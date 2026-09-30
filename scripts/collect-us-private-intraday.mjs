// Evaluate the documented hosted API privately; never publish fetched data.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { normalizeCandles } from "../src/markets/us/model.js";
import { analyzeStockPool } from "../src/markets/us/analysis.js";
import { nyParts, tradingDay, sessionAt } from "../src/markets/us/calendar.js";
import { aggregate4H } from "../src/markets/us/aggregate.js";
import { confirmedChart } from "./lib/finance-query-validation.mjs";

if (!process.argv.includes("--private-validation")) throw Error("Private validation flag required.");
const output = resolve(process.env.US_PRIVATE_OUTPUT || "/tmp/ox-us-private-intraday");
const root = resolve(import.meta.dirname, "..");
if (!relative(root, output).startsWith("..")) throw Error("Private data must remain outside the repository.");
await mkdir(output, { recursive: true });
const directory = JSON.parse(await readFile(new URL("../data/us-directory.json", import.meta.url)));
const arg = flag => { const index = process.argv.indexOf(flag); return index < 0 ? null : process.argv[index + 1]; };
const seeds = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSM", "AMD", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "MU", "JPM", "XOM", "XLK", "XLF", "XLE", "XLV"];
const target = Number(arg("--target") || seeds.length);
if (!Number.isInteger(target) || target < 1 || target > 500) throw Error("Target must be 1–500.");
const frames = [...new Set((arg("--frames") || "1D,1m").split(","))];
const specifications = { "1D": ["1d", "5y"], "1m": ["1m", "5d"], "5m": ["5m", "1mo"],
  "15m": ["15m", "1mo"], "30m": ["30m", "1mo"], "1H": ["1h", "2y"], "4H": ["1h", "2y"] };
