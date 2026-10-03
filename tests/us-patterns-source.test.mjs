import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceDataset, deviceCandles } from '../src/markets/us/device-eod-core.js';
import { tradingDay, shiftDate } from '../src/markets/us/calendar.js';
import { createUSPatternSource, patternDataAllowed, patternSourceKey } from '../src/markets/us/patterns/source.js';
import { usBubbleRows, usBubbleText, US_BUBBLE_METRICS } from '../src/markets/us/visuals.js';

// Deterministic OHLCV is unit-test-only. Browser acceptance uses the genuine
// private EOD packet outside this repository, never published as a test fixture.
const histories = [];
for (let date='2026-05-01';date<='2026-09-30';date=shiftDate(date,1))
  if (tradingDay(date).open) histories.push({date,open:100,high:103,low:99,close:102,volume:1000});
const packet = {format:'ox-us-device-eod',version:1,mode:'eod',sessionDate:'2026-09-30',
  collectedAt:'2026-10-01T06:00:00Z',provider:'unit-test-only',
  directory:[{symbol:'SPY',name:'Benchmark fixture',type:'ETF'}],histories:{SPY:histories}};
const dataset = await buildDeviceDataset(packet,{now:Date.parse('2026-10-01T08:00:00Z')});
let serial=0;
function context() {
  return {capabilities:{...dataset.capabilities},directory:dataset.packet.directory,
    snapshot:{...dataset.snapshot,createdAt:new Date(Date.parse(packet.collectedAt)+ ++serial *1000).toISOString()}};
}
test('US shared pattern source scans genuine same-frame completed bars and keeps short history honest',async()=>{
  const value=context(),requests=[],series=[],progress=[];
  const {source,cache}=createUSPatternSource({getContext:()=>value,adapter:{async candles(symbol,options){
    requests.push(options);return deviceCandles(dataset,symbol,options);
  }}});
  const universe=await source.fetchUniverse(new AbortController().signal);
  assert.deepEqual(Object.keys(source.TIMEFRAMES),['1D','1W','1M']);
  assert.equal(universe.tickers[0].name,'Benchmark fixture');
  assert.equal(source.scanCurrent(universe),true);
  const result=await source.scanUniverse(universe,['1D','1W','1M'],{signal:new AbortController().signal,
    onSeries:row=>series.push(row),onProgress:value=>progress.push(value)});
  assert.deepEqual(result,{done:3,total:3,failed:2});
  assert.equal(series.length,1);
  assert.equal(series[0].frame,'1D');
  assert.deepEqual(series[0].candles,deviceCandles(dataset,'SPY',{limit:200}).bars);
  assert.ok(requests.every(request=>request.extendedHours===false));
  assert.deepEqual(requests.map(request=>request.interval),['1D','1W','1M']);
  assert.equal(progress.at(-1).coinsDone,1);
  const month=await source.fetchSeries('SPY','1M',new AbortController().signal);
  assert.equal(month.candles.length,5,'a short monthly history remains viewable in details without becoming a scan candidate');
  const saved=await cache.saveIndex(series[0],{});
  assert.equal(cache.entryCurrent(saved),true);
  assert.equal((await cache.readIndex(['1D'])).length,1);
  const before=requests.length;
  await source.fetchSeries('SPY','1D',new AbortController().signal);
  assert.equal(requests.length,before,'revisiting a completed close reuses its exact raw candles');
});
test('public widgets and unconfirmed raw-data scopes cannot start a US pattern download',async()=>{
  for (const patch of [{rawDataAvailable:false},{chartMode:'widget'},
    {dataScope:'public',localDataAvailable:false,externalDisplayConfirmed:false},
    {dataScope:'public',localDataAvailable:false,externalDisplayConfirmed:undefined}]) {
    const value=context();Object.assign(value.capabilities,patch);let calls=0;
    const {source}=createUSPatternSource({getContext:()=>value,adapter:{async candles(){calls++;}}});
    assert.equal(patternDataAllowed(value.capabilities),false);
    await assert.rejects(source.fetchUniverse(new AbortController().signal),/原始 K 線尚未接通/);
    await assert.rejects(source.fetchSeries('SPY','1D',new AbortController().signal),/原始 K 線尚未接通/);
    assert.equal(calls,0);
    assert.deepEqual(usBubbleRows(value),[]);
  }
});
test('changing or revoking a dataset isolates cached results and aborts an in-flight pattern read',async()=>{
  let value=context(),release;
  const originalKey=patternSourceKey(value);
  const {source,cache}=createUSPatternSource({getContext:()=>value,adapter:{candles:()=>new Promise(resolve=>{release=resolve;})}});
  const pending=source.fetchSeries('SPY','1D',new AbortController().signal);
  value={...value,capabilities:{...value.capabilities,dataScope:'public',localDataAvailable:false,rawDataAvailable:false}};
  release(deviceCandles(dataset,'SPY'));
  await assert.rejects(pending,{name:'AbortError'});
  assert.notEqual(originalKey,patternSourceKey(value));
  assert.deepEqual(await cache.readIndex(['1D']),[]);
  assert.equal(source.scanCurrent({revision:originalKey}),false);
});
test('replacing a file with identical metadata still invalidates its pattern generation',async()=>{
  let value=context();
  const first=patternSourceKey(value);
  const {source,cache}=createUSPatternSource({getContext:()=>value,adapter:{async candles(symbol,options){return deviceCandles(dataset,symbol,options);}}});
  const row=await source.fetchSeries('SPY','1D',new AbortController().signal);
  await cache.saveIndex(row,{});
  assert.equal((await cache.readIndex(['1D'])).length,1);
  value={...value,snapshot:{...value.snapshot,quotes:value.snapshot.quotes.map(quote=>({...quote,price:103}))}};
  assert.notEqual(patternSourceKey(value),first);
  assert.equal(source.scanCurrent({revision:first}),false);
  assert.deepEqual(await cache.readIndex(['1D']),[]);
  const next=createUSPatternSource({getContext:()=>value});
  assert.deepEqual(await next.cache.readIndex(['1D']),[]);
});
test('US pattern source rejects another date, a substituted frame, and malformed or duplicate candles',async()=>{
  for (const mutate of [r=>{r.asOf='2026-09-29';},r=>{r.interval='1W';},r=>{r.mode='realtime';},
    r=>{r.bars[3].high=90;},r=>{r.bars[3].time=r.bars[2].time;},r=>{r.bars[3].volume=-1;}]) {
    const value=context(),response=structuredClone(deviceCandles(dataset,'SPY'));mutate(response);
    const {source}=createUSPatternSource({getContext:()=>value,adapter:{async candles(){return response;}}});
    await assert.rejects(source.fetchSeries('SPY','1D',new AbortController().signal));
  }
});
test('US bubbles filter the completed snapshot and never invent missing volume or intraday metrics',()=>{
  const value=context();
  value.directory=[{symbol:'A',name:'Alpha'},{symbol:'B',name:'Beta'},{symbol:'C',name:'Complex',complex:true},{symbol:'D',name:'Old'}];
  value.snapshot={...value.snapshot,quotes:[
    {symbol:'A',price:100,changePct:2,volume:1000,asOf:'2026-09-30'},
    {symbol:'B',price:50,changePct:-3,volume:null,asOf:'2026-09-30'},
    {symbol:'C',price:50,changePct:90,volume:100,asOf:'2026-09-30'},
    {symbol:'D',price:50,changePct:90,volume:100,asOf:'2026-09-29'}],
    analyses:[{symbol:'A',interval:'1D',liquidity:123456,rvol:1.2},{symbol:'B',interval:'1D',liquidity:null,rvol:null}]};
  assert.deepEqual(usBubbleRows(value).map(row=>row.symbol),['B','A']);
  assert.deepEqual(usBubbleRows(value,{direction:'long'}).map(row=>row.symbol),['A']);
  assert.deepEqual(usBubbleRows(value,{watch:new Set(['B'])}).map(row=>row.symbol),['B']);
  assert.deepEqual(usBubbleRows(value,{metric:'volume'}).map(row=>row.symbol),['A']);
  assert.equal(usBubbleRows(value,{metric:'liquidity'})[0].value,123456);
  assert.equal(usBubbleRows(value,{metric:'rvol'})[0].value,1.2);
  assert.deepEqual(usBubbleRows(value,{metric:'flow'}),[]);
  assert.equal(US_BUBBLE_METRICS.some(([key])=>['flow','cap'].includes(key)),false);
  assert.equal(usBubbleText(null,'volume'),'—');
  assert.equal(usBubbleText(1.2,'rvol'),'1.20×');
});
