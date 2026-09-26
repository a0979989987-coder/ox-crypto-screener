function getChartRightOffset() {
  return window.matchMedia("(max-width: 720px)").matches ? 12 : 12;
}

function applyChartFutureSpace(snapToLatest = false) {
  if (!state.chart) return;
  const ts = state.chart.timeScale();
  ts.applyOptions({ rightOffset: getChartRightOffset(), fixRightEdge: false, lockVisibleTimeRangeOnResize: false });
  if (snapToLatest) requestAnimationFrame(() => {
    try { ts.scrollToPosition(getChartRightOffset(), false); } catch (e) {}
  });
}

function clearKeyLevelPriceLines() {
  if (!state.candleSeries) return;
  for (const key of ["keyHighLine","keyLowLine","secondaryKeyHighLine","secondaryKeyLowLine"]) {
    if (state[key]) {
      try { state.candleSeries.removePriceLine(state[key]); } catch (e) {}
    }
    state[key] = null;
  }
}

function renderKeyLevelPriceLinesFromState() {
  clearKeyLevelPriceLines();
  if (!state.keyLevelsVisible || !state.candleSeries) return;

  const primary = state.currentLevels;
  if (primary?.high) {
    state.keyHighLine = state.candleSeries.createPriceLine({
      price: primary.high, color: "#f7bd52", lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false,
      title: `前高 ${primary.sourcePeriod || getKeyLevelPeriod()}`
    });
  }
  if (primary?.low) {
    state.keyLowLine = state.candleSeries.createPriceLine({
      price: primary.low, color: "#5ca5ff", lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false,
      title: `前低 ${primary.sourcePeriod || getKeyLevelPeriod()}`
    });
  }

  const secondary = state.secondaryLevels;
  if (secondary?.high) {
    state.secondaryKeyHighLine = state.candleSeries.createPriceLine({
      price: secondary.high, color: "rgba(247,189,82,.58)", lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false,
      title: `前高 ${secondary.sourcePeriod}`
    });
  }
  if (secondary?.low) {
    state.secondaryKeyLowLine = state.candleSeries.createPriceLine({
      price: secondary.low, color: "rgba(92,165,255,.58)", lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false,
      title: `前低 ${secondary.sourcePeriod}`
    });
  }
}

function syncKeyLevelVisibilityUI() {
  const checkbox = document.getElementById("chk-key-levels");
  const textEl = document.getElementById("key-level-toggle-text");
  if (checkbox) checkbox.checked = !!state.keyLevelsVisible;
  if (textEl) textEl.textContent = "前高前低";
}

function setKeyLevelsVisible(visible, { persist = true } = {}) {
  state.keyLevelsVisible = !!visible;
  if (persist) {
    try { localStorage.setItem("ox-chart-key-levels-visible", state.keyLevelsVisible ? "1" : "0"); } catch (e) {}
  }

  const layer = document.getElementById("chart-key-labels");
  if (state.keyLevelsVisible) {
    renderKeyLevelPriceLinesFromState();
    requestAnimationFrame(updateKeyLevelVisualLabels);
  } else {
    clearKeyLevelPriceLines();
    if (layer) layer.innerHTML = "";
  }
  syncKeyLevelVisibilityUI();
}

