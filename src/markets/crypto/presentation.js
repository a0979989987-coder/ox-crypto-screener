function renderBenchmarkBar() {
  const btc = state.btcTicker;
  const eth = state.ethTicker;
  if (btc) {
    document.getElementById("bench-btc-price").textContent = fmtPrice(btc.lastPr);
    const e = document.getElementById("bench-btc-change"); e.textContent = fmtPct(btc.change24h); e.className = num(btc.change24h) >= 0 ? "positive" : "negative";
  }
  if (eth) {
    document.getElementById("bench-eth-price").textContent = fmtPrice(eth.lastPr);
    const e = document.getElementById("bench-eth-change"); e.textContent = fmtPct(eth.change24h); e.className = num(eth.change24h) >= 0 ? "positive" : "negative";
  }
  const btcA = state.analyzedCache.get("BTCUSDT");
  const ethA = state.analyzedCache.get("ETHUSDT");
  const trendText = x => !x ? "等待分析" : x.side === "LONG" ? "結構偏多" : x.side === "SHORT" ? "結構偏空" : "中性";
  document.getElementById("bench-btc-trend").textContent = trendText(btcA);
  document.getElementById("bench-eth-trend").textContent = trendText(ethA);
  const bias = document.getElementById("market-bias");
  if (btcA?.side === "LONG" && ethA?.side === "LONG") { bias.textContent = "Risk On"; bias.className = "positive"; }
  else if (btcA?.side === "SHORT" && ethA?.side === "SHORT") { bias.textContent = "Risk Off"; bias.className = "negative"; }
  else { bias.textContent = "Neutral"; bias.className = ""; }
}

function updateQuickStats() {
  const ticker = state.tickers.find(t => t.symbol === state.symbol);
  if (!ticker) return;
  const chg = document.getElementById("quick-change");
  chg.textContent = fmtPct(ticker.change24h); chg.className = num(ticker.change24h) >= 0 ? "positive" : "negative";
  document.getElementById("quick-volume").textContent = `${fmtCryptoVolume(ticker.usdtVolume)} USDT`;
  const secondaryHigh = state.secondaryLevels?.high ? ` / ${fmtPrice(state.secondaryLevels.high)} · ${state.secondaryLevels.sourcePeriod}` : "";
  const secondaryLow = state.secondaryLevels?.low ? ` / ${fmtPrice(state.secondaryLevels.low)} · ${state.secondaryLevels.sourcePeriod}` : "";
  document.getElementById("quick-high").textContent = state.currentLevels.high ? `${fmtPrice(state.currentLevels.high)} · ${state.currentLevels.sourcePeriod || getKeyLevelPeriod()}${secondaryHigh}` : "—";
  document.getElementById("quick-low").textContent = state.currentLevels.low ? `${fmtPrice(state.currentLevels.low)} · ${state.currentLevels.sourcePeriod || getKeyLevelPeriod()}${secondaryLow}` : "—";
}

function renderOxDetail() {
  const symbol = state.symbol;
  const ticker = state.tickers.find(t => t.symbol === symbol);
  const scored = state.analyzedCache.get(symbol);
  const isBenchmark = benchmarkSymbols.has(symbol);
  document.getElementById("detail-symbol").textContent = symbol;
  document.getElementById("detail-volume").textContent = ticker ? `${fmtCryptoVolume(ticker.usdtVolume)} USDT` : "—";
  const primaryLevelText = `${state.currentLevels.sourcePeriod || getKeyLevelPeriod()}｜${state.currentLevels.high ? fmtPrice(state.currentLevels.high) : '—'} / ${state.currentLevels.low ? fmtPrice(state.currentLevels.low) : '—'}`;
  const secondaryLevelText = state.secondaryLevels
    ? ` · ${state.secondaryLevels.sourcePeriod}｜${state.secondaryLevels.high ? fmtPrice(state.secondaryLevels.high) : '—'} / ${state.secondaryLevels.low ? fmtPrice(state.secondaryLevels.low) : '—'}`
    : "";
  document.getElementById("detail-levels").textContent = primaryLevelText + secondaryLevelText;

  if (!scored) {
    document.getElementById("detail-tier").textContent = isBenchmark ? "Benchmark" : "等待分析";
    for (const id of ["detail-ox","detail-liq","detail-flow","detail-structure","detail-rs","detail-setup","detail-side","detail-progress-text","detail-confidence","detail-trigger"]) {
      document.getElementById(id).textContent = isBenchmark && id === "detail-side" ? "Benchmark" : "—";
    }
    document.getElementById("detail-progress-bar").style.width = "0%";
    document.getElementById("detail-reasons-list").innerHTML = `<div class="detail-reason wait">${isBenchmark ? 'BTC / ETH 作為市場基準，不參與 T1 / T2 / T3 排名。' : '等待全市場輪巡完成這顆幣的分析。'}</div>`;
    updateAlertButtons();
    return;
  }

  const ranked = [...(state.tierMap.t1||[]), ...(state.tierMap.t2||[]), ...(state.tierMap.t3||[])].find(x => x.symbol === symbol);
  const shownTier = ranked?.displayTier || scored.tier;
  const status = ranked?.rankStatus || (scored.tier === "t1" ? "CONFIRMED" : scored.tier === "t2" ? "READY" : scored.tier === "t3" ? "EARLY" : "WATCH");
  document.getElementById("detail-tier").textContent = isBenchmark ? "Benchmark" : `${shownTier.toUpperCase()} ${status}`;
  document.getElementById("detail-ox").textContent = scored.oxScore;
  document.getElementById("detail-liq").textContent = `${scored.liqScore} / 100`;
  document.getElementById("detail-flow").textContent = `${scored.flowScore} / 100`;
  document.getElementById("detail-structure").textContent = scored.structureLabel || scored.side;
  document.getElementById("detail-rs").textContent = `${scored.rsScore} / 100`;
  document.getElementById("detail-setup").textContent = scored.setupName;
  document.getElementById("detail-side").textContent = scored.side;
  document.getElementById("detail-progress-text").textContent = `${scored.setupProgress ?? 0}%`;
  document.getElementById("detail-progress-bar").style.width = `${scored.setupProgress ?? 0}%`;
  document.getElementById("detail-progress-bar").style.setProperty("--meter-color", (scored.setupProgress ?? 0) < 40 ? "var(--meter-weak)" : (scored.setupProgress ?? 0) < 70 ? "var(--meter-mid)" : "var(--meter-strong)");
  document.getElementById("detail-confidence").textContent = `${scored.signalConfidence ?? 0}%`;
  document.getElementById("detail-trigger").textContent = scored.triggerActive ? scored.triggerType : "等待確認";

  const reasons = [
    { ok: scored.liqScore >= 55, text: `24H USDT 成交量 ${fmtCryptoVolume(scored.quoteVol)}，市場前 ${scored.liqPercentile}%` },
    { ok: scored.volRatio1h >= 1.25, text: `1H Volume Ratio ${scored.volRatio1h ?? '—'}x` },
    { ok: scored.structScore >= 60, text: `結構 ${scored.structureLabel || scored.side}` },
    { ok: scored.rsScore >= 55, text: `Relative Strength ${scored.rsScore}` },
    { ok: scored.triggerActive, text: scored.triggerActive ? `Trigger：${scored.triggerType}` : "Trigger 尚待確認" }
  ];
  document.getElementById("detail-reasons-list").innerHTML = reasons.map(r => `<div class="detail-reason ${r.ok ? 'ok' : 'wait'}">${r.ok ? '✓' : '△'} ${r.text}</div>`).join('');
  updateAlertButtons();
}

