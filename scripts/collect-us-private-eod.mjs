// Private, local evaluation only. This collector is not a public data provider.
// FinMind's API access does not grant public redistribution rights.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { normalizeCandles } from "../src/markets/us/model.js";
import { analyzeStock } from "../src/markets/us/analysis.js";
import { candleEnd } from "../src/markets/us/calendar.js";

if (!process.argv.includes("--private-validation"))
  throw Error("Only --private-validation is supported. No production publication.");
const flag = process.argv.indexOf("--output");
const output = resolve(flag >= 0 ? process.argv[flag + 1] : "/tmp/ox-us-private-eod");
const root = resolve(import.meta.dirname, "..");
const path = relative(root, output);
if (!path.startsWith("..")) throw Error("Private data must stay outside the repository.");
await mkdir(output, { recursive: true });
const directory = JSON.parse(await readFile(new URL("../data/us-directory.json", import.meta.url)));
const symbols = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSM", "AMD", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "MU", "JPM", "XOM", "XLK", "XLF", "XLE", "XLV"];
const histories = {}, quotes = [], failures = [];
for (const symbol of symbols) {
  const url = new URL("https://api.finmindtrade.com/api/v4/data");
  for (const [key, value] of Object.entries({ dataset: "USStockPrice", data_id: symbol, start_date: "2024-01-01" }))
    url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  if (response.status === 429 || body.status === 402) throw Error("Source quota reached; no limit bypass.");
  if (!response.ok || body.status !== 200) { failures.push({ symbol, status: body.status }); continue; }
  const bars = normalizeCandles((body.data || []).map(row => ({
    datetime: row.date, open: row.Open, high: row.High, low: row.Low, close: row.Close, volume: row.Volume,
  })), "1D");
  if (bars.length < 60) { failures.push({ symbol, bars: bars.length }); continue; }
  histories[symbol] = bars;
  const last = bars.at(-1), previous = bars.at(-2);
  quotes.push({ symbol, price: last.close, change: last.close - previous.close,
    changePct: (last.close / previous.close - 1) * 100, volume: last.volume,
    open: last.open, high: last.high, low: last.low, previousClose: previous.close,
    marketTime: candleEnd(last, "1D"), receivedAt: Date.now(), marketOpen: false,
    source: "finmind-private-eod", feed: "每日收盤資料 · 私人驗證", delaySeconds: 86400,
    volumeScope: "FinMind USStockPrice 日線成交量；非盤中 feed" });
}
const analyses = Object.entries(histories).map(([symbol, bars]) => analyzeStock(
  directory.items.find(item => item.symbol === symbol), bars, histories.SPY,
)).filter(Boolean);
const snapshot = { schemaVersion: 2, source: "finmind-private-eod", privateValidation: true,
  asOf: new Date().toISOString(), analysisIntervals: ["1D"], adjustment: "資料源原始 OHLC",
  quotes, analyses, failures, counts: { searchable: directory.items.length, quoted: quotes.length, scanned: analyses.length } };
await writeFile(resolve(output, "evaluation.json"), JSON.stringify({ snapshot, histories }));
console.log(JSON.stringify({ privateValidation: true, output, symbols: analyses.length,
  minimumBars: Math.min(...Object.values(histories).map(bars => bars.length)), failures }));