function updateKeyLevelVisualLabels() {
  const layer = document.getElementById("chart-key-labels");
  const chartEl = document.getElementById("chart");
  if (!layer || !chartEl || !state.candleSeries) return;
  if (!state.keyLevelsVisible) { layer.innerHTML = ""; return; }
  const levels = [];
  const add = (price, type, period, secondary = false) => {
    const y = price ? state.candleSeries.priceToCoordinate(price) : null;
    if (!Number.isFinite(y)) return;
    levels.push({ price, type, period, secondary, y });
  };
  add(state.currentLevels?.high, "high", state.currentLevels?.sourcePeriod || getKeyLevelPeriod(), false);
  add(state.currentLevels?.low, "low", state.currentLevels?.sourcePeriod || getKeyLevelPeriod(), false);
  if (state.secondaryLevels) {
    add(state.secondaryLevels.high, "high", state.secondaryLevels.sourcePeriod, true);
    add(state.secondaryLevels.low, "low", state.secondaryLevels.sourcePeriod, true);
  }

  const h = chartEl.clientHeight || 0;
  const last = state.candleData?.at(-1);
  const reservedY = last ? state.candleSeries.priceToCoordinate(last.close) : null;
  const isMobile = window.matchMedia("(max-width:720px)").matches;
  const gap = isMobile ? 19 : 23;
  const minLabelY = isMobile ? 46 : 14; // 手機右上角留給小型倒數，避免標籤互撞
  levels.sort((a,b) => a.y - b.y);

  let prevY = -Infinity;
  for (const item of levels) {
    let y = Math.max(minLabelY, Math.min(h - 14, item.y));
    if (Number.isFinite(reservedY) && Math.abs(y - reservedY) < gap) y = reservedY + (y <= reservedY ? -gap : gap);
    if (y - prevY < gap) y = prevY + gap;
    item.displayY = Math.max(minLabelY, Math.min(h - 14, y));
    prevY = item.displayY;
  }
  // If the last label was pushed past the bottom edge, shift the group back upward while preserving spacing.
  if (levels.length && levels.at(-1).displayY > h - 14) {
    const shift = levels.at(-1).displayY - (h - 14);
    levels.forEach(x => x.displayY = Math.max(minLabelY, x.displayY - shift));
  }

  layer.innerHTML = levels.map(item => {
    const cls = `chart-key-label ${item.type}${item.secondary ? " secondary" : ""}`;
    const label = `${item.type === "high" ? "前高" : "前低"} ${item.period} ${fmtPrice(item.price)}`;
    return `<span class="${cls}" style="top:${item.displayY}px">${label}</span>`;
  }).join("");
}

function initChart() {
  const container = document.getElementById("chart");
  state.chart = LightweightCharts.createChart(container, {
    width: container.clientWidth || 820,
    height: container.clientHeight || 440,
    layout: {
      background: { type: "solid", color: "#121417" },
      textColor: "#929995"
    },
    grid: {
      vertLines: { color: "#202725", visible: false },
      horzLines: { color: "#202725" }
    },
    rightPriceScale: {
      borderColor: "#343b37",
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.25 }
    },
    timeScale: {
      borderColor: "#343b37",
      timeVisible: true,
      secondsVisible: false,
      rightOffset: window.matchMedia("(max-width: 720px)").matches ? 12 : 12,
      barSpacing: window.matchMedia("(max-width: 720px)").matches ? 4.2 : 6,
      minBarSpacing: window.matchMedia("(max-width: 720px)").matches ? 2.0 : 2.5,
      fixRightEdge: false,
      lockVisibleTimeRangeOnResize: true
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    // Vertical swipes over the large mobile chart should move the page.
    // Horizontal drags still pan candles and pinch zoom remains available.
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
  });

  // Mobile only: keep price-axis text compact so the chart has more usable candle space.
  if (window.matchMedia("(max-width: 720px)").matches) {
    state.chart.applyOptions({
      layout: { fontSize: 9 },
      rightPriceScale: { borderColor: "#343b37", autoScale: true, scaleMargins: { top: 0.08, bottom: 0.25 } }
    });
  }

  // User chart reference (Display P3 converted to sRGB): cyan up, magenta down.
  state.candleSeries = state.chart.addCandlestickSeries({
    upColor: "#00b8d4",
    downColor: "#ff3078",
    borderVisible: false,
    wickUpColor: "#00b8d4",
    wickDownColor: "#ff3078"
  });

  state.volumeSeries = state.chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "vol"
  });
  state.chart.priceScale("vol").applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 }
  });


  state.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    requestAnimationFrame(() => { updatePriceTimer(); updateKeyLevelVisualLabels(); });
    if (!range || state.isLoadingOlder || !state.hasMoreHistory) return;
    if (range.from <= 2) loadMoreHistoricalCandles();
  });

  new ResizeObserver(() => {
    resizeChartToContainer();
  }).observe(container);
}

