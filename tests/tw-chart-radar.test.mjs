import { rankingSignal } from './classic-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankChartRows } from '../src/markets/tw/chart-radar-model.js';
import { aggregateCandles, dailyCandles, selectUniverse } from '../src/markets/tw/patterns/model.js';
import { parseMarketDay, buildPatternEntry } from '../server/markets/tw/pattern-snapshot.js';
import { prepareCandles, classifyPrepared } from '../src/markets/crypto/patterns/matcher.js';
const stock=(symbol,tier,changePct=1)=>({symbol,name:'公司'+symbol,tier,changePct,price:100,market:'TWSE',turnoverTwd:1e8,oxScore:80,classic:tier?{[changePct<0?'short':'long']:rankingSignal(tier,changePct<0?'short':'long')}:null});
test('TW chart radar maintains real tier membership and limits without duplicates or invented promotion',()=>{
 const rows=[...Array.from({length:16},(_,i)=>stock(String(1000+i),'T1')),...Array.from({length:20},(_,i)=>stock(String(2000+i),'T2')),...Array.from({length:20},(_,i)=>stock(String(3000+i),'T3')),stock('2330',null),stock('030001','T1')];rows.push(rows[0]);
 const out=rankChartRows(rows);assert.equal(out.length,30);assert.deepEqual(['T1','T2','T3'].map(t=>out.filter(r=>r.displayTier===t).length),[10,10,10]);assert.equal(new Set(out.map(r=>r.symbol)).size,30);assert.ok(out.every(r=>r.displayTier===r.tier));assert.equal(rankChartRows(rows,{tier:'T1'}).length,10);assert.equal(rankChartRows([stock('1234','T3')],{tier:'T1'}).length,0);
});
test('TW chart radar watch and turnover pools use actual membership and search; direction stays separate',()=>{
 const rows=[stock('2330','T1',1),{...stock('6207','T2',-2),turnoverTwd:3e8}];assert.equal(rankChartRows(rows,{side:'short'})[0].symbol,'6207');assert.deepEqual(rankChartRows(rows,{tab:'watch',watchlist:new Set(['6207']),side:'long'}).map(r=>r.symbol),['6207']);assert.equal(rankChartRows(rows,{tab:'surge'})[0].symbol,'6207');assert.equal(rankChartRows(rows,{query:'2330'}).length,1);assert.equal(selectUniverse([{...rows[0],turnoverTwd:0}],0).length,1);
});
const bars=Array.from({length:70},(_,i)=>({date:new Date(Date.UTC(2026,6,1+i)).toISOString().slice(0,10),open:100+i,high:103+i,low:99+i,close:102+i,volume:100,turnoverTwd:10000}));
test('TW longer timeframes merge genuine trading bars, preserve OHLC and volume, and exclude incomplete months',()=>{
 const daily=dailyCandles(bars,bars.at(-1).date),two=aggregateCandles(daily,'2D',bars.at(-1).date);assert.equal(two.length,35);assert.deepEqual([two[0].open,two[0].high,two[0].low,two[0].close,two[0].volume,two[0].quoteVolume],[100,104,99,103,200,20000]);assert.equal(aggregateCandles(daily,'5D',bars.at(-1).date).length,14);const months=aggregateCandles(daily,'1M',bars.at(-1).date);assert.deepEqual(months.map(c=>c.date),['2026-08-01']);
});
test('TW official history rejects substituted dates and malformed price ranges; excludes non-stock instruments',()=>{
 const payload={date:'20260929',tables:[{fields:['證券代號','開盤價','最高價','最低價','收盤價','成交股數','成交金額'],data:[['2330','100','105','99','103','1,000','103,000'],['030001','1','2','1','2','100','200'],['6207','100','98','99','103','100','10000']]}]};const known=new Map([['TWSE:2330',{}],['TWSE:6207',{}]]);const rows=parseMarketDay(payload,'TWSE','2026-09-29',known);assert.equal(rows.length,1);assert.equal(rows[0].candle.volume,1000);assert.equal(rows[0].candle.quoteVolume,103000);assert.throws(()=>parseMarketDay(payload,'TWSE','2026-09-28',known),/substituted/);
});
test('TW preclassification equals shared Crypto matcher on the exact official candles and accounts for unavailable symbols',()=>{
 const date=bars.at(-1).date,result=buildPatternEntry(stock('2330','T1'),bars,date);assert.equal(result.data.candles.length,70);assert.deepEqual(result.matches,classifyPrepared(prepareCandles(result.data.candles)));assert.deepEqual(result.frames['2D'].matches,classifyPrepared(prepareCandles(aggregateCandles(result.data.candles,'2D',date))));assert.equal(buildPatternEntry(stock('2330','T1'),bars.slice(0,20),date).reason,'資料日日 K 缺漏');assert.equal(buildPatternEntry(stock('2330','T1'),bars.slice(-20),date).reason,'官方歷史少於 35 根日 K');
});
test('published all-stock index accounts for every eligible symbol, and every classified bar is valid on an official report session',async()=>{
 const {readFile}=await import('node:fs/promises'),{gunzipSync}=await import('node:zlib');
 const dir=new URL('../data/tw-patterns/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8')),symbols=new Set(),dates=new Set(manifest.dates);let count=0;
 for(const chunk of manifest.chunks){const payload=JSON.parse(gunzipSync(await readFile(new URL(chunk.file,dir))).toString());assert.equal(payload.date,manifest.date);assert.equal(payload.entries.length,chunk.count);for(const e of payload.entries){assert.ok(!symbols.has(e.data.symbol));symbols.add(e.data.symbol);assert.equal(e.data.dataDate,manifest.date);assert.equal(e.data.candles.at(-1).date,manifest.date);assert.ok(e.data.candles.length>=35);assert.ok(e.data.candles.every(c=>dates.has(c.date)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.volume>=0));for(const frame of Object.keys(e.frames))assert.ok(aggregateCandles(e.data.candles,frame,manifest.date).length>=35);count++;}}
 assert.equal(count,manifest.classified);assert.equal(count+manifest.unavailable.length,manifest.total);assert.equal(manifest.stocks.length,manifest.total);assert.equal(new Set([...symbols,...manifest.unavailable.map(r=>r.symbol)]).size,manifest.total);
});
test('TW never fills any tier with legacy grades or unqualified WATCH rows',()=>{
 const rows=Array.from({length:35},(_,i)=>stock(String(1000+i),null));
 assert.equal(rankChartRows(rows).length,0);assert.equal(rankChartRows(rows,{tier:'T1'}).length,0);
 assert.equal(rankChartRows(rows.map(r=>({...r,tier:'T1',oxScore:100}))).length,0);
});
