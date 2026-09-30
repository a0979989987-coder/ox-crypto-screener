// Exchange dates are NY civil dates; only convert to UTC at the chart boundary.
export const NY = "America/New_York";
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: NY,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function nyParts(value = Date.now()) {
  const p = Object.fromEntries(
    parts.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minute: +p.hour * 60 + +p.minute,
    second: +p.second,
  };
}
export function nyEpoch(date, minute = 570) {
  const base = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
  let time = base + 5 * 3600000;
  for (let i = 0; i < 3; i++) {
    const p = nyParts(time),
      local =
        Date.parse(`${p.date}T00:00:00Z`) + p.minute * 60000 + p.second * 1000;
    time += base - local;
  }
  return time / 1000;
}
const dateKey = (d) => d.toISOString().slice(0, 10);
const day = (s) => new Date(`${s}T12:00:00Z`);
export const shiftDate = (s, n) =>
  dateKey(new Date(day(s).getTime() + n * 86400000));
const nth = (y, m, w, n) => {
  const d = new Date(Date.UTC(y, m - 1, 1, 12));
  d.setUTCDate(1 + ((w - d.getUTCDay() + 7) % 7) + (n - 1) * 7);
  return dateKey(d);
};
const last = (y, m, w) => {
  const d = new Date(Date.UTC(y, m, 0, 12));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - w + 7) % 7));
  return dateKey(d);
};
const observed = (s) =>
  day(s).getUTCDay() === 6
    ? shiftDate(s, -1)
    : day(s).getUTCDay() === 0
      ? shiftDate(s, 1)
      : s;
function easter(y) {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    n = h + l - 7 * m + 114;
  return dateKey(
    new Date(Date.UTC(y, Math.floor(n / 31) - 1, (n % 31) + 1, 12)),
  );
}
export function tradingDay(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { open: false, known: false };
  const y = +date.slice(0, 4),
    weekday = day(date).getUTCDay();
  const holidays = new Set([
    `${y}-01-01`,
    observed(`${y}-01-01`),
    nth(y, 1, 1, 3),
    nth(y, 2, 1, 3),
    shiftDate(easter(y), -2),
    last(y, 5, 1),
    observed(`${y}-06-19`),
    observed(`${y}-07-04`),
    nth(y, 9, 1, 1),
    nth(y, 11, 4, 4),
    observed(`${y}-12-25`),
    "2025-01-09",
  ]);
  // NYSE does not close Dec 31 when Jan 1 falls on Saturday.
  if (date.endsWith("-12-31")) holidays.delete(date);
  const known = y >= 2025 && y <= 2028;
  const open = known && weekday !== 0 && weekday !== 6 && !holidays.has(date);
  const early = new Set([
    shiftDate(nth(y, 11, 4, 4), 1),
    `${y}-12-24`,
    ...({ 2025: ["2025-07-03"], 2026: [], 2027: [], 2028: ["2028-07-03"] }[y] ||
      []),
  ]);
  return {
    open,
    known,
    openMinute: 570,
    closeMinute: open && early.has(date) ? 780 : 960,
    early: open && early.has(date),
    extendedCloseMinute: open && early.has(date) ? 1020 : 1200,
  };
}
export function sessionAt(now = Date.now()) {
  const p = nyParts(now),
    d = tradingDay(p.date);
  const session = !d.known
    ? "unknown"
    : !d.open
      ? "closed"
      : p.minute >= 570 && p.minute < d.closeMinute
        ? "regular"
        : p.minute >= 240 && p.minute < 570
          ? "pre"
          : p.minute >= d.closeMinute && p.minute < d.extendedCloseMinute
            ? "post"
            : "closed";
  return {
    ...p,
    ...d,
    session,
    label: {
      regular: "正常交易",
      pre: "盤前",
      post: "盤後",
      closed: "休市",
      unknown: "交易日曆待更新",
    }[session],
  };
}
export const INTERVALS = Object.freeze([
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
  "1M",
]);
export function candleEnd(candle, interval, extended = false) {
  const date = candle.date || nyParts(candle.time * 1000).date;
  const d = tradingDay(date);
  if (!d.known || !d.open) return null;
  if (["1D", "1W", "1M"].includes(interval)) {
    let end = date;
    if (interval === "1W") {
      const w = day(date).getUTCDay();
      end = shiftDate(date, 5 - w);
    }
    if (interval === "1M") {
      const x = day(date);
      end = dateKey(
        new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0, 12)),
      );
    }
    for (let i = 0; i < 7 && !tradingDay(end).open; i++)
      end = shiftDate(end, -1);
    return nyEpoch(end, tradingDay(end).closeMinute);
  }
  const minutes = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1H": 60,
    "4H": 240,
  }[interval];
  if (!minutes) return null;
  return Math.min(
    candle.time + minutes * 60,
    nyEpoch(date, extended ? d.extendedCloseMinute : d.closeMinute),
  );
}
export function countdown(
  candle,
  interval,
  extended = false,
  now = Date.now(),
) {
  const s = sessionAt(now),
    end = candle && candleEnd(candle, interval, extended);
  if (s.session === "closed" || s.session === "unknown") return s.label;
  if (!extended && s.session !== "regular") return "正常盤已收線";
  if (!end || end <= now / 1000) return "等待成交／收線校正";
  const delta = Math.floor(end - now / 1000);
  return `${Math.floor(delta / 3600) ? Math.floor(delta / 3600) + "h " : ""}${String(Math.floor(delta / 60) % 60).padStart(2, "0")}:${String(delta % 60).padStart(2, "0")}`;
}
