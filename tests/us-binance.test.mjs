import test from 'node:test';
import assert from 'node:assert/strict';
import { BINANCE_CAPABILITIES, equityDirectory, binanceBars, binanceQuote, perpetualCountdown } from '../src/markets/us/binance-equity.js';
import { createBinanceService, binanceCapabilities } from '../server/markets/us/binance-service.js';
import { subscribeEquity } from '../src/markets/us/live-equity.js';
import { closedCandles, quoteStatus } from '../src/markets/us/model.js';
import { cachedRequest, resetCache } from '../server/markets/us/cache.js';
import { patternDataAllowed, createUSPatternSource } from '../src/markets/us/patterns/source.js';
import { usBubbleRows } from '../src/markets/us/visuals.js';

// Synthetic, isolated test data. Never exported into the website's data/ folder.
const NOW=Date.parse('2026-10-03T12:00:00Z');
const listing={symbol:'AAPL',name:'Apple',alias:'蘋果',exchange:'NASDAQ',type:'stock'};
const contract={symbol:'AAPLUSDT',baseAsset:'AAPL',quoteAsset:'USDT',underlyingType:'EQUITY',underlyingSubType:['TradFi'],contractType:'TRADIFI_PERPETUAL',status:'TRADING'};
const item={...listing,contractSymbol:'AAPLUSDT'};
const rawBar=[NOW-1000,100,105,99,103,25,NOW+58999,2575];
const ticker={symbol:'AAPLUSDT',lastPrice:'103',openPrice:'100',highPrice:'105',lowPrice:'99',volume:'25',quoteVolume:'2575',closeTime:NOW};
const cap={...BINANCE_CAPABILITIES,externalDisplayConfirmed:true,rawDataAvailable:true};
const env={US_BINANCE_EXTERNAL_DISPLAY_CONFIRMED:'true'};
const response=data=>({ok:true,status:200,json:async()=>data});
const noCache=(_key,fn)=>fn();