if (frames.some(frame => !specifications[frame]) || !frames.includes("1D")) throw Error("Supported frames: 1D,1m,5m,15m,30m,1H,4H; daily benchmark required.");
const symbols = [...new Set([...seeds, ...directory.items.filter(item => !item.complex && item.type === "stock").map(item => item.symbol)])].slice(0, target);
const histories = {}, intraday = {}, quotes = [], failures = [], evidence = [];
const frameHistories = Object.fromEntries(frames.map(frame => [frame, {}]));
const startedAt = Date.now();
let requests = 0, cacheHits = 0;
const batchSize = Number(arg("--batch-size") || 1);
const offline = process.argv.includes("--offline");
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) throw Error("Batch size must be 1–10.");
const prefetchedFailures = new Map();
if (batchSize > 1 && !offline) {
  // Use the documented batch endpoint, with small serial batches. A 429 stops
  // the collector; batching never changes identities or retries a quota error.
  const sourceFrames = [...new Map(frames.map(frame => [specifications[frame][0], specifications[frame]])).values()];
  for (const [interval, range] of sourceFrames) {
    const missing = [];
    for (const symbol of symbols) {
      try { await stat(resolve(output, `${symbol}-${interval}.json`)); }
      catch { missing.push(symbol); }
    }
    for (let offset = 0; offset < missing.length; offset += batchSize) {
      const batch = missing.slice(offset, offset + batchSize), url = new URL("https://finance-query.com/v2/charts");
      for (const [key, value] of Object.entries({ symbols: batch.join(","), interval, range })) url.searchParams.set(key, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      requests++;
      if ([402, 429].includes(response.status)) throw Error(`Source quota reached (${response.status}); collector stopped.`);
      if (!response.ok) throw Error(`Batch source failure ${response.status}; cached progress preserved.`);
      const body = await response.json(), received = new Set();
      await writeFile(resolve(output, "last-batch-response.json"), JSON.stringify(body));
      if ((body.errors || []).some(error => /429|rate.?limit|quota|too many requests/i.test(error.message || "")))
        throw Error("Upstream batch quota error; collector stopped with cached progress preserved.");
      if (!Array.isArray(body.charts)) throw Error("Unexpected batch chart schema.");
      for (const entry of body.charts) {
        if (!batch.includes(entry.symbol))
          throw Error("Unexpected batch source identity or candle schema.");
        const chart = confirmedChart(entry.chart, entry.symbol, interval);
        received.add(chart.symbol);
        await writeFile(resolve(output, `${chart.symbol}-${interval}.json`), JSON.stringify(chart));
      }
      for (const symbol of batch.filter(symbol => !received.has(symbol))) {
        const error = body.errors?.find(error => error.symbol === symbol);
        prefetchedFailures.set(`${symbol}:${interval}`, error?.message || "Source returned no chart");
      }
      console.log(JSON.stringify({ phase: "batch", interval, processed: Math.min(offset + batchSize, missing.length), missing: missing.length, requests, sourceErrors: prefetchedFailures.size,
        errors: body.errors?.map(error => ({ symbol: error.symbol, message: error.message })) || [] }));
      await pause(2000);
    }
  }
}
for (const symbol of symbols) {
  for (const frame of frames) {
    const [interval, range] = specifications[frame];
    if (prefetchedFailures.has(`${symbol}:${interval}`)) {
      failures.push({ symbol, interval: frame, reason: prefetchedFailures.get(`${symbol}:${interval}`) }); continue;
    }
    const destination = frame === "1D" ? histories : frame === "1m" ? intraday : frameHistories[frame];
    const file = resolve(output, `${symbol}-${interval}.json`);
    let body;
    try { body = JSON.parse(await readFile(file)); cacheHits++; }
    catch {
      if (offline) { failures.push({ symbol, interval: frame, reason: "NO_CACHED_SOURCE_DATA" }); continue; }
      const url = new URL(`https://finance-query.com/v2/chart/${encodeURIComponent(symbol)}`);
      url.searchParams.set("interval", interval);
      if (range) url.searchParams.set("range", range);
      else { url.searchParams.set("start", Math.floor(Date.now() / 1000) - 59 * 86400); url.searchParams.set("end", Math.floor(Date.now() / 1000)); }
      await pause(1000);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      requests++;
      if ([402, 429].includes(response.status)) throw Error(`Source quota reached (${response.status}); collector stopped.`);
      if (!response.ok) { failures.push({ symbol, interval, status: response.status }); continue; }
      body = await response.json();
      await writeFile(file, JSON.stringify(body));
    }
    body = confirmedChart(body, symbol, interval);
    let bars = normalizeCandles((body.candles || []).map(row => ({ ...row, time: row.timestamp })), frame === "4H" ? "1H" : frame)
      .filter(bar => {
        if (frame === "1D") return true;
        const parts = nyParts(bar.time * 1000), day = tradingDay(parts.date);
        // Yahoo includes a terminal market-close quote as a zero-volume row.
        // It is outside the regular candle opening-time range.
        return day.known && day.open && parts.minute >= 570 && parts.minute < day.closeMinute;
      });
    if (frame === "4H") bars = aggregate4H(bars, Date.now(), 60);
    if (bars.length < 60) { failures.push({ symbol, interval: frame, bars: bars.length }); continue; }
    destination[symbol] = bars;
    frameHistories[frame][symbol] = bars;
    const receivedAt = (await stat(file)).mtimeMs;
    evidence.push({ symbol, interval: frame, receivedAt, receivedBars: body.candles.length, acceptedBars: bars.length,
      first: bars[0].time, last: bars.at(-1).time, exchangeTimezone: body.meta?.exchangeTimezoneName });
    if (frame === frames.at(-1)) {
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
  console.log(JSON.stringify({ symbol, progress: symbols.indexOf(symbol) + 1, target,
    bars: Object.fromEntries(frames.map(frame => [frame, frameHistories[frame][symbol]?.length || 0])), requests, failures: failures.length }));
}
const evaluationTime = Date.now();
const analyses = frames.filter(frame => ["1D", "1H", "4H"].includes(frame)).flatMap(frame => {
  const rows = analyzeStockPool(directory.items, frameHistories[frame], frameHistories[frame].SPY, frame, evaluationTime);
  const latestBenchmarkDate = rows.find(row => row.symbol === "SPY")?.asOf;
  return rows.filter(row => {
    if (row.asOf === latestBenchmarkDate) return true;
    failures.push({ symbol: row.symbol, interval: frame, reason: "SOURCE_STALE", asOf: row.asOf, expected: latestBenchmarkDate });
    return false;
  });
});
const snapshot = { schemaVersion: 2, source: "finance-query-private", privateValidation: true,
  asOf: new Date().toISOString(), analysisIntervals: frames.filter(frame => ["1D", "1H", "4H"].includes(frame)), adjustment: "資料源 OHLC；還原權息方式待確認",
  quotes, analyses, failures, counts: { searchable: directory.items.length, quoted: quotes.length, scanned: new Set(analyses.map(row => row.symbol)).size } };
const collection = { requested: target, requests, cacheHits, batchSize, offline, elapsedMs: Date.now() - startedAt, frames,
  successfulByFrame: Object.fromEntries(frames.map(frame => [frame, Object.keys(frameHistories[frame]).length])),
  analyzedByFrame: Object.fromEntries(snapshot.analysisIntervals.map(frame => [frame, analyses.filter(row => row.interval === frame).length])) };
await writeFile(resolve(output, "evaluation.json"), JSON.stringify({ snapshot, histories, intraday, frameHistories, evidence, collection }));
console.log(JSON.stringify({ privateValidation: true, collection, failures }));
