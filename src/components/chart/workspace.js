function getChartRightOffset() {
  // Full price ticks require a real scale, but future bars do not need a wide gutter.
  return window.matchMedia("(max-width: 720px)").matches ? 0 : 1;
}

function chartAxisPrecision(price) {
  const value = Math.abs(Number(price) || 0);
  return value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
}

function formatChartAxisPrice(price) {
  const digits = state.chartAxisDigits ?? 2;
  return Number(price).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function formatChartVolume(volume) {
  const value = Math.abs(Number(volume));
  if (value >= 1e9) return `${Number((volume / 1e9).toFixed(1))}B`;
  if (value >= 1e6) return `${Number((volume / 1e6).toFixed(0))}M`;
  if (value >= 1e3) return `${Number((volume / 1e3).toFixed(0))}k`;
  return String(Math.round(volume));
}

function refreshChartPriceViewport() {
  // Reapplying the provider invalidates the library's autoscale cache.
  state.candleSeries?.applyOptions({ autoscaleInfoProvider: chartPriceAutoscale });
  document.dispatchEvent(new Event('ox:chartpriceview'));
}

function chartPriceAutoscale(original) {
  const info = original();
  if (!info) return info;
  state.chartAutoPriceRange = { ...info.priceRange };
  return state.chartPriceViewport ? { ...info, priceRange: { ...state.chartPriceViewport } } : info;
}

function enableMobileChartPriceGestures(container) {
  let gesture = null;
  const plot = target => !!target.closest('table > tbody > tr:first-child > td:first-child');
  const axis = target => !!target.closest('table > tbody > tr:first-child > td:last-child');
  const midpoint = touches => ({
    x: [...touches].reduce((sum, touch) => sum + touch.clientX, 0) / touches.length,
    y: [...touches].reduce((sum, touch) => sum + touch.clientY, 0) / touches.length
  });
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const start = event => {
    if (!window.matchMedia('(max-width:720px)').matches || (!plot(event.target) && !axis(event.target)) || event.touches.length > 2) return;
    if (document.querySelector('#view-radar .chart-drawing-layer.is-editing')) return;
    const priceHeight = container.clientHeight - (state.chart?.timeScale().height() || 0);
    const range = state.chartPriceViewport || state.chartAutoPriceRange;
    if (!range || priceHeight <= 0) return;
    const rect = container.getBoundingClientRect();
    const mid = midpoint(event.touches);
    gesture = { count: event.touches.length, axis: axis(event.target), startX: mid.x, startY: mid.y - rect.top,
      range: { ...range }, height: priceHeight, distance: event.touches.length === 2 ? distance(event.touches) : 0,
      direction: null };
    // The iOS price scale is narrow; handle its touch in the same viewport as the plot.
    if (gesture.axis) event.stopPropagation();
  };
  container.addEventListener('touchstart', start, { passive: true, capture: true });
  container.addEventListener('touchmove', event => {
    if (!gesture || (!plot(event.target) && !axis(event.target)) || !event.touches.length) return;
    if (gesture.axis) event.stopPropagation();
    if (event.touches.length !== gesture.count) { start(event); return; }
    const rect = container.getBoundingClientRect();
    const mid = midpoint(event.touches);
    const y = mid.y - rect.top;
    const span = gesture.range.maxValue - gesture.range.minValue;
    if (!Number.isFinite(span) || span <= 0) return;
    if (gesture.count === 1) {
      const dx = mid.x - gesture.startX, dy = y - gesture.startY;
      if (!gesture.direction && Math.max(Math.abs(dx), Math.abs(dy)) > 6) gesture.direction = gesture.axis || Math.abs(dy) > Math.abs(dx) * 1.1 ? 'vertical' : 'horizontal';
      if (gesture.direction !== 'vertical') return; // Horizontal pan stays with Lightweight Charts.
      const shift = dy / gesture.height * span;
      state.chartPriceViewport = { minValue: gesture.range.minValue + shift, maxValue: gesture.range.maxValue + shift };
    } else {
      const factor = Math.max(.1, Math.min(10, distance(event.touches) / (gesture.distance || 1)));
      const newSpan = span / factor;
      const anchor = gesture.range.maxValue - gesture.startY / gesture.height * span;
      const maxValue = anchor + y / gesture.height * newSpan;
      state.chartPriceViewport = { minValue: maxValue - newSpan, maxValue };
    }
    event.preventDefault();
    refreshChartPriceViewport();
  }, { passive: false, capture: true });
  container.addEventListener('touchend', event => { if (gesture?.axis) event.stopPropagation(); if (event.touches.length) start(event); else gesture = null; }, { passive: true, capture: true });
  container.addEventListener('touchcancel', event => { if (gesture?.axis) event.stopPropagation(); gesture = null; }, { passive: true, capture: true });
  container.addEventListener('dblclick', event => {
    if (event.target.closest('table > tbody > tr:first-child > td:last-child')) {
      state.chartPriceViewport = null;
      refreshChartPriceViewport();
    }
  }, true);
}

function applyChartFutureSpace(snapToLatest = false) {
  if (!state.chart) return;
  const ts = state.chart.timeScale();
  ts.applyOptions({ rightOffset: getChartRightOffset(), fixRightEdge: false, lockVisibleTimeRangeOnResize: true });
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
  if (!state.keyLevelsVisible || !state.candleSeries || document.body.classList.contains("chart-focus")) return;

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
      textColor: "#929995",
      attributionLogo: false
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
      rightOffset: getChartRightOffset(),
      barSpacing: window.matchMedia("(max-width: 720px)").matches ? 4.2 : 6,
      minBarSpacing: window.matchMedia("(max-width: 720px)").matches ? 2.0 : 2.5,
      fixRightEdge: false,
      lockVisibleTimeRangeOnResize: true
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { price: true, time: true }, axisDoubleClickReset: true },
    // Vertical swipes over the large mobile chart should move the page.
    // Horizontal drags still pan candles and pinch zoom remains available.
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
  });

  // Mobile only: use a smaller scale font while preserving the full price.
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
    wickDownColor: "#ff3078",
    // On narrow charts the native last-price badge sets the entire scale width.
    // A badge over the scale below keeps the full number without an empty column.
    lastValueVisible: !window.matchMedia("(max-width:720px)").matches,
    priceFormat: { type: "custom", minMove: 0.01, formatter: formatChartAxisPrice },
    autoscaleInfoProvider: chartPriceAutoscale
  });

  state.volumeSeries = state.chart.addHistogramSeries({
    priceFormat: { type: "custom", minMove: 1, formatter: formatChartVolume },
    priceScaleId: "vol"
  });
  state.chart.priceScale("vol").applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 }
  });

  const mobilePriceLabel = document.createElement('span');
  mobilePriceLabel.className = 'chart-mobile-last-price';
  mobilePriceLabel.setAttribute('aria-hidden', 'true');
  container.append(mobilePriceLabel);


  state.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    requestAnimationFrame(() => { updatePriceTimer(); updateKeyLevelVisualLabels(); });
    if (!range || state.isLoadingOlder || !state.hasMoreHistory || !state.candleData.length) return;
    if (range.from <= 12) loadMoreHistoricalCandles();
  });

  let mobileScale = window.matchMedia('(max-width:720px)').matches;
  new ResizeObserver(() => {
    const mobileNow = window.matchMedia('(max-width:720px)').matches;
    if (mobileNow !== mobileScale) {
      mobileScale = mobileNow;
      state.candleSeries.applyOptions({ lastValueVisible: !mobileNow });
      applyChartFutureSpace();
    }
    resizeChartToContainer();
    updatePriceTimer();
  }).observe(container);
  enableMobileChartPriceGestures(container);
}

