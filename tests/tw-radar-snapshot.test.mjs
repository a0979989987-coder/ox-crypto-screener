import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validRadarSnapshot,savedRadarSnapshot,saveRadarSnapshot} from '../src/markets/tw/radar-snapshot.js';
import {seedTWRadar,refreshTWMarketState,createTWMarketState} from '../src/markets/tw/engine.js';
const published=JSON.parse(readFileSync(new URL('../data/tw-radar.json',import.meta.url),'utf8'));
test('cached TW membership is bounded by age, official date, calendar and complete source status',()=>{
 assert(validRadarSnapshot(published,published.savedAt));
 assert(!validRadarSnapshot(published,published.savedAt+8*86400000));
 assert(!validRadarSnapshot({...published,savedAt:published.savedAt+120000},published.savedAt));
 for(const data of [{...published.data,dataDate:'2026-09-29'},{...published.data,modesMeta:{...published.data.modesMeta,calendarReady:false}},{...published.data,modesMeta:{...published.data.modesMeta,risk:{status:'error'}}}])assert(!validRadarSnapshot({...published,data},published.savedAt));
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const fresh={...published,savedAt:Date.now()};assert(saveRadarSnapshot(fresh,storage));assert.deepEqual(savedRadarSnapshot(storage),fresh);
 assert.equal(savedRadarSnapshot({getItem(){throw Error('denied')}}),null);
});
test('TW renders verified risk membership while live radar waits, accepts the eventual fresh empty list and rejects an older seed',async t=>{
 const saved={...published,savedAt:Date.now()-1000};
 seedTWRadar(saved);assert.equal(createTWMarketState().data.radarModes.risk.length,published.data.modes.risk.length);assert(createTWMarketState().data.usingCachedRadar);
 let release;const radarWait=new Promise(r=>release=r);
 t.mock.method(globalThis,'fetch',async input=>{if(new URL(input).pathname.endsWith('/radar'))await radarWait;return new Response(JSON.stringify({ok:true,data:new URL(input).pathname.endsWith('/radar')?{...published.data,radar:[],modes:{risk:[],disposal:[],release:[]}}:{}}));});
 const pending=refreshTWMarketState({force:true});await Promise.resolve();
 assert.equal(createTWMarketState().data.radarModes.risk.length,published.data.modes.risk.length);
 release();const fresh=await pending;assert.equal(fresh.data.radarModes.risk.length,0);assert(!fresh.data.usingCachedRadar);
 assert.equal(seedTWRadar(saved),fresh);
});