async function loadSymbolCandles(isInitial = true) {
  if (state.activeMarket && state.activeMarket !== "crypto") return;
  state.abortCtrl?.abort();
  state.abortCtrl = new AbortController();
  const overlay = document.getElementById("chart-loading");
  if (isInitial) overlay.classList.add("show");

  try {
    const raw = await BitgetAPI.fetchCandles(state.symbol, state.period, window.matchMedia("(max-width:720px)").matches ? 160 : 100);
    if (!raw.length) throw new Error("無可用 K 線");

    state.candleData = raw;
    state.oldestCandleTime = raw[0].time;
    state.hasMoreHistory = true;
    renderChartData(raw, isInitial);
  } catch (err) {
    if (err.name === "AbortError") return;
  } finally {
    overlay.classList.remove("show");
  }
}

async function loadMoreHistoricalCandles() {
  if (state.isLoadingOlder || !state.hasMoreHistory) return;
  state.isLoadingOlder = true;
  const overlay = document.getElementById("chart-loading");
  overlay.classList.add("show");

  try {
    const older = await BitgetAPI.fetchCandles(state.symbol, state.period, 100, (state.oldestCandleTime - 1) * 1000);
    if (!older.length) {
      state.hasMoreHistory = false;
      return;
    }

    state.oldestCandleTime = older[0].time;
    const combined = [...older, ...state.candleData].filter((c, i, a) => !i || c.time !== a[i - 1].time);
    state.candleData = combined;
    renderChartData(combined, false);
  } catch (e) {
  } finally {
    state.isLoadingOlder = false;
    overlay.classList.remove("show");
  }
}

function renderChartData(candles, fitContent = false) {
  state.candleSeries.setData(candles);

  const volData = candles.map(c => ({
    time: c.time,
    value: c.quoteVolume || c.volume,
    color: c.close >= c.open ? "#00b8d440" : "#ff307840"
  }));
  state.volumeSeries.setData(volData);

  void refreshKeyLevels(candles);

  if (document.getElementById("chk-ox-markers").checked) {
    const markers = [];
    for (let i = 20; i < candles.length - 1; i++) {
      const c = candles[i];
      const prev20 = candles.slice(i - 20, i);
      const prevHigh = Math.max(...prev20.map(x => x.high));
      const prevLow = Math.min(...prev20.map(x => x.low));
      const avgVol = prev20.reduce((s, x) => s + x.volume, 0) / prev20.length || 1;
      const ratio = c.volume / avgVol;
      if (c.close > prevHigh && ratio >= 1.45) {
        markers.push({ time:c.time, position:"belowBar", color:"#00b8d4", shape:"arrowUp", text:"▲", size:1 });
      } else if (c.close < prevLow && ratio >= 1.45) {
        markers.push({ time:c.time, position:"aboveBar", color:"#ff3078", shape:"arrowDown", text:"▼", size:1 });
      }
    }
    state.candleSeries.setMarkers(markers.slice(-6));
  } else {
    state.candleSeries.setMarkers([]);
  }

  if (fitContent) {
    state.chart.timeScale().fitContent();
    applyChartFutureSpace(true);
  } else {
    applyChartFutureSpace(false);
  }
  updatePriceTimer();
  requestAnimationFrame(updateKeyLevelVisualLabels);
  updateQuickStats();
  renderOxDetail();
}

function averageTrueRange(candles, period = 14) {
  if (!candles || candles.length < 3) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.length ? slice.reduce((a,b) => a + b, 0) / slice.length : 0;
}

