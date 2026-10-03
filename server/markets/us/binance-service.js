import { cachedRequest } from './cache.js';
import { BINANCE_SOURCE, BINANCE_CAPABILITIES, BINANCE_INTERVALS,
  equityDirectory, binanceBars, binanceQuote } from '../../../src/markets/us/binance-equity.js';
import { analyzeStockPool } from '../../../src/markets/us/analysis.js';

const failure=(message,status=503,code='US_BINANCE_UNAVAILABLE')=>Object.assign(Error(message),{status,code});
export function binanceCapabilities(env=process.env) {
  const confirmed=env.US_BINANCE_EXTERNAL_DISPLAY_CONFIRMED==='true';
  return {...BINANCE_CAPABILITIES,externalDisplayConfirmed:confirmed,rawDataAvailable:confirmed,
    stream:confirmed?'binance-equity':null};
}
export function createBinanceService({fetchImpl=globalThis.fetch,now=Date.now,cache=cachedRequest}={}) {
  let blockedUntil=0, blockedError;
  async function request(path,params={}) {
    if (now()<blockedUntil) throw blockedError;
    const url=new URL(path,'https://fapi.binance.com');
    for (const [key,value] of Object.entries(params)) if(value!==undefined)url.searchParams.set(key,value);
    let response;
    try { response=await fetchImpl(url,{signal:AbortSignal.timeout(10000)}); }
    catch { throw failure('幣安行情連線失敗，請稍後重試。'); }
    if (!response.ok) {
      const status=response.status;
      const error=status===451?failure('幣安不提供此連線地區的行情服務。',451,'BINANCE_REGION_RESTRICTED'):
        status===429||status===418?failure('幣安行情暫時限流，稍後再更新。',429,'BINANCE_RATE_LIMITED'):
        failure(`幣安行情請求失敗（${status}）。`,status);
      if ([418,429,451].includes(status)) {
        blockedUntil=now()+(status===451?3600000:Math.max(60,Number(response.headers?.get('Retry-After'))||60)*1000);
        blockedError=error;
      }
      throw error;
    }
    let data;
    try { data=await response.json(); } catch { throw failure('幣安行情回應格式無效。'); }
    if(data?.code<0)throw failure('幣安未提供此合約資料。',400,'BINANCE_SYMBOL_UNAVAILABLE');
    return data;
  }
  async function directory(known) {
    const info=await cache('binance:equity-directory',()=>request('/fapi/v1/exchangeInfo'),{ttl:3600000});
    if(!Array.isArray(info.symbols))throw failure('幣安合約目錄格式無效。');
    return equityDirectory(info,known);
  }
  async function candles(item,query={},cap=binanceCapabilities()) {
    const interval=query.interval||'1D',period=BINANCE_INTERVALS[interval];
    if(!period||query.extendedHours==='true')throw failure('合約不支援此時間級別或美股延長時段選項。',400);
    let endTime;
    if(query.to) {
      if(!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(query.to))throw failure('無效歷史日期。',400);
      endTime=Date.parse(query.to.replace(' ','T')+(query.to.length===10?'T00:00:00Z':'Z'));
      if(!Number.isFinite(endTime))throw failure('無效歷史日期。',400);
    }
    const limit=Math.max(1,Math.min(1000,Math.floor(Number(query.limit)||400)));
    const rows=await cache(`binance:bars:${item.contractSymbol}:${period}:${limit}:${endTime||''}`,
      ()=>request('/fapi/v1/klines',{symbol:item.contractSymbol,interval:period,limit,endTime}),
      {ttl:endTime?3600000:5000});
    const bars=binanceBars(rows,now());
    if(!bars.length)throw failure('此合約沒有可用 K 線。');
    return {symbol:item.symbol,contractSymbol:item.contractSymbol,interval,bars,source:BINANCE_SOURCE,
      mode:'perpetual',feed:cap.feed,volumeScope:cap.volumeScope,receivedAt:now(),
      adjustment:'contract-unadjusted',session:'24/7',currency:'USDT',delaySeconds:null,
      historyExhausted:rows.length<limit,asOf:new Date(now()).toISOString(),capabilities:cap};
  }
  async function quotes(items) {
    const rows=await cache('binance:equity-tickers',()=>request('/fapi/v1/ticker/24hr'),{ttl:5000});
    if(!Array.isArray(rows))throw failure('幣安報價格式無效。');
    const byContract=new Map(rows.map(row=>[row.symbol,row]));
    return items.map(item=>binanceQuote(byContract.get(item.contractSymbol),item,now())).filter(Boolean);
  }
  async function snapshot(items,cap,scanLimit=40) {
    return cache(`binance:equity-snapshot:${scanLimit}`,async()=>{
      const tickers=await quotes(items),bySymbol=new Map(items.map(item=>[item.symbol,item]));
      const scan=tickers.filter(q=>!bySymbol.get(q.symbol)?.complex)
        .sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,scanLimit);
      const symbols=[...new Set(['SPY',...scan.map(row=>row.symbol)])].filter(s=>bySymbol.has(s));
      const histories={},failures=[];let cursor=0,fatal=null;
      await Promise.all(Array.from({length:Math.min(3,symbols.length)},async()=>{
        while(cursor<symbols.length&&!fatal) {
          const symbol=symbols[cursor++];
          try {histories[symbol]=(await candles(bySymbol.get(symbol),{interval:'1D',limit:400},cap)).bars;}
          catch(error) {if([401,403,429,451].includes(error.status))fatal=error;else failures.push(symbol);}
        }
      }));
      if(fatal)throw fatal;
      const analyses=analyzeStockPool(items,histories,histories.SPY||[],'1D',now());
      return {schemaVersion:2,source:BINANCE_SOURCE,mode:'perpetual',createdAt:new Date(now()).toISOString(),
        asOf:new Date(now()).toISOString(),sessionDate:null,quotes:tickers,analyses,analysisIntervals:['1D'],
        counts:{searchable:items.length,quoted:tickers.length,scanned:analyses.length,attempted:symbols.length},
        failures,scanLimit,changeBasis:'報價為24小時漲跌；掃描為已完成 UTC 日 K',
        error:failures.length?`${failures.length} 檔合約歷史暫無資料`:null};
    },{ttl:300000});
  }
  async function handle(endpoint,query={}, {known=[],env=process.env}={}) {
    const cap=binanceCapabilities(env);
    if(endpoint==='capabilities')return cap;
    if(!['directory','snapshot','quote-v2','chart-v2'].includes(endpoint))return null;
    if(!cap.rawDataAvailable)throw failure('幣安合約公開資料設定尚未完成。',403,'US_DATA_DISPLAY_RIGHTS_REQUIRED');
    const items=await directory(known);
    if(endpoint==='directory')return {schemaVersion:2,items,source:BINANCE_SOURCE,receivedAt:now()};
    if(endpoint==='snapshot')return snapshot(items,cap,Math.max(1,Math.min(80,Number(env.US_BINANCE_SCAN_LIMIT)||40)));
    const symbol=String(query.symbol||'').toUpperCase();
    const item=items.find(row=>row.symbol===symbol);
    if(!item)throw failure('此股票沒有可用的幣安股票永續合約。',404,'BINANCE_SYMBOL_UNAVAILABLE');
    if(endpoint==='chart-v2')return candles(item,query,cap);
    const quote=(await quotes([item]))[0];
    if(!quote)throw failure('此合約尚無有效報價。');
    return {quote,capabilities:cap};
  }
  return {handle,request};
}
export const binanceService=createBinanceService();
