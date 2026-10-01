/** Shared close-only collector. Visitors never call the upstream data provider. */
import {readFile,writeFile,rename,readdir,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {financeQueryRequest,financeCandles} from '../server/markets/us/finance-query.js';
import {completedSession,completedDaily,eodSeries,closingQuote,EOD_INTERVALS} from '../src/markets/us/eod.js';
import {analyzeStock} from '../src/markets/us/analysis.js';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const privateValidation=process.argv.includes('--private-validation');
if(!privateValidation && (process.env.US_DATA_PROVIDER!=='finance-query' || process.env.US_EXTERNAL_DISPLAY_CONFIRMED!=='true'))
 throw Error('公開日線使用權未確認；不能收集或發布公開資料。');
const root=resolve(new URL('..',import.meta.url).pathname);
const output=resolve(arg('--output')||`${root}/data/us-eod.json`);
if(privateValidation && output.startsWith(`${root}/`))throw Error('私人原始資料必須存放專案以外。');
const directory=JSON.parse(await readFile(`${root}/data/us-directory.json`,'utf8')).items;
const input=arg('--input');
const inputs=input?input.split(','):[];
const files=new Map();
for(const folder of inputs)for(const file of await readdir(folder))if(file.endsWith('-1d.json'))files.set(file.slice(0,-8),`${folder}/${file}`);
const target=Number(arg('--target')||process.env.US_SCAN_TARGET||400);
const budget=Number(process.env.US_COLLECT_CREDIT_BUDGET||400),rpm=Number(process.env.US_API_CREDITS_PER_MINUTE||8);
if(!Number.isInteger(target)||target<1||target>500||!Number.isInteger(budget)||budget<1||!Number.isInteger(rpm)||rpm<1||rpm>8)throw Error('無效收集上限。');
const requested=input?[...files.keys()]:[...new Set(['SPY','QQQ','IWM','XLK','XLF','XLE','XLV','AAPL','MSFT','NVDA','TSM','AMZN','META','GOOGL','TSLA',...directory.filter(x=>!x.complex).map(x=>x.symbol)])].slice(0,target);
const now=Date.now(),sessionDate=completedSession(now),createdAt=new Date(now).toISOString();
const histories={},quotes=[],failures=[];
let used=0,lastRequest=0;
for(const symbol of requested) {
 try {
  let raw;
  if(input)raw=JSON.parse(await readFile(files.get(symbol),'utf8'));
  else {
   if(used>=budget)throw Error('REQUEST_BUDGET');
   const wait=Math.max(0,lastRequest+Math.ceil(60000/rpm)-Date.now());
   if(wait)await new Promise(r=>setTimeout(r,wait));
   lastRequest=Date.now();used++;
   raw=await financeQueryRequest(`/chart/${encodeURIComponent(symbol)}`,{interval:'1d',range:'5y'});
  }
  const bars=completedDaily(financeCandles(raw,symbol,'1D'),now);
  if(bars.length<60 || bars.at(-1)?.date!==sessionDate)throw Error('收盤資料不足或尚未更新至目標交易日');
  histories[symbol]=bars;
  quotes.push(closingQuote(symbol,bars,now,privateValidation?'finance-query-eod-private':'finance-query-eod'));
 }catch(error){failures.push({symbol,message:error.message});if(error.status===429 || error.message==='REQUEST_BUDGET')break;}
}
if(!histories.SPY)throw Error('SPY 收盤基準缺失；保留前次快照。');
if(!privateValidation && quotes.length<Math.ceil(requested.length*.9))throw Error('有效收盤資料不足九成；保留前次快照。');
const analyses=[];
for(const interval of EOD_INTERVALS) {
 const benchmark=eodSeries(histories.SPY,interval,now);
 for(const [symbol,daily] of Object.entries(histories)) {
  const item=directory.find(x=>x.symbol===symbol); if(!item)continue;
  const row=analyzeStock(item,eodSeries(daily,interval,now),benchmark,interval,now);
  if(row)analyses.push({...row,mode:'eod'});
 }
}
const snapshot={schemaVersion:2,mode:'eod',privateValidation,source:privateValidation?'finance-query-eod-private':'finance-query-eod',
 asOf:createdAt,sessionDate,createdAt,analysisIntervals:EOD_INTERVALS.filter(interval=>analyses.some(row=>row.interval===interval)),
 analysisAvailability:Object.fromEntries(EOD_INTERVALS.map(interval=>[interval,{count:analyses.filter(row=>row.interval===interval).length,minimumBars:60}])),quotes,analyses,
 counts:{searchable:directory.length,quoted:quotes.length,scanned:new Set(analyses.map(x=>x.symbol)).size},
 collection:{requested:requested.length,completed:quotes.length,failures,upstreamRequests:used}};
const bundle={schemaVersion:2,mode:'eod',privateValidation,createdAt,sessionDate,...(privateValidation?{histories}:{}),snapshot};
await mkdir(dirname(output),{recursive:true});
await writeFile(`${output}.tmp`,JSON.stringify(bundle));await rename(`${output}.tmp`,output);
console.log(JSON.stringify({output,sessionDate,counts:snapshot.counts,analyses:analyses.length,failures:failures.length,privateValidation}));
