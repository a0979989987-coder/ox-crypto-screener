import {handleTWRequest} from '../api/v1/tw/[endpoint].js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createFeatureAPIGate} from '../server/account/feature-access.js';
import {FEATURE_CATALOG} from '../server/account/feature-catalog.js';
import {seal,cookieName} from '../server/account/cookies.js';
import {handleBitgetAdminLookup} from '../server/account/bitget-admin-lookup.js';
const env={OX_SUPABASE_URL:'https://fixture.supabase.co',OX_SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',OX_AUTH_SESSION_SECRET:'fixture-session-key-more-than-thirty-two'};
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(data){this.body=data;return this;}};}
test('mapped backend policy is fail closed before provider/cache and validates encrypted session',async()=>{
 let mode='public',policyError=false,valid=true,anonymous=false,permitted=true,userChecks=0;
 const factory=()=>({auth:{getUser:async()=>{userChecks++;return {error:valid?null:{},data:{user:{id:'member',is_anonymous:anonymous}}};}},rpc:async(name,args)=>args.p_action==='catalog'?{error:policyError?{}:null,data:{ok:true,features:FEATURE_CATALOG.map(f=>({id:f.id,version:'fixture',mode:f.id==='tw.radar'?mode:'public'}))}}:{data:{ok:true,allowed:permitted}}});
 const gate=createFeatureAPIGate({env,clientFactory:factory}),req={query:{endpoint:'radar'},headers:{}},res=response();
 assert.equal(await gate(req,res),true);assert.equal(userChecks,0);res.setHeader('Cache-Control','public,max-age=600');assert.match(res.headers['Cache-Control'],/no-store/);
 mode='login';let r=response();assert.equal(await gate(req,r),false);assert.equal(r.statusCode,401);
 req.headers.cookie=`${cookieName('access')}=${seal('fixture-access',env.OX_AUTH_SESSION_SECRET,'access')}`;
 assert.equal(await gate(req,response()),true);valid=false;assert.equal(await gate(req,response()),false);valid=true;
 anonymous=true;assert.equal(await gate(req,response()),false);anonymous=false;permitted=false;assert.equal(await gate(req,response()),false);permitted=true;
 policyError=true;r=response();assert.equal(await gate(req,r),false);assert.equal(r.statusCode,503);assert.equal(r.body.code,'FEATURE_POLICY_UNAVAILABLE');
 for(const endpoint of ['radar',' radar ',['radar','home']])assert.equal(await createFeatureAPIGate({env:{}})({query:{endpoint},headers:{}},response()),false);
 assert.equal(await createFeatureAPIGate({env:{}})({query:{endpoint:'ignored'}},response(),'radar'),false);
 assert.equal(await gate({query:{endpoint:'health'}},response()),true);
});
test('Bitget admin adapter is separate from product switches, disabled by default and never proves ownership',async()=>{
 let admin=false,calls=0;
 const reader={rpc:async()=>({data:{administrator:admin}})},factory=()=>({lookupCustomer:async({uid})=>{calls++;return {uid,certification:{status:'passed'},accountBindingVerified:false};}});
 const run=async(body={},enabled=false,method='POST')=>{const res=response();await handleBitgetAdminLookup({req:{method,body},res,reader,env:{OX_BITGET_ADMIN_LOOKUP_ENABLED:String(enabled)},clientFactory:factory});return res;};
 assert.equal((await run({uid:'123'})).statusCode,403);admin=true;assert.equal((await run({},false,'GET')).body.configured,false);
 assert.equal((await run({uid:'123'})).statusCode,503);assert.equal(calls,0);
 assert.equal((await run({uid:'123',accountId:'other'},true)).statusCode,400);assert.equal((await run({uid:'bad'},true)).statusCode,400);
 const result=await run({uid:'123'},true);assert.equal(result.statusCode,200);assert.equal(result.body.ownershipVerified,false);assert.equal(result.body.accessPolicyChanged,false);assert.equal(calls,1);
});

test('actual TW router normalizes duplicate/whitespace endpoints before the same authorization gate',async()=>{
 for(const endpoint of ['home',' home ',['home','radar'],'outlook',['outlook','home']]){
  const res=response();res.end=()=>{};const req={method:'GET',query:{endpoint},headers:{origin:'https://ox-crypto-screener.vercel.app'}};
  await handleTWRequest(req,res,createFeatureAPIGate({env:{}}));assert.equal(res.statusCode,503);assert.equal(res.body.code,'FEATURE_POLICY_UNAVAILABLE');assert.match(res.headers['Cache-Control'],/no-store/);
 }
});