async function loadSymbolCandles(isInitial = true) {
  if (state.activeMarket && state.activeMarket !== "crypto") return;
  state.abortCtrl?.abort();
  state.abortCtrl = new AbortController();
  const symbol = state.symbol, period = state.period;
  const overlay = document.getElementById("chart-loading");
  if (isInitial) overlay.classList.add("show");

  try {
    const raw = await BitgetAPI.fetchCandles(symbol, period, window.matchMedia("(max-width:720px)").matches ? 160 : 100);
    if (state.symbol !== symbol || state.period !== period) return;
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
  const symbol = state.symbol, period = state.period, oldest = state.oldestCandleTime;
  const overlay = document.getElementById("chart-loading");
  overlay.classList.add("show");

  try {
    const older = await BitgetAPI.fetchCandles(symbol, period, 200, (oldest - (periods[period] || 60)) * 1000);
    if (state.symbol !== symbol || state.period !== period || state.oldestCandleTime !== oldest) return;
    const previous = state.candleData;
    const genuinelyOlder = older.filter(c => c.time < oldest);
    if (!genuinelyOlder.length) {
      state.hasMoreHistory = false;
      return;
    }
    const visible = state.chart.timeScale().getVisibleLogicalRange();
    state.oldestCandleTime = genuinelyOlder[0].time;
    const combined = [...genuinelyOlder, ...previous];
    state.candleData = combined;
    renderChartData(combined, false, visible && {
      from: visible.from + genuinelyOlder.length,
      to: visible.to + genuinelyOlder.length
    });
  } catch (e) {
  } finally {
    state.isLoadingOlder = false;
    overlay.classList.remove("show");
  }
}

function renderChartData(candles, fitContent = false, preservedLogicalRange = null) {
  const priceScope = `${state.symbol}:${state.period}`;
  if (state.chartPriceScope !== priceScope) {
    state.chartPriceScope = priceScope;
    state.chartPriceViewport = null;
  }
  const digits = chartAxisPrecision(candles.at(-1)?.close);
  if (digits !== state.chartAxisDigits) {
    state.chartAxisDigits = digits;
    state.candleSeries.applyOptions({ priceFormat: { type: "custom", minMove: 10 ** -digits, formatter: formatChartAxisPrice } });
  }
  state.candleSeries.setData(candles);

  const volData = candles.map(c => ({
    time: c.time,
    value: c.quoteVolume || c.volume,
    color: c.close >= c.open ? "#00b8d440" : "#ff307840"
  }));
  state.volumeSeries.setData(volData);

  void refreshKeyLevels(candles);

  if (!document.body.classList.contains("chart-focus") && document.getElementById("chk-ox-markers").checked) {
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
  } else if (preservedLogicalRange) {
    state.chart.timeScale().setVisibleLogicalRange(preservedLogicalRange);
  }
  updatePriceTimer();
  requestAnimationFrame(updateKeyLevelVisualLabels);
  updateQuickStats();
  renderOxDetail();
  document.dispatchEvent(new Event('ox:chartdata'));
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
    // Draw the full last price without letting its badge widen the native scale.
    const badge = document.querySelector('#chart .chart-mobile-last-price');
    const y = state.candleSeries.priceToCoordinate(last.close);
    if (badge && Number.isFinite(y)) {
      badge.textContent = formatChartAxisPrice(last.close);
      badge.style.top = `${Math.max(20, Math.min(document.getElementById('chart').clientHeight - 26, y))}px`;
      badge.classList.toggle('is-up', last.close >= last.open);
    }
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
