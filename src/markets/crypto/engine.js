const OXEngine = {
  computeLiquidity(ticker, allTickers) {
    const quoteVol = num(ticker.usdtVolume);
    const sorted = allTickers.map(t => num(t.usdtVolume)).sort((a, b) => b - a);
    const rank = sorted.indexOf(quoteVol);
    const percentile = Math.max(0, Math.min(100, (1 - (rank / sorted.length)) * 100));

    let liqScore = (percentile / 100) * 80;
    if (quoteVol >= CONFIG.liquidity.t1MinUsdtVolume) liqScore += 20;
    else if (quoteVol >= CONFIG.liquidity.minUsdtVolume24h) liqScore += 10;
    
    const change = num(ticker.change24h);
    let penaltyApplied = false;
    if (Math.abs(change) > 0.12 && percentile < 40) {
      liqScore *= CONFIG.liquidity.lowLiqPenaltyRatio;
      penaltyApplied = true;
    }

    return {
      score: Math.min(100, Math.max(0, Math.round(liqScore))),
      percentileStr: (100 - percentile).toFixed(1),
      quoteVol,
      penaltyApplied
    };
  },

  computeRelativeStrength(ticker, btcTicker) {
    const chg = num(ticker.change24h);
    const btcChg = btcTicker ? num(btcTicker.change24h) : 0;
    const diffBtc = chg - btcChg;
    
    let rsScore = 50 + (diffBtc * 200);
    rsScore = Math.min(100, Math.max(0, Math.round(rsScore)));
    
    return {
      score: rsScore,
      diffBtcPct: (diffBtc * 100).toFixed(2),
      isOutperforming: diffBtc > 0.02,
      isUnderperforming: diffBtc < -0.02
    };
  },

  computeMoneyFlow(candles) {
    if (!candles || candles.length < 22) return { score: 50, volRatio1h: 1.0, isSurge: false };
    
    const n = candles.length;
    const last = candles[n - 1];
    const vols = candles.map(c => c.volume);
    const avgVol20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
    const volRatio1h = last.volume / avgVol20;
    const recent4Vol = vols.slice(-4).reduce((a, b) => a + b, 0) / 4;
    const volRatio4h = recent4Vol / avgVol20;

    let upVolSum = 0, upCount = 0;
    let downVolSum = 0, downCount = 0;
    for (let i = Math.max(0, n - 12); i < n; i++) {
      if (candles[i].close >= candles[i].open) {
        upVolSum += candles[i].volume;
        upCount++;
      } else {
        downVolSum += candles[i].volume;
        downCount++;
      }
    }
    const avgUpVol = upCount ? upVolSum / upCount : avgVol20;
    const avgDownVol = downCount ? downVolSum / downCount : avgVol20;

    let baseFlow = 50;
    if (volRatio1h >= 1.8) baseFlow += 25;
    else if (volRatio1h >= 1.25) baseFlow += 12;
    else if (volRatio1h < 0.6) baseFlow -= 10;

    const healthyLongVol = avgUpVol > avgDownVol * 1.15;
    const healthyShortVol = avgDownVol > avgUpVol * 1.15;
    if (healthyLongVol || healthyShortVol) baseFlow += 15;

    const isSurge = volRatio1h >= 1.8 || (volRatio4h >= 1.5 && volRatio1h >= 1.4);

    return {
      score: Math.min(100, Math.max(10, Math.round(baseFlow))),
      volRatio1h: Number(volRatio1h.toFixed(2)),
      volRatio4h: Number(volRatio4h.toFixed(2)),
      isSurge,
      healthyLongVol,
      healthyShortVol
    };
  },

  computeStructure(candles) {
    if (!candles || candles.length < 25) {
      return { score: 50, side: "NEUTRAL", swingHigh: 0, swingLow: 0, isHHHL: false, isLHLL: false };
    }

    const n = candles.length;
    const last = candles[n - 1];
    const prev = candles[n - 2];
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const swingHigh = Math.max(...highs.slice(-21, -1));
    const swingLow = Math.min(...lows.slice(-21, -1));

    const isHHHL = last.high >= prev.high && prev.high >= candles[n - 3].high &&
                   last.low >= prev.low && prev.low >= candles[n - 3].low;

    const isLHLL = last.high <= prev.high && prev.high <= candles[n - 3].high &&
                   last.low <= prev.low && prev.low <= candles[n - 3].low;

    let structScore = 50;
    let side = "NEUTRAL";

    if (last.close > ma20) {
      side = "LONG";
      if (isHHHL) structScore += 25;
      const pullback = (swingHigh - last.close) / (swingHigh - swingLow || 1);
      if (pullback >= 0.05 && pullback <= 0.45) structScore += 18;
      else if (pullback < 0.05) structScore += 12;
    } else if (last.close < ma20) {
      side = "SHORT";
      if (isLHLL) structScore += 25;
      const bounce = (last.close - swingLow) / (swingHigh - swingLow || 1);
      if (bounce >= 0.05 && bounce <= 0.45) structScore += 18;
      else if (bounce < 0.05) structScore += 12;
    }

    return {
      score: Math.min(100, Math.max(10, Math.round(structScore))),
      side,
      swingHigh,
      swingLow,
      isHHHL,
      isLHLL
    };
  },

  evaluateSetupMatch(candles, structure, moneyFlow) {
    if (!candles || candles.length < 25) {
      return { setupName: "區間整理", setupScore: 45, side: "NEUTRAL", reasons: ["K線資料分析中"] };
    }

    const n = candles.length;
    const last = candles[n - 1];
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const matched = [];
    const reasons = [];

    if (structure.side === "LONG") {
      const distHigh = (structure.swingHigh - last.close) / structure.swingHigh;

      if (structure.isHHHL && moneyFlow.healthyLongVol) {
        matched.push({ name: "[多] 強勢趨勢延續", score: 85, side: "LONG" });
        reasons.push("高低點階梯式抬高，多頭結構順排");
      }
      if (distHigh <= 0.025 && distHigh >= -0.015) {
        matched.push({ name: "[多] 關鍵前高突破", score: 88, side: "LONG" });
        reasons.push(`距離關鍵前高 ${fmtPrice(structure.swingHigh)} 僅 ${(distHigh * 100).toFixed(1)}%`);
      }
      const range5 = (Math.max(...highs.slice(-5)) - Math.min(...lows.slice(-5))) / last.close;
      const range20 = (Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20))) / last.close;
      if (range5 < range20 * 0.55 && moneyFlow.volRatio1h < 1.0) {
        matched.push({ name: "[多/平] 波動壓縮待變盤", score: 78, side: "LONG" });
        reasons.push("ATR 波動顯著收窄，進入極度壓制狀態");
      }
      if (last.low < structure.swingLow && last.close > structure.swingLow) {
        matched.push({ name: "[多] 假跌破流動性獵取", score: 82, side: "LONG" });
        reasons.push("下插刺破前低支撐後強勢收回");
      }
    }

    if (structure.side === "SHORT") {
      const distLow = (last.close - structure.swingLow) / structure.swingLow;

      if (structure.isLHLL && moneyFlow.healthyShortVol) {
        matched.push({ name: "[空] 弱勢趨勢延續", score: 85, side: "SHORT" });
        reasons.push("高低點階梯式走低，空頭結構順排");
      }
      if (distLow <= 0.025 && distLow >= -0.015) {
        matched.push({ name: "[空] 關鍵前低跌破", score: 88, side: "SHORT" });
        reasons.push(`距離關鍵前低 ${fmtPrice(structure.swingLow)} 僅 ${(distLow * 100).toFixed(1)}%`);
      }
      if (last.high > structure.swingHigh && last.close < structure.swingHigh) {
        matched.push({ name: "[空] 假突破上掃誘多", score: 82, side: "SHORT" });
        reasons.push("上刺突破前高誘多後迅速收回跌破");
      }
    }

    if (!matched.length) {
      matched.push({ name: "常態結構震盪", score: 50, side: structure.side });
      reasons.push("目前處於盤整區間內等待明確結構");
    }

    matched.sort((a, b) => b.score - a.score);
    return {
      setupName: matched[0].name,
      setupScore: matched[0].score,
      side: matched[0].side,
      reasons: reasons.slice(0, 3)
    };
  },

  detectTrigger(candles, structure, moneyFlow) {
    if (!candles || candles.length < 20) return { active: false, type: "" };
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    if (structure.side === "LONG") {
      if (last.close >= structure.swingHigh && moneyFlow.volRatio1h >= 1.35) {
        return { active: true, type: "OX 放量突破" };
      }
      if (prev.close < prev.open && last.close > prev.high && moneyFlow.volRatio1h >= 1.2) {
        return { active: true, type: "OX 回調結束反轉" };
      }
    }

    if (structure.side === "SHORT") {
      if (last.close <= structure.swingLow && moneyFlow.volRatio1h >= 1.35) {
        return { active: true, type: "OX 放量跌破" };
      }
      if (prev.close > prev.open && last.close < prev.low && moneyFlow.volRatio1h >= 1.2) {
        return { active: true, type: "OX 反抽受阻下破" };
      }
    }

    return { active: false, type: "" };
  },


  computeTierFits(liq, moneyFlow, structure, setup, trigger, rs) {
    const triggerScore = trigger.active ? 100 : 35;
    const t1Fit = clamp(Math.round(
      liq.score * 0.18 + moneyFlow.score * 0.18 + structure.score * 0.20 +
      setup.setupScore * 0.18 + rs.score * 0.12 + triggerScore * 0.14
    ));
    const t2Fit = clamp(Math.round(
      liq.score * 0.14 + moneyFlow.score * 0.18 + structure.score * 0.25 +
      setup.setupScore * 0.25 + rs.score * 0.12 + (trigger.active ? 35 : 82) * 0.06
    ));
    const t3Fit = clamp(Math.round(
      liq.score * 0.20 + moneyFlow.score * 0.30 + structure.score * 0.18 +
      setup.setupScore * 0.10 + rs.score * 0.12 + (moneyFlow.isSurge ? 100 : 50) * 0.10
    ));
    const setupProgress = clamp(Math.round(
      liq.score * 0.12 + moneyFlow.score * 0.18 + structure.score * 0.24 +
      setup.setupScore * 0.24 + rs.score * 0.12 + (trigger.active ? 100 : 40) * 0.10
    ));
    const checks = [
      liq.score >= 55,
      moneyFlow.score >= 60,
      structure.score >= 60,
      setup.setupScore >= 65,
      rs.score >= 55,
      moneyFlow.volRatio1h >= 1.25,
      trigger.active
    ];
    const signalConfidence = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return { t1Fit, t2Fit, t3Fit, setupProgress, signalConfidence };
  },

  classifyLifecycle(liq, moneyFlow, structure, setup, trigger) {
    if (
      liq.score >= 60 &&
      structure.score >= 62 &&
      setup.setupScore >= 70 &&
      trigger.active
    ) {
      return { tier: "t1", statusText: `T1 · ${trigger.type}已確認` };
    }

    if (
      liq.score >= 50 &&
      structure.score >= 55 &&
      setup.setupScore >= 60 &&
      !trigger.active
    ) {
      return { tier: "t2", statusText: "T2 · 結構就緒等待觸發" };
    }

    if (
      liq.score >= 40 &&
      (structure.score >= 45 || setup.setupScore >= 45 || moneyFlow.isSurge)
    ) {
      return { tier: "t3", statusText: "T3 · 早期資金/結構醞釀" };
    }

    return { tier: "none", statusText: "常規觀察" };
  }
};

