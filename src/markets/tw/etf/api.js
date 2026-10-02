import { getTWApiBase } from '../api.js';
import { createSnapshotLoader } from './static-snapshot.js';
const requests=new Map();
const onPages=typeof location!=='undefined'&&location.hostname.endsWith('.github.io');
const loadSnapshot=createSnapshotLoader(fetch,new URL('../../../../',import.meta.url));
let apiUnavailableUntil=0;
export async function etfRequest(action='catalog',params={},signal) {
  const query=new URLSearchParams({action,...params}), base=getTWApiBase()||'/api';
  const url=base.replace(/\/$/,'')+'/v1/tw/etf?'+query;
  const refresh=params.refresh==='1';
  if(onPages&&!refresh&&Date.now()<apiUnavailableUntil)return loadSnapshot(action,params,signal);
  try{
    // Cancellation belongs to each mounted view; never share an aborted request.
    const r=await fetch(url,{signal,cache:'no-store'}), payload=await r.json();
    if(!r.ok||!payload.ok)throw Error(payload.error?.message||'ETF 資料暫時無法取得');
    apiUnavailableUntil=0;
    return payload.data;
  }catch(error){
    if(error?.name==='AbortError'||!onPages)throw error;
    apiUnavailableUntil=Date.now()+120000;
    return loadSnapshot(action,params,signal,refresh);
  }
}
export function rememberHistory(rows){for(const r of rows)if(!r.unavailable)requests.set(r.symbol,r);}
export const knownHistory=symbol=>requests.get(symbol);