test('only actual trading equity contracts matching US listings are admitted',()=>{
  const rows=[contract,{...contract,baseAsset:'BTC',symbol:'BTCUSDT',underlyingType:'COIN'},
    {...contract,baseAsset:'COIN',symbol:'COINUSDT',underlyingType:'COIN'},
    {...contract,symbol:'AAPLUSDC',quoteAsset:'USDC'},
    {...contract,status:'SETTLING'},{...contract,underlyingSubType:['Pre-IPO','TradFi']}];
  const result=equityDirectory({symbols:rows},[listing,{symbol:'COIN',name:'Coinbase'}]);
  assert.equal(result.length,1);assert.equal(result[0].contractSymbol,'AAPLUSDT');
  assert.equal(result[0].underlyingExchange,'NASDAQ');assert.equal(result[0].currency,'USDT');
});
test('candle parser preserves UTC close time, contract volume and malformed data never becomes zero',()=>{
  const [bar]=binanceBars([rawBar],NOW);
  assert.equal(bar.closeTime,NOW+58999);assert.equal(bar.closed,false);assert.equal(bar.volume,25);
  assert.equal(perpetualCountdown(bar,NOW),'00:00:59');
  assert.throws(()=>binanceBars([[...rawBar.slice(0,5),'',...rawBar.slice(6)]],NOW));
  assert.throws(()=>binanceBars([[NOW,100,90,99,103,25,NOW+999,100]],NOW));
  assert.throws(()=>binanceBars([[...rawBar.slice(0,7),-1]],NOW));
});
test('a Saturday UTC contract bar closes without applying NYSE holidays or a 16:00 close',()=>{
  const closed={...binanceBars([rawBar],NOW)[0],closeTime:NOW-1};
  const open={...closed,closeTime:NOW+1000};
  assert.deepEqual(closedCandles([closed,open],'1D',NOW),[closed]);
});
test('24-hour quote is labelled as USDT derivatives and stale data is not called live',()=>{
  const quote=binanceQuote(ticker,item,NOW);
  assert.equal(quote.mode,'perpetual');assert.equal(quote.currency,'USDT');assert.equal(quote.changeBasis,'滾動24小時');
  assert.match(quoteStatus({...quote,transport:'websocket'},NOW),/串流/);
  assert.match(quoteStatus(quote,NOW+31000),/待更新/);
  assert.equal(binanceQuote({...ticker,symbol:'BTCUSDT'},item,NOW),null);
  assert.equal(binanceQuote({...ticker,lastPrice:''},item,NOW),null);
  assert.equal(binanceQuote({...ticker,highPrice:''},item,NOW),null);
});
test('prior US feed entitlement does not grant Binance display and no upstream request runs before gating',async()=>{
  assert.equal(binanceCapabilities({US_EXTERNAL_DISPLAY_CONFIRMED:'true'}).rawDataAvailable,false);
  let calls=0;
  const service=createBinanceService({fetchImpl:async()=>{calls++;throw Error('should not run');}});
  await assert.rejects(service.handle('chart-v2',{symbol:'AAPL'},{known:[listing],env:{}}),e=>e.status===403);
  assert.equal(calls,0);
});
test('Binance region restriction opens a circuit and never tries another host',async()=>{
  const urls=[];
  const service=createBinanceService({now:()=>NOW,cache:noCache,fetchImpl:async url=>{
    urls.push(String(url));return {ok:false,status:451};
  }});
  for(let i=0;i<2;i++)await assert.rejects(service.handle('directory',{}, {known:[listing],env}),e=>e.code==='BINANCE_REGION_RESTRICTED');
  assert.deepEqual(urls,['https://fapi.binance.com/fapi/v1/exchangeInfo']);
});
test('a region restriction never serves an old cache as a successful result',async t=>{
  resetCache();let clock=100000;t.mock.method(Date,'now',()=>clock);
  await cachedRequest('binance-test',()=>({price:100}),{ttl:1,stale:60000,withMetadata:true});
  clock+=10;
  await assert.rejects(cachedRequest('binance-test',()=>{throw Object.assign(Error('restricted'),{status:451});},
    {ttl:1,stale:60000,withMetadata:true}),e=>e.status===451);resetCache();
});
test('backend maps only a verified contract, supports intraday/monthly frames and historical pagination',async()=>{
  const urls=[];
  const service=createBinanceService({now:()=>NOW,cache:noCache,fetchImpl:async url=>{
    urls.push(new URL(url));return response(url.pathname.endsWith('exchangeInfo')?{symbols:[contract]}:[rawBar]);
  }});
  const result=await service.handle('chart-v2',{symbol:'AAPL',interval:'1M',to:'2026-10-02 23:59:59',limit:200},{known:[listing],env});
  assert.equal(result.source,'binance-equity');assert.equal(result.mode,'perpetual');assert.equal(result.contractSymbol,'AAPLUSDT');
  assert.equal(urls[1].searchParams.get('interval'),'1M');
  assert.equal(urls[1].searchParams.get('endTime'),String(Date.parse('2026-10-02T23:59:59Z')));
  await assert.rejects(service.handle('chart-v2',{symbol:'BTC',interval:'1D'},{known:[listing],env}),e=>e.status===404);
  await assert.rejects(service.handle('chart-v2',{symbol:'AAPL',interval:'1s'},{known:[listing],env}),e=>e.status===400);
});
test('snapshot uses completed contract bars and makes an honest count for limited scan coverage',async()=>{
  const rows=Array.from({length:100},(_,i)=>{const t=NOW-(100-i)*86400000;return [t,100+i,103+i,99+i,102+i,10000,t+86399999,1000000+i];});
  const service=createBinanceService({now:()=>NOW,cache:noCache,fetchImpl:async url=>response(
    url.pathname.endsWith('exchangeInfo')?{symbols:[contract]}:url.pathname.endsWith('24hr')?[ticker]:rows)});
  const result=await service.handle('snapshot',{}, {known:[listing],env});
  assert.equal(result.mode,'perpetual');assert.equal(result.sessionDate,null);
  assert.equal(result.counts.scanned,1);assert.equal(result.counts.quoted,1);assert.equal(result.analyses[0].bars,100);
});
test('shared pattern and bubble views accept authorized contract data while rejecting unconfirmed capability',async()=>{
  assert.equal(patternDataAllowed(cap),true);assert.equal(patternDataAllowed(BINANCE_CAPABILITIES),false);
  const quote=binanceQuote(ticker,item,NOW);
  const snapshot={mode:'perpetual',source:'binance-equity',asOf:new Date(NOW).toISOString(),createdAt:new Date(NOW).toISOString(),quotes:[quote],analyses:[]};
  const context={capabilities:cap,snapshot,directory:[listing]};
  assert.equal(usBubbleRows(context)[0].price,103);
  context.quotes=new Map([['AAPL',{...quote,price:104,marketTime:quote.marketTime+1}]]);
  assert.equal(usBubbleRows(context)[0].price,104);
  context.quotes.set('AAPL',{...quote,price:102,marketTime:quote.marketTime-1});
  assert.equal(usBubbleRows(context)[0].price,103);
  const {source}=createUSPatternSource({getContext:()=>context});
  assert.equal(source.currency,'USDT');assert.equal((await source.fetchUniverse()).tickers[0].symbol,'AAPL');
});

