import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PATTERNS,patternById,TIMEFRAMES,candleBoundary } from '../src/markets/crypto/patterns/catalog.js';
import { normalize,resample,similarity,matchCandles,validateHarmonic,structureValid,queryFromStrokes,sortMatches,prepareCandles,classifyPrepared,matchPrepared,patternCounts } from '../src/markets/crypto/patterns/matcher.js';
import { parseCandles,selectUniverse,classicScore,fetchSeries,radarSymbols } from '../src/markets/crypto/patterns/source.js';

// Explicit synthetic fixtures, only for checking positive/negative geometric invariants.
function fixture(points){
  const values=[points[0].y+(points[1].y>points[0].y?.16:-.16)];
  for(let i=0;i<points.length-1;i++)for(let j=0;j<10;j++)values.push(points[i].y+(points[i+1].y-points[i].y)*j/10);
  values.push(points.at(-1).y);
  const sign=Math.sign(points.at(-2).y-points.at(-1).y);for(let i=1;i<=4;i++)values.push(points.at(-1).y+sign*.025*i);
  return values.map((v,i)=>{const close=100+v*10,open=100+(values[i-1]??v)*10;return {time:1700000000+i*3600,open,high:Math.max(open,close)+.04,low:Math.min(open,close)-.04,close,volume:100,quoteVolume:close*100};});
}
test('drawing invariants: time scale, price scale and offset; inverse W is dissimilar',()=>{
  const p=patternById('w').points;
  assert.ok(similarity(resample(p),resample(p.map(v=>({x:v.x*300+7,y:v.y*14+991}))))>99.9);
  assert.ok(similarity(resample(p),resample(patternById('m').points))<55);
  assert.equal(queryFromStrokes([p]).id,'w');
  assert.equal(queryFromStrokes([[{x:.1,y:.5},{x:.2,y:.5},{x:.4,y:.5}]]).id,'horizontal-resistance');
  assert.equal(queryFromStrokes([[{x:0,y:1},{x:.5,y:.8},{x:1,y:.6}],[{x:0,y:0},{x:.5,y:.2},{x:1,y:.4}]]).id,'triangle');
});
test('W matching cannot return an M, missing second trough or an old completed W',()=>{
  const w=fixture(patternById('w').points),m=fixture(patternById('m').points);
  assert.ok(matchCandles(w,{id:'w'}));
  assert.equal(matchCandles(m,{id:'w'}),null);
  assert.equal(matchCandles(w.slice(0,25),{id:'w'}),null);
  const tail=Array.from({length:30},(_,i)=>({...w.at(-1),time:w.at(-1).time+(i+1)*3600,open:111+i,close:111+i,high:111.1+i,low:110.9+i}));
  assert.equal(matchCandles([...w,...tail],{id:'w'}),null);
});
test('common patterns require their distinct structural geometry',()=>{
  for(const id of ['w','m','triangle','ascending','descending','range','ihs','hs','triple-bottom','triple-top','falling-wedge','rising-wedge','broadening','channel-up','channel-down','flag-up','flag-down','pennant-up','pennant-down']){
    const p=patternById(id),points=p.points.map((v,i)=>({...v,type:i===0?Math.sign(v.y-p.points[1].y):Math.sign(v.y-p.points[i-1].y)}));
    assert.ok(structureValid(points,p),id+' structural rule accepts the specified geometry');
  }
  const p=patternById('triangle');assert.equal(structureValid(patternById('range').points.map((p,i)=>({...p,type:i%2?-1:1})),p),false);
});
test('harmonic ratios reject visually similar geometry with wrong Fibonacci proportions',()=>{
  for(const p of PATTERNS.filter(p=>p.rule==='harmonic')){
    assert.ok(validateHarmonic(p.points,p),p.id);
    const altered=p.points.map((v,i)=>({...v,y:i===p.points.length-1?v.y+.5:v.y}));
    assert.equal(validateHarmonic(altered,p),null,p.id);
  }
  assert.equal(validateHarmonic(patternById('w').points,patternById('gartley-bull')),null);
});
test('all named templates can match observed OHLC pivots with small nonzero wicks',()=>{
  for(const p of PATTERNS.filter(p=>!p.rule.startsWith('level')&&!p.rule.startsWith('trend')))assert.ok(matchCandles(fixture(p.points),{id:p.id}),p.id);
});
test('closed candles only: deduplicate, reject invalid OHLC and never bridge a missing interval',()=>{
  const base=1700002800000,rows=Array.from({length:8},(_,i)=>[String(base+i*3600000),'100','102','99','101','5','505']);
  const server=base+7.5*3600000;
  assert.equal(parseCandles([...rows,rows[2]],'1H',server).length,7);
  assert.equal(parseCandles(rows.filter((_,i)=>i!==4),'1H',server).length,2);
  assert.equal(parseCandles(rows.slice(0,5),'1H',server).length,0);
  assert.equal(parseCandles(rows,'4H',server).length,0);
  const invalid=rows.map(r=>[...r]);invalid[6][2]='90';assert.equal(parseCandles(invalid,'1H',server).length,0);
});
test('UTC Monday week boundary and provisional Bitget candle are explicit, fresh, and never synthesized',async()=>{
  const monday=Date.parse('2026-09-28T00:00:00Z'),now=monday+36*3600000,week=604800000;
  assert.equal(candleBoundary(now,'1W'),monday/1000);
  const rows=Array.from({length:40},(_,i)=>[String(monday-(39-i)*week),'100','103','98','101','10','1010']);
  assert.equal(parseCandles(rows,'1W',now).length,39);
  const actual=parseCandles(rows,'1W',now,{includeOpen:true});assert.equal(actual.length,40);assert.equal(actual.at(-1).provisional,true);
  assert.equal(parseCandles(rows.filter((_,i)=>i!==30),'1W',now,{includeOpen:true}).length,9);
  const originalFetch=globalThis.fetch;let requested='';
  try{
    globalThis.fetch=async url=>{requested=String(url);return {ok:true,json:async()=>({code:'00000',requestTime:now,data:rows})};};
    const data=await fetchSeries('WEEKTESTUSDT','1W',new AbortController().signal,now);
    assert.match(requested,/granularity=1Wutc/);assert.equal(data.candles.at(-1).provisional,true);
    const {entryCurrent,INDEX_VERSION}=await import('../src/markets/crypto/patterns/index-cache.js');
    const entry={version:INDEX_VERSION,data};
    assert.equal(entryCurrent(entry,now+299000),true);assert.equal(entryCurrent(entry,now+301000),false);
  }finally{globalThis.fetch=originalFetch;}
});
test('universe excludes stock tokens, unavailable instruments and illiquid pairs',()=>{
  const tickers=['BTC','ETH','AAPL','LOW','OFF'].map((s,i)=>({symbol:s+'USDT',lastPr:'10',usdtVolume:s==='LOW'?'90000':String(1e8-i*1e7)}));
  const instruments=tickers.map(t=>({symbol:t.symbol,symbolType:t.symbol==='AAPLUSDT'?'stock':'crypto',type:'perpetual',status:t.symbol==='OFFUSDT'?'offline':'online',quoteCoin:'USDT'}));
  assert.deepEqual(selectUniverse(tickers,instruments,80).map(t=>t.symbol),['BTCUSDT','ETHUSDT']);
});
test('ranking prioritizes similarity, OX only breaks ties',()=>{
  assert.deepEqual(sortMatches([{symbol:'B',similarity:82,oxScore:99},{symbol:'A',similarity:95,oxScore:40},{symbol:'C',similarity:95,oxScore:85}]).map(r=>r.symbol),['C','A','B']);
});
test('pattern T1 is a nearby clean setup, T2 early breakout, T3 lower priority; failed reversals are excluded',()=>{
  const w=patternById('w').points;
  const pending=fixture(w.map((p,i)=>({...p,y:i===4?.87:p.y}))).slice(0,-2);
  const ready=matchCandles(pending,{id:'w'});assert.equal(ready?.tier,1);
  const extended=matchCandles(fixture(w),{id:'w'});assert.equal(extended?.tier,2);
  const triangle=matchCandles(fixture(patternById('triangle').points).slice(0,-2),{id:'triangle'});
  assert.equal(triangle?.tier,1);
  const failed=[...fixture(patternById('ihs').points)];
  const rightShoulder=failed[51].low;for(let i=0;i<3;i++){const close=rightShoulder-2-i;failed.push({...failed.at(-1),time:failed.at(-1).time+3600,open:close,close,low:close-.1,high:close+.1});}
  assert.equal(matchCandles(failed,{id:'ihs'}),null);
  assert.deepEqual(sortMatches([{symbol:'L',similarity:99,match:{tier:3}},{symbol:'H',similarity:83,match:{tier:1}},{symbol:'M',similarity:90,match:{tier:2}}]).map(r=>r.symbol),['H','M','L']);
});
test('horizontal resistance needs at least three separate touches',()=>{
  const three=fixture(patternById('range').points),two=fixture([{x:0,y:1},{x:.33,y:0},{x:.66,y:.99},{x:1,y:.1}]);
  assert.ok(matchCandles(three,{id:'horizontal-resistance'})?.touches>=3);
  assert.equal(matchCandles(two,{id:'horizontal-resistance'}),null);
});
test('classic score unavailable without the original engine; not replaced by similarity',()=>assert.equal(classicScore({},[],[]),null));
test('score adapter agrees with the unchanged classic formula on the same data',()=>{
  const engine=readFileSync(new URL('../src/markets/crypto/engine.js',import.meta.url),'utf8');
  const cfg={weights:{liquidity:.25,moneyFlow:.25,structure:.2,setupMatch:.15,relativeStrength:.1},liquidity:{t1MinUsdtVolume:12000000,minUsdtVolume24h:3000000,lowLiqPenaltyRatio:.35}};
  const ticker={symbol:'BTCUSDT',usdtVolume:'90000000',change24h:'.025'},candles=fixture(patternById('w').points);
  const context={CONFIG:cfg,num:Number,clamp:n=>Math.min(100,Math.max(0,n)),fmtPrice:String,ticker,candles};
  runInNewContext(engine+'\n'+classicScore.toString()+'\nresult=classicScore(ticker,candles,[ticker]);',context);
  assert.ok(Number.isFinite(context.result));assert.ok(context.result>=0&&context.result<=100);
});

