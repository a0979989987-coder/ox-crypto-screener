import { TIMEFRAMES } from './catalog.js';
const BASE='https://api.bitget.com';
const candleCache=new Map();let nextRequest=0;
const abortError=()=>new DOMException('Aborted','AbortError');
function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(abortError());const id=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);function cancel(){clearTimeout(id);reject(abortError());}signal?.addEventListener('abort',cancel,{once:true});});}
async function request(path,signal){
  for(let attempt=0;attempt<3;attempt++){
    const at=Math.max(Date.now(),nextRequest);nextRequest=at+280;await wait(at-Date.now(),signal);
    const ctrl=new AbortController(),cancel=()=>ctrl.abort();signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,12000);
    try{
      const response=await fetch(BASE+path,{signal:ctrl.signal,cache:'no-store'});
      if(!response.ok)throw Error(`Bitget HTTP ${response.status}`);
      const json=await response.json();
      if(json.code!=='00000'||!Array.isArray(json.data))throw Error(`Bitget ${json.code||'格式錯誤'}`);
      return json;
    }catch(e){if(signal?.aborted)throw abortError();if(attempt===2)throw e;await wait(800*(attempt+1),signal);}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
}
export function parseCandles(rows,frame,serverTime){
  const seconds=TIMEFRAMES[frame],map=new Map();if(!seconds||!Number.isFinite(serverTime))return [];
  const times=[...new Set(rows.map(r=>Number(r[0])).filter(Number.isFinite))].sort((a,b)=>a-b);
  if(times.some((t,i)=>i&&(t-times[i-1])%(seconds*1000)!==0))return [];
  for(const row of rows){
    const [ms,open,high,low,close,volume,quoteVolume]=row.map(Number),time=ms/1000;
    if(![ms,open,high,low,close,volume,quoteVolume].every(Number.isFinite)||time%seconds||open<=0||close<=0||low<=0||high<Math.max(open,close)||low>Math.min(open,close)||high<low||volume<0||quoteVolume<0||ms+seconds*1000>serverTime)continue;
    map.set(time,{time,open,high,low,close,volume,quoteVolume});
  }
  const sorted=[...map.values()].sort((a,b)=>a.time-b.time);
  // Only the most recent uninterrupted run is eligible; never fill gaps with invented candles.
  let start=0;for(let i=1;i<sorted.length;i++)if(sorted[i].time-sorted[i-1].time!==seconds)start=i;
  const tail=sorted.slice(start);
  if(!tail.length||tail.at(-1).time+seconds<(Math.floor(serverTime/1000/seconds)*seconds))return [];
  return tail;
}
export function selectUniverse(tickers,instruments,limit=80){
  const allowed=new Set(instruments.filter(i=>i.symbolType==='crypto'&&i.type==='perpetual'&&i.status==='online'&&i.quoteCoin==='USDT').map(i=>i.symbol));
  return tickers.filter(t=>allowed.has(t.symbol)&&Number(t.usdtVolume)>=3000000&&Number(t.lastPr)>0).sort((a,b)=>Number(b.usdtVolume)-Number(a.usdtVolume)).slice(0,limit||Infinity);
}
export async function fetchUniverse(signal,limit=80){
  const [quotes,metadata]=await Promise.all([request('/api/v2/mix/market/tickers?productType=USDT-FUTURES',signal),request('/api/v3/market/instruments?category=USDT-FUTURES',signal)]);
  const serverTime=Number(quotes.requestTime);
  if(!Number.isFinite(serverTime)||Math.abs(Date.now()-serverTime)>300000)throw Error('行情時間戳過期，請稍後重試');
  const tickers=selectUniverse(quotes.data,metadata.data,limit);
  if(!tickers.length)throw Error('沒有符合流動性條件的加密合約');
  const allowed=new Set(metadata.data.filter(i=>i.symbolType==='crypto'&&i.type==='perpetual'&&i.status==='online'&&i.quoteCoin==='USDT').map(i=>i.symbol));
  return {tickers,allTickers:quotes.data.filter(t=>allowed.has(t.symbol)&&[t.lastPr,t.change24h,t.usdtVolume].every(v=>v!==''&&Number.isFinite(Number(v)))),serverTime};
}
export async function fetchSeries(symbol,frame,signal,now=Date.now()){
  const key=`${symbol}:${frame}`,cached=candleCache.get(key),boundary=Math.floor(now/1000/TIMEFRAMES[frame])*TIMEFRAMES[frame];
  if(cached?.candles.at(-1)?.time+TIMEFRAMES[frame]===boundary)return cached;
  const path=`/api/v2/mix/market/candles?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES&granularity=${frame}&limit=200`;
  const data=await request(path,signal),serverTime=Number(data.requestTime),candles=parseCandles(data.data,frame,serverTime);
  if(Math.abs(now-serverTime)>300000||candles.length<35)throw Error(`${symbol} ${frame} K 線不足或缺漏`);
  const value={candles,source:'Bitget',frame,symbol,serverTime};candleCache.set(key,value);
  if(candleCache.size>1200)candleCache.delete(candleCache.keys().next().value);
  return value;
}
// Read the preserved classic engine. No strategy state or score constants are modified.
export function classicScore(ticker,candles,tickers){
  if(typeof OXEngine==='undefined'||typeof CONFIG==='undefined'||candles?.length<35)return null;
  const engine=OXEngine,liq=engine.computeLiquidity(ticker,tickers),rs=engine.computeRelativeStrength(ticker,tickers.find(t=>t.symbol==='BTCUSDT'));
  const flow=engine.computeMoneyFlow(candles),structure=engine.computeStructure(candles),setup=engine.evaluateSetupMatch(candles,structure,flow),trigger=engine.detectTrigger(candles,structure,flow);
  return Math.round(liq.score*CONFIG.weights.liquidity+flow.score*CONFIG.weights.moneyFlow+structure.score*CONFIG.weights.structure+setup.setupScore*CONFIG.weights.setupMatch+rs.score*CONFIG.weights.relativeStrength+(trigger.active?5:0));
}
export async function scanUniverse(universe,frames,{signal,onSeries,onProgress}){
  let cursor=0,done=0,failed=0;const total=universe.tickers.length*frames.length;
  const jobs=universe.tickers.map(ticker=>async()=>{
    let hourly=null;
    try{hourly=await fetchSeries(ticker.symbol,'1H',signal,universe.serverTime);}catch(e){if(signal.aborted)throw e;}
    const oxScore=hourly?classicScore(ticker,hourly.candles,universe.allTickers):null;
    for(const frame of frames){
      if(signal.aborted)throw abortError();
      try{
        const data=frame==='1H'?(hourly||await fetchSeries(ticker.symbol,frame,signal,universe.serverTime)):await fetchSeries(ticker.symbol,frame,signal,universe.serverTime);
        await onSeries({...data,ticker,oxScore,turnover:Number(ticker.usdtVolume),change:Number(ticker.change24h)*100});
      }catch(e){if(signal.aborted)throw e;failed++;}
      done++;onProgress({done,total,failed});
    }
  });
  await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){if(signal.aborted)throw abortError();const job=jobs[cursor++];await job();}}));
  return {done,total,failed};
}
