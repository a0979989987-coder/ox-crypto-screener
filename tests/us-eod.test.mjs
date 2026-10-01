import test from 'node:test';
import assert from 'node:assert/strict';
import {completedSession,completedDaily,eodSeries,closingQuote} from '../src/markets/us/eod.js';
import {nyEpoch,shiftDate,tradingDay} from '../src/markets/us/calendar.js';
import {handleEOD} from '../server/markets/us/eod-service.js';
const now=Date.parse('2026-10-01T05:00:00Z');
const daily=(start,end)=>{const rows=[];for(let d=start;d<=end;d=shiftDate(d,1))if(tradingDay(d).open)rows.push({date:d,time:nyEpoch(d),open:100,high:103,low:99,close:101,volume:1000});return rows;};
test('completed session accounts for New York DST, source settlement, weekends, holidays and early closes',()=>{
 assert.equal(completedSession(Date.parse('2026-09-30T19:00:00Z')),'2026-09-29');
 assert.equal(completedSession(Date.parse('2026-09-30T20:30:00Z')),'2026-09-29');
 assert.equal(completedSession(now),'2026-09-30');
 assert.equal(completedSession(Date.parse('2026-09-07T23:00:00Z')),'2026-09-04');
 assert.equal(completedSession(Date.parse('2026-11-27T19:01:00Z')),'2026-11-27');
 assert.equal(completedSession(Date.parse('2026-12-01T21:30:00Z')),'2026-11-30');
});
test('daily series excludes the active session and complete weekly/monthly bars never contain gaps or forming periods',()=>{
 const bars=daily('2026-08-03','2026-10-01');
 assert.equal(completedDaily(bars,now).at(-1).date,'2026-09-30');
 const weeks=eodSeries(bars,'1W',now);assert.equal(weeks.at(-1).periodEnd,'2026-09-25');
 assert.equal(eodSeries(bars.filter(b=>b.date!=='2026-09-24'),'1W',now).at(-1).periodEnd,'2026-09-18');
 const month=eodSeries(bars,'1M',now).at(-1);assert.equal(month.periodEnd,'2026-09-30');
 assert.equal(month.volume,daily('2026-09-01','2026-09-30').length*1000);
 assert.throws(()=>eodSeries(bars,'1H',now));
});
const bars=daily('2026-08-03','2026-09-30');
const quote=closingQuote('SPY',bars,now);
const bundle={mode:'eod',schemaVersion:2,sessionDate:'2026-09-30',createdAt:new Date(now).toISOString(),
 histories:{SPY:bars},snapshot:{mode:'eod',schemaVersion:2,quotes:[quote],analyses:[]}};
test('closing quote uses daily OHLCV and the actual session close instead of current fetch time',()=>{
 assert.equal(quote.marketOpen,false);assert.equal(quote.mode,'eod');
 assert.equal(quote.marketTime,nyEpoch('2026-09-30',960));assert.equal(quote.asOf,'2026-09-30');
});
test('private chart and quote endpoints only read a shared closing bundle',async()=>{
 const options={privateValidation:true,readBundle:async()=>bundle};
 const q=await handleEOD('quote-v2',{symbol:'SPY'},options);assert.deepEqual(q.quote,quote);
 const chart=await handleEOD('chart-v2',{symbol:'SPY',interval:'1W',limit:2},options);
 assert.equal(chart.bars.length,2);assert.equal(chart.bars.at(-1).periodEnd,'2026-09-25');
 assert.equal(chart.capabilities.pollMs,0);assert.equal(chart.capabilities.externalDisplayConfirmed,false);
 for(const interval of ['1m','5m','15m','30m','1H','4H'])await assert.rejects(handleEOD('chart-v2',{symbol:'SPY',interval},options),e=>e.code==='US_INTRADAY_DISABLED');
 await assert.rejects(handleEOD('chart-v2',{symbol:'SPY',extendedHours:'true'},options));
 await assert.rejects(handleEOD('chart-v2',{symbol:'BAD'},options));
});
test('public permission gate does not read or disclose private bundles; licensed mode still refuses private data',async()=>{
 delete process.env.US_EXTERNAL_DISPLAY_CONFIRMED;
 const snapshot=await handleEOD('snapshot',{}, {readBundle:()=>{throw Error('must not read');}});
 assert.deepEqual(snapshot.quotes,[]);assert.equal(snapshot.mode,'eod');
 process.env.US_EXTERNAL_DISPLAY_CONFIRMED='true';process.env.US_DATA_PROVIDER='finance-query';
 try {await assert.rejects(handleEOD('snapshot',{}, {readBundle:async()=>({...bundle,privateValidation:true})}),/私人驗證資料不可公開/);}
 finally {delete process.env.US_EXTERNAL_DISPLAY_CONFIRMED;delete process.env.US_DATA_PROVIDER;}
});
import {resetCache} from '../server/markets/us/cache.js';
import {resetBudget} from '../server/markets/us/budget.js';
test('public daily/weekly/monthly chart requests share one verified daily history without exposing a raw pool',async()=>{
 resetCache();resetBudget();process.env.US_DATA_PROVIDER='finance-query';process.env.US_EXTERNAL_DISPLAY_CONFIRMED='true';
 let calls=0;
 const publicBundle={...bundle};delete publicBundle.histories;
 const options={readBundle:async()=>publicBundle,financeUpstream:async(path,params)=>{
  calls++;assert.equal(path,'/chart/SPY');assert.equal(params.interval,'1d');
  return {symbol:'SPY',interval:'1d',candles:bars.map(b=>({...b,timestamp:b.time}))};
 }};
 try {
  for(const interval of ['1D','1W','1M'])assert.ok((await handleEOD('chart-v2',{symbol:'SPY',interval},options)).bars.length);
  assert.equal(calls,1);
  await assert.rejects(handleEOD('chart-v2',{symbol:'SPY',interval:'1H'},options),e=>e.code==='US_INTRADAY_DISABLED');
  assert.equal(calls,1);
 }finally{delete process.env.US_DATA_PROVIDER;delete process.env.US_EXTERNAL_DISPLAY_CONFIRMED;resetCache();resetBudget();}
});
