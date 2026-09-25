async function refreshMarketTickers() {
  if (state.activeMarket && state.activeMarket !== "crypto") return;
  try {
    const rawTickers = await BitgetAPI.fetchTickers();
    if (!state.contracts.size) {
      const [contractList, instrumentMetadata] = await Promise.all([
        BitgetAPI.fetchContracts(),
        BitgetAPI.fetchInstrumentMetadata()
      ]);
      const metaBySymbol = new Map((instrumentMetadata || []).map(m => [m.symbol, m]));
      state.instrumentCatalog.clear();
      state.contracts.clear();
      state.assetClassCounts = { crypto: 0, stock: 0, etf: 0, commodity: 0, index: 0, other: 0 };

      contractList.forEach(c => {
        const meta = metaBySymbol.get(c.symbol) || {};
        const merged = {
          ...c,
          assetSymbolType: meta.symbolType || "",
          isRwa: meta.isRwa ?? c.isRwa,
          assetClass: undefined
        };
        const assetClass = classifyInstrument(merged);
        const tagged = { ...merged, assetClass };
        state.instrumentCatalog.set(tagged.symbol, tagged);
        state.assetClassCounts[assetClass] = (state.assetClassCounts[assetClass] || 0) + 1;
        if (assetClass === ASSET_CLASS.CRYPTO) state.contracts.set(tagged.symbol, tagged);
      });
    }

    state.tickers = rawTickers.filter(t => 
      state.contracts.has(t.symbol) && 
      isCryptoSymbolAllowed(t.symbol) &&
      [t.lastPr, t.change24h, t.usdtVolume].every(v => Number.isFinite(num(v)))
    );

    // Purge any stale non-crypto records before rebuilding ranking / scanner state.
    for (const symbol of Array.from(state.analyzedCache.keys())) {
      if (!isCryptoSymbolAllowed(symbol)) state.analyzedCache.delete(symbol);
    }
    state.scanQueue = state.scanQueue.filter(isCryptoSymbolAllowed);

    state.btcTicker = state.tickers.find(t => t.symbol === "BTCUSDT") || null;
    state.ethTicker = state.tickers.find(t => t.symbol === "ETHUSDT") || null;
    captureStrengthSnapshot();

    const eligible = state.tickers.filter(t => num(t.usdtVolume) >= CONFIG.liquidity.minUsdtVolume24h);
    eligible.sort((a, b) => num(b.usdtVolume) - num(a.usdtVolume));
    
    if (!state.scanQueue.length) {
      state.scanQueue = eligible.map(t => t.symbol);
      state.scanIndex = 0;
    }

    try { LiquidationService?.NativeExchangeAdapter?.ensureStarted?.(); } catch (e) {}
    rebuildTierLists();
    if (state.activeView === 'radar') {
      renderCurrentTab();
      updateHeaderHUD();
      renderBenchmarkBar();
    }
    checkLevelAlerts();

    if (!state.isQueueRunning) {
      state.isQueueRunning = true;
      runScanQueueLoop();
    }
  } catch (e) {
    document.getElementById("scan-status").textContent = `行情取得失敗：${e.message}`;
    document.getElementById("dot").style.background = "#ee617c";
  }
}

