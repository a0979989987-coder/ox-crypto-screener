import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClassic, evaluateFrames, CLASSIC_VERSION, rankClassicTiers } from '../src/core/classic.js';
import { preparation, shortBars, rankingSignal } from './classic-fixtures.mjs';

test('repeated valid overhead pressure with upward progress and volume qualifies before breakout', () => {
  const s = evaluateClassic(preparation(), { frame: '4H' });
  assert.equal(s.version, CLASSIC_VERSION);
  assert.equal(s.eligible, true, JSON.stringify(s.rejectionReasons));
  assert.equal(s.phase, 'prebreakout');
  assert.ok(s.pressure.touches >= 2);
  assert.equal(s.pressure.state, 'valid');
});
test('price scale and market labels do not change qualification or quality tier', () => {
  const a = evaluateClassic(preparation(), { market: 'crypto' });
  for (const scale of [0.0001, 10, 10000]) {
    const b = evaluateClassic(preparation({ scale }), { market: 'tw' });
    assert.equal(b.eligible, a.eligible); assert.equal(b.tier, a.tier); assert.equal(b.phase, a.phase);
  }
});
test('nearness or absolute turnover cannot compensate for absent upward volume', () => {
  const s = evaluateClassic(preparation({ volume: false }), { turnover: 1e12 });
  assert.equal(s.eligible, false); assert.equal(s.tier, null);
  assert.ok(s.rejectionReasons.includes('上攻量能不足'));
});
test('missing volume stays unavailable', () => {
  const bars = preparation(); bars[50].volume = null;
  const s = evaluateClassic(bars);
  assert.equal(s.eligible, false); assert.equal(s.volume.ratio, null);
});
test('down-volume and current falling structure are excluded at every tier', () => {
  const bars = preparation(), last = bars.at(-1);
  Object.assign(last, { close: last.open - 2, low: last.open - 2.2, volume: 12000 });
  const s = evaluateClassic(bars);
  assert.equal(s.eligible, false); assert.equal(s.tier, null); assert.equal(s.volume.distribution, true);
});
test('cross-and-return consumes the original pressure instead of resetting preparation', () => {
  const bars = preparation();
  for (const [i, close] of [[50, 102], [51, 103], [52, 94]]) {
    const open = bars[i].open;
    Object.assign(bars[i], { close, high: Math.max(open, close) + .3, low: Math.min(open, close) - .3 });
  }
  const s = evaluateClassic(bars);
  const old = s.levels.filter(p => p.kind === 'horizontal' && Math.abs(p.level - 100) < .1);
  assert.ok(old.length); assert.ok(old.every(p => p.state === 'consumed'));
  assert.ok(!s.pressure || Math.abs(s.pressure.level - 100) > .1);
});
test('an unfinished crossing is a probe, never a confirmed breakout', () => {
  const bars = preparation(), last = bars.at(-1);
  bars.push({ time: last.time + 3600, open: last.close, high: 101, low: last.close - .1, close: 100.6, volume: 3000, provisional: true });
  const s = evaluateClassic(bars);
  assert.equal(s.phase, 'probe'); assert.equal(s.pressure.state, 'valid');
  assert.equal(s.closedAt, last.time); assert.equal(s.provisional, true);
});
test('future bars cannot create touches or change a historical scan', () => {
  const bars = preparation(), now = bars.at(-1).time * 1000 + 1000;
  const future = { ...bars.at(-1), time: now / 1000 + 100000, high: 300, close: 250, volume: 1e8 };
  assert.deepEqual(evaluateClassic([...bars, future], { now }), evaluateClassic(bars, { now }));
});
test('short and long rules are mirrored with strictly separated direction', () => {
  const bars = shortBars(preparation()), bear = evaluateClassic(bars, { side: 'short' }), bull = evaluateClassic(bars);
  assert.equal(bear.eligible, true); assert.equal(bear.side, 'SHORT'); assert.equal(bull.eligible, false);
});
test('a higher-frame setup cannot bypass a weak trigger frame', () => {
  const s = evaluateFrames({ '4H': preparation(), '1H': shortBars(preparation()) }, { setupFrame: '4H', triggerFrame: '1H' });
  assert.equal(s.eligible, false); assert.equal(s.tier, null);
  assert.ok(s.rejectionReasons.some(r => r.includes('1H')));
});

