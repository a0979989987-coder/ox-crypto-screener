import { BITGET_INTERVALS, bitgetBars, bitgetQuote } from './bitget-equity.js?v=20261003-us-bitget1';

export function subscribeBitget({symbol,contractSymbol,interval,items=null,onBar=()=>{},onQuote=()=>{},
  onStatus=()=>{},onReconnect=()=>{},WebSocketImpl=globalThis.WebSocket,
  documentImpl=globalThis.document,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const aggregate=Array.isArray(items)&&items.length>0;
  if(!WebSocketImpl||!aggregate&&(!/^[A-Z0-9]+USDT$/.test(contractSymbol||'')||!BITGET_INTERVALS[interval]))return ()=>{};
  if(aggregate&&items.length>40){
    const stops=[];for(let i=0;i<items.length;i+=40)stops.push(subscribeBitget({items:items.slice(i,i+40),
      onQuote,onStatus,onReconnect,WebSocketImpl,documentImpl,now,setTimer,clearTimer}));
    return ()=>stops.forEach(stop=>stop());
  }
  const allowed=new Map((aggregate?items:[{symbol,contractSymbol}]).map(row=>[row.contractSymbol,row]));
  let disposed=false,socket=null,retry=null,heartbeat=null,attempt=0,generation=0,connectedOnce=false;
  const status=value=>{if(!disposed)onStatus(value);};
  function disconnect(){
    ++generation;clearTimer(retry);clearTimer(heartbeat);retry=heartbeat=null;
    const old=socket;socket=null;try{old?.close();}catch{}
  }
  function reconnect(){
    if(disposed||documentImpl?.hidden)return;
    status('reconnecting');clearTimer(retry);retry=setTimer(connect,Math.min(30000,1000*2**Math.min(attempt++,5)));
  }
  function connect(){
    if(disposed||documentImpl?.hidden)return;
    disconnect();const id=generation;status('connecting');
    try{socket=new WebSocketImpl('wss://ws.bitget.com/v2/ws/public');}catch{reconnect();return;}
    const current=socket,quoteTimes=new Map();let lastBarEvent=0,lastPacket=now(),lastValid=0;
    const active=()=>!disposed&&id===generation&&socket===current;
    const beat=()=>{
      if(!active())return;
      if(now()-lastPacket>45000){status('stale');current.close();return;}
      if(lastValid&&now()-lastValid>45000)status('stale');
      if(current.readyState===1)current.send('ping');
      heartbeat=setTimer(beat,20000);
    };
    heartbeat=setTimer(beat,20000);
    socket.onopen=()=>{
      if(!active())return;
      const args=[...allowed.keys()].map(instId=>({instType:'USDT-FUTURES',channel:'ticker',instId}));
      // Bitget has REST 3m candles but no documented 3m WebSocket channel.
      if(!aggregate&&interval!=='3m')args.push({instType:'USDT-FUTURES',channel:'candle'+BITGET_INTERVALS[interval],instId:contractSymbol});
      current.send(JSON.stringify({op:'subscribe',args}));
      lastPacket=now();if(connectedOnce)onReconnect();connectedOnce=true;
    };
    socket.onmessage=event=>{
      if(!active())return;
      if(event.data==='pong'){lastPacket=now();return;}
      let packet;try{packet=JSON.parse(event.data);}catch{return;}
      lastPacket=now();
      if(packet.event==='error'){status('stale');return;}
      const item=allowed.get(packet.arg?.instId),timestamp=Number(packet.ts);
      if(!item||packet.arg?.instType!=='USDT-FUTURES'||!Array.isArray(packet.data)||
        !Number.isFinite(timestamp)||timestamp>now()+60000||now()-timestamp>60000)return;
      if(packet.arg.channel==='ticker'){
        for(const raw of packet.data){const quote=bitgetQuote(raw,item,now());
          if(!quote||quote.stale||quote.marketTime<(quoteTimes.get(item.contractSymbol)||0))continue;
          quoteTimes.set(item.contractSymbol,quote.marketTime);lastValid=now();attempt=0;status('live');
          onQuote({...quote,transport:'websocket'});
        }
      }else if(!aggregate&&packet.arg.channel==='candle'+BITGET_INTERVALS[interval]&&timestamp>=lastBarEvent){
        try{const bar=bitgetBars(packet.data,interval,now()).at(-1);if(!bar)return;
          lastBarEvent=timestamp;lastValid=now();attempt=0;status('live');onBar(bar,timestamp);
        }catch{}
      }
    };
    socket.onerror=()=>{if(active())status('reconnecting');};
    socket.onclose=()=>{if(active()){socket=null;clearTimer(heartbeat);reconnect();}};
  }
  const visibility=()=>{disconnect();if(documentImpl?.hidden)status('paused');else{onReconnect();connect();}};
  documentImpl?.addEventListener('visibilitychange',visibility);connect();
  return ()=>{disposed=true;disconnect();documentImpl?.removeEventListener('visibilitychange',visibility);};
}