function updateRadarMarketGlow() {
  const radar = document.getElementById("view-radar");
  if (!radar) return;
  if (radar.dataset.selectedSymbol !== state.symbol) {
    delete radar.dataset.priceDirection;
    delete radar.dataset.glowLevel;
    return;
  }
  const ticker = state.tickers.find(t => t.symbol === state.symbol);
  if (!ticker) {
    delete radar.dataset.priceDirection;
    delete radar.dataset.glowLevel;
    return;
  }
  const change = num(ticker.change24h);
  const magnitude = Math.abs(change);
  radar.dataset.priceDirection = change < 0 ? "down" : "up";
  radar.dataset.glowLevel = magnitude >= 0.25 ? "3" : magnitude >= 0.10 ? "2" : "1";
}

function updateHeaderHUD() {
  const ticker = state.tickers.find(t => t.symbol === state.symbol);
  updateRadarMarketGlow();
  if (!ticker) return;

  document.getElementById("ticker-pair").textContent = `${ticker.symbol} · Bitget 永續`;
  document.getElementById("price").textContent = fmtPrice(ticker.lastPr);
  const focusPrice = document.getElementById("chart-focus-price");
  if (focusPrice) focusPrice.textContent = fmtPrice(ticker.lastPr);
  
  const chgEl = document.getElementById("change");
  chgEl.textContent = fmtPct(ticker.change24h);
  chgEl.className = num(ticker.change24h) >= 0 ? "positive" : "negative";

  document.getElementById("quote").textContent = `${fmtCryptoVolume(ticker.usdtVolume)} USDT`;
  document.getElementById("chart-head-title").children[0].textContent = `${ticker.symbol} 永續合約`;

  const scored = state.analyzedCache.get(state.symbol);
  if (scored) {
    document.getElementById("ox-score").textContent = scored.oxScore;
    document.getElementById("ox-tier-label").textContent = `${scored.statusText} · 結構:${scored.structScore}`;
    document.getElementById("ox-setup").textContent = scored.setupName;
    document.getElementById("ox-rs-desc").textContent = `RS: ${scored.rsScore} (${scored.side})`;
    document.getElementById("quote-rank").textContent = `全市場前 ${scored.liqPercentile}%`;
  } else {
    document.getElementById("ox-score").textContent = "—";
    document.getElementById("ox-tier-label").textContent = "全市場輪巡佇列中";
    document.getElementById("ox-setup").textContent = "等待分析";
    document.getElementById("ox-rs-desc").textContent = "—";
    document.getElementById("quote-rank").textContent = "評估中…";
  }

  if (state.btcTicker) {
    const diff = num(ticker.change24h) - num(state.btcTicker.change24h);
    document.getElementById("btc-rel").textContent = `相對 BTC: ${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(2)}%`;
  }
  updateQuickStats();
  renderOxDetail();
  renderBenchmarkBar();
  renderHomeOverview();
}

function switchSymbol(symbol) {
  if (state.activeView !== "radar") switchAppView("radar");
  document.getElementById("view-radar")?.setAttribute("data-selected-symbol", symbol);
  if (symbol === state.symbol) { updateHeaderHUD(); return; }
  state.symbol = symbol;
  state.currentLevels = { high: 0, low: 0, sourcePeriod: getKeyLevelPeriod(), highTime: 0, lowTime: 0 };
  state.secondaryLevels = null;
  updateHeaderHUD();
  renderCurrentTab();
  document.querySelector('#screener-list .coin-card.selected')?.classList.add('ox-coin-new-selection');
  updateAlertButtons();
  loadSymbolCandles(true);
}




/* ===== v3.6 feature pack: watchlist / local account / market architecture / home BTC mini chart ===== */