let lastRadarBatchPaint = 0;
async function runScanQueueLoop() {
  while (true) {
    // Keep the ranking data, but do not spend CPU scanning Crypto in the
    // background while another market, page, or browser tab is visible.
    if (document.hidden || state.activeMarket !== 'crypto' || !['home','strength','radar'].includes(state.activeView)) {
      await new Promise(r => setTimeout(r, document.hidden ? 15000 : 8000));
      continue;
    }
    if (!state.scanQueue.length) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const batchSymbols = [];
    for (let i = 0; i < CONFIG.queueBatchSize; i++) {
      if (state.scanIndex >= state.scanQueue.length) {
        state.scanIndex = 0;
      }
      batchSymbols.push(state.scanQueue[state.scanIndex]);
      state.scanIndex++;
    }

    document.getElementById("scan-status").textContent = `輪巡 ${state.scanIndex}/${state.scanQueue.length}`;
    document.getElementById("dot").style.background = "#38c99b";

    await Promise.allSettled(batchSymbols.map(async symbol => {
      const ticker = state.tickers.find(t => t.symbol === symbol);
      if (!ticker) return;

      try {
        const candles = await BitgetAPI.fetchCandles(symbol, "1H", 35);
        if (!candles.length) return;

        const liq = OXEngine.computeLiquidity(ticker, state.tickers);
        const rs = OXEngine.computeRelativeStrength(ticker, state.btcTicker);
        const moneyFlow = OXEngine.computeMoneyFlow(candles);
        const structure = OXEngine.computeStructure(candles);
        const setup = OXEngine.evaluateSetupMatch(candles, structure, moneyFlow);
        const trigger = OXEngine.detectTrigger(candles, structure, moneyFlow);
        const lifecycle = OXEngine.classifyLifecycle(liq, moneyFlow, structure, setup, trigger);
        const fits = OXEngine.computeTierFits(liq, moneyFlow, structure, setup, trigger, rs);

        const oxScore = Math.round(
          liq.score * CONFIG.weights.liquidity +
          moneyFlow.score * CONFIG.weights.moneyFlow +
          structure.score * CONFIG.weights.structure +
          setup.setupScore * CONFIG.weights.setupMatch +
          rs.score * CONFIG.weights.relativeStrength +
          (trigger.active ? 5 : 0)
        );

        const reasons = [
          `24H 成交額市場前 ${liq.percentileStr}% (${fmtUsd(liq.quoteVol)} USDT)`,
          `1H 放量比率: ${moneyFlow.volRatio1h}x`,
          ...setup.reasons
        ];
        if (rs.isOutperforming) reasons.push(`強於 BTC +${rs.diffBtcPct}%`);
        if (rs.isUnderperforming) reasons.push(`弱於 BTC ${rs.diffBtcPct}%`);

        state.analyzedCache.set(symbol, {
          symbol,
          ticker,
          oxScore,
          liqScore: liq.score,
          flowScore: moneyFlow.score,
          structScore: structure.score,
          setupScore: setup.setupScore,
          rsScore: rs.score,
          side: setup.side,
          setupName: setup.setupName,
          tier: lifecycle.tier,
          statusText: lifecycle.statusText,
          isSurge: moneyFlow.isSurge,
          triggerActive: trigger.active,
          triggerType: trigger.type,
          reasons,
          change24h: num(ticker.change24h),
          ret1h: candleReturn(candles, 1),
          ret4h: candleReturn(candles, 4),
          ret24h: candleReturn(candles, 24) || num(ticker.change24h),
          quoteVol: liq.quoteVol,
          liqPercentile: liq.percentileStr,
          volRatio1h: moneyFlow.volRatio1h,
          volRatio4h: moneyFlow.volRatio4h,
          swingHigh: structure.swingHigh,
          swingLow: structure.swingLow,
          structureLabel: structure.isHHHL ? "HH / HL" : structure.isLHLL ? "LH / LL" : structure.side,
          t1Fit: fits.t1Fit,
          t2Fit: fits.t2Fit,
          t3Fit: fits.t3Fit,
          setupProgress: fits.setupProgress,
          signalConfidence: fits.signalConfidence
        });

        if (moneyFlow.isSurge && !state.scanQueue.slice(state.scanIndex, state.scanIndex + 5).includes(symbol)) {
          state.scanQueue.splice(state.scanIndex, 0, symbol);
        }
      } catch (e) {}
    }));

    rebuildTierLists();
    if (state.activeView === 'radar') {
      const now = performance.now();
      if (!lastRadarBatchPaint || now - lastRadarBatchPaint >= 8000) {
        renderCurrentTab();
        updateHeaderHUD();
        renderBenchmarkBar();
        lastRadarBatchPaint = now;
      }
    }

    await new Promise(r => setTimeout(r, CONFIG.batchIntervalMs));
  }
}

