import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { evaluateClassic, CLASSIC_VERSION } from '../src/core/classic.js';
import { tierResults, matchPath } from '../src/markets/us/analysis.js';
import { USWorkspace } from '../src/markets/us/workspace.js';
import { classicTWRow, classifyTWSeries } from '../src/markets/tw/classic.js';
import { rankChartRows } from '../src/markets/tw/chart-radar-model.js';
import { prepareCandles, qualifyPatternMatches, rankPatternMatches } from '../src/markets/crypto/patterns/matcher.js';
import { applyClassicToRows } from '../server/markets/tw/classic-provider.js';
import { preparation, shortBars, rankingSignal } from './classic-fixtures.mjs';

test('US legacy pattern/RS/turnover scores cannot grant classic membership or sketch membership',()=>{
 const row={symbol:'WEAK',type:'stock',price:100,rvol:100,liquidity:1e12,rs:100,
  patterns:{long:[{id:'W',forming:true,distance:0}]},path:preparation().slice(-40).map(c=>c.close)};
 assert.deepEqual(tierResults([row]),[]);
 assert.deepEqual(matchPath([row],[{x:0,y:1},{x:1,y:0}]),[]);
 assert.equal(tierResults([row],{mode:'rs'}).length,1,'An explicitly selected standalone RS strategy remains available');
});
test('US real OHLCV qualifies by the same signal, while missing volume cannot borrow a geometric grade',()=>{
 const bars=preparation(),row={symbol:'GOOD',type:'stock',interval:'1D',bars,patterns:{long:[]}};
 const s=evaluateClassic(bars);
 assert.equal(tierResults([row])[0].qualityTier,s.tier);
 const observing=tierResults([{...row,bars:preparation({volume:false})}]);
 assert.equal(observing[0].tier,'T2');assert.equal(observing[0].classicSignal.eligible,false);
 assert.ok(observing[0].reasons.some(r=>r.includes('次獨立測試')));
 assert.ok(observing[0].reasons.some(r=>r.startsWith('待確認：')));
 const missing=preparation();missing[50].volume=null;
 assert.equal(tierResults([{...row,bars:missing}]).length,0);
});
test('old classic versions cannot grant US membership without actual bars to recompute',()=>{
 const bars=preparation(),old={...evaluateClassic(bars),version:0};
 const row={symbol:'OLD',type:'stock',interval:'1D',classic:{long:old},path:bars.slice(-40).map(c=>c.close)};
 assert.deepEqual(tierResults([row]),[]);
 assert.deepEqual(matchPath([row],[{x:0,y:1},{x:1,y:0}]),[]);
 assert.equal(tierResults([{...row,bars}])[0].classicSignal.version,CLASSIC_VERSION);
});
test('US automatic guides require eligibility and leave pressure to the shared engine',()=>{
 const bars=preparation(),classic={long:evaluateClassic(bars)},patterns={long:[
  {id:'horizontal',distance:0},{id:'trend',distance:.1},{id:'W',distance:1}
 ]};
 let guide;
 const workspace={state:{side:'long'},snapshot:{analyses:[{symbol:'GOOD',interval:'1D',classic,patterns}]},chart:{setGuide(value){guide=value;}}};
 USWorkspace.prototype.applyPatternGuide.call(workspace,'GOOD','1D');
 assert.equal(guide.id,'W');
 workspace.snapshot.analyses[0].classic={long:{...classic.long,eligible:false}};
 USWorkspace.prototype.applyPatternGuide.call(workspace,'GOOD','1D');
 assert.equal(guide,null);
});
test('Crypto native pressure remains visible during an unfinished long or short test',()=>{
 const context={OXClassic:globalThis.OXClassic,window:{}};
 for(const path of ['../src/markets/crypto/scanner.js','../src/components/chart/workspace.js'])
  runInNewContext(readFileSync(new URL(path,import.meta.url),'utf8'),context);
 const duration=3600,boundary=Math.floor(Date.now()/1000/duration)*duration;
 const bars=preparation().map((c,i)=>({...c,time:boundary-(72-i)*duration}));
 bars.push({time:boundary,open:bars.at(-1).close,high:101,low:99,close:100.6,volume:3000});
 const long=context.findStructuralPivotLevels(bars,'1H');
 assert.equal(long.highPressure.state,'valid');assert.ok(Math.abs(long.high-100)<.01);
 const short=context.findStructuralPivotLevels(shortBars(bars),'1H');
 assert.equal(short.lowPressure.state,'valid');assert.ok(Math.abs(short.low-100)<.01);
});
test('TW daily frame only attaches grades to the exact current report date and close',()=>{
 const date='2026-10-01',bars=preparation().map(c=>({...c,date}));
 const entry={data:{candles:bars,dataDate:date,frame:'1D'},classic:classifyTWSeries(bars)};
 const row={symbol:'2330',price:bars.at(-1).close,dataDate:date,changePct:-1};
 assert.equal(classicTWRow(row,entry,date).eligible,true,'Direction is evaluated from OHLCV, not 24H change alone');
 assert.equal(classicTWRow(row,entry,'2026-10-02').tier,'');
 assert.equal(classicTWRow({...row,price:row.price+1},entry,date).tier,'');
});
test('a positive TW day percentage cannot move a bearish current structure into the long ranking',()=>{
 const classic=classifyTWSeries(shortBars(preparation()));
 const row={symbol:'2330',price:100,changePct:20,classic};
 assert.equal(rankChartRows([row],{side:'long'}).length,0);
 assert.equal(rankChartRows([row],{side:'short'})[0].classicSignal.side,'SHORT');
});
test('canvas observations do not grant full radar eligibility or trust unverified cached geometry',()=>{
 const context=prepareCandles(preparation({volume:false}));
 const legacy={'horizontal-resistance':{tier:1,similarity:100},w:{tier:1,similarity:100}};
 const matches=qualifyPatternMatches(context,legacy);
 assert.equal(matches.w,undefined);assert.ok(matches['horizontal-resistance']);
 assert.ok(Object.values(matches).every(m=>m.classicSignal.eligible===false&&m.tier!==1));
});
test('TW backend preserves factual quotes but withholds grades when history is from a different day',async()=>{
 const row={symbol:'2330',dataDate:'2026-10-02',price:200,changePct:10,turnoverTwd:1e12};
 const [result]=await applyClassicToRows([row],'2026-10-02');
 assert.equal(result.price,200);assert.equal(result.turnoverTwd,1e12);
 assert.equal(result.oxScore,null);assert.equal(result.tier,'');assert.equal(result.classic,null);
});
test('US, TW and pattern search share strict T1 plus 15/15 remainder ranking',()=>{
 for(const quality of ['T1','T3']){
  const rows=Array.from({length:55},(_,i)=>({symbol:String(1000+i),type:'stock',interval:'1D',price:100,
   classic:{long:{...rankingSignal(quality),qualityScore:(quality==='T1'?95:70)-i/100}}}));
  const matches=rows.map(row=>({entry:{key:row.symbol+':1D',data:row},match:{classicSignal:row.classic.long,similarity:90,radar:true}}));
  const us=tierResults(rows),tw=rankChartRows(rows),patterns=rankPatternMatches(matches);
  const expected=quality==='T1'?[10,15,15]:[0,15,15];
  for(const output of [us,tw])assert.deepEqual(['T1','T2','T3'].map(t=>output.filter(r=>r.tier===t).length),expected);
  assert.deepEqual([1,2,3].map(t=>patterns.filter(r=>r.match.tier===t).length),expected);
  assert.deepEqual(us.map(r=>r.symbol),tw.map(r=>r.symbol));
  assert.deepEqual(us.map(r=>r.symbol),patterns.map(r=>r.entry.data.symbol));
  assert.ok(patterns.every(r=>r.match.radarTier===r.match.tier));
 }
});
test('US and TW radar retain 30 same-direction observations without promoting any to T1',()=>{
 const observation=evaluateClassic(preparation({volume:false}));
 const rows=Array.from({length:40},(_,i)=>({symbol:String(1000+i),type:'stock',interval:'1D',price:100,classic:{long:observation}}));
 for(const output of [tierResults(rows),rankChartRows(rows)]){
  assert.deepEqual(['T1','T2','T3'].map(t=>output.filter(r=>r.tier===t).length),[0,15,15]);
  assert.ok(output.every(r=>r.observationOnly&&!r.classicSignal.eligible));
 }
});
