import { nyParts, nyEpoch, tradingDay } from "./calendar.js?v=20260930-us-native4";
// 09:30–13:30 and 13:30–session close. Never spans an overnight gap.
export function aggregate4H(bars, now = Date.now()) {
  const map = new Map();
  for (const c of bars) {
    const p = nyParts(c.time * 1000),
      d = tradingDay(p.date);
    if (!d.open || p.minute < 570 || p.minute >= d.closeMinute) continue;
    const start = 570 + Math.floor((p.minute - 570) / 240) * 240,
      time = nyEpoch(p.date, start);
    let bucket = map.get(time);
    if (!bucket) {
      bucket = {
        ...c,
        time,
        date: p.date,
        volume: c.volume,
        components: 0,
        componentTimes: [],
      };
      map.set(time, bucket);
    } else {
      bucket.high = Math.max(bucket.high, c.high);
      bucket.low = Math.min(bucket.low, c.low);
      bucket.close = c.close;
      bucket.volume =
        bucket.volume === null || c.volume === null
          ? null
          : bucket.volume + c.volume;
    }
    bucket.components++;
    bucket.componentTimes.push(c.time);
  }
  return [...map.values()]
    .sort((a, b) => a.time - b.time)
    .filter((c) => {
      const day = tradingDay(c.date);
      const end = Math.min(
        c.time + 240 * 60,
        nyEpoch(c.date, day.closeMinute),
        now / 1000,
      );
      // A missing 30m component is a gap, not a candle to interpolate.
      // Keep the current partial bucket only when its available components are continuous.
      const expected = Math.max(1, Math.ceil((end - c.time) / 1800));
      return (
        c.componentTimes.length === expected &&
        c.componentTimes.every((time, i) => time === c.time + i * 1800)
      );
    })
    .map(({ componentTimes, ...c }) => c);
}
export function aggregateMonthly(bars) {
  const map = new Map();
  for (const c of bars) {
    const month = c.date.slice(0, 7);
    let b = map.get(month);
    if (!b) {
      b = { ...c, components: 0 };
      map.set(month, b);
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume =
        b.volume === null || c.volume === null ? null : b.volume + c.volume;
    }
    b.components++;
  }
  const result = [...map.values()];
  return result.filter((c, i) => i > 0 || Number(c.date.slice(8, 10)) <= 3);
}