function rebuildTierLists() {
  const tierLimit = 10;
  const allAnalyzed = Array.from(state.analyzedCache.values())
    .filter(c => !benchmarkSymbols.has(c.symbol));

  const pickRanked = (pool, fitKey, formalTier, taken = new Set()) => {
    const formal = pool
      .filter(c => c.tier === formalTier && !taken.has(c.symbol))
      .sort((a, b) => ((b[fitKey] || 0) - (a[fitKey] || 0)) || (num(b.oxScore) - num(a.oxScore)));
    const result = [];
    for (const c of formal) {
      if (result.length >= tierLimit) break;
      result.push({ ...c, displayTier: formalTier, rankStatus: formalTier === "t1" ? "CONFIRMED" : formalTier === "t2" ? "READY" : "EARLY" });
    }
    const used = new Set(result.map(x => x.symbol));
    const fallback = pool
      .filter(c => !used.has(c.symbol) && !taken.has(c.symbol))
      .map(c => ({ c, adjusted: c[fitKey] || 0 }))
      .sort((a, b) => (b.adjusted - a.adjusted) || (num(b.c.oxScore) - num(a.c.oxScore)));
    for (const row of fallback) {
      if (result.length >= tierLimit) break;
      result.push({ ...row.c, displayTier: formalTier, rankStatus: "WATCH" });
    }
    return result;
  };

  const buildTierSet = pool => {
    const t1 = pickRanked(pool, "t1Fit", "t1");
    const t1Symbols = new Set(t1.map(c => c.symbol));
    const t2 = pickRanked(pool, "t2Fit", "t2", t1Symbols);
    const t12Symbols = new Set([...t1Symbols, ...t2.map(c => c.symbol)]);
    const t3 = pickRanked(pool, "t3Fit", "t3", t12Symbols);
    return { t1, t2, t3 };
  };

  // 保留原本 combined tierMap 供首頁、OX LIVE、其他既有模組讀取。
  const combined = buildTierSet(allAnalyzed);
  const longPool = allAnalyzed.filter(c => String(c.side || "").toUpperCase() === "LONG");
  const shortPool = allAnalyzed.filter(c => String(c.side || "").toUpperCase() === "SHORT");
  // 雷達則使用獨立六榜：LONG T1/T2/T3 與 SHORT T1/T2/T3，各自從全市場符合方向者重新排名。
  state.tierMapBySide = {
    long: buildTierSet(longPool),
    short: buildTierSet(shortPool)
  };

  const surge = allAnalyzed.filter(c => c.isSurge).sort((a, b) => b.flowScore - a.flowScore).slice(0, 15);
  const gainers = state.tickers.filter(t => num(t.change24h) > 0 && !benchmarkSymbols.has(t.symbol))
    .sort((a, b) => num(b.change24h) - num(a.change24h)).slice(0, 15);
  const losers = state.tickers.filter(t => num(t.change24h) < 0 && !benchmarkSymbols.has(t.symbol))
    .sort((a, b) => num(a.change24h) - num(b.change24h)).slice(0, 15);

  state.tierMap = { ...combined, surge, gainers, losers };
  syncDirectionalBadges();
  syncWatchBadge();
  if (state.activeView === 'strength') renderMarketStrength();
  if (state.activeView === 'home') renderHomeOverview();
  renderOxLive();
}

