import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_US_DISPLAY, widgetSymbol, chartWidgetSettings } from '../src/markets/us/widget-config.js';
import { capabilities, handleUS2 } from '../server/markets/us/service.js';
import handler from '../api/v1/us/[endpoint].js';

test('free display does not claim raw OHLCV, redistribution rights or complete-market realtime',()=>{
  assert.equal(capabilities().chartMode,'widget');
  assert.equal(FREE_US_DISPLAY.externalDisplayConfirmed,false);
  assert.equal(FREE_US_DISPLAY.rawDataAvailable,false);
  assert.equal(FREE_US_DISPLAY.delaySeconds,null);
});
test('free display pins US ADR and ETF exchanges and rejects ambiguous symbols',()=>{
  assert.equal(widgetSymbol('TSM'),'NYSE:TSM');
  assert.equal(widgetSymbol('SPY'),'AMEX:SPY');
  assert.equal(widgetSymbol('QQQ'),'NASDAQ:QQQ');
  assert.equal(widgetSymbol('AAPL',{exchange:'NASDAQ'}),'NASDAQ:AAPL');
  assert.equal(widgetSymbol('BRK.B',{mic:'XNYS'}),'NYSE:BRK.B');
  assert.equal(widgetSymbol('NEW'),null);
});
test('all nine intervals use genuine provider timeframes and request blue/red preferences',()=>{
  for(const interval of ['1m','5m','15m','30m','1H','4H','1D','1W','1M']){
    const s=chartWidgetSettings('SPY',interval,{});
    assert.equal(s.symbol,'AMEX:SPY');assert.equal(s.allow_symbol_change,false);
    assert.equal(s.overrides['mainSeriesProperties.candleStyle.upColor'],'#00b8d4');
    assert.equal(s.locale,'zh_TW');assert.equal(s.theme,'dark');
    assert.ok(s.interval);assert.equal(s.customer,undefined);
  }
});
test('normal charts have one OX toolbar; provider tools remain explicitly available',()=>{
  const compact=chartWidgetSettings('SPY','1D',{});
  assert.equal(compact.hide_top_toolbar,true);assert.equal(compact.hide_side_toolbar,true);
  assert.equal(compact.hide_legend,false);assert.equal(compact.hide_volume,false);
  const analysis=chartWidgetSettings('SPY','1D',{}, {tools:true});
  assert.equal(analysis.hide_top_toolbar,false);assert.equal(analysis.hide_side_toolbar,false);
});
test('widget mode never falls through to the previous supplier or its private snapshot',async()=>{
  for(const endpoint of ['quote-v2','chart-v2'])
    await assert.rejects(handleUS2(endpoint,{symbol:'SPY'},()=>{throw Error('forbidden upstream');}),e=>e.code==='RAW_DATA_UNAVAILABLE');
  const s=await handleUS2('snapshot',{},()=>{throw Error('forbidden upstream');});
  assert.equal(s.counts.scanned,0);assert.deepEqual(s.quotes,[]);
  assert.equal(s.errorCode,'RAW_DATA_UNAVAILABLE');
});
test('health is honest and old price routes do not use a Twelve Data key',async()=>{
  const call=async endpoint=>{
    let body,status;
    const res={status(s){status=s;},setHeader(){},end(s){body=JSON.parse(s);}};
    await handler({method:'GET',headers:{},query:{endpoint,symbol:'SPY'}},res);
    return {status,body};
  };
  const health=await call('health');assert.equal(health.status,200);
  assert.equal(health.body.data.provider,'tradingview-widget');
  assert.equal(health.body.data.apiKeyRequired,false);
  for(const endpoint of ['quote','quotes','candles','market-pulse']){
    const r=await call(endpoint);assert.equal(r.status,503);
    assert.equal(r.body.error.code,'US_RAW_DATA_UNAVAILABLE');
  }
});
