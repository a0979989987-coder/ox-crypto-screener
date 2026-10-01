import { evaluateClassic, qualifyClassicRow, compareClassic, compactClassic, CLASSIC_VERSION, CLASSIC_TIER_LIMITS, rankClassicTiers } from '../../core/classic.js?v=20261002-rank7';
import { closedCandles, relativeStrength } from "./model.js?v=20261001-us-eod1";
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
  const data = closedCandles(bars, interval, now);
  if (data.length < 60) return null;
  return preparedAnalysis(item, data, closedCandles(benchmark, interval, now), interval, now);
}
export function analyzeStockPool(items, histories, benchmark, interval = "1D", now = Date.now()) {
  const lookup = new Map(items.map(item => [item.symbol, item]));
  const closedBenchmark = closedCandles(benchmark, interval, now);
  return Object.entries(histories).map(([symbol, bars]) => preparedAnalysis(
    lookup.get(symbol), closedCandles(bars, interval, now), closedBenchmark, interval, now,
  )).filter(Boolean);
}
function preparedAnalysis(item, data, benchmark, interval, now) {
  const last = data.at(-1);
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
    classic: Object.fromEntries(['long','short'].map(side=>[side,compactClassic(evaluateClassic(data,{side,frame:interval,now}))])),
    price: last.close,
    changePct,
    marketTime: last.time,
    asOf: last.periodEnd || last.date,
    interval,
    liquidity,
    rvol,
    rvolBasis:
      interval === "1D" ? "完整日 K／前20完整交易日" : "同級別已收線 K／前20根",
    rs: relativeStrength(data, benchmark),
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
export function stockClassic(row,side='long') {
 const saved=qualifyClassicRow(row,side);if(saved)return saved;
 if(row.classic?.[side]?.version===CLASSIC_VERSION)return row.classic[side];
 // Old stored analyses may carry genuine bars, but their old grades are never
 // trusted. Recompute from OHLCV; an analysis without bars cannot qualify.
 if(Array.isArray(row.bars))return evaluateClassic(row.bars,{side,frame:row.interval});
 return null;
}
export function tierResults(rows,{side='long',mode='classic',type='stock',pattern='all',limit}={}) {
 const candidates=[],seen=new Set();
 for(const row of rows){
  if((type==='stock'&&row.type==='ETF')||(type==='ETF'&&row.type!=='ETF')||row.complex||seen.has(row.symbol))continue;
  const signal=stockClassic(row,side);
  let setups=row.patterns?.[side]||[];
  if(pattern!=='all')setups=setups.filter(p=>p.id===pattern);
  const best=[...setups].sort((a,b)=>a.distance-b.distance)[0],sign=side==='long'?1:-1;
  if(mode==='classic'&&(!(signal?.eligible||signal?.observationEligible)||pattern!=='all'&&!best))continue;
  if(mode==='ma'&&!(sign*(row.ma20-row.ma50)>0&&sign*(row.price-row.ma20)>0))continue;
  if(mode==='breakout'&&!(signal?.eligible&&signal.phase==='breakout'))continue;
  if(mode==='gap'&&sign*row.gapPct<2)continue;
  if(mode==='rs'&&sign*row.rs<3)continue;
  const tier=signal?.eligible?signal.tier:'T3';
  candidates.push({...row,classicSignal:signal,side:side.toUpperCase(),tier,
    setup:mode==='classic'?'OX 經典 · '+(signal.eligible?signal.stage:'同向觀察'):({ma:'均線排列',gap:'跳空觀察',rs:'相對 SPY 強勢',breakout:'放量突破'})[mode],
    forming:signal?.phase==='prebreakout'||signal?.phase==='probe',stage:signal?.stage,
    reasons:[...(signal?.eligible?signal.reasons:signal?.matchedReasons||[]),
      ...(!signal?.eligible?(signal?.rejectionReasons||[]).map(reason=>'待確認：'+reason):[]),
      ...(row.rs!==null&&Number.isFinite(row.rs)?['同日期20期相對 SPY '+row.rs.toFixed(2)+'%']:[])],
    distance:signal?.distanceATR??Infinity});seen.add(row.symbol);
 }
 const compare=(a,b)=>compareClassic(a,b)||(b.liquidity||0)-(a.liquidity||0);
 // Timeframe conditions consume the full intrinsic classification pool first.
 if(limit===Infinity)return candidates.sort(compare);
 const limits=limit===undefined?CLASSIC_TIER_LIMITS:{T1:limit,T2:limit,T3:limit};
 if(mode==='classic'||mode==='breakout')return rankClassicTiers(candidates,{side,limits,compare});
 return ['T1','T2','T3'].flatMap(t=>candidates.filter(x=>x.tier===t).sort(compare).slice(0,limits[t]));
}

export function timeframeTierResults(analyses,options,config) {
 if(!config?.enabled||!config.rules?.length)return tierResults(analyses.filter(x=>x.interval===options.scanInterval),options);
 const indexes=new Map(config.rules.map(rule=>[rule.frame,new Map(tierResults(analyses.filter(x=>x.interval===rule.frame),{...options,mode:'classic',limit:Infinity}).map(row=>[row.symbol,row]))]));
 const symbols=new Set([...indexes.values()].flatMap(index=>[...index.keys()])),matched=[];
 for(const symbol of symbols){
  const rows=config.rules.map(rule=>{const row=indexes.get(rule.frame).get(symbol);return row?.tier===rule.tier?row:null;});
  const row=config.match==='any'?rows.find(Boolean):rows.every(Boolean)?rows[0]:null;
  if(row)matched.push({...row,combination:true});
 }
 return rankClassicTiers(matched,{side:options.side,compare:(a,b)=>compareClassic(a,b)||(b.liquidity||0)-(a.liquidity||0)});
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
export function matchPath(rows,points,options={}) {
 const target=resamplePath(points.map(p=>1-p.y));if(!target.length)return [];
 const side=options.side|| (target.at(-1)>=target[0]?'long':'short');
 const ranked=rows.flatMap(row=>{
  if(row.path?.length<20)return [];
  const signal=stockClassic(row,side);if(!signal?.eligible)return [];
  const path=resamplePath(row.path);
  const pathDistance=Math.sqrt(path.reduce((s,x,i)=>s+(x-target[i])**2,0)/target.length);
  if(pathDistance>.28)return [];
  return [{...row,side:signal.side,tier:signal.tier,classicSignal:signal,pathDistance,
    setup:'相似路徑 · '+signal.stage,reasons:[...signal.reasons,'路徑 RMSE '+pathDistance.toFixed(3)]}];
 }).sort((a,b)=>compareClassic(a,b)||a.pathDistance-b.pathDistance);
 return rankClassicTiers(ranked,{side,compare:(a,b)=>compareClassic(a,b)||a.pathDistance-b.pathDistance});
}
