/** Shared collector: only this process scans the pool; visitors read its snapshot.
 * No provider key is ever placed in output. Complete data replaces prior valid data.
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  normalizeDirectory,
  normalizeQuote,
  normalizeCandles,
} from "../src/markets/us/model.js";
import { analyzeStock } from "../src/markets/us/analysis.js";
import { aggregate4H } from "../src/markets/us/aggregate.js";
import { nyParts } from "../src/markets/us/calendar.js";
if (process.env.US_DATA_PROVIDER !== "twelve-data")
  throw Error("免費嵌入圖表不提供掃描 API；舊行情收集器已停用，避免消耗額度。");
const root = new URL("../", import.meta.url),
  arg = (name) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : null;
  };
const backend = arg("--backend");
const key = process.env.TWELVE_DATA_API_KEY;
const budget = Number(arg("--budget") || process.env.US_COLLECT_CREDIT_BUDGET);
const rpm = Number(
  arg("--credits-per-minute") || process.env.US_API_CREDITS_PER_MINUTE,
);
if (
  !Number.isInteger(budget) ||
  budget < 1 ||
  !Number.isInteger(rpm) ||
  rpm < 1
)
  throw Error("必須明確設定 credit budget 與每分鐘上限；不猜測帳號方案。");
if (!backend && !key) throw Error("缺少後端環境變數 TWELVE_DATA_API_KEY。");
if (
  process.env.US_EXTERNAL_DISPLAY_CONFIRMED !== "true" &&
  !process.argv.includes("--private-validation")
)
  throw Error(
    "需先確認 US_EXTERNAL_DISPLAY_CONFIRMED=true；未授權資料不可發布。",
  );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let used = 0,
  windowUsed = 0,
  windowStart = Date.now();
async function request(endpoint, params = {}, weight = 1) {
  if (used + weight > budget) throw Error("CREDIT_BUDGET");
  if (windowUsed + weight > rpm) {
    await wait(Math.max(0, windowStart + 62000 - Date.now()));
    windowStart = Date.now();
    windowUsed = 0;
  }
  used += weight;
  windowUsed += weight;
  const url = new URL(
    backend
      ? `${backend.replace(/\/$/, "")}/${endpoint === "quote" ? "quotes" : endpoint === "time_series" ? "candles" : endpoint}`
      : `https://api.twelvedata.com/${endpoint}`,
  );
  const mapped =
    backend && endpoint === "time_series"
      ? {
          symbol: params.symbol,
          interval: params.interval,
          limit: params.outputsize,
        }
      : backend && endpoint === "quote"
        ? { symbols: params.symbol }
        : params;
  for (const [k, v] of Object.entries(mapped)) url.searchParams.set(k, v);
  const c = new AbortController(),
    timer = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: backend ? {} : { Authorization: `apikey ${key}` },
    });
    const j = await r.json();
    if (!r.ok || j.ok === false || j.status === "error") {
      const error = Error("供應商請求失敗");
      error.status = j.code || r.status;
      throw error;
    }
    return j.data ?? j;
  } finally {
    clearTimeout(timer);
  }
}
const load = async (name) => {
  try {
    return JSON.parse(await readFile(new URL(name, root), "utf8"));
  } catch {
    return null;
  }
};
let directory = await load("data/us-directory.json");
if (!backend) {
  const [s, t] = await Promise.all([
    request("stocks", { country: "United States" }, 0),
    request("etf", { country: "United States" }, 0),
  ]);
  directory = {
    schemaVersion: 2,
    source: "twelve-data",
    receivedAt: new Date().toISOString(),
    items: normalizeDirectory(s.data, t.data),
  };
  if (!directory.items.length)
    throw Error("官方股票目錄未回傳有效標的，保留前次目錄。");
  await writeFile(
    new URL("data/us-directory.json", root),
    JSON.stringify(directory),
  );
}
const previous = await load("data/us-snapshot.json");
const seeds = [
  "SPY",
  "QQQ",
  "IWM",
  "AAPL",
  "NVDA",
  "TSM",
  "JPM",
  "XOM",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLY",
  "XLP",
  "XLI",
  "XLB",
  "XLU",
  "XLRE",
  "XLC",
  "MSFT",
  "AMD",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "MU",
  "INTC",
  "BAC",
  "WMT",
  "KO",
  "UNH",
  "CAT",
  "GE",
  "BA",
  "DIS",
  "PLTR",
  "UBER",
  "COIN",
  "HOOD",
  "SOXX",
];
const explicit = (arg("--symbols") || process.env.US_SCAN_SYMBOLS || "")
  .split(",")
  .filter(Boolean);
const target = Number(arg("--target") || process.env.US_SCAN_TARGET || 350);
if (!Number.isInteger(target) || target < 1 || target > 500)
  throw new Error("掃描目標必須是 1～500 的整數");
const analysisIntervals = [
  ...new Set(
    (arg("--intervals") || process.env.US_SCAN_INTERVALS || "1D").split(","),
  ),
];
if (analysisIntervals.some((x) => !["1D", "1H", "4H"].includes(x)))
  throw Error("掃描級別只支援 1D／1H／4H。");
if (!analysisIntervals.includes("1D")) analysisIntervals.unshift("1D");
// Keep liquid candidates, then rotate through the full directory for discovery.
const lastLiquid = [...(previous?.analyses || [])]
  .filter((x) => !x.complex && x.liquidity >= 10000000)
  .sort((a, b) => b.liquidity - a.liquidity)
  .map((x) => x.symbol);
const eligible = directory.items.filter((x) => !x.complex);
const offset = (previous?.discoveryOffset || 0) % eligible.length;
const discovered = [
  ...eligible.slice(offset),
  ...eligible.slice(0, offset),
].map((x) => x.symbol);
const pool = [
  ...new Set(
    explicit.length
      ? ["SPY", ...explicit]
      : ["SPY", ...lastLiquid, ...seeds, ...discovered],
  ),
]
  .filter((s) => directory.items.some((x) => x.symbol === s))
  .slice(0, target);
const quotes = new Map((previous?.quotes || []).map((q) => [q.symbol, q]));
const bars = new Map();
const failures = [];
const cap = {
  feed: process.env.US_FEED_NAME || "未確認 feed",
  delaySeconds:
    process.env.US_DATA_DELAY_SECONDS === undefined
      ? null
      : Number(process.env.US_DATA_DELAY_SECONDS),
};
let fetched = 0;
for (let i = 0; i < pool.length; i += Math.min(rpm, 20)) {
  const batch = pool.slice(i, i + Math.min(rpm, 20));
  if (used + batch.length > budget) break;
  try {
    const raw = await request(
      "quote",
      { symbol: batch.join(",") },
      batch.length,
    );
    for (const s of batch) {
      const q = normalizeQuote(
        raw.symbol === s ? raw : raw[s],
        Date.now(),
        cap,
      );
      if (q) {
        quotes.set(s, q);
        fetched++;
      } else failures.push({ symbol: s, reason: "無有效報價" });
    }
  } catch (error) {
    failures.push({ symbols: batch, reason: `報價失敗 ${error.status || ""}` });
    if (error.status === 429 || error.status === 403) break;
  }
}
// SPY is loaded first to ensure comparable benchmark dates.
for (const symbol of pool) {
  if (used >= budget) break;
  if (!quotes.has(symbol)) continue;
  try {
    const raw = await request("time_series", {
      symbol,
      interval: "1day",
      outputsize: 400,
      timezone: "America/New_York",
      adjust: "splits",
    });
    const data = normalizeCandles(raw, "1D");
    if (data.length >= 60) bars.set(symbol, data);
    else failures.push({ symbol, reason: `有效歷史不足 ${data.length} 根` });
  } catch (error) {
    failures.push({ symbol, reason: `K線失敗 ${error.status || ""}` });
    if (error.status === 429 || error.status === 403) break;
  }
  console.log(`US collect: ${bars.size} histories · ${used}/${budget} credits`);
}
const benchmark = bars.get("SPY") || [],
  items = pool
    .map((symbol) => {
      const item = directory.items.find((x) => x.symbol === symbol),
        data = bars.get(symbol);
      return data ? analyzeStock(item, data, benchmark) : null;
    })
    .filter(Boolean);
const minLiquidity =
  Number(arg("--min-liquidity") || process.env.US_SCAN_MIN_DOLLAR_VOLUME) ||
  10000000;
const analyses = items.filter(
  (x) => x.liquidity !== null && x.liquidity >= minLiquidity,
);
// Optional extra levels have an explicit additional per-symbol credit cost.
// Daily dollar liquidity remains the inclusion criterion across all levels.
const intervalHistories = new Map();
for (const interval of analysisIntervals.filter((x) => x !== "1D")) {
  const histories = new Map();
  for (const symbol of pool.filter((s) =>
    analyses.some((x) => x.symbol === s),
  )) {
    if (used >= budget) break;
    try {
      const raw = await request("time_series", {
        symbol,
        interval: interval === "4H" ? "30min" : "1h",
        outputsize: interval === "4H" ? 3200 : 400,
        timezone: "America/New_York",
        adjust: "splits",
      });
      let data = normalizeCandles(raw, interval === "4H" ? "30m" : "1H");
      if (interval === "4H") data = aggregate4H(data);
      if (data.length >= 60) histories.set(symbol, data);
      else failures.push({ symbol, interval, reason: "已收線歷史不足" });
    } catch (error) {
      failures.push({
        symbol,
        interval,
        reason: `K線失敗 ${error.status || ""}`,
      });
      if (error.status === 429 || error.status === 403) break;
    }
  }
  intervalHistories.set(interval, histories);
}
const additionalAnalyses = [];
for (const [interval, histories] of intervalHistories) {
  const reference = histories.get("SPY") || [];
  for (const [symbol, data] of histories) {
    const daily = analyses.find((x) => x.symbol === symbol);
    const item = directory.items.find((x) => x.symbol === symbol);
    const result = analyzeStock(item, data, reference, interval);
    if (result)
      additionalAnalyses.push({ ...result, liquidity: daily.liquidity });
  }
}
const allAnalyses = [...analyses, ...additionalAnalyses];
const next = {
  schemaVersion: 2,
  source: "twelve-data",
  asOf: new Date().toISOString(),
  analysisIntervals: [...new Set(allAnalyses.map((x) => x.interval))],
  adjustment: backend ? "資料商預設（舊後端未確認）" : "splits",
  counts: {
    searchable: directory.items.length,
    quoted: fetched,
    scanned: new Set(allAnalyses.map((x) => x.symbol)).size,
    analysisSeries: allAnalyses.length,
    historyValidated: items.length,
    candidates: pool.length,
  },
  quotes: [...quotes.values()].filter(
    (q) => pool.includes(q.symbol) && Date.now() - q.receivedAt < 3600000,
  ),
  analyses: allAnalyses,
  failures,
  discoveryOffset: (offset + target) % eligible.length,
  collection: {
    creditsUsed: used,
    budget,
    rpm,
    minLiquidity,
    calendarDate: nyParts().date,
    privateValidation: process.argv.includes("--private-validation"),
  },
};
// A failed run must not overwrite a previous valid snapshot.
if (!analyses.length) throw Error("本次沒有有效分析，保留既有快照。");
const filename = arg("--output") || "data/us-snapshot.json";
await writeFile(new URL(filename, root), JSON.stringify(next));
console.log(JSON.stringify({ file: filename, ...next.counts, credits: used }));
