import { cachedRequest } from './cache.js';
import { BITGET_SOURCE, BITGET_CAPABILITIES, BITGET_INTERVALS, bitgetDirectory, bitgetBars, bitgetQuote } from '../../../src/markets/us/bitget-equity.js';
import { analyzeStockPool } from '../../../src/markets/us/analysis.js';

const failure=(message,status=503,code='US_BITGET_UNAVAILABLE')=>Object.assign(Error(message),{status,code});
export function createBitgetService({fetchImpl=globalThis.fetch,now=Date.now,cache=cachedRequest}={}) {
  let blockedUntil=0,blockedError,nextRequest=0;
  async function request(path,params={}) {
    if(now()<blockedUntil)throw blockedError;
    // Stay below Bitget's public endpoint limits, including simultaneous scans.
    const delay=Math.max(0,nextRequest-now());nextRequest=Math.max(now(),nextRequest)+140;
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(now()<blockedUntil)throw blockedError;
    const url=new URL('/api/v2/mix/market/'+path,'https://api.bitget.com');
    url.searchParams.set('productType','USDT-FUTURES');
    for(const [key,value] of Object.entries(params))if(value!==undefined)url.searchParams.set(key,value);
    let response;
    try{response=await fetchImpl(url,{signal:AbortSignal.timeout(12000)});}catch{throw failure('Bitget 行情連線失敗，請稍後重試。');}
    if(!response.ok){
      const error=failure(`Bitget 行情請求失敗（${response.status}）。`,response.status);
      if([403,429,451].includes(response.status)){blockedUntil=now()+(response.status===429?60000:3600000);blockedError=error;}
      throw error;
    }
    let data;try{data=await response.json();}catch{throw failure('Bitget 行情回應格式無效。');}
    if(data.code!=='00000')throw failure('Bitget 暫時無法提供此合約或時間級別。',400,'BITGET_SYMBOL_UNAVAILABLE');
    if(!Array.isArray(data.data))throw failure('Bitget 行情欄位無效。');
    return data.data;
  }
  async function directory(known){
    return bitgetDirectory(await cache('bitget:equity-directory',()=>request('contracts'),{ttl:3600000}),known);
  }
  async function candles(item,query={}){
    const interval=query.interval||'1D',granularity=BITGET_INTERVALS[interval];
    if(!granularity||query.extendedHours==='true')throw failure('合約不支援此時間級別或美股延長時段選項。',400);
    let endTime;
    if(query.to){
      if(!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(query.to))throw failure('無效歷史日期。',400);
      endTime=Date.parse(query.to.replace(' ','T')+(query.to.length===10?'T00:00:00Z':'Z'));
      if(!Number.isFinite(endTime))throw failure('無效歷史日期。',400);
    }
    const limit=Math.max(1,Math.min(1000,Math.floor(Number(query.limit)||400)));
    const result=await cache(`bitget:bars:${item.contractSymbol}:${interval}:${limit}:${endTime||''}`,async()=>{
      let rows=await request(endTime?'history-candles':'candles',{symbol:item.contractSymbol,granularity,limit:Math.min(endTime?200:1000,limit),endTime});
      let bars=bitgetBars(rows,interval,now()),exhausted=rows.length===0;
      // Each response is bounded to a 90-day window even when limit is larger.
      // Page by the actual oldest timestamp, never fabricate missing candles.
      for(let page=0;bars.length<limit&&!exhausted&&page<5;page++){
        const oldest=bars[0]?.time;if(oldest===undefined)break;
        // Bitget rounds endTime down to the interval boundary. Subtracting a
        // millisecond would skip the candle immediately before this page.
        rows=await request('history-candles',{symbol:item.contractSymbol,granularity,limit:Math.min(200,limit-bars.length),endTime:oldest*1000});
        const older=bitgetBars(rows,interval,now()).filter(bar=>bar.time<oldest);
        exhausted=!older.length;bars=[...older,...bars];
      }
      if(!bars.length)throw failure('此合約沒有可用 K 線。');
      return {bars:bars.slice(-limit),historyExhausted:exhausted};
    },{ttl:endTime?3600000:5000});
    return {symbol:item.symbol,contractSymbol:item.contractSymbol,interval,...result,source:BITGET_SOURCE,
      mode:'perpetual',feed:BITGET_CAPABILITIES.feed,volumeScope:BITGET_CAPABILITIES.volumeScope,
      receivedAt:now(),asOf:new Date(now()).toISOString(),adjustment:'contract-unadjusted',
      session:'24/7',currency:'USDT',delaySeconds:null,capabilities:BITGET_CAPABILITIES};
  }
  async function quotes(items){
    const rows=await cache('bitget:equity-tickers',()=>request('tickers'),{ttl:3000});
    const byContract=new Map(rows.map(row=>[row.symbol,row]));
    return items.map(item=>bitgetQuote(byContract.get(item.contractSymbol),item,now())).filter(Boolean);
  }
  async function snapshot(items,scanLimit=80){
    const tickers=await quotes(items),bySymbol=new Map(items.map(item=>[item.symbol,item]));
    const analysis=await cache(`bitget:equity-analysis:${scanLimit}`,async()=>{
      const scan=tickers.filter(q=>!bySymbol.get(q.symbol)?.complex&&!q.stale).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,scanLimit);
      const symbols=[...new Set(['SPY',...scan.map(row=>row.symbol)])].filter(symbol=>bySymbol.has(symbol));
      const histories={},failures=[];let cursor=0,fatal;
      await Promise.all(Array.from({length:3},async()=>{
        while(cursor<symbols.length&&!fatal){const symbol=symbols[cursor++];
          try{histories[symbol]=(await candles(bySymbol.get(symbol),{interval:'1D',limit:90})).bars;}
          catch(error){if([401,403,429,451].includes(error.status))fatal=error;else failures.push(symbol);}
        }
      }));
      if(fatal)throw fatal;
      const analyses=analyzeStockPool(items,histories,histories.SPY||[],'1D',now());
      return {analyses,failures,attempted:symbols.length,createdAt:new Date(now()).toISOString()};
    },{ttl:300000});
    return {schemaVersion:2,source:BITGET_SOURCE,mode:'perpetual',...analysis,asOf:new Date(now()).toISOString(),
      sessionDate:null,quotes:tickers,analysisIntervals:['1D'],scanLimit,
      counts:{searchable:items.length,quoted:tickers.length,scanned:analysis.analyses.length,attempted:analysis.attempted},
      changeBasis:'報價為24小時漲跌；掃描為已完成 UTC 日 K',
      error:analysis.failures.length?`${analysis.failures.length} 檔合約歷史暫無資料`:null};
  }
  async function handle(endpoint,query={}, {known=[],env=process.env}={}){
    if(endpoint==='capabilities')return BITGET_CAPABILITIES;
    if(!['directory','snapshot','quotes','quote-v2','chart-v2'].includes(endpoint))return null;
    const items=await directory(known);
    if(endpoint==='directory')return {schemaVersion:2,items,source:BITGET_SOURCE,receivedAt:now()};
    if(endpoint==='snapshot')return snapshot(items,Math.max(1,Math.min(100,Number(env.US_BITGET_SCAN_LIMIT)||80)));
    if(endpoint==='quotes')return {quotes:await quotes(items),source:BITGET_SOURCE};
    const item=items.find(row=>row.symbol===String(query.symbol||'').toUpperCase());
    if(!item)throw failure('此股票沒有可用的 Bitget 股票永續合約。',404,'BITGET_SYMBOL_UNAVAILABLE');
    if(endpoint==='chart-v2')return candles(item,query);
    const quote=(await quotes([item]))[0];if(!quote)throw failure('此合約尚無有效報價。');
    return {quote,capabilities:BITGET_CAPABILITIES};
  }
  return {handle,request};
}
export const bitgetService=createBitgetService();
