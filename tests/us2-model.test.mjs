import test from "node:test";
import assert from "node:assert/strict";
import {
  nyEpoch,
  nyParts,
  sessionAt,
  tradingDay,
  candleEnd,
  countdown,
} from "../src/markets/us/calendar.js";
import {
  normalizeDirectory,
  normalizeQuote,
  quoteStatus,
  normalizeCandles,
  mergeCandles,
  relativeStrength,
  closedCandles,
} from "../src/markets/us/model.js";
import { aggregate4H } from "../src/markets/us/aggregate.js";
import { tierResults, resamplePath, analyzeStock, analyzeStockPool } from "../src/markets/us/analysis.js";
test("NY timezone changes with DST, and calendar includes holidays and early closes", () => {
  assert.equal(
    nyEpoch("2026-03-06", 570),
    Date.parse("2026-03-06T14:30:00Z") / 1000,
  );
  assert.equal(
    nyEpoch("2026-03-09", 570),
    Date.parse("2026-03-09T13:30:00Z") / 1000,
  );
  assert.equal(sessionAt(Date.parse("2026-07-03T15:00:00Z")).session, "closed");
  assert.equal(tradingDay("2026-11-27").closeMinute, 780);
  assert.equal(tradingDay("2026-12-24").closeMinute, 780);
  assert.equal(tradingDay("2027-12-24").open, false);
  assert.equal(tradingDay("2027-12-31").open, true);
  assert.equal(tradingDay("2028-07-03").closeMinute, 780);
  assert.equal(sessionAt(nyEpoch("2026-11-27", 1019) * 1000).session, "post");
  assert.equal(sessionAt(nyEpoch("2026-11-27", 1020) * 1000).session, "closed");
  assert.equal(tradingDay("2029-01-02").known, false);
});
test("candle deadlines respect early close and never create next bars during a holiday", () => {
  const c = { time: nyEpoch("2026-11-27", 570), date: "2026-11-27" };
  assert.equal(candleEnd(c, "4H"), nyEpoch("2026-11-27", 780));
  assert.equal(
    countdown(c, "4H", false, nyEpoch("2026-11-27", 779) * 1000),
    "01:00",
  );
  assert.equal(
    countdown(c, "4H", false, nyEpoch("2026-11-27", 800) * 1000),
    "正常盤已收線",
  );
  assert.equal(
    countdown(c, "4H", false, nyEpoch("2026-12-25", 600) * 1000),
    "休市",
  );
  assert.equal(
    candleEnd({ ...c, date: "2026-11-23", time: nyEpoch("2026-11-23") }, "1W"),
    nyEpoch("2026-11-27", 780),
  );
});
test("directory filters unsuitable listings, deduplicates and preserves ADR asset type", () => {
  const r = {
    symbol: "TSM",
    name: "Taiwan Semiconductor ADR",
    exchange: "NYSE",
    currency: "USD",
    country: "United States",
    type: "American Depositary Receipt",
  };
  assert.deepEqual(
    normalizeDirectory([
      r,
      { ...r, exchange: "IEX" },
      { ...r, symbol: "WRNT", type: "Warrant" },
      { ...r, symbol: "OTC", exchange: "OTC" },
    ]).map((x) => [x.symbol, x.type]),
    [["TSM", "ADR"]],
  );
  assert.equal(
    normalizeDirectory(
      [],
      [{ ...r, symbol: "SQQQ", name: "UltraPro Short QQQ" }],
    )[0].complex,
    true,
  );
});
test("quote status uses market timestamps, not response arrival", () => {
  const now = Date.parse("2026-09-29T15:00:00Z");
  const q = normalizeQuote(
    {
      symbol: "AAPL",
      close: "200",
      last_quote_at: now / 1000 - 3600,
      is_market_open: true,
    },
    now,
  );
  assert.equal(quoteStatus(q, now), "行情過期");
  assert.equal(normalizeQuote({ symbol: "BAD", close: "" }), null);
  assert.equal(
    quoteStatus({ ...q, marketTime: now / 1000, delaySeconds: null }, now),
    "延遲狀態未確認",
  );
});
test("OHLC validation drops corrupt rows, sorts and corrects duplicate candles without filling gaps", () => {
  const raw = {
    values: [
      {
        datetime: "2026-09-29",
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 10,
      },
      { datetime: "2026-09-28", open: 100, high: 90, low: 99, close: 101 },
      {
        datetime: "2026-09-29",
        open: 100,
        high: 103,
        low: 99,
        close: 102,
        volume: 12,
      },
    ],
  };
  const bars = normalizeCandles(raw);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].close, 102);
  assert.equal(nyParts(bars[0].time * 1000).date, "2026-09-29");
  assert.equal(mergeCandles(bars, [{ ...bars[0], volume: 14 }])[0].volume, 14);
  const utc = normalizeCandles(
    {
      values: [
        {
          datetime: "2026-09-29 13:30:00",
          open: 100,
          high: 102,
          low: 99,
          close: 101,
        },
      ],
    },
    "1m",
    "UTC",
  );
  assert.equal(utc[0].time, nyEpoch("2026-09-29", 570));
  const late = normalizeCandles(
    {
      values: [
        {
          datetime: "2026-09-30 00:00:00",
          open: 100,
          high: 102,
          low: 99,
          close: 101,
        },
      ],
    },
    "1m",
    "UTC",
  );
  assert.equal(late[0].date, "2026-09-29");
  assert.equal(
    closedCandles(bars, "1D", nyEpoch("2026-09-29", 700) * 1000).length,
    0,
  );
});
test("4H is anchored at 09:30 and last normal-session bucket is only 150 minutes", () => {
  const bars = Array.from({ length: 13 }, (_, i) => ({
    time: nyEpoch("2026-09-29", 570 + i * 30),
    date: "2026-09-29",
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 100,
  }));
  const result = aggregate4H(bars);
  assert.equal(result.length, 2);
  assert.equal(result[0].volume, 800);
  assert.equal(result[1].volume, 500);
  assert.equal(result[1].time, nyEpoch("2026-09-29", 810));
  assert.equal(aggregate4H(bars.filter((c, i) => i !== 3)).length, 1);
  assert.equal(
    aggregate4H(bars.slice(0, 2), nyEpoch("2026-09-29", 605) * 1000).length,
    1,
  );
});
test("hourly 4H aggregation preserves OHLCV, short sessions and source gaps", () => {
  const make = (date, minute, i) => ({ time: nyEpoch(date, minute), date,
    open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 100 });
  const half = Array.from({ length: 13 }, (_, i) => make("2026-09-29", 570 + i * 30, i));
  const hour = Array.from({ length: 7 }, (_, i) => {
    const pair = half.slice(i * 2, i * 2 + 2);
    return { ...pair[0], high: Math.max(...pair.map(c => c.high)),
      low: Math.min(...pair.map(c => c.low)), close: pair.at(-1).close,
      volume: pair.reduce((sum, c) => sum + c.volume, 0) };
  });
  const now = nyEpoch("2026-09-30", 1000) * 1000;
  const values = rows => rows.map(({ components, ...bar }) => bar);
  assert.deepEqual(values(aggregate4H(hour, now, 60)), values(aggregate4H(half, now)));
  assert.equal(aggregate4H(hour.filter((_, i) => i !== 2), now, 60).length, 1);
  const early = Array.from({ length: 4 }, (_, i) => make("2026-11-27", 570 + i * 60, i));
  assert.equal(aggregate4H(early, nyEpoch("2026-11-27", 900) * 1000, 60)[0].volume, 400);
  assert.equal(aggregate4H(early.slice(0, 3), nyEpoch("2026-11-27", 900) * 1000, 60).length, 0);
  assert.equal(aggregate4H(hour.slice(0, 2), nyEpoch("2026-09-29", 640) * 1000, 60).length, 1);
  assert.throws(() => aggregate4H(hour, now, 15), /30m or 1H/);
});
test("relative strength requires common dates rather than comparing mismatched periods", () => {
  const stock = [
    { date: "a", close: 100 },
    { date: "b", close: 110 },
    { date: "c", close: 120 },
  ];
  const benchmark = [
    { date: "a", close: 100 },
    { date: "c", close: 105 },
  ];
  assert.ok(Math.abs(relativeStrength(stock, benchmark, 1) - 15) < 1e-9);
  assert.equal(relativeStrength(stock, benchmark, 2), null);
  assert.equal(
    relativeStrength(
      [
        { date: "a", time: 1, close: 100 },
        { date: "a", time: 2, close: 110 },
      ],
      [
        { date: "a", time: 1, close: 100 },
        { date: "a", time: 2, close: 105 },
      ],
      1,
    ).toFixed(2),
    "5.00",
  );
});
test("pool analysis reuses the closed benchmark without including future daily candles", () => {
  const dates = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10))
    .filter(date => tradingDay(date).open);
  const bars = dates.map((date, i) => ({ date, time: nyEpoch(date), open: 100 + i,
    high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 }));
  const benchmark = bars.map((bar, i) => ({ ...bar, open: 200 + i, high: 202 + i, low: 199 + i, close: 201 + i }));
  const now = nyEpoch("2026-10-01", 600) * 1000;
  const future = { ...bars.at(-1), date: "2026-10-01", time: nyEpoch("2026-10-01"), close: 999999, high: 999999 };
  const histories = { AAPL: [...bars, future], MSFT: bars.slice(0, -2) };
  const items = [{ symbol: "AAPL", type: "stock" }, { symbol: "MSFT", type: "stock" }];
  const sourceBenchmark = [...benchmark, future];
  const result = analyzeStockPool(items, histories, sourceBenchmark, "1D", now);
  assert.deepEqual(result, items.map(item => analyzeStock(item, histories[item.symbol], sourceBenchmark, "1D", now)));
  assert.equal(result[0].price, bars.at(-1).close);
  const end = bars.at(-1), start = bars.at(-21), spyEnd = benchmark.at(-1), spyStart = benchmark.at(-21);
  assert.equal(result[0].rs, (end.close / start.close - spyEnd.close / spyStart.close) * 100);
  assert.equal(result[1].marketTime, bars.at(-3).time);
  assert.equal(analyzeStock(items[0], [], undefined, "1D", now), null);
});
test("T1 rewards a nearby untriggered pattern, results cannot be filled to 30 artificially", () => {
  const base = {
    symbol: "X",
    type: "stock",
    liquidity: 20000000,
    patterns: {
      long: [{ id: "W", label: "W 底", forming: true, distance: 2 }],
    },
    rvol: 1,
    rs: 4,
  };
  const rows = tierResults([
    base,
    {
      ...base,
      symbol: "Y",
      patterns: {
        long: [{ id: "W", label: "W 底", forming: false, distance: 1 }],
      },
    },
  ]);
  assert.deepEqual(
    rows.map((r) => r.tier),
    ["T1", "T3"],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(resamplePath([1, 1], 3), [0.5, 0.5, 0.5]);
});
