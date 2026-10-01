/* OX 經典: price structure qualifies the opportunity before any ranking.
 * Plain script for the preserved runtime; classic.js exposes the same code to
 * modules/workers/Node. No provider, DOM, orders or future candles are consulted.
 */
(function (root) {
  'use strict';
  const CLASSIC_VERSION = 3;
  const CLASSIC_TIER_LIMITS = Object.freeze({ T1: 10, T2: 15, T3: 15 });
  // Initial, centralized defaults in ATR/bar units. These are implementation
  // thresholds, not claims of calibration or performance from trade screenshots.
  const CLASSIC_RULES = Object.freeze({
    minimumBars: 35, historyBars: 180, pivotRadius: 2, minimumTouches: 2,
    touchGap: 4, minimumSpan: 8, touchATR: 0.35, rejectionATR: 0.45,
    breakATR: 0.6, holdATR: 0.25, nearATR: 1.2, recentBreakBars: 8,
    impulseVolume: 1.35, upwardShare: 0.56, maximumRiskATR: 8
  });
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
  const sideName = side => String(side).toLowerCase() === 'short' ? 'SHORT' : 'LONG';

  function normalize(input, now) {
    const map = new Map();
    for (const bar of input || []) {
      if (!bar || ![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
          bar.time * 1000 > now || Math.min(bar.open, bar.close, bar.low) <= 0 ||
          bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) continue;
      map.set(bar.time, bar);
    }
    return [...map.values()].sort((a, b) => a.time - b.time);
  }
  const mirror = (bars, dir) => bars.map(c => ({
    ...c, open: c.open * dir, close: c.close * dir,
    high: (dir === 1 ? c.high : c.low) * dir,
    low: (dir === 1 ? c.low : c.high) * dir
  }));
  function trueRange(bars) {
    const start = Math.max(1, bars.length - 14), values = [];
    for (let i = start; i < bars.length; i++) values.push(Math.max(
      bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
    return mean(values);
  }
  function pivots(bars, radius) {
    const highs = [], lows = [];
    for (let i = radius; i < bars.length - radius; i++) {
      const bar = bars[i], window = bars.slice(i - radius, i + radius + 1);
      const high = window.every(c => c.high <= bar.high) && window.some(c => c.high < bar.high);
      const low = window.every(c => c.low >= bar.low) && window.some(c => c.low > bar.low);
      // The high is an observed pressure test even on an outside candle.
      // Do not infer a high-then-low reversal sequence from that candle.
      if (high) highs.push({ index: i, price: bar.high, time: bar.time, confirmedAt: bars[i + radius].time });
      if (low && !high) lows.push({ index: i, price: bar.low, time: bar.time, confirmedAt: bars[i + radius].time });
    }
    return { highs, lows };
  }
  function independentTouches(points, line, bars, a, rules) {
    const touches = [];
    for (const p of points) {
      if (Math.abs(p.price - (line.slope * p.index + line.intercept)) > rules.touchATR * a) continue;
      const prev = touches.at(-1);
      if (prev) {
        if (p.index - prev.index < rules.touchGap) continue;
        const rejected = bars.slice(prev.index + 1, p.index).some((c, j) =>
          c.close < line.slope * (prev.index + 1 + j) + line.intercept - rules.rejectionATR * a);
        if (!rejected) continue;
      }
      touches.push(p);
    }
    return touches;
  }
  function pressureLevels(bars, features, a, rules) {
    const points = features.highs.slice(-24), n = bars.length, candidates = [], seen = new Set();
    function consider(line, kind, pointsForLine) {
      const touches = independentTouches(pointsForLine, line, bars, a, rules);
      if (touches.length < rules.minimumTouches || touches.at(-1).index - touches[0].index < rules.minimumSpan) return;
      const start = touches[0].index, formed = touches[rules.minimumTouches - 1].index + rules.pivotRadius;
      if (formed >= n) return;
      const level = line.slope * (n - 1) + line.intercept;
      const key = kind + ':' + Math.round(level / (a * 0.15)) + ':' + start;
      if (seen.has(key)) return; seen.add(key);
      let breakIndex = null, consumedAt = null, cutBeforeFormation = false;
      for (let i = start; i < n; i++) {
        const at = line.slope * i + line.intercept, close = bars[i].close - at;
        const held = i > start && close > rules.holdATR * a &&
          bars[i - 1].close > line.slope * (i - 1) + line.intercept + rules.holdATR * a;
        if (close > rules.breakATR * a || held) {
          if (i < formed) cutBeforeFormation = true;
          if (breakIndex === null) breakIndex = i;
        }
        if (breakIndex !== null && i > breakIndex && close < -rules.rejectionATR * a && consumedAt === null) consumedAt = i;
      }
      const state = cutBeforeFormation || consumedAt !== null ? 'consumed' : breakIndex !== null ? 'broken' : 'valid';
      const error = mean(touches.map(p => Math.abs(p.price - (line.slope * p.index + line.intercept)))) / a;
      candidates.push({ kind, ...line, start, formed, end: n - 1, level, state, breakIndex, consumedAt, touches, error });
    }
    for (const p of points) {
      const cluster = points.filter(q => Math.abs(q.price - p.price) <= rules.touchATR * a);
      consider({ slope: 0, intercept: median(cluster.map(q => q.price)) }, 'horizontal', cluster);
    }
    for (let i = 0; i < points.length - 1; i++) for (let j = i + 1; j < points.length; j++) {
      const first = points[i], last = points[j], span = last.index - first.index;
      if (span < rules.minimumSpan) continue;
      const slope = (last.price - first.price) / span;
      if (Math.abs(slope) < a * 0.015 || Math.abs(slope) > a * 0.25) continue;
      consider({ slope, intercept: first.price - slope * first.index }, 'diagonal', points.slice(i));
    }
    return candidates;
  }
  function volumeEvidence(bars, a, rules) {
    const baseBars = bars.slice(-28, -8), recent = bars.slice(-8);
    const complete = baseBars.length === 20 && [...baseBars, ...recent].every(c =>
      Number.isFinite(c.volume) && c.volume >= 0);
    const baseline = complete ? mean(baseBars.map(c => c.volume)) : null;
    if (!(baseline > 0)) return { complete: false, supported: false, baseline: null, ratio: null, impulseRatio: null, upwardShare: null, distribution: false };
    let up = 0, down = 0, impulseRatio = 0, impulseAt = null;
    for (let i = 0; i < recent.length; i++) {
      const c = recent[i], body = c.close - c.open, ratio = c.volume / baseline;
      if (body > 0) up += c.volume;
      else if (body < 0) down += c.volume;
      if (body > a * 0.2 && ratio > impulseRatio) { impulseRatio = ratio; impulseAt = c.time; }
    }
    const upwardShare = up + down > 0 ? up / (up + down) : 0;
    const last = bars.at(-1), ratio = last.volume / baseline;
    const distribution = last.close < last.open - a * 0.45 && ratio >= 1.4 ||
      upwardShare < 0.38 && last.close < bars.at(-3).close;
    return { complete: true, supported: !distribution && impulseRatio >= rules.impulseVolume && upwardShare >= rules.upwardShare,
      baseline, ratio, impulseRatio, impulseAt, upwardShare, distribution,
      recentRatio: mean(recent.slice(-4).map(c => c.volume)) / baseline };
  }
  function directionEvidence(bars, features, a) {
    const n = bars.length, last = bars.at(-1), recent = bars.slice(-12);
    const high = Math.max(...recent.map(c => c.high)), low = Math.min(...recent.map(c => c.low));
    const position = (last.close - low) / Math.max(high - low, a);
    const advance = (last.close - bars[Math.max(0, n - 9)].close) / a;
    const lateMove = (last.close - bars.at(-3).close) / a;
    const [low1, low2] = features.lows.slice(-2), [high1, high2] = features.highs.slice(-2);
    const higherLows = !!(low1 && low2 && low2.price > low1.price + a * 0.1);
    const higherHighs = !!(high1 && high2 && high2.price > high1.price + a * 0.1);
    const lowerLows = !!(low1 && low2 && low2.price < low1.price - a * 0.1);
    const recentHigh = features.highs.filter(p => p.index >= n - 18).at(-1);
    const reclaim = !!(recentHigh && last.close > recentHigh.price + a * 0.2 && advance >= 1);
    const falling = lateMove < -0.9 || last.close < bars.at(-2).low - a * 0.3;
    // Local momentum must not relabel a rebound inside a larger decline (or,
    // after mirroring, a pullback inside a larger advance).
    const context = bars.slice(-36), previousContext = context.slice(0, -12);
    const contextAdvance = (last.close - context[0].close) / a;
    const contextMean = mean(previousContext.map(c => c.close));
    const contextCeiling = Math.max(...previousContext.map(c => c.high));
    const contextReclaimed = last.close > contextCeiling + a * 0.2 ||
      higherLows && higherHighs && recentHigh && last.close > recentHigh.price + a * 0.2;
    const opposingContext = contextAdvance < -1 && last.close < contextMean - a * 0.5 && !contextReclaimed;
    // A lone bounce at the bottom of an ongoing decline is not a reversal.
    const confirmed = !falling && !opposingContext && (higherLows && advance >= 0.25 && position >= 0.55 ||
      advance >= 1 && position >= 0.72 && (!lowerLows || reclaim) || reclaim);
    const invalidation = low2 && low2.index >= n - 20 ? low2 : {
      price: Math.min(...bars.slice(-8).map(c => c.low)), index: n - 8, time: bars[Math.max(0, n - 8)].time
    };
    return { confirmed, falling, opposingContext, contextAdvance, contextReclaimed, higherLows, higherHighs, lowerLows, reclaim, advance, lateMove, position, invalidation };
  }
  function publicLevel(level, bars, dir) {
    if (!level) return null;
    return { kind: level.kind, state: level.state, level: dir * level.level,
      slope: dir * level.slope, touches: level.touches.length, errorATR: level.error,
      formedAt: bars[level.formed].time, testedAt: level.touches.at(-1).time,
      brokenAt: level.breakIndex === null ? null : bars[level.breakIndex].time,
      consumedAt: level.consumedAt === null ? null : bars[level.consumedAt].time,
      points: [{ time: bars[level.start].time, index: level.start, price: dir * (level.slope * level.start + level.intercept) },
        { time: bars[level.end].time, index: level.end, price: dir * level.level }] };
  }
  function finish(signal, eligible, phase, pressure, reasons) {
    const score = signal.qualityScore;
    return { ...signal, eligible, tier: eligible ? score >= 82 ? 'T1' : score >= 72 ? 'T2' : 'T3' : null,
      phase, stage: phase === 'prebreakout' ? (signal.side === 'LONG' ? '帶量逼近 · 尚未突破' : '帶量逼近 · 尚未跌破') :
        phase === 'probe' ? '突破試探 · 尚未收 K' : phase === 'breakout' ? '已收 K 確認突破' :
          phase === 'continuation' ? (signal.side === 'LONG' ? '帶量上漲 · 強勢延續' : '帶量下跌 · 弱勢延續') : '待確認',
      pressure, reasons };
  }
  function evaluateClassic(input, options = {}) {
    const side = sideName(options.side), dir = side === 'LONG' ? 1 : -1;
    const rules = { ...CLASSIC_RULES, ...options.rules }, now = options.now ?? Date.now();
    const source = normalize(input, now).slice(-rules.historyBars), observed = source.at(-1);
    const closed = source.filter(c => !c.provisional && c.closed !== false);
    const base = { version: CLASSIC_VERSION, side, frame: options.frame || null, eligible: false, tier: null,
      phase: 'watch', stage: '待確認', qualityScore: null, pressure: null, target: null, invalidation: null,
      reasons: [], rejectionReasons: [], evaluatedAt: now, closedAt: closed.at(-1)?.time ?? null,
      observedAt: observed?.time ?? null, provisional: !!observed?.provisional };
    if (closed.length < rules.minimumBars) return { ...base, rejectionReasons: ['已收 K 歷史不足'] };
    const bars = mirror(closed, dir), a = trueRange(bars);
    if (!(a > 0)) return { ...base, rejectionReasons: ['有效波動資料不足'] };
    const features = pivots(bars, rules.pivotRadius), direction = directionEvidence(bars, features, a);
    const volume = volumeEvidence(bars, a, rules), levels = pressureLevels(bars, features, a, rules);
    const last = bars.at(-1), observedPrice = observed.close * dir, n = bars.length;
    const ahead = levels.filter(p => p.state === 'valid' && p.level >= last.close - a * 0.15)
      .sort((x, y) => x.level - y.level || y.touches.length - x.touches.length || x.error - y.error);
    const pressure = ahead[0] || null, gap = pressure ? (pressure.level - last.close) / a : null;
    const near = pressure && gap >= -0.15 && gap <= rules.nearATR;
    const broken = levels.filter(p => p.state === 'broken' && n - 1 - p.breakIndex <= rules.recentBreakBars &&
      last.close >= p.level - a * 0.15).sort((x, y) => y.breakIndex - x.breakIndex)[0] || null;
    const failed = levels.some(p => p.state === 'consumed' && p.consumedAt !== null &&
      n - 1 - p.consumedAt <= 5 && last.close < p.level - a * 0.25);
    const stop = direction.invalidation, risk = (last.close - stop.price) / a;
    const liveFailure = observedPrice < stop.price - a * 0.2 ||
      observed.provisional && observedPrice < last.close - a * 0.9;
    const lastRange = Math.max(last.high - last.low, a * 0.1);
    const exhausted = (last.high - last.close) / lastRange > 0.55 && last.high - last.close > a * 0.7 ||
      risk > rules.maximumRiskATR;
    const next = ahead.find(p => !pressure || p.level > pressure.level + a * 0.5) || null;
    const breakoutDistance = broken ? (observedPrice - broken.level) / a : null;
    const chase = !near && broken && breakoutDistance > 2;
    // Activation must originate from a verified multi-test liquidity level.
    // Momentum alone, without that origin, is not an OX classic opportunity.
    const phase = near ? observed.provisional && observedPrice > pressure.level + a * rules.holdATR ? 'probe' : 'prebreakout' :
      broken ? 'breakout' : 'watch';
    const trigger = near ? pressure : broken, target = near ? next : ahead[0] || null;
    const space = target ? (target.level - observedPrice) / a : null;
    const spaceOK = space === null || space >= 0.65;
    const structureReady = phase !== 'watch' && direction.confirmed && !failed && !liveFailure && !exhausted && !chase &&
      risk > 0 && spaceOK;
    // T2/T3 are directional observations, not miniature copies of the strict
    // entry gate. Missing activation/impulse alone must not empty those lists.
    const observationDirection = !direction.falling && !direction.opposingContext &&
      direction.advance >= 0.15 && direction.position >= 0.45 &&
      (!direction.lowerLows || direction.reclaim || direction.contextReclaimed);
    const observationEvidence = { liquidity:!!pressure || !!broken,
      directionalVolume:volume.supported && direction.confirmed && direction.advance >= 1 };
    const observationEligible = observationDirection && (observationEvidence.liquidity || observationEvidence.directionalVolume) &&
      volume.complete && !volume.distribution &&
      !failed && !liveFailure && !exhausted && !chase && risk > 0 && spaceOK;
    const qualityScore = Math.round(clamp(55 + (trigger ? Math.min(4, trigger.touches.length) * 4 : 0) +
      (direction.higherLows ? 7 : 0) + (direction.higherHighs ? 4 : 0) +
      (volume.supported ? 10 : 0) + Math.min(8, Math.max(0, volume.impulseRatio || 0) * 3) +
      (near ? Math.max(0, 8 - Math.max(0, gap) * 5) : 2) + (target && spaceOK ? 4 : 0), 0, 100));
    const rejectionReasons = [];
    if (!direction.confirmed) rejectionReasons.push(direction.falling ? '當下結構轉跌' : '右側上攻結構不足');
    if (direction.opposingContext) rejectionReasons.push('較大結構仍逆向，局部反彈／回檔不算轉向');
    if (chase) rejectionReasons.push('突破後已離開流動性，禁止追高／追空');
    if (!volume.complete) rejectionReasons.push('成交量歷史不足');
    else if (!volume.supported) rejectionReasons.push(volume.distribution ? '下跌放量／派發' : '上攻量能不足');
    if (phase === 'watch') rejectionReasons.push('沒有接近有效壓力或強勢啟動');
    if (failed) rejectionReasons.push('近期突破失敗，壓力已上下貫穿');
    if (liveFailure) rejectionReasons.push('最新價格已破壞結構');
    if (exhausted) rejectionReasons.push('上攻回落或已走離可觀察位置');
    if (!spaceOK) rejectionReasons.push('下一個目標空間不足');
    const publicPressure = publicLevel(trigger, bars, dir);
    const reasons = [side === 'LONG' ? '右側價格向上推進' : '右側價格向下推進'];
    if (publicPressure) reasons.push((publicPressure.kind === 'horizontal' ? '水平' : '斜線') +
      (side === 'LONG' ? '壓力' : '支撐') + ' · ' + publicPressure.touches + ' 次獨立測試 · ' +
      (publicPressure.state === 'valid' ? '尚未有效突破' : '已收 K 越過'));
    if (gap !== null && near) reasons.push('距觸發 ' + Math.max(0, gap).toFixed(2) + ' ATR');
    if (volume.complete) reasons.push((side === 'LONG' ? '上攻' : '下攻') + '量比 ' + volume.impulseRatio.toFixed(2) +
      'x · 同向量 ' + (volume.upwardShare * 100).toFixed(0) + '%');
    if (!target) reasons.push('下一個歷史目標尚未辨識');
    const signal = { ...base, qualityScore, atr: a, direction, volume, structureReady, observationEligible, observationEvidence, distanceATR: gap,
      invalidation: { level: dir * stop.price, time: stop.time }, target: publicLevel(target, bars, dir),
      levels: levels.map(p => publicLevel(p, bars, dir)), rejectionReasons,
      priority: phase === 'prebreakout' || phase === 'probe' ? 0 : 1 };
    return finish(signal, structureReady && volume.supported, phase, publicPressure, reasons);
  }
  function evaluateFrames(frames, { side = 'long', setupFrame, triggerFrame, now = Date.now(), rules } = {}) {
    const setup = evaluateClassic(frames[setupFrame] || [], { side, frame: setupFrame, now, rules });
    if (!triggerFrame || triggerFrame === setupFrame) return setup;
    const trigger = evaluateClassic(frames[triggerFrame] || [], { side, frame: triggerFrame, now, rules });
    // The trigger frame need not have its own nearby ceiling, but failures,
    // distribution and exhaustion may never be waived by a larger frame.
    const triggerVeto = ['最新價格已破壞結構', '近期突破失敗，壓力已上下貫穿', '上攻回落或已走離可觀察位置'];
    const triggerOK = trigger.direction?.confirmed && trigger.volume?.supported &&
      !trigger.volume.distribution && !triggerVeto.some(reason => trigger.rejectionReasons.includes(reason));
    const eligible = setup.eligible && triggerOK;
    const observationEligible = setup.observationEligible && trigger.volume?.complete &&
      !trigger.direction?.falling && !trigger.direction?.opposingContext && !trigger.volume?.distribution &&
      !triggerVeto.some(reason => trigger.rejectionReasons.includes(reason));
    const reasons = [setupFrame + ' 結構＋' + triggerFrame + (setup.side === 'LONG' ? ' 上攻確認' : ' 下攻確認'), ...setup.reasons.filter(r => !r.includes('量比')),
      ...trigger.reasons.filter(r => r.includes('量比'))];
    const signal = { ...setup, observationEligible:!!observationEligible,
      triggerFrame, triggerClosedAt: trigger.closedAt, triggerVolume: trigger.volume,
      rejectionReasons: eligible ? [] : [...setup.rejectionReasons, ...(triggerOK ? [] : [triggerFrame + ' 當下方向或上攻量能未確認'])] };
    return finish(signal, !!eligible, setup.phase, setup.pressure, reasons);
  }
  function qualifyClassicRow(row, side = 'long', { observations = false } = {}) {
    const key = sideName(side).toLowerCase(), signal = row?.classic?.[key] || row?.classic;
    return signal?.version === CLASSIC_VERSION && (signal.eligible && signal.tier || observations && signal.observationEligible) &&
      signal.side === sideName(side) ? signal : null;
  }
  function compareClassic(a, b) {
    const x = a.classicSignal || a, y = b.classicSignal || b;
    return (x.priority ?? 1) - (y.priority ?? 1) || (y.qualityScore || 0) - (x.qualityScore || 0);
  }
  function compactClassic(signal) {
    if (!signal.eligible && !signal.observationEligible) return {version:signal.version,eligible:false,side:signal.side,
      frame:signal.frame,tier:null,phase:signal.phase,stage:signal.stage,qualityScore:null,
      closedAt:signal.closedAt,rejectionReasons:signal.rejectionReasons};
    const {levels,...decision}=signal;
    return decision;
  }
  function rankClassicTiers(rows, { side, limits = CLASSIC_TIER_LIMITS, compare = compareClassic } = {}) {
    const seen = new Set();
    const pool = rows.filter(row => {
      const signal = row.classicSignal;
      return signal?.version === CLASSIC_VERSION && (signal.eligible || signal.observationEligible) &&
        (!side || signal.side === sideName(side));
    }).sort(compare).filter(row => !seen.has(row.symbol) && seen.add(row.symbol));
    // Only full T1 quality can occupy T1. Its unused slots stay empty.
    // T2/T3 are the next two ranked groups, not isolated score buckets: a T1
    // overflow or a T3-quality candidate may fill the remaining ranked slots.
    const t1 = pool.filter(row => row.classicSignal.eligible && row.classicSignal.tier === 'T1').slice(0, limits.T1);
    const selected = new Set(t1.map(row => row.symbol));
    const rest = pool.filter(row => !selected.has(row.symbol));
    const t2 = rest.slice(0, limits.T2);
    const t3 = rest.slice(t2.length, t2.length + limits.T3);
    return [t1, t2, t3].flatMap((group, i) => group.map(row => ({ ...row,
      qualityTier: row.classicSignal.tier, tier: 'T' + (i + 1), displayTier: 'T' + (i + 1),
      observationOnly:!row.classicSignal.eligible,
      stage:row.classicSignal.eligible ? row.classicSignal.stage : '同向觀察 · 尚未確認',
      rankStatus: row.classicSignal.eligible ? row.classicSignal.stage : '同向觀察 · 尚未通過完整入選條件' })));
  }
  root.OXClassic = Object.freeze({ CLASSIC_VERSION, CLASSIC_TIER_LIMITS, CLASSIC_RULES, evaluateClassic, evaluateFrames, qualifyClassicRow, compareClassic, compactClassic, rankClassicTiers });
})(globalThis);
