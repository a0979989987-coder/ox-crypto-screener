import { nyParts, nyEpoch, shiftDate, tradingDay, candleEnd } from './calendar.js';
export const EOD_INTERVALS = Object.freeze(['1D', '1W', '1M']);
export const EOD_CAPABILITIES = Object.freeze({source:'finance-query-eod', chartMode:'native', mode:'eod',
 intervals:EOD_INTERVALS, extendedHours:false, pollMs:0, externalDisplayConfirmed:false, rawDataAvailable:false,
 feed:'Finance Query / Yahoo · 收盤快照', delaySeconds:null, volumeScope:'資料源日成交量；交易所涵蓋與還原方式待確認',
 update:'收盤後集中更新；訪客讀取共用快照', depth:false, trades:false});
export function completedSession(now=Date.now()) {
 let date=nyParts(now).date;
 for(let i=0;i<15;i++,date=shiftDate(date,-1)) {
  const day=tradingDay(date); if(!day.known)throw Error('交易日曆待更新。');
  if(day.open && (nyEpoch(date,day.closeMinute)+3600)*1000<=now)return date;
 } throw Error('找不到已完成交易日。');
}
// Freshness follows completed New York trading sessions, not elapsed wall time.
// Friday's close remains current through the weekend; an older valid close is
// still usable, but must be identified as awaiting an update.
export function eodFreshness(sessionDate, now=Date.now()) {
 let expectedSessionDate;
 try { expectedSessionDate=completedSession(now); }
 catch { return {status:'calendar-unavailable',sessionDate:sessionDate||null,expectedSessionDate:null}; }
 if(!sessionDate)return {status:'unavailable',sessionDate:null,expectedSessionDate};
 const valid=typeof sessionDate==='string' && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) &&
  Number.isFinite(Date.parse(`${sessionDate}T12:00:00Z`)) &&
  new Date(`${sessionDate}T12:00:00Z`).toISOString().slice(0,10)===sessionDate;
 if(!valid || !tradingDay(sessionDate).open || sessionDate>expectedSessionDate)
  return {status:'invalid',sessionDate,expectedSessionDate};
 return {status:sessionDate===expectedSessionDate?'current':'stale',sessionDate,expectedSessionDate};
}
export function completedDaily(bars,now=Date.now()) {
 const cutoff=completedSession(now); return bars.filter(b=>b.date<=cutoff && tradingDay(b.date).open);
}
export function eodSeries(daily,interval,now=Date.now()) {
 const bars=completedDaily(daily,now); if(interval==='1D')return bars;
 if(!EOD_INTERVALS.includes(interval))throw Error('盤後模式只提供日／週／月線。');
 const groups=new Map();
 for(const bar of bars) {
  const weekday=new Date(`${bar.date}T12:00:00Z`).getUTCDay();
  const key=interval==='1W'?shiftDate(bar.date,1-weekday):bar.date.slice(0,7);
  if(!groups.has(key))groups.set(key,[]); groups.get(key).push(bar);
 }
 return [...groups].flatMap(([key,rows])=>{
  const start=interval==='1W'?key:`${key}-01`;
  const end=interval==='1W'?shiftDate(start,4):new Date(Date.UTC(+key.slice(0,4),+key.slice(5,7),0,12)).toISOString().slice(0,10);
  const expected=[];
  for(let d=start;d<=end;d=shiftDate(d,1))if(tradingDay(d).open)expected.push(d);
  if(expected.length!==rows.length || rows.some((r,i)=>r.date!==expected[i]))return [];
  const first=rows[0],last=rows.at(-1);
  if(!candleEnd(first,interval) || candleEnd(first,interval)*1000+3600000>now)return [];
  return [{...first,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:last.close,
   volume:rows.some(r=>r.volume===null)?null:rows.reduce((s,r)=>s+r.volume,0),periodEnd:last.date,components:rows.length}];
 });
}
export function closingQuote(symbol,bars,receivedAt,source='finance-query-eod') {
 const last=bars.at(-1),prev=bars.at(-2); if(!last || !prev)return null;
 return {symbol,price:last.close,previousClose:prev.close,change:last.close-prev.close,changePct:(last.close/prev.close-1)*100,
  volume:last.volume,open:last.open,high:last.high,low:last.low,marketTime:nyEpoch(last.date,tradingDay(last.date).closeMinute),
  marketOpen:false,receivedAt,source,mode:'eod',session:'closed',asOf:last.date,feed:EOD_CAPABILITIES.feed,
  volumeScope:EOD_CAPABILITIES.volumeScope,delaySeconds:null};
}
