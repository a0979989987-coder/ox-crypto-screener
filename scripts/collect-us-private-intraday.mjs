// Evaluate the documented hosted API privately; never publish fetched data.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { normalizeCandles } from "../src/markets/us/model.js";
import { analyzeStock } from "../src/markets/us/analysis.js";
import { nyParts, tradingDay, sessionAt } from "../src/markets/us/calendar.js";

if (!process.argv.includes("--private-validation")) throw Error("Private validation flag required.");
const output = resolve(process.env.US_PRIVATE_OUTPUT || "/tmp/ox-us-private-intraday");
const root = resolve(import.meta.dirname, "..");
if (!relative(root, output).startsWith("..")) throw Error("Private data must remain outside the repository.");
await mkdir(output, { recursive: true });
const directory = JSON.parse(await readFile(new URL("../data/us-directory.json", import.meta.url)));
const symbols = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSM", "AMD", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "MU", "JPM", "XOM", "XLK", "XLF", "XLE", "XLV"];
const histories = {}, intraday = {}, quotes = [], failures = [], evidence = [];
for (const symbol of symbols) {
  for (const [interval, range, frame, target] of [["1d", "5y", "1D", histories], ["1m", "5d", "1m", intraday]]) {
    const file = resolve(output, `${symbol}-${interval}.json`);
    let body;
    try { body = JSON.parse(await readFile(file)); }
    catch {
      const url = `https://finance-query.com/v2/chart/${symbol}?interval=${interval}&range=${range}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if ([402, 429].includes(response.status)) throw Error(`Source quota reached (${response.status}); collector stopped.`);
      if (!response.ok) { failures.push({ symbol, interval, status: response.status }); continue; }
      body = await response.json();
      await writeFile(file, JSON.stringify(body));
      await pause(1000);
    }
    if (body.symbol !== symbol || body.interval !== interval) throw Error(`Unexpected source identity for ${symbol}/${interval}`);
    const bars = normalizeCandles((body.candles || []).map(row => ({ ...row, time: row.timestamp })), frame)
      .filter(bar => {
        if (frame === "1D") return true;
        const parts = nyParts(bar.time * 1000), day = tradingDay(parts.date);
        // Yahoo includes a terminal market-close quote as a zero-volume row.
        // It is outside the regular candle opening-time range.
        return day.known && day.open && parts.minute >= 570 && parts.minute < day.closeMinute;
      });
    if (bars.length < 60) { failures.push({ symbol, interval, bars: bars.length }); continue; }
    target[symbol] = bars;
    const receivedAt = (await stat(file)).mtimeMs;
    evidence.push({ symbol, interval, receivedAt, receivedBars: body.candles.length, acceptedBars: bars.length,
      first: bars[0].time, last: bars.at(-1).time, exchangeTimezone: body.meta?.exchangeTimezoneName });
    if (frame === "1m") {
      const meta = body.meta || {}, last = bars.at(-1), previous = meta.previousClose;
      quotes.push({ symbol, price: meta.regularMarketPrice ?? last.close,
        change: previous ? (meta.regularMarketPrice ?? last.close) - previous : null,
        changePct: previous ? ((meta.regularMarketPrice ?? last.close) / previous - 1) * 100 : null,
        volume: meta.regularMarketVolume, previousClose: previous,
        marketTime: meta.regularMarketTime * 1000, receivedAt, marketOpen: sessionAt().session === "regular",
        source: "finance-query-private", feed: "Finance Query / Yahoo · 私人驗證", delaySeconds: null,
        volumeScope: "資料源回傳成交量；交易所涵蓋與延遲尚未確認" });
    }
  }
  console.log(JSON.stringify({ symbol, daily: histories[symbol]?.length, minute: intraday[symbol]?.length }));
}
const analyses = Object.entries(histories).map(([symbol, bars]) => analyzeStock(
  directory.items.find(item => item.symbol === symbol), bars, histories.SPY,
)).filter(Boolean);
const snapshot = { schemaVersion: 2, source: "finance-query-private", privateValidation: true,
  asOf: new Date().toISOString(), analysisIntervals: ["1D"], adjustment: "資料源 OHLC；還原權息方式待確認",
  quotes, analyses, failures, counts: { searchable: directory.items.length, quoted: quotes.length, scanned: analyses.length } };
await writeFile(resolve(output, "evaluation.json"), JSON.stringify({ snapshot, histories, intraday, evidence }));
console.log(JSON.stringify({ privateValidation: true, symbols: analyses.length, minuteSymbols: Object.keys(intraday).length, failures }));
