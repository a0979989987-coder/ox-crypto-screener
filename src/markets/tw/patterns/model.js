export const TIMEFRAMES = { '1D': 86400, '1W': 604800 };
export function selectUniverse(stocks, limit = 80) {
  return stocks.filter(row => /^\d{4}$/.test(row.symbol) && ['TWSE', 'TPEX'].includes(row.market) && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.turnoverTwd) && row.turnoverTwd > 0)
    .sort((a, b) => b.turnoverTwd - a.turnoverTwd).slice(0, limit || Infinity);
}
export function dailyCandles(rows, asOf) {
  const candles = new Map();
  for (const row of rows || []) {
    const date = row.date || row.datetime;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > asOf) continue;
    const { open, high, low, close, volume } = row;
    if (![open, high, low, close, volume].every(Number.isFinite) || Math.min(open, low, close) <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || high < low || volume < 0) continue;
    candles.set(date, { date, time: Date.parse(date + 'T00:00:00+08:00') / 1000, open, high, low, close, volume, quoteVolume: Number.isFinite(row.turnoverTwd) ? row.turnoverTwd : null });
  }
  // Holidays and suspended sessions remain gaps, never synthetic bars.
  return [...candles.values()].sort((a, b) => a.time - b.time);
}
export function weekStart(date) {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function weeklyCandles(daily, asOf, now = Date.now()) {
  const groups = new Map(), local = new Date(now + 8 * 3600000), today = local.toISOString().slice(0, 10);
  const thisWeek = weekStart(today), day = local.getUTCDay();
  // Only complete weeks. Friday's official close can finish a week;
  // holiday-shortened weeks are accepted once the weekend has arrived.
  const officialFriday = new Date(asOf + 'T00:00:00Z').getUTCDay() === 5;
  for (const c of daily) {
    const week = weekStart(c.date);
    if (week > thisWeek || week === thisWeek && day !== 0 && day !== 6 && !officialFriday) continue;
    const group = groups.get(week);
    if (!group) groups.set(week, { ...c, date: week, time: Date.parse(week + 'T00:00:00+08:00') / 1000, lastDate: c.date });
    else { group.high = Math.max(group.high, c.high); group.low = Math.min(group.low, c.low); group.close = c.close; group.volume += c.volume; group.quoteVolume = group.quoteVolume === null || c.quoteVolume === null ? null : group.quoteVolume + c.quoteVolume; group.lastDate = c.date; }
  }
  return [...groups.values()];
}