function renderCurrentTab() {
  const container = document.getElementById("screener-list");
  const tab = state.currentTab;
  if (!container) return;
  syncScannerFilterUI();

  if (tab === "watch") {
    const savedAll = getWatchlistRecords().filter(rec => state.activeMarket !== "crypto" || isCryptoSymbolAllowed(rec.symbol));
    const saved = savedAll.filter(rec => {
      const analyzed = state.analyzedCache.get(rec.symbol);
      return passesDirectionFilter(analyzed?.side || rec.side || "—");
    });
    document.getElementById("pool-count").textContent = `${saved.length} 檔${state.directionFilter === "long" ? "多頭" : "空頭"}收藏`;
    syncWatchBadge();
    if (!saved.length) {
      const dir = state.directionFilter === "long" ? "LONG" : "SHORT";
      container.innerHTML = `<div style="padding:30px 16px;text-align:center;color:var(--muted)"><b>${savedAll.length ? `觀察列表目前沒有 ${dir} 標的` : "還沒有收藏標的"}</b><p style="font-size:11px">在 T1 / T2 / T3 點 ☆ 即可加入 ⭐觀察。</p></div>`;
      return;
    }
    container.innerHTML = saved.map((rec, idx) => {
      const analyzed = state.analyzedCache.get(rec.symbol);
      const ticker = state.tickers.find(t => t.symbol === rec.symbol);
      const c = analyzed || rec;
      const tier = String(c.displayTier || c.tier || rec.tier || "t3").toLowerCase();
      const side = c.side || rec.side || "—";
      const price = ticker ? ticker.lastPr : (c.lastPr || rec.lastPr);
      const change = ticker ? ticker.change24h : (c.change24h ?? rec.change24h);
      return `<div class="coin-card watch-list-card ${rec.symbol === state.symbol ? 'selected' : ''}" data-symbol="${rec.symbol}" role="button" tabindex="0">
        <div class="watch-card-main">
          <div class="watch-card-copy">
            <div class="coin-title watch-coin-title"><span class="coin-rank">#${idx+1}</span><span class="watch-symbol" title="${rec.symbol}">${rec.symbol.replace(/USDT$/, "")}</span><span class="badge badge-${side === 'SHORT' ? 'short' : 'long'}">${side}</span><span class="badge badge-${['t1','t2','t3'].includes(tier)?tier:'t3'}">${tier.toUpperCase()}</span></div>
            <div class="watch-metrics">
              <span class="watch-metric"><label>最新價格</label><strong>${fmtPrice(price)}</strong></span>
              <span class="watch-metric"><label>24H 漲跌</label><strong class="${num(change)>=0?'positive':'negative'}">${fmtPct(change)}</strong></span>
              <span class="watch-metric"><label>OX 分數</label><strong style="color:var(--gold)">${c.oxScore ?? rec.oxScore ?? '—'}</strong></span>
            </div>
          </div>
          <button class="watch-star is-starred" type="button" data-watch-symbol="${rec.symbol}" aria-label="移除 ${rec.symbol} 收藏"><span aria-hidden="true">★</span></button>
        </div>
      </div>`;
    }).join('');
    return;
  }

  const isTierTab = ["t1","t2","t3"].includes(tab);
  const sourceList = isTierTab
    ? (state.tierMapBySide?.[state.directionFilter]?.[tab] || [])
    : (state.tierMap[tab] || []).filter(c => passesDirectionFilter(c.side));
  const list = sourceList;
  const directionLabel = state.directionFilter === "long" ? "多頭" : "空頭";
  document.getElementById("pool-count").textContent = `${list.length} 檔${directionLabel}`;
  syncWatchBadge();
  if (!list.length) {
    container.innerHTML = `<div style="padding:30px 16px;text-align:center;color:var(--muted)"><b>目前仍在輪巡 ${directionLabel} 標的</b><p style="font-size:11px">符合條件後會依目前 T${["t1","t2","t3"].includes(tab)?tab.slice(1):""} 排名顯示。</p></div>`;
    return;
  }

  container.innerHTML = list.map((c, idx) => {
    const displayTier = tab === "surge" ? (c.tier !== "none" ? c.tier : "t3") : (c.displayTier || c.tier || "t3");
    const status = tab === "surge" ? "SURGE" : (c.rankStatus || c.statusText || "WATCH");
    const fit = displayTier === "t1" ? c.t1Fit : displayTier === "t2" ? c.t2Fit : c.t3Fit;
    const allowStar = ["t1","t2","t3"].includes(tab);
    const starred = isWatchlisted(c.symbol);
    return `<div class="coin-card ${c.symbol === state.symbol ? 'selected' : ''}" data-symbol="${c.symbol}" role="button" tabindex="0">
      <div class="coin-top">
        <span class="coin-title">
          <span class="coin-rank">#${idx + 1}</span>
          <span class="coin-symbol-full">${c.symbol}</span><span class="coin-symbol-mobile" title="${c.symbol.replace(/USDT$/, "")}">${c.symbol.replace(/USDT$/, "")}</span>
          <span class="badge badge-${c.side === 'SHORT' ? 'short' : 'long'}">${c.side}</span>
          <span class="badge badge-${displayTier}">${displayTier.toUpperCase()}</span>
          ${c.isSurge ? '<span class="badge badge-surge">🔥</span>' : ''}
        </span>
        <span class="coin-top-right"><span class="coin-ox">OX ${c.oxScore}</span>${allowStar ? `<button class="watch-star watch-star-desktop ${starred?'is-starred':''}" type="button" data-watch-symbol="${c.symbol}" aria-label="${starred?'移除':'加入'} ${c.symbol} 收藏"><span aria-hidden="true">${starred?'★':'☆'}</span></button>` : ''}</span>
      </div>
      <div class="coin-mid">
        <span class="meta desktop-coin-meta">${status} · Fit ${fit ?? '—'} · 24H Vol ${fmtUsd(c.quoteVol)} USDT</span>
        <span class="mobile-coin-volume">24H 成交量 ${fmtUsd(c.quoteVol)} USDT</span>
        <span class="coin-change desktop-coin-change ${c.change24h >= 0 ? 'positive' : 'negative'}" style="font-weight:700">${fmtPct(c.change24h)}</span>
      </div>
      <div class="coin-mobile-bottom">
        ${allowStar ? `<button class="watch-star watch-star-mobile ${starred?'is-starred':''}" type="button" data-watch-symbol="${c.symbol}" aria-label="${starred?'移除':'加入'} ${c.symbol} 收藏"><span aria-hidden="true">${starred?'★':'☆'}</span></button>` : '<span></span>'}
        <span class="coin-change ${c.change24h >= 0 ? 'positive' : 'negative'}" style="font-weight:700">${fmtPct(c.change24h)}</span>
      </div>
      <div class="coin-reason"><div class="setup-head">${c.setupName}</div><div>• ${c.reasons.join('</div><div>• ')}</div></div>
      <div class="score-pills">
        <span class="score-pill">流動 ${c.liqScore}</span><span class="score-pill">資金 ${c.flowScore}</span>
        <span class="score-pill">結構 ${c.structScore}</span><span class="score-pill">RS ${c.rsScore}</span>
        <span class="score-pill">Progress ${c.setupProgress ?? '—'}%</span>
      </div>
    </div>`;
  }).join('');
}
