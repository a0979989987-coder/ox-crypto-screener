import { cachedRequest } from './cache.js';
import { withinBudget } from './budget.js';
import { financeQueryRequest, financeCandles } from './finance-query.js';
import { readFile } from 'node:fs/promises';
import { EOD_CAPABILITIES, EOD_INTERVALS, eodSeries, completedDaily, closingQuote } from '../../../src/markets/us/eod.js';
const unavailable=message=>Object.assign(Error(message),{status:503,code:'US_EOD_UNAVAILABLE'});
export function eodCapabilities(privateValidation=false) {
 const confirmed=process.env.US_DATA_PROVIDER==='finance-query' && process.env.US_EXTERNAL_DISPLAY_CONFIRMED==='true';
 return {...EOD_CAPABILITIES,privateValidation,source:privateValidation?'finance-query-eod-private':'finance-query-eod',
 externalDisplayConfirmed:!privateValidation && confirmed,rawDataAvailable:privateValidation || confirmed};
}
let bundlePending;
async function loadEOD(path=new URL('../../../data/us-eod.json',import.meta.url)) {
 try {const data=JSON.parse(await readFile(path,'utf8'));
  if(data.mode!=='eod' || data.schemaVersion!==2 || !Array.isArray(data.snapshot?.analyses))throw Error('invalid');
  return data;
 } catch {throw unavailable('盤後快照尚未建立；不顯示盤中或模擬行情。');}
}
export async function readEOD() {
 bundlePending ||= loadEOD().catch(error=>{bundlePending=null;throw error;});
 return bundlePending;
}
export async function handleEOD(endpoint,query={}, {privateValidation=false,readBundle=readEOD,financeUpstream=financeQueryRequest}={}) {
 const cap=eodCapabilities(privateValidation);
 if(endpoint==='capabilities')return cap;
 if(!['snapshot','quote-v2','chart-v2'].includes(endpoint))return null;
 const empty={schemaVersion:2,mode:'eod',asOf:null,quotes:[],analyses:[],analysisIntervals:EOD_INTERVALS,counts:{searchable:0,quoted:0,scanned:0}};
 if(!cap.rawDataAvailable) {
  if(endpoint==='snapshot')return {...empty,error:'盤後資料公開使用權尚待確認；盤中資訊已停止。'};
  throw Object.assign(Error('盤後資料公開使用權尚待確認。'),{status:403,code:'LICENSE_NOT_CONFIRMED'});
 }
 let bundle;
 try {bundle=await readBundle();}catch(error){if(endpoint!=='snapshot')throw error;return {...empty,error:error.message};}
 if(!privateValidation && (bundle.privateValidation || bundle.snapshot.privateValidation))throw unavailable('私人驗證資料不可公開。');
 if(endpoint==='snapshot')return bundle.snapshot;
 const symbol=String(query.symbol||'').toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol))throw Object.assign(Error('無效股票代號。'),{status:400});
 async function dailyHistory() {
  if(bundle.histories) return bundle.histories[symbol] || [];
  if(privateValidation) throw unavailable('私人收盤歷史不存在。');
  // Raw history stays in the server cache, never in a public Git snapshot.
  const saved=await cachedRequest(`eod-history:${symbol}:${bundle.sessionDate}`,()=>withinBudget(1,async()=>{
   const raw=await financeUpstream(`/chart/${encodeURIComponent(symbol)}`,{interval:'1d',range:'5y'});
   const daily=completedDaily(financeCandles(raw,symbol,'1D'),Date.parse(bundle.createdAt));
   if(daily.at(-1)?.date!==bundle.sessionDate)throw unavailable('資料源尚未提供目標交易日的完整日線。');
   const expected=bundle.snapshot.quotes.find(q=>q.symbol===symbol);
   if(expected && Math.abs(expected.price-daily.at(-1).close)>1e-8)throw unavailable('資料源收盤价已校正；等待共用快照更新。');
   return daily;
  }),{ttl:7*86400000,stale:7*86400000,withMetadata:true});
  return saved.value;
 }
 if(endpoint==='quote-v2') {
  const quote=bundle.snapshot.quotes.find(q=>q.symbol===symbol) || closingQuote(symbol,await dailyHistory(),Date.parse(bundle.createdAt),cap.source);if(!quote)throw unavailable('這檔股票尚無有效收盤資料。');
  return {quote,capabilities:cap};
 }
 const interval=query.interval||'1D';
 if(!EOD_INTERVALS.includes(interval) || query.extendedHours==='true')throw Object.assign(Error('盤中與延長時段資訊已停止；只提供日／週／月線。'),{status:400,code:'US_INTRADAY_DISABLED'});
 let bars=eodSeries(await dailyHistory(),interval,Date.parse(bundle.createdAt));
 if(query.to) {
  if(!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(query.to))throw Object.assign(Error('無效歷史日期。'),{status:400});
  bars=bars.filter(b=>b.date<query.to.slice(0,10));
 }
 if(!bars.length)throw unavailable('這個級別尚無完整收盤 K 線。');
 const limit=Math.max(1,Math.min(5000,Number(query.limit)||400));
 return {symbol,interval,bars:bars.slice(-limit),source:cap.source,mode:'eod',asOf:bundle.sessionDate,
  receivedAt:Date.parse(bundle.createdAt),adjustment:'unknown',session:'regular',volumeScope:cap.volumeScope,feed:cap.feed,
  delaySeconds:null,historyExhausted:bars.length<=limit,capabilities:cap};
}
