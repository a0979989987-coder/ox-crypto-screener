const API='https://api.bitget.com';
export async function json(url,signal) {
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true}); const timeout=setTimeout(abort,12000);
  try { if(signal?.aborted)abort(); const r=await fetch(url,{signal:controller.signal}); if(!r.ok)throw Error('HTTP '+r.status);return await r.json(); }
  finally { clearTimeout(timeout);signal?.removeEventListener('abort',abort); }
}
let capCache=null;
export async function fetchCaps(signal) {
  if(capCache&&Date.now()-capCache.at<300000)return capCache.rows;
  const rows=await json('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false',signal);
  if(!Array.isArray(rows)||!rows.length)throw Error('市值資料暫時無法取得');capCache={at:Date.now(),rows};return rows;
}
export async function fetchQuotes(signal) {
  const [quotes,instruments]=await Promise.all([json(API+'/api/v2/mix/market/tickers?productType=USDT-FUTURES',signal),json(API+'/api/v3/market/instruments?category=USDT-FUTURES',signal)]);
  if(quotes.code!=='00000'||instruments.code!=='00000'||!Array.isArray(quotes.data)||!Array.isArray(instruments.data))throw Error('行情資料暫時無法取得');
  const allowed=new Map(instruments.data.filter(i=>i.symbolType==='crypto'&&i.type==='perpetual'&&i.status==='online'&&i.quoteCoin==='USDT').map(i=>[i.symbol,i]));
  return quotes.data.filter(t=>allowed.has(t.symbol)).map(t=>({...t,baseCoin:allowed.get(t.symbol).baseCoin}));
}
export async function fetchLargeTrades(symbol,signal) {
  const body=await json(API+`/api/v2/mix/market/fills?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES&limit=100`,signal);
  if(body.code!=='00000'||!Array.isArray(body.data))throw Error('大單資料暫時無法取得');
  return {records:body.data,time:Number(body.requestTime)};
}
export const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(id);reject(new DOMException('Aborted','AbortError'));};
  const id=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
});
