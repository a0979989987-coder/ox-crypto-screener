import test from 'node:test';
import assert from 'node:assert/strict';
import {eodFreshness} from '../src/markets/us/eod.js';

test('a completed Friday close stays current through the weekend and before Monday settlement',()=>{
 for(const instant of ['2026-10-03T09:00:00Z','2026-10-04T23:00:00Z','2026-10-05T20:30:00Z'])
  assert.equal(eodFreshness('2026-10-02',Date.parse(instant)).status,'current');
 const stale=eodFreshness('2026-09-30',Date.parse('2026-10-03T09:00:00Z'));
 assert.equal(stale.status,'stale');assert.equal(stale.expectedSessionDate,'2026-10-02');
 assert.equal(eodFreshness('2026-10-02',Date.parse('2026-10-05T21:01:00Z')).status,'stale');
});

test('holiday and early-close settlement gates never promote an unclosed or malformed date',()=>{
 assert.equal(eodFreshness('2026-11-25',Date.parse('2026-11-26T22:00:00Z')).status,'current');
 assert.equal(eodFreshness('2026-11-27',Date.parse('2026-11-27T18:59:00Z')).status,'invalid');
 assert.equal(eodFreshness('2026-11-27',Date.parse('2026-11-27T19:01:00Z')).status,'current');
 for(const value of ['2026-02-30','2026-10-03','2026-10-05',{},'invalid'])
  assert.equal(eodFreshness(value,Date.parse('2026-10-03T09:00:00Z')).status,'invalid');
 assert.equal(eodFreshness(null,Date.parse('2026-10-03T09:00:00Z')).status,'unavailable');
});