test('both rising and falling diagonal overhead pressures qualify from repeated rejected tests',()=>{
 for(const slope of [-.04,.04]){
  const bars=preparation().map((c,i)=>({...c,open:c.open+slope*i,high:c.high+slope*i,low:c.low+slope*i,close:c.close+slope*i}));
  const s=evaluateClassic(bars);assert.equal(s.eligible,true);assert.equal(s.pressure.kind,'diagonal');assert.equal(s.pressure.touches,3);assert.ok(Math.abs(s.pressure.slope-slope)<1e-8);
 }
});
test('an upper wick test keeps pressure valid until a close actually confirms crossing',()=>{
 const bars=preparation();bars.at(-1).high=100.2;
 const s=evaluateClassic(bars);assert.equal(s.phase,'prebreakout');assert.equal(s.pressure.state,'valid');
});
test('a higher-frame setup cannot waive exhaustion on the trigger frame',()=>{
 const trigger=preparation(),last=trigger.at(-1);last.high+=6;
 const s=evaluateFrames({'4H':preparation(),'1H':trigger},{setupFrame:'4H',triggerFrame:'1H'});
 assert.equal(s.eligible,false);assert.equal(s.tier,null);
});
test('T1 overflow fills T2 and T3 as the next 15 plus 15 ranked candidates',()=>{
 const input=Array.from({length:55},(_,i)=>({symbol:'COIN'+i,classicSignal:{...rankingSignal(),qualityScore:100-i/10}}));
 const output=rankClassicTiers([...input,input[0]],{side:'long'});
 assert.deepEqual(['T1','T2','T3'].map(t=>output.filter(r=>r.tier===t).length),[10,15,15]);
 assert.equal(new Set(output.map(r=>r.symbol)).size,40);
 assert.ok(output.every(r=>r.qualityTier==='T1'));
 assert.deepEqual(output.filter(r=>r.tier==='T2').map(r=>r.symbol),input.slice(10,25).map(r=>r.symbol));
 assert.deepEqual(output.filter(r=>r.tier==='T3').map(r=>r.symbol),input.slice(25,40).map(r=>r.symbol));
});
test('an empty strict T1 never borrows weaker candidates while T2 and T3 still fill 15 each',()=>{
 const input=Array.from({length:45},(_,i)=>({symbol:'C'+i,classicSignal:{...rankingSignal('T3'),qualityScore:70-i/10}}));
 input.push({symbol:'INVALID',classicSignal:{...rankingSignal(),eligible:false}});
 input.push({symbol:'BEAR',classicSignal:rankingSignal('T1','short')});
 const output=rankClassicTiers(input,{side:'long'});
 assert.deepEqual(['T1','T2','T3'].map(t=>output.filter(r=>r.tier===t).length),[0,15,15]);
 assert.ok(output.every(r=>r.classicSignal.eligible&&r.classicSignal.side==='LONG'));
 assert.equal(output.length,30);
});

test('a supported 1H impulse cannot replace missing 4H directional volume',()=>{
 const s=evaluateFrames({'4H':preparation({volume:false}),'1H':preparation()}, {setupFrame:'4H',triggerFrame:'1H'});
 assert.equal(s.eligible,false);assert.ok(s.rejectionReasons.includes('上攻量能不足'));
});
test('momentum without a tested liquidity origin is not a classic continuation',()=>{
 const bars=Array.from({length:72},(_,i)=>({time:1700000000+i*3600,open:90+i*.4,close:90+i*.4+.3,high:90+i*.4+.4,low:90+i*.4-.1,volume:i>=64?2000:1000}));
 const s=evaluateClassic(bars);assert.equal(s.direction.confirmed,true);assert.equal(s.volume.supported,true);
 assert.equal(s.eligible,false);assert.equal(s.pressure,null);assert.equal(s.phase,'watch');
});
test('a weak bounce inside a larger decline and its mirrored pullback never change sides',()=>{
 const bars=preparation().map((c,i)=>{const offset=i<56?(56-i)*.7:0;return {...c,open:c.open+offset,close:c.close+offset,high:c.high+offset,low:c.low+offset};});
 for(const [input,side] of [[bars,'long'],[shortBars(bars),'short']]){
  const s=evaluateClassic(input,{side});assert.equal(s.direction.opposingContext,true);assert.equal(s.eligible,false);
 }
});
test('previous rule-version signals cannot reenter the current ranking',()=>{
 assert.equal(rankClassicTiers([{symbol:'STALE',classicSignal:{...rankingSignal(),version:CLASSIC_VERSION-1}}]).length,0);
});
test('a previous decline does not ban a recovered, strong rebound attacking valid pressure',()=>{
 const bars=preparation().map((c,i)=>{const offset=i<12?(12-i)*2:0;return {...c,open:c.open+offset,close:c.close+offset,high:c.high+offset,low:c.low+offset};});
 const s=evaluateClassic(bars);assert.equal(s.eligible,true,JSON.stringify(s.rejectionReasons));
 assert.equal(s.pressure.state,'valid');assert.equal(s.volume.supported,true);
});
