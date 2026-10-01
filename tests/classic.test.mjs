import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClassic, evaluateFrames, CLASSIC_VERSION } from '../src/core/classic.js';
import { preparation, shortBars } from './classic-fixtures.mjs';

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