function streamHarness(options={}) {
  let clock=NOW,seq=0;const sockets=[],events=[],timers=new Map();
  class WS {
    constructor(url){this.url=url;sockets.push(this);}
    close(){this.closed=true;this.onclose?.();}
    emit(data){this.onmessage?.({data:JSON.stringify({data})});}
  }
  const doc=new EventTarget();doc.hidden=false;
  const stop=subscribeEquity({symbol:'AAPL',contractSymbol:'AAPLUSDT',interval:'1m',WebSocketImpl:WS,documentImpl:doc,
    ...options,now:()=>clock,setTimer:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimer:id=>timers.delete(id),
    onStatus:x=>events.push(['status',x]),onReconnect:()=>events.push(['reconnect']),onBar:x=>events.push(['bar',x]),onQuote:x=>events.push(['quote',x])});
  return {sockets,events,timers,doc,stop,setTime:t=>clock=t};
}
test('stream rejects other instruments, old events, and disposed subscriptions',()=>{
  const h=streamHarness(),socket=h.sockets[0];socket.onopen();
  assert.match(socket.url,/fstream\.binance\.com\/market\/stream/);
  assert.equal(h.events.some(x=>x[1]==='live'),false);
  const event={e:'24hrTicker',E:NOW,s:'AAPLUSDT',c:'103',o:'100',v:'25',q:'2575',h:'105',l:'99'};
  socket.emit({...event,s:'BTCUSDT'});socket.emit({...event,E:NOW-31000});
  assert.equal(h.events.filter(x=>x[0]==='quote').length,0);
  socket.emit(event);assert.equal(h.events.filter(x=>x[0]==='quote').length,1);
  h.stop();socket.emit(event);assert.equal(h.events.filter(x=>x[0]==='quote').length,1);assert.equal(h.timers.size,0);
});
test('visibility lifecycle closes the socket and resynchronizes once visible',()=>{
  const h=streamHarness();h.sockets[0].onopen();
  h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.ok(h.sockets[0].closed);assert.equal(h.timers.size,0);
  h.doc.hidden=false;h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.sockets.length,2);assert.ok(h.events.some(x=>x[0]==='reconnect'));
  h.stop();assert.ok(h.sockets[1].closed);
});
test('out-of-order kline events cannot roll back the active candle',()=>{
  const h=streamHarness(),socket=h.sockets[0];socket.onopen();
  const event={e:'kline',E:NOW,s:'AAPLUSDT',k:{t:NOW-1000,T:NOW+58999,s:'AAPLUSDT',i:'1m',o:'100',h:'105',l:'99',c:'103',v:'25',q:'2575',x:false}};
  socket.emit(event);socket.emit({...event,E:NOW-1,k:{...event.k,c:'102'}});
  assert.equal(h.events.filter(x=>x[0]==='bar').length,1);h.stop();
});
test('all-market ticker only updates confirmed equities and orders events per symbol',()=>{
  const h=streamHarness({items:[item,{symbol:'SPY',contractSymbol:'SPYUSDT'}]}),socket=h.sockets[0];
  socket.onopen();assert.match(socket.url,/streams=!ticker@arr$/);
  const tick={e:'24hrTicker',E:NOW,s:'AAPLUSDT',c:'103',o:'100',h:'105',l:'99',v:'25',q:'2575'};
  socket.emit([tick,{...tick,s:'SPYUSDT',E:NOW-1},{...tick,s:'BTCUSDT'}]);
  socket.emit([{...tick,E:NOW-1,c:'102'},{...tick,s:'SPYUSDT',E:NOW,c:'104'}]);
  assert.deepEqual(h.events.filter(x=>x[0]==='quote').map(x=>[x[1].symbol,x[1].price]),[['AAPL',103],['SPY',103],['SPY',104]]);
  h.stop();assert.equal(h.timers.size,0);socket.emit([tick]);
  assert.equal(h.events.filter(x=>x[0]==='quote').length,3);
});
test('a connection without fresh events times out and reconnects with bounded backoff',()=>{
  const h=streamHarness(),first=h.sockets[0];
  h.setTime(NOW+31000);[...h.timers.values()].find(x=>x.ms===31000).fn();
  assert.ok(first.closed);
  const retry=[...h.timers.values()].find(x=>x.ms===1000);assert.ok(retry);retry.fn();
  assert.equal(h.sockets.length,2);h.stop();assert.equal(h.timers.size,0);
});