function findStructuralPivotLevels(candles, sourcePeriod) {
  if (!candles || candles.length < 12) return { high:0, low:0, highTime:0, lowTime:0 };

  // 不使用「最近 N 根的最高/最低」；改用已確認的局部 Swing High / Swing Low。
  // 這樣週線不會直接抓到很久以前的絕對高點，而是抓近期結構真正要突破的前高。
  const completed = candles.slice(0, -1); // 排除尚未收盤的當前 K
  const span = sourcePeriod === "1W" ? 2 : sourcePeriod === "1D" ? 2 : 3;
  const atr = averageTrueRange(completed, 14) || 0;
  const highs = [];
  const lows = [];

  for (let i = span; i < completed.length - span; i++) {
    const c = completed[i];
    const left = completed.slice(i - span, i);
    const right = completed.slice(i + 1, i + span + 1);

    const isHigh = left.every(x => c.high > x.high) && right.every(x => c.high >= x.high);
    const isLow = left.every(x => c.low < x.low) && right.every(x => c.low <= x.low);

    if (isHigh) {
      const wingLow = Math.max(Math.min(...left.map(x => x.low)), Math.min(...right.map(x => x.low)));
      const prominence = c.high - wingLow;
      if (!atr || prominence >= atr * 0.55) highs.push({ price:c.high, time:c.time, index:i });
    }
    if (isLow) {
      const wingHigh = Math.min(Math.max(...left.map(x => x.high)), Math.max(...right.map(x => x.high)));
      const prominence = wingHigh - c.low;
      if (!atr || prominence >= atr * 0.55) lows.push({ price:c.low, time:c.time, index:i });
    }
  }

  const current = candles[candles.length - 1].close;
  // 前高：優先找「目前價格上方、最近形成」的已確認 pivot high；若沒有，再用最近一個已確認前高。
  const overheadHighs = highs.filter(p => p.price > current * 1.0005);
  const highPick = (overheadHighs.length ? overheadHighs : highs).at(-1) || null;
  // 前低：優先找目前價格下方、最近形成的已確認 pivot low。
  const supportLows = lows.filter(p => p.price < current * 0.9995);
  const lowPick = (supportLows.length ? supportLows : lows).at(-1) || null;

  return {
    high: highPick?.price || 0,
    low: lowPick?.price || 0,
    highTime: highPick?.time || 0,
    lowTime: lowPick?.time || 0
  };
}

async function refreshKeyLevels(chartCandles) {
  if (!state.candleSeries) return;
  const symbolAtRequest = state.symbol;
  const sourcePeriods = getKeyLevelPeriods();

  clearKeyLevelPriceLines();
  state.currentLevels = { high:0, low:0, sourcePeriod:sourcePeriods[0], highTime:0, lowTime:0 };
  state.secondaryLevels = null;
  updateAlertButtons();
  updateQuickStats();

  try {
    const results = [];
    for (const sourcePeriod of sourcePeriods) {
      const sourceCandles = state.period === sourcePeriod
        ? chartCandles
        : await BitgetAPI.fetchCandles(symbolAtRequest, sourcePeriod, 100);

      if (state.symbol !== symbolAtRequest || !getKeyLevelPeriods().includes(sourcePeriod)) return;
      results.push({ sourcePeriod, levels: findStructuralPivotLevels(sourceCandles, sourcePeriod) });
    }

    const primary = results[0];
    state.currentLevels = { ...primary.levels, sourcePeriod: primary.sourcePeriod };


    if (results[1]) {
      const secondary = results[1];
      state.secondaryLevels = { ...secondary.levels, sourcePeriod: secondary.sourcePeriod };
    }

    renderKeyLevelPriceLinesFromState();
    updateAlertButtons();
    updateQuickStats();
    renderOxDetail();
    requestAnimationFrame(updateKeyLevelVisualLabels);
  } catch (e) {
    console.warn("關鍵前高/前低取得失敗", symbolAtRequest, sourcePeriods, e);
  }
}

function updatePriceTimer() {
  const timerEl = document.getElementById("price-timer");
  if (!state.candleData.length || !timerEl) return;
  const last = state.candleData[state.candleData.length - 1];
  const step = periods[state.period] || 60;
  const now = Math.floor(Date.now() / 1000);
  const left = step - (now % step);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const mobile = window.matchMedia("(max-width:720px)").matches;

  if (mobile) {
    // 手機價格軸已顯示即時價格，中央不再重複放大型價格卡；倒數固定在安全的右上角。
    const shortTime = h > 0 ? `${h}h ${String(m).padStart(2,"0")}m` : `${Math.max(1, m)}m`;
    if (timerEl.textContent !== shortTime) timerEl.innerHTML = `<small>${shortTime}</small>`;
    if (timerEl.style.top !== "7px") timerEl.style.top = "7px";
    if (timerEl.style.transform !== "none") timerEl.style.transform = "none";
    return;
  }

  const timeStr = `${h > 0 ? `${h}h ` : ''}${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  const y = state.candleSeries.priceToCoordinate(last.close);
  timerEl.style.transform = "translateY(-50%)";
  timerEl.innerHTML = `${fmtPrice(last.close)}<small>倒數 ${timeStr}</small>`;
  if (Number.isFinite(y)) {
    timerEl.style.top = `${Math.max(16, Math.min(document.getElementById("chart").clientHeight - 24, y))}px`;
  }
}
