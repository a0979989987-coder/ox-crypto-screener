import test from 'node:test';
import assert from 'node:assert/strict';
import {collectNight,nightReportDate,nightUrl,parseNight} from '../server/markets/tw/home-night.js';

const html=(tradeDate,sessionDate,close=49346)=>`<input name="queryDate" value="${tradeDate.replaceAll('-','/')}"><p>${sessionDate.replaceAll('-','/')} 15:00~次日05:00 盤後交易時段行情表</p><table><tr>${['TX','202610','48671','49495','48000',String(close),'▲+677','▲+1.39%','32288',...Array(6).fill('-')].map(value=>`<td>${value}</td>`).join('')}</tr></table>`;
const source=(latest,reports={},calls=[])=>async url=>{
 const date=new URL(url).searchParams.get('queryDate')?.replaceAll('/','-')||'latest';calls.push(date);
 const body=date==='latest'?latest:reports[date]||'尚無資料';
 if(body instanceof Error)throw body;
 return {text:async()=>body};
};
const prior=(tradeDate,sessionDate,now)=>({...parseNight(html(tradeDate,sessionDate),tradeDate,now),collectedAt:new Date(now.getTime()-3600000).toISOString()});

test('official latest page supplies the future Monday attribution for a completed Friday night',async()=>{
 const now=new Date('2026-10-04T22:00:00+08:00'),calls=[];
 const result=await collectNight(null,now,source(html('2026-10-05','2026-10-02'),{},calls));
 assert.equal(result.tradeDate,'2026-10-05');assert.equal(result.sessionEnd,'2026-10-03T05:00:00+08:00');
 assert.equal(result.close,49346);assert.equal(result.change,677);assert.equal(result.volume,32288);assert.equal(result.status,'ok');
 assert.deepEqual(calls,['latest','2026-10-04','2026-10-03']);
 assert.equal(new URL(nightUrl()).searchParams.get('queryDate'),null);
 assert.equal(new URL(result.sourceUrl).searchParams.get('queryDate'),'2026/10/05');
});

test('official attribution handles long holidays and year boundaries without guessing the next weekday',async()=>{
 for(const [tradeDate,sessionDate,checked] of [['2026-02-23','2026-02-11','2026-02-18'],['2027-01-04','2026-12-31','2027-01-02']]){
  const result=await collectNight(null,new Date(checked+'T06:00:00+08:00'),source(html(tradeDate,sessionDate)));
  assert.equal(result.tradeDate,tradeDate);assert.equal(result.sessionStart,sessionDate+'T15:00:00+08:00');assert.equal(result.status,'ok');
 }
});

test('latest unfinished night cannot replace the completed session before the 05:00 boundary',async()=>{
 const now=new Date('2026-10-06T04:59:59+08:00');
 const previous=prior('2026-10-05','2026-10-02',now);
 const result=await collectNight(previous,now,source(html('2026-10-06','2026-10-05'),{'2026-10-05':html('2026-10-05','2026-10-02')}));
 assert.equal(result.tradeDate,'2026-10-05');assert.equal(result.sessionEnd,previous.sessionEnd);assert.equal(result.status,'ok');
 const completed=await collectNight(previous,new Date('2026-10-06T05:00:00+08:00'),source(html('2026-10-06','2026-10-05')));
 assert.equal(completed.sessionEnd,'2026-10-06T05:00:00+08:00');assert.equal(completed.status,'ok');
});

test('actual completed session, not response order or trading attribution, selects the newest quote',async()=>{
 const now=new Date('2026-10-06T12:00:00+08:00');
 const result=await collectNight(null,now,source(html('2026-10-07','2026-10-02',49000),{'2026-10-06':html('2026-10-06','2026-10-05',49346)}));
 assert.equal(result.tradeDate,'2026-10-06');assert.equal(result.close,49346);assert.equal(result.sessionEnd,'2026-10-06T05:00:00+08:00');
});

