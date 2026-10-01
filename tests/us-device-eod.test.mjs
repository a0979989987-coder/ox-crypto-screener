import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceDataset, deviceCandles } from '../src/markets/us/device-eod-core.js';
import { tradingDay, shiftDate, nyEpoch } from '../src/markets/us/calendar.js';
import { usDisplayCapabilities } from '../src/markets/us/widget-config.js';
import { nativeAllowed } from '../src/markets/us/view-utils.js';

// Synthetic values are confined to unit tests. Live acceptance uses the real
// private closing dataset supplied through the same user-visible file picker.
const now = Date.parse('2026-10-01T08:00:00Z');
function packet() {
  const bars = [];
  for (let date = '2026-06-01'; date <= '2026-09-30'; date = shiftDate(date, 1))
    if (tradingDay(date).open) bars.push({ date, open:100, high:102, low:98, close:101, volume:1000 });
  return { format:'ox-us-device-eod', version:1, mode:'eod', sessionDate:'2026-09-30',
    collectedAt:'2026-10-01T05:00:00Z', provider:'unit-test-only',
    directory:[{symbol:'SPY',name:'Benchmark fixture',type:'ETF'}], histories:{SPY:bars},
    snapshot:{quotes:[{symbol:'SPY',price:9999}],analyses:[{symbol:'SPY',tier:'T1'}]} };
}
test('device file derives native candles, quote and analysis without claiming public rights', async () => {
  const dataset = await buildDeviceDataset(packet(), { now });
  assert.equal(dataset.snapshot.quotes[0].price, 101);
  assert.equal(dataset.snapshot.quotes[0].marketTime, nyEpoch('2026-09-30', 960));
  assert.equal(dataset.snapshot.analyses[0].price, 101);
  assert.equal(dataset.snapshot.analyses[0].tier, undefined);
  assert.equal(dataset.snapshot.analyses[0].bars.at(-1).close, 101);
  assert.equal(usDisplayCapabilities(dataset.capabilities).chartMode, 'native');
  assert.equal(nativeAllowed(dataset.capabilities), true);
  assert.equal(dataset.capabilities.externalDisplayConfirmed, false);
  assert.equal(dataset.capabilities.dataScope, 'device');
  const daily = deviceCandles(dataset, 'SPY', { limit:3 });
  assert.equal(daily.bars.length, 3); assert.equal(daily.historyExhausted, false);
  assert.equal(daily.bars.at(-1).date, '2026-09-30');
  assert.equal(deviceCandles(dataset, 'SPY', { interval:'1W' }).bars.at(-1).periodEnd, '2026-09-25');
  assert.equal(deviceCandles(dataset, 'SPY', { interval:'1M' }).bars.at(-1).periodEnd, '2026-09-30');
  assert.equal(deviceCandles(dataset, 'SPY', { to:'2026-09-30' }).bars.at(-1).date, '2026-09-29');
  assert.throws(() => deviceCandles(dataset, 'SPY', { interval:'1m' }), /日／週／月/);
  assert.throws(() => deviceCandles(dataset, 'SPY', { extendedHours:true }), /日／週／月/);
  assert.throws(() => deviceCandles(dataset, 'MISSING'), /不在這份/);
});
test('invalid or forming histories and inconsistent dates never become a device dataset', async () => {
  const cases = [
    p => { p.sessionDate = '2026-10-01'; },
    p => { p.collectedAt = '2026-09-30T19:00:00Z'; },
    p => { p.histories.SPY[3].high = 90; },
    p => { p.histories.SPY[3].volume = -1; },
    p => { p.histories.SPY[3].close = '101'; },
    p => { p.histories.SPY[3].date = p.histories.SPY[2].date; },
    p => { p.histories.SPY.at(-1).date = '2026-10-01'; },
    p => { p.directory = []; },
    p => { p.histories.SPY.pop(); },
    p => { p.format = 'untrusted-other-format'; },
  ];
  for (const mutate of cases) { const value = packet(); mutate(value); await assert.rejects(buildDeviceDataset(value, { now })); }
});
