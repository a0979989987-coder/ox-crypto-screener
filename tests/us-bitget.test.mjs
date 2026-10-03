import test from 'node:test';
import assert from 'node:assert/strict';
import {BITGET_CAPABILITIES,bitgetDirectory,bitgetBars,bitgetQuote,bitgetBarEnd} from '../src/markets/us/bitget-equity.js';
import {closedCandles} from '../src/markets/us/model.js';
import {usDisplayCapabilities} from '../src/markets/us/widget-config.js';
import {createUSPatternSource,patternDataAllowed} from '../src/markets/us/patterns/source.js';
import {subscribeBitget} from '../src/markets/us/live-bitget.js';
import {createBitgetService} from '../server/markets/us/bitget-service.js';
const now=Date.UTC(2026,9,3,14),item={symbol:'AAPL',name:'Apple',contractSymbol:'AAPLUSDT'};
const ticker={symbol:'AAPLUSDT',lastPr:'103',open24h:'100',high24h:'104',low24h:'99',baseVolume:'20',quoteVolume:'2060',ts:String(now)};
test('RWA metadata and exact listing isolate stocks from same-name crypto',()=>{
 const row={baseCoin:'STXSTOCK',symbol:'STXSTOCKUSDT',quoteCoin:'USDT',symbolStatus:'normal',symbolType:'perpetual',isRwa:'YES'};
 const known=[{symbol:'STX',name:'Seagate'},{symbol:'BTC',name:'not a stock'}];
 const result=bitgetDirectory([row,{...row,baseCoin:'STX',symbol:'STXUSDT',isRwa:'NO'},
  {...row,baseCoin:'UNKNOWN',symbol:'UNKNOWNUSDT'},{...row,symbolStatus:'off'}],known);
 assert.equal(result.length,1);assert.equal(result[0].symbol,'STX');assert.equal(result[0].contractSymbol,'STXSTOCKUSDT');
});
test('monthly boundaries and completed contract bars use UTC even on weekends',()=>{
 const start=Date.UTC(2026,9,1);assert.equal(bitgetBarEnd(start,'1M'),Date.UTC(2026,10,1)-1);
 const rows=[[now-3600000,100,105,99,103,10,1030],[now,103,106,100,105,20,2100]];
 const bars=bitgetBars(rows,'1H',now);assert.equal(closedCandles(bars,'1H',now).length,1);
 assert.throws(()=>bitgetBars([[now,100,99,98,103,10,1000]],'1H',now));
 assert.throws(()=>bitgetBars([[now,100,105,99,103,'',1000]],'1H',now));
});
test('quotes preserve USDT contract scope and reject missing or mismatched data',()=>{
 const q=bitgetQuote(ticker,item,now);assert.equal(q.price,103);assert.ok(Math.abs(q.changePct-3)<1e-8);
 assert.equal(q.currency,'USDT');assert.equal(q.source,'bitget-equity');
 assert.equal(bitgetQuote({...ticker,symbol:'BTCUSDT'},item,now),null);
 assert.equal(bitgetQuote({...ticker,quoteVolume:''},item,now),null);
 assert.equal(bitgetQuote({...ticker,ts:String(now-120000)},item,now).stale,true);
});
test('public contracts activate the native tools and intraday pattern frames',()=>{
 assert.equal(usDisplayCapabilities(BITGET_CAPABILITIES).chartMode,'native');
 assert.equal(patternDataAllowed(BITGET_CAPABILITIES),true);
 const context={capabilities:BITGET_CAPABILITIES,snapshot:{mode:'perpetual',asOf:new Date(now).toISOString()}};
 const {source}=createUSPatternSource({getContext:()=>context});
 assert.deepEqual(source.defaultFrames,['1H','4H']);assert.equal(source.TIMEFRAMES['1D'],86400);
});
test('history pagination requests the exact oldest boundary without losing a candle',async()=>{
 const start=Date.UTC(2026,9,1),requests=[];
 const service=createBitgetService({cache:(_key,fn)=>fn(),fetchImpl:async url=>{
  requests.push(url);let data;
  if(url.pathname.endsWith('contracts'))data=[{symbol:'AAPLUSDT',baseCoin:'AAPL',quoteCoin:'USDT',symbolType:'perpetual',symbolStatus:'normal',isRwa:'YES'}];
  else if(url.pathname.endsWith('history-candles')){
   assert.equal(Number(url.searchParams.get('endTime')),start);
   data=[[start-86400000,100,105,99,103,10,1030]];
  }else data=[[start,100,105,99,103,10,1030],[start+86400000,100,105,99,103,10,1030]];
  return {ok:true,json:async()=>({code:'00000',data})};
 }});
 const result=await service.handle('chart-v2',{symbol:'AAPL',interval:'1D',limit:3},{known:[item]});
 assert.equal(result.bars.length,3);assert.equal(result.bars[1].time-result.bars[0].time,86400);
 assert.equal(requests.length,3);
});
test('Bitget streaming verifies symbols, drops late messages, and cleans up after leaving',()=>{
 const sockets=[],timers=new Map(),quotes=[],bars=[];let tid=0;
 class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(data){this.sent=data;}close(){this.closed=true;this.onclose?.();}emit(packet){this.onmessage?.({data:JSON.stringify(packet)});}}
 const doc=new EventTarget();doc.hidden=false;
 const stop=subscribeBitget({...item,interval:'1H',now:()=>now,documentImpl:doc,WebSocketImpl:Socket,
  setTimer:(fn,ms)=>{timers.set(++tid,{fn,ms});return tid;},clearTimer:id=>timers.delete(id),onQuote:q=>quotes.push(q),onBar:b=>bars.push(b)});
 const ws=sockets[0];ws.onopen();assert.ok(JSON.parse(ws.sent).args.some(a=>a.channel==='candle1H'));
 const packet={ts:now,arg:{instType:'USDT-FUTURES',instId:'AAPLUSDT',channel:'ticker'},data:[ticker]};
 ws.emit(packet);ws.emit({...packet,data:[{...ticker,ts:String(now-1),lastPr:'102'}]});
 ws.emit({...packet,arg:{...packet.arg,instId:'BTCUSDT'}});assert.equal(quotes.length,1);
 ws.emit({ts:now,arg:{...packet.arg,channel:'candle1H'},data:[[now,100,105,99,103,10,1030]]});assert.equal(bars.length,1);
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(ws.closed,true);assert.equal(timers.size,0);
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(sockets.length,2);
 stop();sockets[1].emit(packet);assert.equal(quotes.length,1);assert.equal(timers.size,0);
});
