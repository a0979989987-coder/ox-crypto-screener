import { aggregateCandles } from './model.js';
import { classifyTWSeries } from '../classic.js?v=20261001-audit1';
import { qualifyPatternMatches } from '../../crypto/patterns/matcher.js?v=20261001-audit1';
// Official candles and named-pattern classifications are built once on the server.
const manifestURL=new URL('../../../../data/tw-patterns/manifest.json',import.meta.url);
const entries=new Map(),listeners=new Set();let manifest=null,pending=null,checkedAt=0,failed=0;
export function subscribeBundle(listener){listeners.add(listener);return()=>listeners.delete(listener);}
const emit=()=>{for(const listener of listeners)listener(bundleState());};
export function bundleState(){return {date:manifest?.date,revision:manifest?.updatedAt,total:manifest?.total||0,expected:manifest?.classified||0,dates:manifest?.dates||[],classified:entries.size,unavailable:manifest?.unavailable||[],stocks:manifest?.stocks||[],failed,loading:!!pending};}
export function awaitBundleManifest(signal){
 if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
 const job=preloadBundle();
 return new Promise((resolve,reject)=>{
  let unsubscribe=()=>{};
  const finish=(error)=>{unsubscribe();signal?.removeEventListener('abort',abort);error?reject(error):resolve(bundleState());};
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  const check=()=>{if(bundleState().date&&bundleState().stocks.length)finish();};
  unsubscribe=subscribeBundle(check);signal?.addEventListener('abort',abort,{once:true});check();
  job.then(()=>{if(bundleState().date&&bundleState().stocks.length)finish();else finish(Error('官方台股觀察池尚未取得'));},finish);
 });
}
export function bundleEntry(symbol,frame='1D',date){const base=entries.get(symbol+':1D');if(!base||date&&base.data.dataDate!==date)return null;if(frame==='1D')return base;const prepared=base.frames?.[frame];if(!prepared)return null;return {key:symbol+':'+frame,data:{...base.data,frame,candles:aggregateCandles(base.data.candles,frame,base.data.dataDate),classic:prepared.classic},matches:prepared.matches,classic:prepared.classic};}
export function bundleClassification(symbol,frame='1D',date){return bundleEntry(symbol,frame,date);}
export function bundleEntries(frames=['1D'],date){return [...entries.values()].filter(e=>frames.includes(e.data.frame)&&(!date||e.data.dataDate===date));}
export async function preloadBundle({force=false,silent=false}={}){
 if(pending)return pending;if(!force&&manifest&&Date.now()-checkedAt<300000)return bundleState();
 const loading=silent?null:globalThis.OXLoading?.begin('tw','載入台股標的',{views:['radar','strength']});
 pending=(async()=>{
  const response=await fetch(manifestURL,{cache:'no-cache'});if(!response.ok)throw Error('全市場分類索引更新中');
  const next=await response.json();if(![5,6].includes(next.algorithmVersion)||!Array.isArray(next.chunks)||!next.date)throw Error('分類索引版本不符');
  if(manifest?.date===next.date&&manifest?.updatedAt===next.updatedAt&&entries.size===next.classified){checkedAt=Date.now();return bundleState();}
  manifest=next;failed=0;
  for(const [key,e]of entries)if(e.data.dataDate!==next.date)entries.delete(key);
  emit();
  loading?.update(entries.size,next.classified);
  let cursor=0;await Promise.all(Array.from({length:2},async()=>{while(cursor<next.chunks.length){
   const chunk=next.chunks[cursor++];try{
    if(!/^daily-\d+\.json(?:\.gz)?$/.test(chunk.file))throw Error('分類資料路徑異常');
    const result=await fetch(new URL(chunk.file+'?date='+next.date+'&revision='+encodeURIComponent(next.updatedAt||''),manifestURL),{cache:'no-cache'});if(!result.ok)throw Error('分類資料尚未取得');const payload=chunk.file.endsWith('.gz')&&!result.headers.get('content-encoding')?.includes('gzip')?await new Response(result.body.pipeThrough(new DecompressionStream('gzip'))).json():await result.json();
    if(payload.date!==next.date||![5,6].includes(payload.algorithmVersion)||!Array.isArray(payload.entries))throw Error('分類資料日期不符');
    for(const [index,e]of payload.entries.entries()){
      if(e.key!==e.data?.symbol+':1D'||e.data.dataDate!==next.date||e.data.candles?.length<35||!e.matches)throw Error('分類資料格式異常');
      const qualify=(candles,frame,matches)=>{
        const classic=classifyTWSeries(candles,frame);
        return {classic,matches:qualifyPatternMatches({candles,classic,volatility:classic.long.atr||classic.short.atr||0},matches)};
      };
      const daily=qualify(e.data.candles,'1D',e.matches);
      const frames=Object.fromEntries(Object.entries(e.frames||{}).map(([frame,prepared])=>[frame,qualify(aggregateCandles(e.data.candles,frame,next.date),frame,prepared.matches)]));
      entries.set(e.key,{...e,...daily,data:{...e.data,classic:daily.classic},frames});
      if(index===0||index%30===29){loading?.update(entries.size+failed,next.classified);emit();await new Promise(resolve=>setTimeout(resolve,0));}
    }
   }catch{failed+=chunk.count;}loading?.update(entries.size+failed,next.classified);emit();
  }}));checkedAt=failed?0:Date.now();return bundleState();
 })().finally(()=>{pending=null;loading?.finish();emit();});
 emit();return pending;
}