test('latest discovery failure allows dated fallback but explicitly marks freshness unverified',async()=>{
 const now=new Date('2026-10-04T22:00:00+08:00');
 const result=await collectNight(null,now,source(new Error('offline'),{'2026-10-02':html('2026-10-02','2026-10-01')}));
 assert.equal(result.tradeDate,'2026-10-02');assert.equal(result.status,'stale');assert.match(result.error,/最新夜盤交易歸屬日未確認/);
});

test('an incomplete default page retries its explicit attribution date, including future Mondays',async()=>{
 for(const [tradeDate,sessionDate,checked] of [['2026-10-06','2026-10-05','2026-10-06'],['2026-10-05','2026-10-02','2026-10-04']]){
  const calls=[],latest=`<input name="queryDate" value="${tradeDate.replaceAll('-','/')}"><p>資料發布中</p>`;
  const result=await collectNight(null,new Date(checked+'T07:00:00+08:00'),source(latest,{[tradeDate]:html(tradeDate,sessionDate)},calls));
  assert.equal(calls[1],tradeDate);assert.equal(result.status,'ok');assert.equal(result.sessionStart,sessionDate+'T15:00:00+08:00');assert.equal(result.tradeDate,tradeDate);
 }
});

test('failed or older sources preserve newer saved session and its original acquisition time',async()=>{
 const now=new Date('2026-10-04T22:00:00+08:00'),previous=prior('2026-10-05','2026-10-02',now);
 for(const latest of [new Error('offline'),html('2026-10-02','2026-10-01')]){
  const result=await collectNight(previous,now,source(latest));
  assert.equal(result.sessionEnd,previous.sessionEnd);assert.equal(result.collectedAt,previous.collectedAt);assert.equal(result.checkedAt,now.toISOString());assert.equal(result.status,'stale');
 }
 const future=prior('2026-10-06','2026-10-05',new Date('2026-10-06T06:00:00+08:00'));
 const result=await collectNight(future,now,source(new Error('offline')));assert.equal(result.status,'unavailable');assert.equal(result.close,undefined);
});

test('latest discovery and parsing reject invalid dates, mismatched attribution and future actual sessions',()=>{
 assert.throws(()=>nightReportDate(html('2026-02-31','2026-02-01')),/有效交易歸屬日/);
 assert.throws(()=>parseNight(html('2026-10-05','2026-09-31'),'2026-10-05'),/場次日期無效/);
 assert.throws(()=>parseNight(html('2026-10-02','2026-10-02'),'2026-10-02'),/交易歸屬日不符/);
 assert.throws(()=>parseNight(html('2026-10-05','2026-10-02'),'2026-10-02'),/交易歸屬日不符/);
 assert.throws(()=>parseNight(html('2026-10-05','2026-10-02'),'2026-10-05',new Date('2026-10-03T04:59:00+08:00')),/尚未結束/);
});

test('browser cache compares actual sessions even if an older quote has a later attribution day',async()=>{
 const originalFetch=global.fetch,originalStorage=global.localStorage;
 const now=new Date('2026-10-04T22:00:00+08:00'),newer=prior('2026-10-05','2026-10-02',now);
 const older={...prior('2026-10-06','2026-10-01',now),collectedAt:now.toISOString()};
 global.localStorage={getItem:()=>JSON.stringify({night:newer}),setItem:()=>{}};
 global.fetch=async url=>({ok:true,json:async()=>String(url).includes('data/tw-home.json')?{night:older}:{data:{section:new URL(url,'https://test.invalid').searchParams.get('section'),data:String(url).includes('section=night')?older:null,checkedAt:now.toISOString(),status:'ok'}}});
 try{
  const {loadHome,savedHome}=await import('../src/markets/tw/home-data.js?night-cache-regression');
  await loadHome({force:true});assert.equal(savedHome().night.sessionEnd,newer.sessionEnd);assert.equal(savedHome().night.tradeDate,'2026-10-05');
 }finally{global.fetch=originalFetch;global.localStorage=originalStorage;}
});
