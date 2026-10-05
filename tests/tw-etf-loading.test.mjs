import test from 'node:test';
import assert from 'node:assert/strict';
import { createETFRequester } from '../src/markets/tw/etf/request.js';
import { createSnapshotLoader } from '../src/markets/tw/etf/static-snapshot.js';
const rootUrl=new URL('https://example.test/ox/');
const response=data=>({ok:true,json:async()=>data});
const catalog={rows:[{symbol:'0050',date:'2026-10-01'}],acquiredAt:'2026-10-02T00:00:00Z'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('ETF and savings share published catalog without waiting for a market API',async()=>{
  let files=0,api=0;
  const request=createETFRequester({rootUrl,getApiBase:()=>{api++;throw Error('should not need API');},fetcher:async()=>{files++;return response(catalog);}});
  const first=await request();const second=await request();
  assert.equal(first.snapshot,true);assert.equal(first.acquiredAt,catalog.acquiredAt);
  assert.equal(second,first);assert.equal(files,1);assert.equal(api,0);
});
test('switching tools cancels only the old subscriber, not the shared download',async()=>{
  const gate=deferred();let files=0;
  const request=createETFRequester({rootUrl,getApiBase:()=>'/api',fetcher:async()=>{files++;await gate.promise;return response(catalog);}});
  const old=new AbortController(),next=new AbortController();
  const first=request('catalog',{},old.signal),second=request('catalog',{},next.signal);
  const rejected=assert.rejects(first,{name:'AbortError'});old.abort();gate.resolve();
  await rejected;assert.equal((await second).rows[0].symbol,'0050');assert.equal(files,1);
});
test('different holdings requests reuse one file while preserving per-view cancellation',async()=>{
  const gate=deferred();let files=0;
  const load=createSnapshotLoader(async()=>{files++;await gate.promise;return response({rows:{'0050':{holdings:[{code:'2330'}]},'006208':{holdings:[{code:'2454'}]}}});},rootUrl);
  const controller=new AbortController();const a=load('holdings',{symbol:'0050'},controller.signal),b=load('holdings',{symbol:'006208'});
  const rejected=assert.rejects(a,{name:'AbortError'});controller.abort();gate.resolve();
  await rejected;assert.equal((await b).holdings[0].code,'2454');assert.equal(files,1);
});
test('explicit refresh fetches upstream and becomes the next normal cached result',async()=>{
  let api=0;const fresh={rows:[{symbol:'0050',date:'2026-10-02'}]};
  const request=createETFRequester({rootUrl,getApiBase:()=>'/api',fetcher:async url=>{
    if(String(url).includes('/v1/tw/etf')){api++;assert.match(String(url),/refresh=1/);return response({ok:true,data:fresh});}
    return response(catalog);
  }});
  await request();assert.equal(await request('catalog',{refresh:'1'}),fresh);
  assert.equal(await request(),fresh);assert.equal(api,1);
});
test('a hung explicit refresh times out and keeps dated published data available',async()=>{
  let aborted=false;
  const request=createETFRequester({rootUrl,getApiBase:()=>'/api',timeoutMs:20,fetcher:async(url,{signal})=>{
    if(String(url).includes('/v1/tw/etf'))return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));
    return response(catalog);
  }});
  const keepAlive=setTimeout(()=>{},1000);
  try { const data=await request('catalog',{refresh:'1'});assert(aborted);assert.equal(data.snapshot,true);assert.equal(data.rows[0].date,'2026-10-01'); }
  finally{clearTimeout(keepAlive);}
});
test('symbols missing from the published history still fall back to the API',async()=>{
  let api=0;
  const request=createETFRequester({rootUrl,getApiBase:()=>'/api',fetcher:async url=>{
    if(String(url).includes('/v1/tw/etf')){api++;return response({ok:true,data:{rows:[{symbol:'00999',monthly:[{value:1}]}]}});}
    return response({rows:{}});
  }});
  const data=await request('history',{symbol:'00999'});assert.equal(api,1);assert.equal(data.rows[0].unavailable,undefined);
});
