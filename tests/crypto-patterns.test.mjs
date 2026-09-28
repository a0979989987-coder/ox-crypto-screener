import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PATTERNS,patternById } from '../src/markets/crypto/patterns/catalog.js';
import { normalize,resample,similarity,matchCandles,validateHarmonic,structureValid,queryFromStrokes,sortMatches } from '../src/markets/crypto/patterns/matcher.js';
import { parseCandles,selectUniverse,classicScore } from '../src/markets/crypto/patterns/source.js';

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
  assert.equal(queryFromStrokes([[{x:.1,y:.5},{x:.2,y:.5},{x:.4,y:.5}]]),null);
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
  for(const p of PATTERNS)assert.ok(matchCandles(fixture(p.points),{id:p.id}),p.id);
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
test('universe excludes stock tokens, unavailable instruments and illiquid pairs',()=>{
  const tickers=['BTC','ETH','AAPL','LOW','OFF'].map((s,i)=>({symbol:s+'USDT',lastPr:'10',usdtVolume:s==='LOW'?'90000':String(1e8-i*1e7)}));
  const instruments=tickers.map(t=>({symbol:t.symbol,symbolType:t.symbol==='AAPLUSDT'?'stock':'crypto',type:'perpetual',status:t.symbol==='OFFUSDT'?'offline':'online',quoteCoin:'USDT'}));
  assert.deepEqual(selectUniverse(tickers,instruments,80).map(t=>t.symbol),['BTCUSDT','ETHUSDT']);
});
test('ranking prioritizes similarity, OX only breaks ties',()=>{
  assert.deepEqual(sortMatches([{symbol:'B',similarity:82,oxScore:99},{symbol:'A',similarity:95,oxScore:40},{symbol:'C',similarity:95,oxScore:85}]).map(r=>r.symbol),['C','A','B']);
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
