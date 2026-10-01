import test from 'node:test';
import assert from 'node:assert/strict';
import { handleUS2, capabilities } from '../server/markets/us/service.js';
import { resetCache } from '../server/markets/us/cache.js';
import { resetBudget } from '../server/markets/us/budget.js';
import { nyEpoch } from '../src/markets/us/calendar.js';
process.env.US_DATA_PROVIDER = 'finance-query';
process.env.NODE_ENV = 'test';
const candle = minute => ({ timestamp: nyEpoch('2026-09-30', minute), open: 100, high: 102, low: 99, close: 101, volume: 500 });
const chart = (interval, minutes) => ({ symbol: 'AAPL', interval, meta: { dataGranularity: interval }, candles: minutes.map(candle) });
const forbidden = () => { throw Error('must not consume Twelve Data'); };

test('Finance Query uses confirmed minute data and excludes market-close rows; bootstrap and tail share upstream', async () => {
  resetCache(); resetBudget(); let calls = 0;
  const load = async (path, params) => {
    calls++; assert.equal(path, '/chart/AAPL'); assert.deepEqual(params, { interval: '1m', range: '5d' });
    return chart('1m', [570, 571, 960]);
  };
  const first = await handleUS2('chart-v2', { symbol: 'AAPL', interval: '1m' }, forbidden, load);
  const tail = await handleUS2('chart-v2', { symbol: 'AAPL', interval: '1m', limit: 1 }, forbidden, load);
  assert.equal(calls, 1); assert.equal(first.bars.length, 2);
  assert.deepEqual(tail.bars, first.bars.slice(-1));
  assert.equal(first.source, 'finance-query'); assert.equal(first.adjustment, 'unknown');
  assert.equal(first.delaySeconds, null);
});
test('Finance Query rejects a daily response to a minute request before caching it', async () => {
  resetCache(); resetBudget(); let calls = 0;
  const load = async () => { calls++; return calls === 1 ? chart('1d', [570]) : chart('1m', [570]); };
  await assert.rejects(handleUS2('chart-v2', { symbol: 'AAPL', interval: '1m' }, forbidden, load), /Unexpected source identity/);
  const result = await handleUS2('chart-v2', { symbol: 'AAPL', interval: '1m' }, forbidden, load);
  assert.equal(calls, 2); assert.equal(result.bars.length, 1);
});
test('Finance Query aggregates four-hour sessions from confirmed hourly data and reuses that source for 1H', async () => {
  resetCache(); resetBudget(); let calls = 0;
  const load = async () => { calls++; return chart('1h', [570, 630, 690, 750, 810, 870, 930]); };
  const four = await handleUS2('chart-v2', { symbol: 'AAPL', interval: '4H' }, forbidden, load);
  const hour = await handleUS2('chart-v2', { symbol: 'AAPL', interval: '1H' }, forbidden, load);
  assert.equal(four.bars.length, 2); assert.equal(four.bars[0].volume, 2000);
  assert.equal(hour.bars.length, 7); assert.equal(calls, 1);
});
test('Finance Query quotes preserve provider identity, market seconds and unknown delay', async () => {
  resetCache(); resetBudget();
  const result = await handleUS2('quote-v2', { symbol: 'AAPL' }, forbidden, async () => ({
    symbol: 'AAPL', regularMarketPrice: 100, regularMarketTime: 1790787600, marketState: 'REGULAR',
    regularMarketChange: 2, regularMarketPreviousClose: 98, regularMarketChangePercent: 0.0204,
  }));
  assert.equal(result.quote.price, 100); assert.equal(result.quote.source, 'finance-query');
  assert.equal(result.quote.marketTime, 1790787600); assert.equal(result.quote.marketOpen, true);
  assert.equal(result.quote.delaySeconds, null);
  assert.ok(Math.abs(result.quote.changePct - 2.04081632653) < 0.000001);
});
test('Finance Query does not expose unverified frames or request upstream without public display confirmation', async () => {
  assert.deepEqual(capabilities().intervals, ['1m','5m','15m','30m','1H','4H','1D']);
  await assert.rejects(handleUS2('chart-v2', { symbol: 'AAPL', interval: '1W' }, forbidden, forbidden), e => e.code === 400);
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(handleUS2('chart-v2', { symbol: 'AAPL', interval: '1D' }, forbidden, forbidden), e => e.code === 'LICENSE_NOT_CONFIRMED');
  } finally { process.env.NODE_ENV = 'test'; }
});
