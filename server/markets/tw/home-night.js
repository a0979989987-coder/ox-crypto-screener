// Adapted from update-night.py: only completed TAIFEX marketCode=1 TX months.
import {numeric,taipeiClock} from './home-close.js';
import {readSource} from './home-markets.js';
import {validNight} from '../../../src/markets/tw/home-model.js';
const text=html=>String(html).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
const value=s=>numeric(String(s).replace(/[,▲▼%]/g,''));
const validDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
// Without queryDate, TAIFEX selects its latest official trading attribution day,
// including the next trading day during weekends and long market holidays.
export const nightUrl=date=>'https://www.taifex.com.tw/cht/3/futDailyMarketReport?'+new URLSearchParams({...date?{queryDate:date.replaceAll('-','/')}:{},marketCode:'1',commodity_id:'TX'});
export function nightReportDate(html){
 const input=[...html.matchAll(/<input\b[^>]*>/gi)].find(m=>/\bname\s*=\s*["']queryDate["']/i.test(m[0]))?.[0];
 const query=input?.match(/\bvalue\s*=\s*["']([^"']+)["']/i)?.[1];
 const date=query?.replaceAll('/','-');
 if(!validDate(date))throw Error('來源未標示有效交易歸屬日');
 return date;
}
export function parseNight(html,requested,now=new Date()){
 if(!validDate(requested)||nightReportDate(html)!==requested)throw Error('來源交易歸屬日不符');
 const session=text(html).match(/(\d{4}\/\d{2}\/\d{2})\s+15:00\s*~\s*次日05:00\s+盤後交易時段行情表/);
 if(!session)throw Error('未取得已完成夜盤報表');
 const startDate=session[1].replaceAll('/','-');
 if(!validDate(startDate))throw Error('夜盤場次日期無效');
 const start=startDate+'T15:00:00+08:00';
 // Derive the Taipei calendar day, not the preceding UTC day.
 const endDate=taipeiClock(new Date(Date.parse(start)+14*3600000)).date,sessionEnd=endDate+'T05:00:00+08:00';
 if(endDate>requested)throw Error('來源夜盤場次與交易歸屬日不符');
 if(Date.parse(sessionEnd)>now.getTime())throw Error('夜盤尚未結束');
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>text(c[1])));
 const contracts=rows.filter(r=>r.length>=15&&r[0]==='TX'&&/^\d{6}$/.test(r[1])&&Number(r[1].slice(4))>=1&&Number(r[1].slice(4))<=12).sort((a,b)=>a[1].localeCompare(b[1]));
 if(!contracts.length)throw Error('TX 近月月契約夜盤尚未公布');
 const r=contracts[0],close=value(r[5]),high=value(r[3]),low=value(r[4]),open=value(r[2]),volume=value(r[8]);
 if(close<=0||volume<=0||!Number.isInteger(volume)||low<=0||high<low||close<low||close>high||open<low||open>high)throw Error('TX 近月夜盤資料不完整');
 return {contract:r[1],close,change:value(r[6]),changePct:value(r[7]),open,high,low,volume,tradeDate:requested,sessionStart:start,sessionEnd,status:'ok',source:'臺灣期貨交易所',sourceUrl:nightUrl(requested)};
}
export async function collectNight(previous,now=new Date(),read=readSource){
 const clock=taipeiClock(now),base=Date.parse(clock.date+'T12:00:00Z'),checkedAt=now.toISOString();let error,latestDate,best,latestVerified=false;
 try{
  const html=await(await read(nightUrl())).text();latestDate=nightReportDate(html);
  try{best=parseNight(html,latestDate,now);latestVerified=true;}
  catch(e){
   // A valid but still-open latest session is expected before 05:00. Its
   // attribution day is known; dated queries may still supply the prior close.
   if(e.message==='夜盤尚未結束')latestVerified=true;
   error=e.message;
  }
 }catch(e){error=e.message;}
 // The default page may be partially published while its explicit date route
 // already works. Retry the discovered day even when it is beyond today.
 if(latestDate&&!latestVerified){
  try{best=parseNight(await(await read(nightUrl(latestDate))).text(),latestDate,now);latestVerified=true;}
  catch(e){error||=e.message;}
 }
 for(let offset=0;offset<10;offset++){
  const day=new Date(base-offset*86400000).toISOString().slice(0,10);
  // A report cannot finish after its own attribution day (parseNight enforces
  // this). Older query days therefore cannot beat the best actual session.
  if(best&&day<best.sessionEnd.slice(0,10))break;
  if(day===latestDate)continue;
  try{const result=parseNight(await(await read(nightUrl(day))).text(),day,now);if(!best||Date.parse(result.sessionEnd)>Date.parse(best.sessionEnd))best=result;}
  catch(e){error||=e.message;}
 }
 const prior=validNight(previous,now.getTime())?previous:null;
 if(best&&(!prior||Date.parse(best.sessionEnd)>=Date.parse(prior.sessionEnd))){
  return {...best,collectedAt:checkedAt,checkedAt,...latestVerified?{}:{status:'stale',error:'最新夜盤交易歸屬日未確認：'+(error||'來源無資料')}};
 }
 return {...(prior||{}),status:prior?'stale':'unavailable',error:best?'來源夜盤場次早於已保存資料':error||'夜盤尚未公布',checkedAt};
}
