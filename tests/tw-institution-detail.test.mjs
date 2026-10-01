import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInstitutionSummary,collectInstitutionSummary} from '../server/markets/tw/institution-summary.js';
import {riskDetailContent} from '../src/markets/tw/risk-detail.js';
import {institutionContent} from '../src/markets/tw/home-content.js';
const date='2026-09-30';
const payload={date:'20260930',fields:['單位','買進金額','賣出金額','買賣差額'],data:[['外資及陸資(不含外資自營商)',0,0,'300'],['投信',0,0,'80'],['自營商(自行買賣)',0,0,'10'],['自營商(避險)',0,0,'20'],['合計',0,0,'410']]};
test('institution totals use exact-date official amounts, validate sums and reject missing zero-like values',()=>{
 assert.equal(parseInstitutionSummary(payload,'TWSE',date).total,410);
 assert.throws(()=>parseInstitutionSummary(payload,'TWSE','2026-10-01'),/日期/);
 for(const value of ['',null,'—'])assert.throws(()=>parseInstitutionSummary({...payload,data:payload.data.map((r,i)=>i===0?[...r.slice(0,3),value]:r)},'TWSE',date),/金額/);
 assert.throws(()=>parseInstitutionSummary({...payload,data:payload.data.map((r,i)=>i===4?[...r.slice(0,3),'500']:r)},'TWSE',date),/加總/);
});
test('unavailable institutional sources preserve only same-day valid data and never make partial totals look complete',async()=>{
 const previous={date,markets:{TWSE:{total:410}}};
 const result=await collectInstitutionSummary(date,previous,async()=>{throw Error('offline');});
 assert.equal(result.markets.TWSE.status,'stale');assert.equal(result.markets.TWSE.total,410);assert.equal(result.total,null);
 const next=await collectInstitutionSummary('2026-10-01',previous,async()=>{throw Error('offline');});assert.equal(next.markets.TWSE.total,null);
 assert(institutionContent({core:{institutional:result}}).includes('上次有效資料'));
});
test('risk details keep ordered announcements and navigation without charts, escape official text and reject different-date flows',()=>{
 const row={symbol:'6456',name:'GIS-KY',market:'TWSE',dataDate:date,price:92,volume:10000,disposition:{status:'risk',riskDays:1,riskBasis:'<script>bad</script>'}};
 const html=riskDetailContent(row,{date:'2026-10-01',stocks:[{symbol:'6456',market:'TWSE',netTwd:999000000}]});
 assert(html.includes('注意交易資訊公告'));assert(html.includes('最快 1 個交易日'));assert(html.includes('urgent'));assert(html.includes('跳到圖表'));assert(!html.includes('<svg'));assert(!html.includes('<script>'));assert(!html.includes('9.99 億'));
 assert.doesNotThrow(()=>riskDetailContent({...row,dataDate:undefined},null));
 assert(!html.includes('<small>週轉率</small>'));assert(!html.includes('<small>當沖損益</small>'));assert(!html.includes('<small>三大法人淨買賣（估算）</small>'));
 const zero=riskDetailContent({...row,turnoverRate:0,dayTradeVolume:0},{date,stocks:[{symbol:'6456',market:'TWSE',netTwd:0}]});
 assert(zero.includes('<small>週轉率</small><strong class="">0%</strong>'));assert(zero.includes('<small>當沖成交量（張）</small><strong class="">0</strong>'));assert(zero.includes('<small>三大法人淨買賣（估算）</small>'));
 assert(html.indexOf('tw-risk-metrics')<html.indexOf('tw-risk-announcement'));assert(html.includes('<details class="tw-risk-announcement">'));assert(!html.includes('<details open')); assert(html.indexOf('tw-risk-quote-grid')<html.indexOf('tw-risk-metrics'));
 for(const status of ['active','release'])assert(riskDetailContent({...row,disposition:{status,startDate:date,endDate:'2026-10-02',detail:'措施',releaseDays:0}}).includes('處置措施公告'));
});
