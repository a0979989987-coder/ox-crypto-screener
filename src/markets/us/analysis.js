import { closedCandles, relativeStrength } from "./model.js?v=20260930-us-data4";
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export function pivots(bars, radius = 3) {
  const p = [];
  for (let i = radius; i < bars.length - radius; i++) {
    const c = bars[i],
      w = bars.slice(i - radius, i + radius + 1);
    if (w.every((x) => c.low <= x.low) && w.some((x) => c.low < x.low))
      p.push({ i, value: c.low, kind: "low", time: c.time });
    if (w.every((x) => c.high >= x.high) && w.some((x) => c.high > x.high))
      p.push({ i, value: c.high, kind: "high", time: c.time });
  }
  return p;
}
export function detectPatterns(bars, side = "long") {
  if (bars.length < 40) return [];
  const p = pivots(bars.slice(-80)),
    window = bars.slice(-80),
    last = window.at(-1),
    tol = last.close * 0.025,
    patterns = [];
  const wanted = side === "long" ? "low" : "high";
  const swings = p.filter((x) => x.kind === wanted).slice(-3);
  if (swings.length >= 2) {
    const [a, b] = swings.slice(-2),
      between = p.filter((x) => x.i > a.i && x.i < b.i && x.kind !== wanted);
    const neck = between.sort((a, b) =>
      side === "long" ? b.value - a.value : a.value - b.value,
    )[0];
    if (
      neck &&
      b.i - a.i >= 8 &&
      Math.abs(a.value - b.value) <= tol &&
      Math.abs(neck.value - a.value) > tol
    ) {
      const crossed =
        side === "long" ? last.close > neck.value : last.close < neck.value;
      patterns.push({
        id: side === "long" ? "W" : "M",
        label: side === "long" ? "W 底" : "M 頂",
        line: [a, neck, b],
        level: neck.value,
        forming: !crossed,
        distance: (Math.abs(last.close - neck.value) / neck.value) * 100,
      });
    }
  }
  if (swings.length === 3) {
    const [a, b, c] = swings;
    const shoulder = Math.abs(a.value - c.value) <= tol,
      head =
        side === "long"
          ? b.value < Math.min(a.value, c.value) - tol
          : b.value > Math.max(a.value, c.value) + tol;
    const necks = p.filter((x) => x.kind !== wanted && x.i > a.i && x.i < c.i);
    if (shoulder && head && necks.length >= 2) {
      const level = mean(necks.map((x) => x.value));
      patterns.push({
        id: side === "long" ? "IHS" : "HS",
        label: side === "long" ? "頭肩底" : "頭肩頂",
        line: [a, ...necks, b, c].sort((a, b) => a.i - b.i),
        level,
        forming: side === "long" ? last.close <= level : last.close >= level,
        distance: (Math.abs(last.close - level) / level) * 100,
      });
    }
  }
  const highs = p.filter((x) => x.kind === "high").slice(-3),
    lows = p.filter((x) => x.kind === "low").slice(-3);
  if (
    highs.length === 3 &&
    lows.length === 3 &&
    highs[2].value < highs[0].value &&
    lows[2].value > lows[0].value &&
    highs[2].value > lows[2].value
  )
    patterns.push({
      id: "triangle",
      label: "三角收斂",
      line: [highs[0], highs[2], lows[0], lows[2]],
      level: side === "long" ? highs[2].value : lows[2].value,
      forming: true,
      distance:
        (Math.abs(
          last.close - (side === "long" ? highs[2].value : lows[2].value),
        ) /
          last.close) *
        100,
    });
  const targets = side === "long" ? highs : lows;
  if (targets.length >= 2) {
    const [a, b] = targets.slice(-2),
      slope = (b.value - a.value) / (b.i - a.i);
    const violations = window
      .slice(a.i, b.i + 1)
      .filter((c, j) =>
        side === "long"
          ? c.high > a.value + slope * j + tol * 0.4
          : c.low < a.value + slope * j - tol * 0.4,
      );
    if (violations.length === 0) {
      const level = a.value + slope * (window.length - 1 - a.i),
        flat = Math.abs(slope) * (b.i - a.i) < tol * 0.3;
      patterns.push({
        id: flat ? "horizontal" : "trend",
        label: flat ? "水平關鍵位" : "趨勢線",
        line: [a, b],
        level,
        forming: side === "long" ? last.close <= level : last.close >= level,
        distance: (Math.abs(last.close - level) / last.close) * 100,
      });
    }
  }
  return patterns;
}
export function analyzeStock(
  item,
  bars,
  benchmark,
  interval = "1D",
  now = Date.now(),
) {
  const data = closedCandles(bars, interval, now),
    last = data.at(-1);
  if (data.length < 60 || !last) return null;
  const volumes = data
      .slice(-21, -1)
      .map((x) => x.volume)
      .filter((x) => x !== null),
    avg = volumes.length === 20 ? mean(volumes) : null;
  const rvol = avg > 0 && last.volume !== null ? last.volume / avg : null;
  const ma = (p) => mean(data.slice(-p).map((x) => x.close));
  const prev = data.at(-2),
    changePct = (last.close / prev.close - 1) * 100;
  const amountBars = data.slice(-21, -1);
  const liquidity = amountBars.every((c) => c.volume !== null)
    ? mean(amountBars.map((c) => c.volume * c.close))
    : null;
  return {
    ...item,
    price: last.close,
    changePct,
    marketTime: last.time,
    asOf: last.date,
    interval,
    liquidity,
    rvol,
    rvolBasis:
      interval === "1D" ? "完整日 K／前20完整交易日" : "同級別已收線 K／前20根",
    rs: relativeStrength(data, closedCandles(benchmark, interval, now)),
    gapPct: (last.open / prev.close - 1) * 100,
    ma20: ma(20),
    ma50: ma(50),
    path: data.slice(-40).map((x) => x.close),
    patterns: {
      long: detectPatterns(data, "long"),
      short: detectPatterns(data, "short"),
    },
    bars: data.length,
  };
}
export function tierResults(
  rows,
  { side = "long", mode = "classic", type = "stock", pattern = "all" } = {},
) {
  const candidates = [];
  for (const row of rows) {
    if (
      (type === "stock" && row.type === "ETF") ||
      (type === "ETF" && row.type !== "ETF") ||
      row.complex
    )
      continue;
    let setups = row.patterns?.[side] || [];
    if (pattern !== "all") setups = setups.filter((p) => p.id === pattern);
    const best = [...setups].sort((a, b) => a.distance - b.distance)[0];
    const sign = side === "long" ? 1 : -1;
    if (
      mode === "ma" &&
      !(sign * (row.ma20 - row.ma50) > 0 && sign * (row.price - row.ma20) > 0)
    )
      continue;
    if (mode === "breakout" && !(row.rvol >= 1.5 && best && !best.forming))
      continue;
    if (mode === "gap" && sign * row.gapPct < 2) continue;
    if (mode === "rs" && sign * row.rs < 3) continue;
    if (mode === "classic" && !best) continue;
    const tier =
      best?.forming && best.distance <= 3
        ? "T1"
        : best?.forming && best.distance <= 7
          ? "T2"
          : "T3";
    candidates.push({
      ...row,
      tier,
      setup:
        best?.label ||
        {
          ma: "均線排列",
          gap: "跳空觀察",
          rs: "相對 SPY 強勢",
          breakout: "放量突破",
        }[mode] ||
        "結構觀察",
      forming: best?.forming ?? false,
      reasons: [
        ...(best
          ? [
              `${best.label} · ${best.forming ? "形成中，未確認突破" : "已收線越過關鍵位"}`,
              `距關鍵位 ${best.distance.toFixed(2)}%`,
            ]
          : []),
        ...(row.rvol !== null ? [`已收線量比 ${row.rvol.toFixed(2)}x`] : []),
        ...(row.rs !== null
          ? [
              `同日期20期相對 SPY ${row.rs >= 0 ? "+" : ""}${row.rs.toFixed(2)}%`,
            ]
          : []),
      ],
      distance: best?.distance ?? 100,
    });
  }
  return ["T1", "T2", "T3"].flatMap((t) =>
    candidates
      .filter((x) => x.tier === t)
      .sort((a, b) => a.distance - b.distance || b.liquidity - a.liquidity)
      .slice(0, 10),
  );
}
export function resamplePath(values, count = 32) {
  if (values.length < 2) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const pos = (i * (values.length - 1)) / (count - 1),
      a = Math.floor(pos),
      b = Math.min(a + 1, values.length - 1);
    out.push(values[a] + (values[b] - values[a]) * (pos - a));
  }
  const min = Math.min(...out),
    range = Math.max(...out) - min;
  return out.map((x) => (range ? (x - min) / range : 0.5));
}
export function matchPath(rows, points) {
  const target = resamplePath(points.map((p) => 1 - p.y)),
    rank = rows
      .filter((x) => x.path?.length >= 20)
      .map((row) => ({
        ...row,
        pathDistance: Math.sqrt(
          resamplePath(row.path).reduce(
            (s, x, i) => s + (x - target[i]) ** 2,
            0,
          ) / target.length,
        ),
      }));
  return rank
    .sort((a, b) => a.pathDistance - b.pathDistance)
    .slice(0, 30)
    .map((x, i) => ({
      ...x,
      tier: i < 10 ? "T1" : i < 20 ? "T2" : "T3",
      setup: "相似路徑",
      reasons: [`標準化路徑 RMSE ${x.pathDistance.toFixed(3)}（非勝率）`],
    }));
}
