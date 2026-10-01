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

import {financeCandles,financeQuote} from '../server/markets/us/finance-query.js';
test('source daily history is validated against its symbol and source interval',()=>{
  const daily=chart('1d',[570]);
  assert.equal(financeCandles(daily,'AAPL','1D').length,1);
  assert.throws(()=>financeCandles(daily,'SPY','1D'),/Unexpected source identity/);
  assert.throws(()=>financeCandles(chart('1m',[570]),'AAPL','1D'),/Unexpected source identity/);
});
test('historical adapter preserves true source time and never claims confirmed delay',()=>{
  const result=financeQuote({symbol:'AAPL',regularMarketPrice:100,regularMarketPreviousClose:98,regularMarketTime:1790787600},'AAPL',1,{source:'finance-query',delaySeconds:null});
  assert.equal(result.marketTime,1790787600);assert.equal(result.delaySeconds,null);
  assert.ok(Math.abs(result.changePct-2.04081632653)<1e-8);
});
test('public data requests remain gated even in test mode; old source settings do not enable intraday',async()=>{
  for(const provider of ['finance-query','twelve-data']){
    process.env.US_DATA_PROVIDER=provider;
    assert.deepEqual(capabilities().intervals,['1D','1W','1M']);
    await assert.rejects(handleUS2('chart-v2',{symbol:'AAPL',interval:'1m'},forbidden,forbidden),e=>e.code==='LICENSE_NOT_CONFIRMED');
  }
});
