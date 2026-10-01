import { aggregateCandles } from './model.js';
// Official candles and named-pattern classifications are built once on the server.
const manifestURL=new URL('../../../../data/tw-patterns/manifest.json',import.meta.url);
const entries=new Map(),listeners=new Set();let manifest=null,pending=null,checkedAt=0,failed=0;
export function subscribeBundle(listener){listeners.add(listener);return()=>listeners.delete(listener);}
const emit=()=>{for(const listener of listeners)listener(bundleState());};
export function bundleState(){return {date:manifest?.date,total:manifest?.total||0,classified:entries.size,unavailable:manifest?.unavailable||[],stocks:manifest?.stocks||[],failed,loading:!!pending};}
export function bundleEntry(symbol,frame='1D',date){const base=entries.get(symbol+':1D');if(!base||date&&base.data.dataDate!==date)return null;if(frame==='1D')return base;const prepared=base.frames?.[frame];if(!prepared)return null;return {key:symbol+':'+frame,data:{...base.data,frame,candles:aggregateCandles(base.data.candles,frame,base.data.dataDate)},matches:prepared.matches};}
export function bundleEntries(frames=['1D'],date){return [...entries.values()].filter(e=>frames.includes(e.data.frame)&&(!date||e.data.dataDate===date));}
export async function preloadBundle({force=false}={}){
 if(pending)return pending;if(!force&&manifest&&Date.now()-checkedAt<300000)return bundleState();
 const loading=globalThis.OXLoading?.begin('tw','載入台股標的');
 pending=(async()=>{
  const response=await fetch(manifestURL,{cache:'no-cache'});if(!response.ok)throw Error('全市場分類索引更新中');
  const next=await response.json();if(next.algorithmVersion!==5||!Array.isArray(next.chunks)||!next.date)throw Error('分類索引版本不符');
  if(manifest?.date===next.date&&entries.size===next.classified){checkedAt=Date.now();return bundleState();}
  manifest=next;failed=0;
  for(const [key,e]of entries)if(e.data.dataDate!==next.date)entries.delete(key);
  loading?.update(entries.size,next.classified);
  let cursor=0;await Promise.all(Array.from({length:2},async()=>{while(cursor<next.chunks.length){
   const chunk=next.chunks[cursor++];try{
    if(!/^daily-\d+\.json(?:\.gz)?$/.test(chunk.file))throw Error('分類資料路徑異常');
    const result=await fetch(new URL(chunk.file+'?date='+next.date,manifestURL));if(!result.ok)throw Error('分類資料尚未取得');const payload=chunk.file.endsWith('.gz')&&!result.headers.get('content-encoding')?.includes('gzip')?await new Response(result.body.pipeThrough(new DecompressionStream('gzip'))).json():await result.json();
    if(payload.date!==next.date||payload.algorithmVersion!==5||!Array.isArray(payload.entries))throw Error('分類資料日期不符');
    for(const e of payload.entries)if(e.key===e.data?.symbol+':1D'&&e.data.dataDate===next.date&&e.data.candles?.length>=35&&e.matches)entries.set(e.key,e);else throw Error('分類資料格式異常');
   }catch{failed+=chunk.count;}loading?.update(entries.size+failed,next.classified);emit();
  }}));checkedAt=failed?0:Date.now();return bundleState();
 })().finally(()=>{pending=null;loading?.finish();emit();});
 emit();return pending;
}
