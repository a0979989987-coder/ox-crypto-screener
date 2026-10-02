import { getTWApiBase } from '../api.js';
const requests=new Map();
export async function etfRequest(action='catalog',params={},signal) {
  const query=new URLSearchParams({action,...params}), base=getTWApiBase()||'/api';
  const url=base.replace(/\/$/,'')+'/v1/tw/etf?'+query;
  // Cancellation belongs to each mounted view; never share an aborted request.
  const r=await fetch(url,{signal,cache:'no-store'}), payload=await r.json();
  if(!r.ok||!payload.ok)throw Error(payload.error?.message||'ETF 資料暫時無法取得');
  return payload.data;
}
export function rememberHistory(rows){for(const r of rows)if(!r.unavailable)requests.set(r.symbol,r);}
export const knownHistory=symbol=>requests.get(symbol);
