import test from 'node:test';
import assert from 'node:assert/strict';
import {eventDay,matchesEventWindow,todayTaipei} from '../src/markets/us/news-dates.js';
const now = Date.parse('2026-10-02T15:40:00+08:00');
test('US events include date-only records in the Today filter without inventing a time', () => {
  assert.equal(matchesEventWindow({date:'2026-10-02'},{scope:'today',now}),true);
  assert.equal(matchesEventWindow({date:'2026-10-01'},{scope:'today',now}),false);
  assert.equal(eventDay({occursAt:'2026-10-01T17:00:00Z'}),'2026-10-02');
  assert.equal(eventDay({occursAt:'invalid'}),'');
  assert.equal(todayTaipei(Date.parse('2026-10-01T17:00:00Z')),'2026-10-02');
});
test('Taipei weekly boundaries include Sunday all-day events but exclude next Monday', () => {
  assert.equal(matchesEventWindow({date:'2026-09-28'},{now}),true);
  assert.equal(matchesEventWindow({date:'2026-10-04'},{now}),true);
  assert.equal(matchesEventWindow({date:'2026-10-05'},{now}),false);
  assert.equal(matchesEventWindow({occursAt:'2026-10-04T16:00:00Z'},{now}),false);
});
test('watch events retain today all-day records and respect actual timed cutoffs', () => {
  const options = {scope:'watch',watch:new Set(['NVDA']),now};
  assert.equal(matchesEventWindow({date:'2026-10-02',symbols:['NVDA']},options),true);
  assert.equal(matchesEventWindow({date:'2026-10-01',symbols:['NVDA']},options),false);
  assert.equal(matchesEventWindow({date:'2026-10-02',symbols:['AAPL']},options),false);
  assert.equal(matchesEventWindow({occursAt:'2026-10-02T07:00:00Z',symbols:['NVDA']},options),false);
  assert.equal(matchesEventWindow({occursAt:'2026-10-02T08:00:00Z',symbols:['NVDA']},options),true);
});
test('specific selected day overrides the range only while it is explicitly selected', () => {
  assert.equal(matchesEventWindow({date:'2026-11-05'},{scope:'today',date:'2026-11-05',now}),true);
  assert.equal(matchesEventWindow({date:'2026-11-05'},{scope:'today',date:'',now}),false);
});
