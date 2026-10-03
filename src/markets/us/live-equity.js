import { BINANCE_INTERVALS, binanceBars, binanceQuote } from './binance-equity.js?v=20261003-us-bitget1';
import { subscribeBitget } from './live-bitget.js?v=20261003-us-bitget1';

export function subscribeEquity(options={}) {
  return options.source==='bitget-equity'?subscribeBitget(options):subscribeBinance(options);
}

// The selected chart or a verified equity quote list. Closing it, switching
// symbol/frame or hiding the page prevents obsolete messages from updating UI.
function subscribeBinance({symbol,contractSymbol,interval,items=null,onBar=()=>{},onQuote=()=>{},
  onStatus=()=>{},onReconnect=()=>{},WebSocketImpl=globalThis.WebSocket,
  documentImpl=globalThis.document,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const aggregate=Array.isArray(items)&&items.length>0;
  if((!aggregate&&(!/^[A-Z0-9]+USDT$/.test(contractSymbol||'')||!BINANCE_INTERVALS[interval]))||!WebSocketImpl)return ()=>{};
  const allowed=new Map((aggregate?items:[{symbol,contractSymbol}]).map(item=>[item.contractSymbol,item]));
  let disposed=false,socket=null,retry=null,watchdog=null,attempt=0,generation=0,lastEvent=0,connectedOnce=false;
  const item={symbol,contractSymbol};
  const status=value=>{if(!disposed)onStatus(value);};
  const disconnect=()=>{
    ++generation;clearTimer(retry);clearTimer(watchdog);retry=watchdog=null;
    const old=socket;socket=null;try{old?.close();}catch{}
  };
  function connect() {
    if(disposed||documentImpl?.hidden)return;
    disconnect();const id=generation;
    const channels=aggregate?['!ticker@arr']:[`${contractSymbol.toLowerCase()}@kline_${BINANCE_INTERVALS[interval]}`,`${contractSymbol.toLowerCase()}@ticker`];
    status('connecting');
    try {socket=new WebSocketImpl(`wss://fstream.binance.com/market/stream?streams=${channels.join('/')}`);}
    catch {scheduleRetry();return;}
    const current=socket;let lastKlineEvent=0;const quoteTimes=new Map();
    const active=()=>!disposed&&id===generation&&socket===current;
    const armWatchdog=()=>{
      clearTimer(watchdog);
      watchdog=setTimer(()=>{if(active()&&now()-lastEvent>=30000){status('stale');current.close();}},31000);
    };
    lastEvent=now();armWatchdog();
    socket.onopen=()=>{
      if(!active())return;
      lastEvent=now();armWatchdog();
      if(connectedOnce)onReconnect();connectedOnce=true;
      // Open is not proof of fresh market data. Wait for a valid event.
    };
    socket.onmessage=event=>{
      if(!active())return;
      let data;try{const packet=JSON.parse(event.data);data=packet.data||packet;}catch{return;}
      if(aggregate) {
        if(!Array.isArray(data))return;
        for(const tick of data) {
          const entry=allowed.get(tick.s);
          if(!entry||tick.e!=='24hrTicker'||!Number.isFinite(tick.E)||tick.E>now()+60000||now()-tick.E>30000||tick.E<(quoteTimes.get(tick.s)||0))continue;
          const quote=binanceQuote({...tick,symbol:tick.s},entry,now());
          if(!quote)continue;
          quoteTimes.set(tick.s,tick.E);lastEvent=now();attempt=0;armWatchdog();status('live');onQuote({...quote,transport:'websocket'});
        }
        return;
      }
      if(data?.s!==contractSymbol||!Number.isFinite(data.E)||data.E>now()+60000||now()-data.E>30000)return;
      if(data.e==='kline'&&data.k?.i===BINANCE_INTERVALS[interval]&&data.k.s===contractSymbol&&data.E>=lastKlineEvent) {
        try {
          const k=data.k,bar=binanceBars([[k.t,k.o,k.h,k.l,k.c,k.v,k.T,k.q]],now())[0];
          lastKlineEvent=data.E;lastEvent=now();attempt=0;armWatchdog();status('live');
          onBar({...bar,closed:Boolean(k.x)},data.E);
        }catch{}
      } else if(data.e==='24hrTicker'&&data.E>=(quoteTimes.get(data.s)||0)) {
        const quote=binanceQuote({...data,symbol:contractSymbol},item,now());
        if(quote){quoteTimes.set(data.s,data.E);lastEvent=now();attempt=0;armWatchdog();status('live');onQuote({...quote,transport:'websocket'});}
      }
    };
    socket.onerror=()=>{if(active())status('reconnecting');};
    socket.onclose=()=>{if(active()){socket=null;clearTimer(watchdog);scheduleRetry();}};
  }
  function scheduleRetry() {
    if(disposed||documentImpl?.hidden)return;
    status('reconnecting');clearTimer(retry);
    retry=setTimer(connect,Math.min(30000,1000*2**Math.min(attempt++,5)));
  }
  const visibility=()=>{
    disconnect();if(documentImpl?.hidden)status('paused');else{onReconnect();connect();}
  };
  documentImpl?.addEventListener('visibilitychange',visibility);
  connect();
  return ()=>{disposed=true;disconnect();documentImpl?.removeEventListener('visibilitychange',visibility);};
}