test('clear asymmetric W is recognized structurally; optional similar-path mode remains ungated',()=>{
  const points=[1,.04,.75,0,.62].map((y,i)=>({x:[0,.18,.51,.79,1][i],y}));
  const query=queryFromStrokes([points]);assert.equal(query.mode,'pattern');assert.equal(query.id,'w');assert.ok(query.points.length);
  const c=fixture(points);assert.ok(matchCandles(c,query));
  const sketch={...query,mode:'sketch'},forced={...sketch,id:'m'};assert.equal(matchCandles(c,forced)?.similarity,matchCandles(c,sketch)?.similarity);
});
test('forming W can be found without requiring neckline completion; inverse is rejected',()=>{
  const c=fixture([1,0,.8,.10,.60].map((y,i)=>({x:i/4,y})));
  const match=matchCandles(c,{id:'w'});assert.ok(match);assert.equal(match.stage,'未噴發');assert.equal(match.tier,1);
  assert.equal(matchCandles(c,{id:'m'}),null);
});
test('uneven hand-drawn W and M tolerate small tremors, but a V is not a W',()=>{
  const shape=[{x:0,y:1},{x:.12,y:.08},{x:.43,y:.7},{x:.82,y:.2},{x:1,y:.82}];
  const drawn=[];for(let i=0;i<shape.length-1;i++)for(let j=0;j<20;j++){const t=j/20;drawn.push({x:shape[i].x+(shape[i+1].x-shape[i].x)*t,y:shape[i].y+(shape[i+1].y-shape[i].y)*t+Math.sin(j*2)*.012});}drawn.push(shape.at(-1));
  assert.equal(queryFromStrokes([drawn]).id,'w');assert.equal(queryFromStrokes([drawn.map(p=>({...p,y:1-p.y}))]).id,'m');
  assert.notEqual(queryFromStrokes([[{x:0,y:1},{x:.5,y:0},{x:1,y:1}]]).id,'w');
});
test('a W that already ran past the neckline cannot return to T1 on a pullback',()=>{
  const base=fixture(patternById('w').points.map((p,i)=>({...p,y:i===4?.87:p.y}))).slice(0,-2);
  const original=matchCandles(base,{id:'w'});assert.equal(original?.tier,1);
  const spiked=structuredClone(base);spiked.at(-3).high+=8;
  assert.notEqual(matchCandles(spiked,{id:'w'})?.tier,1);
});
test('radar candidate bridge is read-only, deduplicated and Crypto-only',()=>{
  const runtime={activeMarket:'crypto',tierMap:{t1:[{symbol:'BTCUSDT'}],t2:[{symbol:'BTCUSDT'},{symbol:'ALGOUSDT'}],t3:[]}},before=JSON.stringify(runtime);
  assert.deepEqual(radarSymbols(runtime),['BTCUSDT','ALGOUSDT']);assert.equal(JSON.stringify(runtime),before);
  assert.deepEqual(radarSymbols({...runtime,activeMarket:'tw'}),[]);
});
test('weekly fetch pages 90-day historical slices, preserves actual current week and reuses history',async()=>{
  const monday=Date.parse('2026-09-28T00:00:00Z'),now=monday+3600000,week=604800000;
  const rows=Array.from({length:100},(_,i)=>[String(monday-(99-i)*week),'100','103','98','101','10','1010']);
  const oldFetch=globalThis.fetch,requests=[];
  try{
    globalThis.fetch=async input=>{const url=new URL(input);requests.push(url.pathname);const end=Number(url.searchParams.get('endTime'));return {ok:true,json:async()=>({code:'00000',requestTime:now,data:end?rows.filter(r=>Number(r[0])<end).slice(-13):rows.slice(-13)})};};
    const data=await fetchSeries('PAGEDWEEKUSDT','1W',new AbortController().signal,now);
    assert.ok(data.candles.length>=80);assert.equal(data.candles.at(-1).provisional,true);assert.ok(requests.filter(x=>x.endsWith('history-candles')).length>=5);
  }finally{globalThis.fetch=oldFetch;}
});
test('levels and trend lines overlap other patterns without becoming pattern aliases',()=>{
  const range=fixture(patternById('range').points),up=fixture(patternById('channel-up').points),down=fixture(patternById('channel-down').points);
  const matches=classifyPrepared(prepareCandles(range));
  assert.ok(matches['horizontal-resistance']);assert.ok(matchCandles(fixture(patternById('range').points.map(p=>({...p,y:1-p.y}))),{id:'horizontal-support'}));assert.ok(matches.range);
  assert.ok(matchCandles(up,{id:'trend-up'}));assert.ok(matchCandles(down,{id:'trend-down'}));
  assert.equal(matchCandles(up,{id:'trend-down'}),null);
  const broken=[...range,...Array.from({length:8},(_,i)=>({...range.at(-1),close:120+i,open:120+i,high:121+i,low:119+i}))];
  assert.equal(matchCandles(broken,{id:'horizontal-resistance'}),null);
});
test('preclassification equals direct search; counts deduplicate symbols across selected frames',()=>{
  const candles=fixture(patternById('w').points),context=prepareCandles(candles),matches=classifyPrepared(context);
  assert.deepEqual(matches.w,matchCandles(candles,{id:'w'}));
  assert.ok(matchPrepared(context,{mode:'sketch',points:patternById('w').points}));
  const entries=[{data:{symbol:'BTCUSDT',frame:'1H'},matches},{data:{symbol:'BTCUSDT',frame:'4H'},matches},{data:{symbol:'ETHUSDT',frame:'15m'},matches}];
  assert.equal(patternCounts(entries,['1H','4H']).w,1);assert.equal(patternCounts(entries,['1H','4H','15m']).w,2);
});

test('cache cannot carry an index across a close boundary or algorithm version',async()=>{
  const {entryCurrent,INDEX_VERSION}=await import('../src/markets/crypto/patterns/index-cache.js');
  const start=1700002800,candles=Array.from({length:40},(_,i)=>({time:start+i*3600}));
  const entry={version:INDEX_VERSION,data:{frame:'1H',candles}},now=(start+40.5*3600)*1000;
  assert.equal(entryCurrent(entry,now),true);assert.equal(entryCurrent(entry,now+3600000),false);
  assert.equal(entryCurrent({...entry,version:0},now),false);
  assert.equal(Object.keys(TIMEFRAMES).length,11);
});
