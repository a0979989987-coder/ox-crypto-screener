import test from "node:test";
import assert from "node:assert/strict";
import { twModule } from "../src/markets/tw/index.js";
import { twProvider } from "../src/markets/tw/api.js";
import { normalizeTWStockCard, rowsForTWMode, renderTWStockCard, renderTWCandles, renderTWCurrentCandle } from "../src/markets/tw/radar-card.js";

test("TW module uses the configured official-data backend", () => {
  assert.equal(twModule.id, "tw");
  assert.equal(twModule.status, "connected");
  assert.equal(twProvider.available, true);
  assert.match(twProvider.apiBase, /^https:\/\//);
  assert.equal(twModule.refresh().data, null);
});

test("TW disposition lists require explicit provider membership and never infer risk", () => {
  const ordinary = normalizeTWStockCard({ symbol: "2330", name: "台積電", price: 120, changePct: 8, turnoverTwd: 1e10 });
  const state = { data: { radarModes: { disposal: [{ ...ordinary, disposition: { status: "active", startDate: "2026-09-21", endDate: "2026-09-29", batchMinutes: 5 } }] } } };
  assert.deepEqual(rowsForTWMode(state, "risk", [ordinary]), []);
  assert.equal(rowsForTWMode(state, "disposal", [ordinary])[0].disposition.batchMinutes, 5);
  assert.match(renderTWStockCard(ordinary, new Set()), /週轉率<\/span><b>—<\/b>/);
  assert.doesNotMatch(renderTWStockCard(ordinary, new Set()), /進入處置/);
});

test("TW price icon shows only the last supplied session and does not invent a candle", () => {
  const points = [{ open: 10, high: 12, low: 9, close: 11 }, { open: 11, high: 12, low: 8, close: 9 }];
  const icon = renderTWCurrentCandle(points);
  assert.equal((icon.match(/<rect/g) || []).length, 1);
  assert.match(icon, /#48b78e/);
  assert.equal(renderTWCurrentCandle([...points, { open: null }]), "");
});

test("TW cards retain all reference information without treating unknown as safe", () => {
  const source = { symbol: "2330", name: "台積電", change: 3.5, changePct: 1.97, disposition: { status: "active", startDate: "2026-09-21", endDate: "2026-09-29", repeatRiskDays: 2, batchMinutes: 5, riskProgress: 75, margin: true } };
  const card = renderTWStockCard(source, new Set());
  for (const content of ["▲3.5", "(1.97%)", "最快 2 日後再次處置", "5分盤", "成交值", "週轉率", "處置期間 09/21 - 09/29", 'aria-valuenow="75"']) assert.ok(card.includes(content));
  const unknown = renderTWStockCard({ symbol: "2330" }, new Set());
  assert.doesNotMatch(unknown, /近期無再次處置風險|aria-valuenow/);
  assert.match(unknown, /券：資料待更新/);
  assert.doesNotMatch(unknown, /tw-stock-risk-track|分盤 —|OX T1/);
  const quiet = renderTWStockCard({ symbol: "2330", tier: "T1", disposition: { noRepeatRisk: true, batchMinutes: 2, riskProgress: 80 } }, new Set());
  assert.match(quiet, /近期無再次處置風險|2分盤/);
  assert.doesNotMatch(quiet, /tw-stock-risk-track|OX T1/);
  const watched = renderTWStockCard({ symbol: "2330" }, new Set(["2330"]));
  assert.match(watched, /tw-stock-watch active/);
});

test("TW candles render OHLC bodies and wicks only from valid provider points", () => {
  const svg = renderTWCandles([{ open: 10, high: 12, low: 9, close: 11 }, { open: 11, high: 12, low: 8, close: 9 }]);
  assert.match(svg, /#f16a70/);
  assert.match(svg, /#48b78e/);
  assert.equal((svg.match(/<path/g) || []).length, 2);
  assert.equal(renderTWCandles([{ open: 1, high: null, low: 1, close: 2 }]), "");
});
