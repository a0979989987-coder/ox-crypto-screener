import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreloader } from '../src/markets/tw/preload.js';
import { selectUniverse, dailyCandles, weeklyCandles } from '../src/markets/tw/patterns/model.js';

test('TW preload coalesces activation, reuses fresh data and expires without cancelling a pending request', async () => {
  let calls = 0, clock = 0, finish;
  const preload = createPreloader(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, { ttl: 100, now: () => clock });
  const background = preload(), activation = preload(); assert.equal(background, activation);
  await Promise.resolve(); assert.equal(calls, 1);
  finish({ data: { radar: ['2330'] } }); const result = await background;
  assert.equal(await preload(), result); assert.equal(calls, 1);
  clock = 101; const expired = preload(), forced = preload({ force: true }); assert.equal(expired, forced);
  await Promise.resolve(); assert.equal(calls, 2); finish({ data: { radar: ['2317'] } }); await expired;
});
test('TW preload retries failure or unusable data instead of caching a loading/error state', async () => {
  let calls = 0; const preload = createPreloader(() => { calls++; if(calls===1)throw Error('offline'); return { data: null }; });
  await assert.rejects(preload(), /offline/); await preload(); await preload(); assert.equal(calls, 3);
});
test('TW observation pool includes listed and OTC ordinary shares, ranks turnover, excludes warrants and invalid quotes', () => {
  const stock = (symbol, market, turnoverTwd) => ({ symbol, market, turnoverTwd, price: 100 });
  const rows = [stock('2330','TWSE',1e10),stock('6207','TPEX',1e9),stock('030001','TWSE',2e10),stock('1234','OTHER',2e10),stock('3450','TPEX',null)];
  assert.deepEqual(selectUniverse(rows,0).map(x=>x.symbol), ['2330','6207']);
  assert.equal(selectUniverse(rows,1).length,1);
});
test('TW daily OHLC preserves real trading gaps and excludes future/invalid candles', () => {
  const bar = date => ({ date, open:10, high:12, low:9, close:11, volume:100, turnoverTwd:1000 });
  const daily = dailyCandles([bar('2026-09-25'),bar('2026-09-28'),bar('2026-09-30'),{...bar('2026-09-29'),high:8}], '2026-09-29');
  assert.equal(daily.length,2); assert.equal(daily[1].time-daily[0].time,3*86400);
  assert.equal(daily[1].time, Date.parse('2026-09-28T00:00:00+08:00')/1000);
});
test('TW weekly bars aggregate actual OHLC and do not include an unfinished week', () => {
  const rows = [{date:'2026-09-21',open:10,high:12,low:9,close:11,volume:100,turnoverTwd:1000},
    {date:'2026-09-24',open:11,high:14,low:10,close:13,volume:200,turnoverTwd:2000},
    {date:'2026-09-28',open:13,high:15,low:12,close:14,volume:300,turnoverTwd:3000}];
  const daily = dailyCandles(rows,'2026-09-28'), weeks = weeklyCandles(daily,'2026-09-28',Date.parse('2026-09-30T10:00:00+08:00'));
  assert.equal(weeks.length,1); assert.deepEqual([weeks[0].open,weeks[0].high,weeks[0].low,weeks[0].close,weeks[0].volume,weeks[0].quoteVolume],[10,14,9,13,300,3000]);
  // A holiday-shortened week becomes complete at the weekend without invented Friday candles.
  assert.equal(weeklyCandles(daily,'2026-09-24',Date.parse('2026-09-26T10:00:00+08:00')).length,1);
});
