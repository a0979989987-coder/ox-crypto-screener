import test from 'node:test';
import assert from 'node:assert/strict';
import {externalIntradayChart,INTRADAY_INTERVALS} from '../src/markets/tw/intraday-display.js';

test('external Taiwan chart uses confirmed board and all six native intraday intervals',()=>{
 for(const [frame,interval]of Object.entries(INTRADAY_INTERVALS))for(const market of ['TWSE','TPEX']){
  const url=new URL(externalIntradayChart('2330',frame,market));
  assert.equal(url.origin,'https://www.tradingview.com');
  assert.equal(url.searchParams.get('symbol'),`${market}:2330`);
  assert.equal(url.searchParams.get('interval'),interval);
 }
});
test('unknown boards, unsupported frames and invalid stocks have no substitute chart',()=>{
 for(const args of [['2330','30m',null],['2330','30m','TW'],['TSM','30m','TWSE'],['2330&symbol=BTC','30m','TWSE'],['2330','1D','TWSE']])assert.equal(externalIntradayChart(...args),null);
});
