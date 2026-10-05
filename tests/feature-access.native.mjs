import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Client} from 'pg';
import {initializeCandidate} from '../scripts/lib/admin-review-candidate-fixtures.mjs';
import {initializeFeatureFixture} from '../scripts/lib/feature-access-fixtures.mjs';import {fixtureIDs as ids} from '../scripts/lib/admin-review-fixtures.mjs';
const config={host:'127.0.0.1',port:Number(process.env.OX_NATIVE_PG_PORT||55439),user:'ox_fixture_owner',database:'postgres'};
test('native PostgreSQL product access migration and independent concurrent admin updates',async t=>{
 const root=new Client(config);await root.connect();const directory=(await root.query('show data_directory')).rows[0].data_directory.replaceAll('\\','/').toLowerCase();
 assert.ok(directory.endsWith('/task-2/imports/postgres-tools/candidate-data'),'Owned synthetic database only');
 const database='ox_features_'+randomUUID().replaceAll('-','');await root.query('create database '+database);
 const owner=new Client({...config,database}),a=new Client({...config,database}),b=new Client({...config,database});await Promise.all([owner.connect(),a.connect(),b.connect()]);
 const db={exec:s=>owner.query(s),query:(s,p)=>owner.query(s,p)};
 async function rpc(client,id,action,payload={}){await client.query('begin');try{await client.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);await client.query('set local role '+(id?'authenticated':'anon'));const r=(await client.query('select public.ox_feature_access_rpc($1,$2::jsonb) as result',[action,JSON.stringify(payload)])).rows[0].result;await client.query('commit');return r;}catch(e){await client.query('rollback');throw e;}}
 try{
  await initializeCandidate(db,{seedAdmin:true});await initializeFeatureFixture(db);
  const catalog=await rpc(a,null,'catalog'),row=catalog.features.find(f=>f.id==='tw.etf');
  await t.test('draft applies to native engine; catalog default public, audit private',async()=>{assert.equal(catalog.features.length,18);assert.ok(catalog.features.every(f=>f.mode==='public'));await assert.rejects(rpc(a,ids.a,'records'),e=>e.code==='42501');});
  await t.test('concurrent version checks allow one winner and one immutable audit only',async()=>{
   const body={feature:row.id,version:row.version,mode:'login',reason:'Native synthetic lock'};
   const results=await Promise.all([rpc(a,ids.admin,'update',{...body,idempotencyKey:randomUUID()}),rpc(b,ids.admin,'update',{...body,idempotencyKey:randomUUID()})]);
   assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'VERSION_CONFLICT');assert.equal((await rpc(a,ids.admin,'records')).audit.length,1);
  });
  await t.test('guest denied, ordinary registered member allowed without Bitget/admin',async()=>{assert.equal((await rpc(a,null,'access',{feature:row.id})).allowed,false);assert.equal((await rpc(b,ids.a,'access',{feature:row.id})).allowed,true);});
  await t.test('protected identities cannot become product features and audit is append-only',async()=>{
   assert.equal((await rpc(a,null,'access',{feature:'admin-review'})).ok,false);
   await assert.rejects(owner.query("update ox_review_live.feature_audit set new_mode='public'"),/AUDIT_APPEND_ONLY/);
   const rights=(await owner.query("select has_table_privilege('authenticated','ox_review_live.feature_audit','SELECT') as member_audit,has_function_privilege('anon','public.ox_feature_access_rpc(text,jsonb)','EXECUTE') as catalog_rpc")).rows[0];assert.deepEqual(rights,{member_audit:false,catalog_rpc:true});
  });
 }finally{await Promise.all([owner.end(),a.end(),b.end()]);await root.query('drop database '+database);await root.end();}
});
