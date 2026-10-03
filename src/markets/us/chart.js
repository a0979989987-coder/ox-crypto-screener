import { evaluateClassic, compareClassic } from '../../core/classic.js?v=20261002-rank8';
import { USAdapter } from "./provider.js?v=20261003-us-bitget1";
import { INTERVALS, countdown, sessionAt, nyParts } from "./calendar.js?v=20261001-us-eod1";
import { mergeCandles, movingAverage, vwap } from "./model.js?v=20261003-us-bitget1";
import { icon, positionTimeframe, openDialog, closeDialog } from "./ui.js?v=20261001-us-eod1";
import { sourceInfo, nativeAllowed } from "./view-utils.js?v=20261003-us-bitget1";
import { subscribeEquity } from './live-equity.js?v=20261003-us-bitget1';
import { perpetualCountdown } from './binance-equity.js?v=20261003-us-bitget1';
const UP = "#00b8d4",
  DOWN = "#ff3078";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  Number(n).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
const stored = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const put = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const viewports = new Map();
export class USChart {
  constructor(
    root,
    {
      symbol = "SPY",
      interval = "1D",
      capabilities = {},
      onState = () => {},
      onInterval = () => {},
      onCollapse = null,
      onTierFilter = () => {},
    } = {},
  ) {
    this.root = root;
    this.guide = null;
    this.symbol = symbol;
    this.interval = interval;
    this.capabilities = capabilities;
    this.onState = onState;
    this.onInterval = onInterval;
    this.onCollapse = onCollapse;
    this.bars = [];
    this.request = 0;
    this.extended = false;
    this.disposed = false;
    this.drawings = [];
    this.tool = "cursor";
    this.selected = -1;
    this.color = "#f4f0e8";
    this.width = 2;
    this.magnet = true;
    this.ma = false;
    this.vwap = false;
    const savedFrames = stored('ox-us-v2-chart-timeframes', null);
    this.allowedFrames = capabilities.intervals || INTERVALS;
    if (!this.allowedFrames.includes(this.interval)) this.interval = this.allowedFrames.includes('1D') ? '1D' : this.allowedFrames[0];
    this.frames=(capabilities.mode === 'eod' ? this.allowedFrames : Array.isArray(savedFrames) ? savedFrames : ['1m','15m','1H','1D']).filter(tf=>this.allowedFrames.includes(tf));
    if(!this.frames.length)this.frames=[this.interval];
    root.innerHTML = `<div class="chart-controls us2-chart-toolbar"><div class="ctrl-group chart-timeframe-group"><div class="chart-timeframe-strip us2-timeframes" aria-label="圖表時間級別"><span class="tf-glass-indicator" aria-hidden="true"></span>${INTERVALS.map((tf,i)=>`<button class="btn-tf ${tf===interval?"active":""}" type="button" data-tf="${tf}" aria-pressed="${tf===interval}">${tf}${i===INTERVALS.length-1?'<span class="tf-hint">▾</span>':''}</button>`).join("")}</div></div><div class="ctrl-group chart-tool-actions"><button class="chart-tool-icon us2-indicator-open" type="button" data-indicator-open aria-label="指標與時段設定" aria-haspopup="dialog">${icon("settings")}</button>${onCollapse?`<button class="chart-tool-icon us2-list-toggle" type="button" data-collapse aria-label="收起／展開雷達清單">${icon("collapse")}</button>`:""}<button class="chart-tool-icon ox-chart-expand-dot us2-expand-control" type="button" data-expand aria-label="展開圖表">${icon("expand")}</button></div></div><button class="us2-focus-exit chart-tool-icon" data-exit-focus aria-label="收合圖表" hidden>${icon("expand")}</button>
      <div class="us2-chart-stage chart-container"><div class="us2-chart-canvas"></div><svg class="us2-drawings" aria-label="型態關鍵線"></svg><div class="us2-ohlc" role="status"></div><div class="chart-current-price" hidden><span class="chart-current-price-line"></span><div class="chart-mobile-last-price us2-price-label"><strong></strong><small></small></div></div><div class="us2-chart-message" role="status">取得歷史 OHLCV…</div><button class="chart-tool-icon us2-latest" data-latest title="回到最新行情" aria-label="回到最新行情">${icon("latest")}</button></div>
      <dialog class="chart-tools-dialog us2-indicators-dialog" aria-label="指標與時段設定"><header><b>指標與交易時段</b><button data-close-indicators aria-label="關閉指標選單">${icon("close")}</button></header><div class="chart-indicator-options"><button class="chart-indicator-option" data-ma aria-pressed="false">MA20／50</button><button class="chart-indicator-option" data-vwap aria-pressed="false" title="依 OHLCV 加權估計，非逐筆 VWAP" ${capabilities.mode === "eod" ? "hidden" : ""}>VWAP 估計</button><select data-session aria-label="交易時段" ${["eod","perpetual"].includes(capabilities.mode) ? "hidden" : ""}><option value="regular">正常盤</option><option value="extended" ${capabilities.extendedHours ? "" : "disabled"}>含盤前盤後${capabilities.extendedHours ? "" : " · 權限未確認"}</option></select><button data-retry>重新取得行情</button></div><div class="chart-tier-filter" data-us-tier-filter></div><details class="us2-chart-source"><summary>來源與資料口徑</summary><div class="us2-chart-meta"></div><div class="us2-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a> · <a data-provider-credit href="https://verdenroz.github.io/finance-query/" target="_blank" rel="noopener">Finance Query / Yahoo</a></div></details></dialog><dialog class="chart-tools-dialog us2-timeframe-dialog" aria-label="時間級別"><header><b>時間級別</b><button data-close-timeframes aria-label="關閉時間級別">${icon("close")}</button></header><div class="chart-timeframe-preferences">${INTERVALS.map(tf=>`<label class="chart-choice"><input type="checkbox" value="${tf}" ${this.frames.includes(tf)?"checked":""}><span>${tf}</span></label>`).join("")}</div><button class="chart-tools-save" data-save-timeframes>儲存時間級別</button></dialog>`;
    this.tierFilters=globalThis.OXTierFilters?.mount(root.querySelector('[data-us-tier-filter]'),{market:'us',frames:this.allowedFrames,onChange:onTierFilter});
    this.message = root.querySelector(".us2-chart-message");
    this.svg = root.querySelector(".us2-drawings");
    const LC = globalThis.LightweightCharts;
    if (!LC) {
      this.message.textContent = "圖表程式尚未載入；請重新載入頁面。";
      return;
    }
    const container = root.querySelector(".us2-chart-canvas");
    this.chart = LC.createChart(container, {
      width: Math.max(100, container.clientWidth),
      height: container.clientHeight || 380,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#aeb3b3",
        fontSize: 10,
        // The shared source dialog and OX settings retain the required attribution.
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#ffffff0b" },
      },
      timeScale: {
        timeVisible: !["1D", "1W", "1M"].includes(interval),
        rightOffset: 4,
        barSpacing: 7,
        minBarSpacing: 2,
        lockVisibleTimeRangeOnResize: true,
      },
      rightPriceScale: {
        scaleMargins: { top: 0.12, bottom: 0.24 },
        minimumWidth: 58,
      },
      crosshair: { mode: LC.CrosshairMode.Normal },
      handleScroll: {
        pressedMouseMove: true,
        horzTouchDrag: !globalThis.OXChartGestures,
        vertTouchDrag: false,
        mouseWheel: true,
      },
      handleScale: {
        pinch: !globalThis.OXChartGestures,
        mouseWheel: true,
        axisPressedMouseMove: { price: true, time: true },
      },
      localization: {
        locale: "zh-TW",
        timeFormatter: (t) => {
          const n = typeof t === "number" ? t : Date.parse(t) / 1000;
          return new Intl.DateTimeFormat("zh-TW", {
            timeZone: ["1D", "1W", "1M"].includes(this.interval)
              ? "America/New_York"
              : "Asia/Taipei",
            dateStyle: "short",
            ...(["1D", "1W", "1M"].includes(this.interval)
              ? {}
              : { timeStyle: "short" }),
          }).format(n * 1000);
        },
      },
    });
    this.series = this.chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const owner = this;
    this.gestureState = {
      get chart() { return owner.chart; },
      get candleSeries() { return owner.series; },
      get candleData() { return owner.bars; },
      chartPriceViewport: null,
      chartPriceViewportMargins: null,
    };
    this.autoscale = original => {
      const info = original();
      if (!info) return info;
      this.gestureState.chartAutoPriceMargins = info.margins || { above: 0, below: 0 };
      return this.gestureState.chartPriceViewport ? { ...info,
        priceRange: { ...this.gestureState.chartPriceViewport },
        margins: this.gestureState.chartPriceViewportMargins } : info;
    };
    this.series.applyOptions({ autoscaleInfoProvider: this.autoscale });
    this.gestures = globalThis.OXChartGestures?.({ container,
      state: this.gestureState, formatPrice: money,
      getRange: () => this.getPriceRange(),
      setRange: range => this.setPriceRange(range),
      refreshRange: () => this.refreshPriceRange(),
      isDrawing: () => root.querySelector('.chart-drawing-layer.is-editing'),
    });
    this.volume = this.chart.addHistogramSeries({
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    this.volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.ma20 = this.chart.addLineSeries({
      color: "#e9dcc5",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
    });
    this.ma50 = this.chart.addLineSeries({
      color: "#8b969f",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
    });
    this.vwapSeries = this.chart.addLineSeries({
      color: "#76a9ca",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
    });
    this.chart.subscribeCrosshairMove((p) => {
      const c = p.seriesData?.get(this.series);
      this.ohlc(c ? this.bars.find(bar => bar.time === c.time) || c : this.bars.at(-1));
      this.scheduleOverlay();
    });
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.scheduleOverlay();
      if (
        range &&
        range.from < 15 &&
        this.bars.length &&
        !this.loading &&
        !this.historyLoading &&
        !this.historyExhausted
      )
        this.loadOlder();
    });
    this.ro = new ResizeObserver(() => {
      if (this.disposed || this.resizeFrame) return;
      // WebKit reports an observer loop if LWC updates its canvas inside the
      // resize notification. Batch it into the next frame and skip equal sizes.
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        if (this.disposed) return;
        const width = container.clientWidth, height = container.clientHeight;
        if (this.lastWidth !== width || this.lastHeight !== height) {
          this.lastWidth = width; this.lastHeight = height;
          this.chart.resize(width, height);
        }
        this.draw(); this.priceTimer(); positionTimeframe(root);
      });
    });
    this.ro.observe(container);
    this.overlayEvents = new AbortController();
    for (const name of ["pointermove", "pointerdown", "wheel", "touchmove"])
      container.addEventListener(name, () => this.scheduleOverlay(), {passive:true, signal:this.overlayEvents.signal});
    const frameDialog=root.querySelector(".us2-timeframe-dialog");
    frameDialog.querySelectorAll('input').forEach(input => {
      input.disabled = !this.allowedFrames.includes(input.value);
      if (input.disabled) input.checked = false;
    });
    root.querySelector('.chart-timeframe-strip').onclick=event=>{
      const button=event.target.closest('[data-tf]');if(!button)return;
      if(button.dataset.tf===this.interval&&button.querySelector(".tf-hint")) openDialog(frameDialog,button);
      else this.change({interval:button.dataset.tf});
    };
    root.querySelector('[data-save-timeframes]').onclick=()=>{
      const chosen=[...frameDialog.querySelectorAll('input:checked')].map(x=>x.value).filter(tf => this.allowedFrames.includes(tf));
      this.frames=chosen.length?chosen:[this.interval];put('ox-us-v2-chart-timeframes',this.frames);
      this.renderTimeframes();closeDialog(frameDialog);
    };
    this.renderTimeframes();
    root.querySelector("[data-close-timeframes]").onclick=()=>closeDialog(frameDialog);
    const indicatorDialog=root.querySelector(".us2-indicators-dialog");
    root.querySelector("[data-indicator-open]").onclick=event=>openDialog(indicatorDialog,event.currentTarget);
    root.querySelector("[data-close-indicators]").onclick=()=>closeDialog(indicatorDialog);
    root.querySelector("[data-collapse]")?.addEventListener("click",()=>{onCollapse?.();this.draw();});
    const focus=()=>{
      const expanded=root.classList.toggle("us2-chart-full");
      document.body.classList.toggle("us2-chart-focus",expanded);
      root.querySelector("[data-exit-focus]").hidden=!expanded;
      root.querySelector("[data-expand]").setAttribute("aria-pressed",expanded);
      this.sharedDrawings?.sync();this.draw();
    };
    root.querySelector("[data-expand]").onclick=focus;
    root.querySelector("[data-exit-focus]").onclick=focus;
    positionTimeframe(root,true);
    root.querySelector("[data-session]").onchange = (e) =>
      this.change({ extended: e.target.value === "extended" });
    root.querySelector("[data-latest]").onclick = () => {
      this.gestureState.chartPriceViewport = null;
      this.gestureState.chartPriceViewportMargins = null;
      this.refreshPriceRange();
      this.chart.timeScale().scrollToRealTime();
    };
    root.querySelector("[data-ma]").onclick = (e) => {
      this.ma = !this.ma;
      e.currentTarget.setAttribute("aria-pressed", this.ma);
      this.indicators();
    };
    root.querySelector("[data-vwap]").onclick = (e) => {
      this.vwap = !this.vwap;
      e.currentTarget.setAttribute("aria-pressed", this.vwap);
      this.indicators();
    };
    root.querySelector("[data-retry]").onclick = () => this.load(true);
    if (this.capabilities.mode !== "eod") this.timer = setInterval(() => this.priceTimer(), 1000);
    this.load();
  }
  getPriceRange() {
    const container = this.root.querySelector('.us2-chart-canvas');
    const height = container.clientHeight - this.chart.timeScale().height();
    const maxValue = this.series.coordinateToPrice(0), minValue = this.series.coordinateToPrice(height - 1);
    return Number.isFinite(minValue) && Number.isFinite(maxValue) && maxValue > minValue ? { minValue, maxValue } : null;
  }
  setPriceRange(range) {
    const state = this.gestureState, margins = this.chart.priceScale('right').options().scaleMargins;
    const extra = (state.chartPriceViewport ? state.chartPriceViewportMargins : state.chartAutoPriceMargins) || { above: 0, below: 0 };
    const height = this.root.querySelector('.us2-chart-canvas').clientHeight - this.chart.timeScale().height();
    if (height <= 1) return;
    const span = range.maxValue - range.minValue;
    state.chartPriceViewportMargins = extra;
    state.chartPriceViewport = {
      minValue: range.minValue + span * (height * margins.bottom + extra.below) / (height - 1),
      maxValue: range.maxValue - span * (height * margins.top + extra.above) / (height - 1),
    };
    this.refreshPriceRange();
  }
  refreshPriceRange() {
    this.chart.priceScale('right').applyOptions({ autoScale: true });
    this.series.applyOptions({ autoscaleInfoProvider: this.autoscale });
    this.scheduleOverlay();
    this.sharedDrawings?.sync();
  }
  mountDrawings() {
    if(!globalThis.OXChartDrawings)return;
    const source = this.result?.source || this.capabilities.source || 'finance-query-eod';
    const market=`us-v2-${source.replace(/[^a-z0-9-]/gi, '-')}`;
    const drawingKey=`ox-${market}-chart-drawings-v1`;
    if (this.drawingMarket && this.drawingMarket !== market) {
      this.sharedDrawings?.destroy(); this.sharedDrawings = null;
    }
    this.drawingMarket = market;
    // Existing Crypto component; only OHLCV getters and US-specific persistence are supplied.
    if(!this.sharedDrawings){
      // Migrate all existing US stocks before the component takes its storage snapshot.
      const saved=stored(drawingKey,{});
      try{for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i),match=/^ox-us-v2:drawings:([^:]+):twelve-data:(.+)$/.exec(key);
        if(!match || source !== 'twelve-data')continue;
        const scope=`${match[1]}:${match[2]}`,legacy=stored(key,[]);
        if(!saved[scope]&&Array.isArray(legacy)&&legacy.length)saved[scope]=legacy;
      }put(drawingKey,saved);}catch{}
      const owner=this;
      this.drawingState={get chart(){return owner.chart},get candleSeries(){return owner.series},get candleData(){return owner.bars},get symbol(){return owner.symbol},get period(){return owner.result?.adjustment||"unknown"}};
      this.sharedDrawings=globalThis.OXChartDrawings({box:this.root,chartEl:this.root.querySelector(".us2-chart-stage"),state:this.drawingState,market,isExpanded:()=>this.root.classList.contains("us2-chart-full")});
    }
    this.drawings=[];this.sharedDrawings.sync();
  }
  renderTimeframes() {
    const visible=this.frames.includes(this.interval)?this.frames:[...this.frames,this.interval];
    this.root.querySelector('.chart-timeframe-strip').innerHTML=visible.map((tf,i)=>`<button class="btn-tf ${tf===this.interval?'active':''}" type="button" data-tf="${tf}" aria-pressed="${tf===this.interval}" ${i===visible.length-1?'title="再次點擊設定時間級別"':''}>${tf}${i===visible.length-1?'<span class="tf-hint">▾</span>':''}</button>`).join('')+'<span class="tf-glass-indicator" aria-hidden="true"></span>';
    requestAnimationFrame(()=>{if(!this.disposed)positionTimeframe(this.root,true);});
  }
  setCapabilities(capabilities) {
    const previousInterval = this.interval;
    const previousSource = this.capabilities.source;
    const previousSession = this.capabilities.sessionDate;
    this.capabilities=capabilities;
    if(previousSource!==capabilities.source)this.stopLive();
    if (capabilities.mode === "eod") { clearTimeout(this.poll); clearInterval(this.timer); }
    this.allowedFrames = capabilities.intervals || INTERVALS;
    this.frames = this.frames.filter(tf => this.allowedFrames.includes(tf));
    if (!this.frames.length) this.frames = [this.allowedFrames.includes('1D') ? '1D' : this.allowedFrames[0]];
    if (!this.allowedFrames.includes(this.interval)) this.interval = this.frames[0];
    this.root.querySelectorAll('.chart-timeframe-preferences input').forEach(input => {
      input.disabled = !this.allowedFrames.includes(input.value);
      if (input.disabled) input.checked = false;
    });
    this.renderTimeframes();
    if (!nativeAllowed(capabilities)) {
      ++this.request;
      this.controller?.abort();
      this.loading = false;
      this.unavailable("盤後資料尚未開通公開使用；不載入盤中行情。", 403, "US_DATA_DISPLAY_RIGHTS_REQUIRED");
    }
    const option=this.root.querySelector('[data-session] option[value="extended"]');
    if(option){option.disabled=!capabilities.extendedHours;option.textContent=capabilities.extendedHours?'含盤前盤後':'含盤前盤後 · 權限未確認';}
    if (nativeAllowed(capabilities) && (previousInterval !== this.interval || previousSource !== capabilities.source || previousSession !== capabilities.sessionDate))
      this.change({ interval: this.interval });
  }
  unavailable(message, status = 0, code = null) {
    this.error = true;
    this.blocked = status === 403 || status === 451;
    if(this.blocked)this.stopLive();
    clearTimeout(this.poll);
    const empty = !this.bars.length;
    this.root.classList.toggle("is-blocked", this.blocked);
    this.root.classList.toggle("is-empty-chart", empty);
    const stage = this.root.querySelector(".us2-chart-stage");
    stage.classList.toggle("us2-empty-stage", empty);
    stage.classList.toggle("chart-container", !empty);
    if (empty) this.root.querySelector(".us2-ohlc").textContent = "";
    this.root.querySelector("[data-expand]").disabled = empty;
    this.message.hidden = false;
    this.message.textContent = `${empty ? "" : "保留前次資料 · "}${message}`;
    this.onState({ error: message, errorStatus: status, errorCode: code, bars: this.bars });
  }
  key() {
    return `ox-us-v2:drawings:${this.symbol}:${this.result?.source || this.capabilities.source || 'finance-query-eod'}:${this.result?.adjustment || "pending"}`;
  }
  persist() {
    put(this.key(), this.drawings);
  }
  viewportKey() {
    return `${this.capabilities.source || 'finance-query-eod'}:${this.symbol}:${this.interval}:${this.extended}:${this.result?.adjustment || 'pending'}`;
  }
  saveViewport() {
    const r = this.chart?.timeScale().getVisibleLogicalRange();
    if (r) viewports.set(this.viewportKey(), { logical: r,
      price: this.gestureState?.chartPriceViewport,
      margins: this.gestureState?.chartPriceViewportMargins });
  }
  async change({
    symbol = this.symbol,
    interval = this.interval,
    extended = this.extended,
  } = {}) {
    if (!this.chart) return;
    this.stopLive();
    this.saveViewport();
    ++this.request;
    this.controller?.abort();
    this.historyController?.abort();
    this.loading = false;
    this.historyLoading = false;
    clearTimeout(this.poll);
    this.guide = null;
    this.symbol = symbol;
    this.interval = interval;
    this.extended = extended;
    this.sharedDrawings?.sync();
    this.drawings = [];
    this.selected = -1;
    this.bars = [];
    this.result = null;
    this.gestureState.chartPriceViewport = null;
    this.gestureState.chartPriceViewportMargins = null;
    this.series.setData([]);
    this.volume.setData([]);
    this.ma20.setData([]);
    this.ma50.setData([]);
    this.vwapSeries.setData([]);
    this.chart.applyOptions({
      timeScale: { timeVisible: !["1D", "1W", "1M"].includes(interval) },
    });
    if(!this.root.querySelector(`[data-tf="${interval}"]`))this.renderTimeframes();
    this.root
      .querySelectorAll("[data-tf]")
      .forEach((b) =>
        {b.setAttribute("aria-pressed", b.dataset.tf === interval);b.classList.toggle("active",b.dataset.tf === interval);},
      );
    positionTimeframe(this.root,true);
    this.onInterval(interval);
    await this.load();
  }
  async load(force = false) {
    if (this.disposed || !this.chart || this.loading) return;
    if (!nativeAllowed(this.capabilities)) {
      this.unavailable("盤後資料尚未開通公開使用；不載入盤中行情。", 403, "US_DATA_DISPLAY_RIGHTS_REQUIRED");
      return;
    }
    const requestStartedAt=Date.now();
    const id = ++this.request,
      controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    if (!this.bars.length) {
      this.message.hidden = false;
      this.message.textContent = `載入 ${this.symbol} · ${this.interval}…`;
    }
    try {
      const first = !this.bars.length;
      const result = await USAdapter.candles(this.symbol, {
        interval: this.interval,
        extendedHours: this.extended,
        limit: first ? 400 : 8,
        signal: controller.signal,
        force,
        capabilities: this.capabilities,
      });
      if (this.disposed || id !== this.request) return;
      if (this.result && this.result.adjustment !== result.adjustment)
        throw Error("資料復權口徑改變，請重新載入圖表。");
      this.result = result;
      this.historyExhausted = first
        ? result.historyExhausted
        : this.historyExhausted;
      const existing=new Map(this.bars.map(bar=>[bar.time,bar]));
      // A slower REST resync must not overwrite a newer WebSocket candle.
      const receivedBars=result.bars.map(bar=>(this.liveVersions?.get(bar.time)||0)>requestStartedAt
        ? existing.get(bar.time)||bar : bar);
      this.applyBars(receivedBars, first);
      this.sharedDrawings?.sync();
      this.message.hidden = !result.stale;
      this.message.textContent = result.stale ? "更新暫停 · 保留前次收盤 K 線，可手動重試" : "";
      this.error = Boolean(result.stale);
      this.blocked = false;
      this.root.classList.remove("is-blocked","is-empty-chart");
      this.root.querySelector(".us2-chart-stage").classList.remove("us2-empty-stage");
      this.root.querySelector(".us2-chart-stage").classList.add("chart-container");
      this.root.querySelector("[data-expand]").disabled = false;
      if (first) {
        this.mountDrawings();
        this.draw();
      }
      this.root.querySelector(".us2-chart-meta").textContent =
        `${result.source} · ${result.feed} · ${result.mode==='perpetual'?'24/7 · UTC K 線':this.extended ? "含盤前盤後" : "正常盤"} · ${result.adjustment} · ${this.bars.length} 根 · ${result.volumeScope}`;
      const provider = sourceInfo(result.source), link = this.root.querySelector('.us2-attribution [data-provider-credit]');
      link.textContent = provider.label;
      if (provider.url) link.href = provider.url;
      else link.removeAttribute('href');
      this.onState({ ...result, bars: this.bars, error: null });
      this.startLive(result);
    } catch (e) {
      if (controller.signal.aborted || this.disposed || id !== this.request)
        return;
      const licenseRequired = e.code === "US_DATA_DISPLAY_RIGHTS_REQUIRED" || e.message.includes("對外展示授權");
      this.unavailable(licenseRequired
        ? "盤後資料尚未開通公開使用；不載入盤中行情。"
        : e.status === 429 ? "資料源暫時無法回應，請稍後手動重試" : e.message, e.status, licenseRequired ? "US_DATA_DISPLAY_RIGHTS_REQUIRED" : e.code);
    } finally {
      if (id === this.request) {
        this.loading = false;
        this.controller = null;
        this.schedule();
      }
    }
  }
  stopLive() {
    this.liveStop?.();this.liveStop=null;this.liveKey=null;
    clearTimeout(this.livePaint);this.livePaint=null;this.liveBar=null;
    this.liveVersions=new Map();
  }
  startLive(result) {
    if(!['binance-equity','bitget-equity'].includes(this.capabilities.stream)||!nativeAllowed(this.capabilities)||!result.contractSymbol)return;
    const key=`${result.contractSymbol}:${this.interval}`;
    if(this.liveKey===key)return;
    this.stopLive();this.liveKey=key;
    this.liveStop=subscribeEquity({source:this.capabilities.source,symbol:this.symbol,contractSymbol:result.contractSymbol,interval:this.interval,
      onStatus:status=>{this.liveStatus=status;this.priceTimer();},
      onReconnect:()=>{if(!this.disposed)this.load(true);},
      onQuote:quote=>{if(!this.disposed&&this.liveKey===key)this.onState({quote,stream:true,symbol:this.symbol});},
      onBar:(bar,eventTime)=>{
        if(this.disposed||this.liveKey!==key||bar.time<(this.bars.at(-1)?.time||0))return;
        this.liveVersions.set(bar.time,eventTime);
        while(this.liveVersions.size>8)this.liveVersions.delete(this.liveVersions.keys().next().value);
        this.liveBar=bar;
        if(this.livePaint)return;
        this.livePaint=setTimeout(()=>{
          this.livePaint=null;
          if(this.disposed||this.liveKey!==key||!this.liveBar)return;
          const next=this.liveBar;this.liveBar=null;
          this.applyBars([next]);this.error=false;
          if(this.result){this.result.stale=false;this.result.receivedAt=Date.now();}
          this.message.hidden=true;
        },250);
      },
    });
  }
  schedule() {
    clearTimeout(this.poll);
    if (this.disposed || this.blocked || this.capabilities.mode === "eod") return;
    if(this.capabilities.mode==='perpetual') {
      this.poll=setTimeout(()=>{if(!document.hidden)this.load(true);else this.schedule();},
        this.liveStatus==='live'?60000:this.error?60000:15000);
      return;
    }
    const s = sessionAt(),
      ms = this.error
        ? 120000
        : s.session === "closed"
          ? 300000
          : Math.max(60000, this.capabilities.pollMs || 60000);
    this.poll = setTimeout(() => {
      if (!document.hidden) this.load(true);
      else this.schedule();
    }, ms);
  }
  applyBars(next, first = false) {
    const old = this.bars,
      range = this.chart.timeScale().getVisibleLogicalRange();
    const oldLast = old.at(-1)?.time;
    const correction = next.some(
      (c) =>
        c.time < oldLast &&
        old.some(
          (x) =>
            x.time === c.time &&
            (x.close !== c.close ||
              x.high !== c.high ||
              x.low !== c.low ||
              x.volume !== c.volume),
        ),
    );
    this.bars = mergeCandles(old, next);
    const analysisBars=this.capabilities.mode==='perpetual'?this.bars.filter(c=>c.closeTime<Date.now()):this.bars;
    const analysisKey=this.capabilities.mode==='perpetual'?JSON.stringify(analysisBars.at(-1)):null;
    if(!analysisKey||this.analysisKey!==analysisKey) {
      this.classicSignal=["long","short"].map(side=>evaluateClassic(analysisBars,{side,frame:this.interval})).filter(s=>s.eligible).sort(compareClassic)[0]||null;
      this.analysisKey=analysisKey;
    }
    const vol = (c) => ({
      time: c.time,
      value: c.volume ?? 0,
      color: c.close >= c.open ? "#00b8d444" : "#ff307844",
    });
    if (first || correction) {
      this.series.setData(this.bars);
      this.volume.setData(this.bars.filter((c) => c.volume !== null).map(vol));
      if (!first && range) this.chart.timeScale().setVisibleLogicalRange(range);
    } else
      for (const c of next.filter((c) => c.time >= oldLast)) {
        this.series.update(c);
        if (c.volume !== null) this.volume.update(vol(c));
      }
    if (first) {
      const saved = viewports.get(this.viewportKey());
      this.chart.timeScale().setVisibleLogicalRange(
        saved?.logical || {
          from: Math.max(0, this.bars.length - (innerWidth < 600 ? 75 : 125)),
          to: this.bars.length + 3,
        },
      );
      this.gestureState.chartPriceViewport = saved?.price || null;
      this.gestureState.chartPriceViewportMargins = saved?.margins || null;
      this.refreshPriceRange();
    }
    this.indicators();
    this.sharedDrawings?.sync();
    this.ohlc(this.bars.at(-1));
    this.priceTimer();
    this.draw();
  }
  async loadOlder() {
    if (this.disposed || this.historyLoading || this.historyExhausted) return;
    this.historyLoading = true;
    const id = this.request,
      first = this.bars[0],
      controller = new AbortController();
    this.historyController = controller;
    try {
      const result = await USAdapter.candles(this.symbol, {
        interval: this.interval,
        extendedHours: this.extended,
        limit: 400,
        to: new Date((first.time - 1) * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
        signal: controller.signal,
        capabilities: this.capabilities,
      });
      if (this.disposed || id !== this.request) return;
      if (result.adjustment !== this.result.adjustment)
        throw Error("歷史資料口徑不一致。");
      const older = result.bars.filter((c) => c.time < first.time),
        range = this.chart.timeScale().getVisibleLogicalRange();
      this.historyExhausted = result.historyExhausted || !older.length;
      if (older.length) {
        this.bars = mergeCandles(older, this.bars);
        this.series.setData(this.bars);
        this.volume.setData(
          this.bars
            .filter((c) => c.volume !== null)
            .map((c) => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? "#00b8d444" : "#ff307844",
            })),
        );
        if (range)
          this.chart.timeScale().setVisibleLogicalRange({
            from: range.from + older.length,
            to: range.to + older.length,
          });
        this.indicators();
        this.draw();
      }
    } catch (e) {
      if (!controller.signal.aborted && id === this.request) {
        this.message.hidden = false;
        this.message.textContent = `歷史續載：${e.message}`;
      }
    } finally {
      this.historyLoading = false;
    }
  }
  indicators() {
    if (!this.chart) return;
    this.ma20.applyOptions({ visible: this.ma });
    this.ma50.applyOptions({ visible: this.ma });
    if (this.ma) {
      this.ma20.setData(movingAverage(this.bars, 20));
      this.ma50.setData(movingAverage(this.bars, 50));
    }
    const available =
      !["1D", "1W", "1M"].includes(this.interval) &&
      this.bars.some((c) => c.volume > 0);
    const btn = this.root.querySelector("[data-vwap]");
    btn.disabled = !available;
    this.vwapSeries.applyOptions({ visible: this.vwap && available });
    if (this.vwap && available) this.vwapSeries.setData(vwap(this.bars));
  }
  ohlc(c) {
    if (!c) return;
    const node = this.root.querySelector(".us2-ohlc");
    const text = `${this.symbol}  開 ${money(c.open)}  高 ${money(c.high)}  低 ${money(c.low)}  收 ${money(c.close)}  量 ${Number.isFinite(c.volume) ? c.volume.toLocaleString() : "—"}`;
    if (node.textContent !== text) node.textContent = text;
  }
  scheduleOverlay() {
    if (this.disposed || this.overlayFrame) return;
    this.overlayFrame = requestAnimationFrame(() => {
      this.overlayFrame = 0;
      if (this.disposed) return;
      this.priceTimer();
      this.draw();
    });
  }
  priceTimer() {
    if (!this.chart || !this.bars.length) return;
    const c = this.bars.at(-1),
      node = this.root.querySelector(".chart-current-price"),
      stage = this.root.querySelector(".us2-chart-stage"),
      y = this.series.priceToCoordinate(c.close);
    node.hidden = y === null || y < 0 || y > stage.clientHeight;
    if (node.hidden) return;
    node.style.transform = `translate3d(0,${y}px,0)`;
    node.classList.toggle("is-up", c.close >= c.open);
    const badge=node.querySelector(".chart-mobile-last-price");
    badge.classList.toggle("is-up",c.close >= c.open);
    badge.style.width = `${Math.max(54, this.chart.priceScale("right").width?.() - 4 || 54)}px`;
    const priceNode = node.querySelector("strong"), timerNode = node.querySelector("small");
    const priceText = money(c.close);
    const timer = this.capabilities.mode === 'perpetual' ? perpetualCountdown(c) : this.capabilities.mode === "eod" ? `收盤 ${c.periodEnd || c.date}` : countdown(c, this.interval, this.extended);
    const compactTimer = {"正常盤已收線":"已收線","等待成交／收線校正":"待校正","交易日曆待更新":"日曆未知"}[timer] || timer;
    const delay = this.capabilities.mode==='perpetual' ? ({live:'串流',connecting:'連線中',reconnecting:'重連中',paused:'暫停',stale:'待更新'}[this.liveStatus]||'定時更新') : this.result?.delaySeconds === null ? "未確認" : this.result?.delaySeconds > 0 ? `延${Math.round(this.result.delaySeconds / 60)}分` : "輪詢";
    const timerText = this.error || this.result?.stale ? "舊資料" : this.capabilities.mode === "eod" ? timer : `${compactTimer}·${delay}`;
    if (priceNode.textContent !== priceText) priceNode.textContent = priceText;
    if (timerNode.textContent !== timerText) timerNode.textContent = timerText;
    node.title = `${this.error ? "更新失敗，保留舊資料" : timer} · ${delay}`;
  }
  dataPoint(event) {
    const rect = this.svg.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    let time = this.chart.timeScale().coordinateToTime(x),
      price = this.series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    const c = this.bars.reduce(
      (a, b) => (Math.abs(b.time - time) < Math.abs(a.time - time) ? b : a),
      this.bars[0],
    );
    if (this.magnet && c) {
      time = c.time;
      price = [c.open, c.high, c.low, c.close].sort(
        (a, b) => Math.abs(a - price) - Math.abs(b - price),
      )[0];
    }
    return { time, price };
  }
  pointerDown(e) {
    if (e.button !== 0 || !this.bars.length) return;
    const index = e.target.dataset.index;
    if (this.tool === "cursor" && index !== undefined) {
      this.selected = +index;
      this.editing = {
        index: +index,
        start: this.dataPoint(e),
        original: structuredClone(this.drawings[+index]),
      };
      this.svg.setPointerCapture(e.pointerId);
      this.draw();
      return;
    }
    if (this.tool === "cursor") return;
    const p = this.dataPoint(e);
    if (!p) return;
    e.preventDefault();
    this.svg.setPointerCapture(e.pointerId);
    this.draft = {
      type: this.tool,
      a: p,
      b: p,
      color: this.color,
      width: this.width,
    };
    this.draw();
  }
  pointerMove(e) {
    if (!this.draft && !this.editing) return;
    const p = this.dataPoint(e);
    if (!p) return;
    if (this.draft) this.draft.b = p;
    else if (this.editing?.start) {
      const { original, start, index } = this.editing,
        dp = p.price - start.price,
        dt = p.time - start.time;
      this.drawings[index] = {
        ...original,
        a: { time: original.a.time + dt, price: original.a.price + dp },
        b: { time: original.b.time + dt, price: original.b.price + dp },
      };
    }
    this.draw();
  }
  pointerUp() {
    if (this.draft) {
      this.drawings.push(this.draft);
      this.selected = this.drawings.length - 1;
      this.draft = null;
    }
    this.editing = null;
    this.persist();
    this.draw();
  }
  editSelected() {
    if (this.selected >= 0) {
      Object.assign(this.drawings[this.selected], {
        color: this.color,
        width: this.width,
      });
      this.persist();
      this.draw();
    }
  }
  draw() {
    if (!this.chart || !this.svg || this.disposed) return;
    const w = this.svg.clientWidth,
      h = this.svg.clientHeight;
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.svg.innerHTML = "";
    const signal=this.classicSignal;
    for(const [label,level,color]of [['觸發',signal?.pressure,'#eee7df'],['下一目標',signal?.target,'#f7bd52'],['結構失效',signal?.invalidation,'#5ca5ff']]){
      if(!level)continue;
      const points=level.points||[{time:this.bars[0].time,price:level.level},{time:this.bars.at(-1).time,price:level.level}];
      const x1=level.kind==='diagonal'?this.projectTime(points[0].time):0,x2=level.kind==='diagonal'?this.projectTime(points[1].time):w-58;
      const y1=this.series.priceToCoordinate(points[0].price),y2=this.series.priceToCoordinate(points[1].price);
      if([x1,x2,y1,y2].some(x=>x===null))continue;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      Object.entries({x1,x2,y1,y2,stroke:color,'stroke-width':1,'stroke-dasharray':'4 4'}).forEach(([k,v])=>line.setAttribute(k,v));line.style.pointerEvents='none';this.svg.append(line);
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',Math.max(4,x2-82));text.setAttribute('y',y2-4);text.setAttribute('fill',color);text.setAttribute('font-size',10);text.textContent=label;text.style.pointerEvents='none';this.svg.append(text);
    }
    const guide = this.guide?.line || [];
    const segments =
      this.guide?.id === "triangle"
        ? [
            [guide[0], guide[1]],
            [guide[2], guide[3]],
          ]
        : guide.slice(1).map((point, i) => [guide[i], point]);
    for (const [a, b] of segments) {
      if (!a || !b) continue;
      const values = {
        x1: this.projectTime(a.time),
        x2: this.projectTime(b.time),
        y1: this.series.priceToCoordinate(a.value),
        y2: this.series.priceToCoordinate(b.value),
      };
      if (Object.values(values).some((v) => v === null)) continue;
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      Object.entries({
        ...values,
        stroke: "#f0ebe3",
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
      }).forEach(([key, value]) => line.setAttribute(key, value));
      line.style.pointerEvents = "none";
      this.svg.append(line);
    }
    for (const [i, d] of [
      ...this.drawings,
      ...(this.draft ? [this.draft] : []),
    ].entries()) {
      let x1 = this.projectTime(d.a.time),
        x2 = this.projectTime(d.b.time),
        y1 = this.series.priceToCoordinate(d.a.price),
        y2 = this.series.priceToCoordinate(d.b.price);
      if (d.type === "horizontal") {
        x1 = 0;
        x2 = w - 58;
        y2 = y1;
      }
      if ([x1, x2, y1, y2].some((x) => x === null)) continue;
      for (const hit of [true, false]) {
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        Object.entries({
          x1,
          x2,
          y1,
          y2,
          stroke: hit ? "transparent" : d.color,
          "stroke-width": hit ? 14 : d.width + (i === this.selected ? 1 : 0),
        }).forEach(([k, v]) => line.setAttribute(k, v));
        line.dataset.index = i;
        if (hit) line.classList.add("us2-line-hit");
        else line.style.pointerEvents = "none";
        this.svg.append(line);
      }
    }

  }
  setGuide(guide) {
    this.guide = guide;
    this.draw();
  }
  projectTime(time) {
    const scale = this.chart.timeScale(),
      exact = scale.timeToCoordinate(time);
    if (exact !== null) return exact;
    const index = this.bars.findIndex((c) => c.time > time);
    if (index < 1) return null;
    const a = this.bars[index - 1],
      b = this.bars[index];
    const x1 = scale.timeToCoordinate(a.time),
      x2 = scale.timeToCoordinate(b.time);
    return x1 === null || x2 === null
      ? null
      : x1 + ((x2 - x1) * (time - a.time)) / (b.time - a.time);
  }
  destroy() {
    this.disposed = true;
    this.stopLive();
    this.tierFilters?.destroy();
    this.saveViewport();
    ++this.request;
    this.controller?.abort();
    this.historyController?.abort();
    clearTimeout(this.poll);
    clearInterval(this.timer);
    this.ro?.disconnect();
    this.overlayEvents?.abort();
    cancelAnimationFrame(this.overlayFrame);
    cancelAnimationFrame(this.resizeFrame);
    this.sharedDrawings?.destroy();
    this.gestures?.destroy();
    this.chart?.remove();
    this.root.classList.remove("us2-chart-full");
    document.body.classList.remove("us2-chart-focus");
  }
}
