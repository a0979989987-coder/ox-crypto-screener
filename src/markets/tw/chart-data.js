import { TIMEFRAMES, FRAME_LABELS, aggregateCandles } from './patterns/model.js';

// Intraday options are distinct from the daily pattern-scanning catalog.
export const CHART_FRAMES = {'1m':'1 分','5m':'5 分','15m':'15 分','30m':'30 分','1H':'1 小時','4H':'4 小時',...FRAME_LABELS,'1Q':'季'};
export const INTRADAY_MESSAGE = '分鐘／小時 K 尚未接入盤中行情資料，請先使用日、週、月或季線。';
export const isIntraday = frame => !TIMEFRAMES[frame] && frame !== '1Q';

export function quarterlyCandles(daily, asOf) {
  const quarter = date => `${date.slice(0,4)}-${String(Math.floor((Number(date.slice(5,7))-1)/3)*3+1).padStart(2,'0')}-01`;
  const groups = new Map(), first = quarter(daily[0]?.date || asOf), current = quarter(asOf);
  const end = new Date(Date.UTC(Number(current.slice(0,4)),Number(current.slice(5,7))+2,0)).toISOString().slice(0,10);
  for (const c of daily) {
    const key = quarter(c.date);
    // Keep only complete calendar quarters with a complete history boundary.
    if (c.date > asOf || key === first || key > current || key === current && asOf < end) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups].map(([date, bars]) => ({date,time:Date.parse(date+'T00:00:00+08:00')/1000,lastDate:bars.at(-1).date,
    open:bars[0].open,high:Math.max(...bars.map(c=>c.high)),low:Math.min(...bars.map(c=>c.low)),close:bars.at(-1).close,
    volume:bars.reduce((sum,c)=>sum+c.volume,0),quoteVolume:bars.every(c=>Number.isFinite(c.quoteVolume))?bars.reduce((sum,c)=>sum+c.quoteVolume,0):null}));
}

export function aggregateChartCandles(daily, frame, asOf) {
  return frame === '1Q' ? quarterlyCandles(daily, asOf) : aggregateCandles(daily, frame, asOf);
}

export function stockDetails(row, asOf) {
  const finite = n => Number.isFinite(n) ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : '—';
  const c = row?.currentCandle || {}, d = row?.disposition || {};
  return [ ['市場', row?.market === 'TWSE' ? '上市' : row?.market === 'TPEX' ? '上櫃' : '—'],
    ['產業', row?.industry || '—'], ['開盤',finite(c.open)], ['最高',finite(c.high)], ['最低',finite(c.low)],
    ['成交量（股）',finite(row?.volume ?? c.volume)], ['週轉率',Number.isFinite(row?.turnoverRate)?finite(row.turnoverRate)+'%':'—'],
    ['雷達級別',row?.tier || '—'], ['處置／注意',d.riskLabel || (d.status==='active'?'處置中':d.status==='release'?'即將出關':'—')],
    ['資料日',asOf || '—'] ];
}
