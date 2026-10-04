import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {briefingContent} from '../src/markets/tw/home-content.js';

const seed=JSON.parse(await readFile(new URL('../data/tw-home.json',import.meta.url),'utf8'));
const row=(id,group,marketDate,collectedAt,extra={})=>({id,name:id,group,marketDate,collectedAt,value:100,change:1,changePct:1,status:'ok',...extra});
const meta=html=>html.match(/<div class="twx-briefing-meta"[^>]*>(.*?)<\/div>/s)?.[1];
const rowHtml=(html,id)=>html.split(`data-market-row="${id}"`)[1]?.split('class="twx-briefing-value"')[0];
const night={contract:'202610',close:48475,change:-223,changePct:-.46,high:48661,low:48210,volume:37554,tradeDate:'2026-10-05',sessionStart:'2026-10-02T15:00:00+08:00',sessionEnd:'2026-10-03T05:00:00+08:00',collectedAt:'2026-10-03T21:30:00.000Z',status:'ok'};

test('premarket separates the report day, latest source acquisition and each market source date',()=>{
 const rows=[
  row('US','us','2026-10-02','2026-10-04T21:30:10Z'),
  row('ASIA','asia','2026-10-01','2026-10-04T21:30:20Z'),
  row('FX','fx','2026-10-04','2026-10-04T21:30:40Z'),
  row('YIELD','yields','2026-10-01','2026-10-04T21:30:00Z'),
  row('BTC','crypto','2026-10-05','2026-10-04T21:30:30Z')
 ];
 const html=briefingContent({briefing:{date:'2026-10-05',collectedAt:'2026-10-04T21:31:00Z',rows}},false);
 assert.match(meta(html),/報告日 <time datetime="2026-10-05">2026-10-05<\/time>/);
 assert.match(meta(html),/最近資料取得 <time datetime="2026-10-04T21:30:40Z">2026-10-05 05:30<\/time>（台北）/);
 assert.doesNotMatch(meta(html),/21:31|2026-10-02/);
 for(const r of rows)assert(rowHtml(html,r.id).includes(`來源日 <time datetime="${r.marketDate}">${r.marketDate}</time>`));
});

test('every populated bundled market row displays its own source date',()=>{
 const html=briefingContent(seed,false);
 assert.equal((html.match(/class="twx-source-date"/g)||[]).length,22);
 for(const r of seed.briefing.rows)if(Number.isFinite(r.value))assert(rowHtml(html,r.id).includes(`datetime="${r.marketDate}"`),r.id);
});

test('new attempts and stale snapshots cannot advance visible acquisition times',()=>{
 const old='2026-10-01T21:30:00Z',attempt='2026-10-04T21:30:00Z';
 const stale=row('STALE','us','2026-10-01',old,{status:'stale',checkedAt:attempt});
 const missing=row('MISSING','fx',null,attempt,{value:null,status:'unavailable'});
 const home={briefing:{date:'2026-10-05',collectedAt:attempt,rows:[stale,missing]},briefingStatus:{checkedAt:attempt,error:'offline'},night:{...night,status:'stale',checkedAt:attempt},nightStatus:{checkedAt:attempt,error:'offline'}};
 const html=briefingContent(home,false);
 assert.match(meta(html),/2026-10-02 05:30/);
 assert.doesNotMatch(meta(html),/2026-10-05 05:30/);
 assert.match(rowHtml(html,'STALE'),/2026-10-01.*上次有效資料/);
 assert.match(rowHtml(html,'MISSING'),/來源日 — · 尚未公布／來源無資料/);
 assert.match(html,/來源更新失敗，保留上次已完成夜盤/);
 assert.match(html,/資料取得 <time datetime="2026-10-03T21:30:00.000Z">2026-10-04 05:30/);
});

test('night shows its actual cross-midnight session separately from the Monday attribution date',()=>{
 const html=briefingContent({night},false);
 assert.match(html,/實際時段 <time datetime="2026-10-02T15:00:00\+08:00">2026-10-02 15:00<\/time> → <time datetime="2026-10-03T05:00:00\+08:00">2026-10-03 05:00<\/time>（台北）/);
 assert.match(html,/交易歸屬日 <time datetime="2026-10-05">2026-10-05<\/time>/);
 assert.match(html,/資料取得 <time datetime="2026-10-03T21:30:00.000Z">2026-10-04 05:30<\/time>（台北）/);
 assert.doesNotMatch(html,/2026-10-05 15:00/);
});

test('unknown or invalid dates stay unknown and unavailable nights do not claim a completed session',()=>{
 const html=briefingContent({briefing:{date:'2026-02-30',collectedAt:'2026-10-04T21:30:00Z',rows:[row('INVALID','us','<img src=x>','bad',{status:'stale'})]},night:{...night,status:'unavailable'}},true);
 assert.match(meta(html),/報告日 —/);
 assert.match(meta(html),/最近資料取得 —/);
 assert.match(rowHtml(html,'INVALID'),/來源日 — · 上次有效資料/);
 assert.doesNotMatch(html,/<img|Invalid Date|實際時段|交易歸屬日|0\.00/);
 assert.match(html,/夜盤尚未公布/);
});
