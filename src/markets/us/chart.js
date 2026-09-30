import { USAdapter } from "./provider.js";
import { INTERVALS, countdown, sessionAt, nyParts } from "./calendar.js";
import { mergeCandles, movingAverage, vwap } from "./model.js";
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
    } = {},
  ) {
    this.root = root;
    this.guide = null;
    this.symbol = symbol;
    this.interval = interval;
    this.capabilities = capabilities;
    this.onState = onState;
    this.onInterval = onInterval;
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
    root.innerHTML = `<div class="us2-chart-toolbar"><div class="us2-timeframes" role="group" aria-label="圖表時間級別">${INTERVALS.map((tf) => `<button type="button" data-tf="${tf}" aria-pressed="${tf === interval}">${tf.replace("1D", "日").replace("1W", "週").replace("1M", "月")}</button>`).join("")}</div><button type="button" data-expand aria-label="展開圖表" title="展開圖表">⤢</button></div>
      <div class="us2-chart-options"><button type="button" data-ma aria-pressed="false">MA20／50</button><button type="button" data-vwap aria-pressed="false" title="依 OHLCV 加權估計，非逐筆 VWAP">VWAP 估計</button><select data-session aria-label="交易時段"><option value="regular">正常盤</option><option value="extended" ${capabilities.extendedHours ? "" : "disabled"}>含盤前盤後${capabilities.extendedHours ? "" : " · 權限未確認"}</option></select><button type="button" data-latest title="回到最新行情">↦ 最新</button></div>
      <div class="us2-ohlc" role="status">載入 ${esc(symbol)} 歷史 K 線…</div>
      <div class="us2-chart-stage"><div class="us2-chart-canvas"></div><svg class="us2-drawings" aria-label="美股畫線區"></svg><div class="us2-price-label" hidden><b></b><small></small></div><div class="us2-chart-message" role="status">取得歷史 OHLCV…</div></div>
      <div class="us2-draw-toolbar" role="group" aria-label="圖表畫線工具"><button data-tool="cursor" aria-pressed="true">游標</button><button data-tool="horizontal" aria-pressed="false">水平線</button><button data-tool="trend" aria-pressed="false">趨勢線</button><button data-magnet aria-pressed="true" title="磁吸最近 K 線 OHLC">磁吸</button><input type="color" value="${this.color}" aria-label="畫線顏色" data-color><select aria-label="畫線粗細" data-width><option value="1">1px</option><option value="2" selected>2px</option><option value="3">3px</option><option value="4">4px</option></select><button data-delete title="刪除選中的線" disabled>刪除</button><button data-retry title="重新取得行情">↻</button></div><div class="us2-chart-meta"></div><div class="us2-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a> · <a href="https://twelvedata.com/" target="_blank" rel="noopener">Twelve Data</a></div>`;
    this.message = root.querySelector(".us2-chart-message");
    this.svg = root.querySelector("svg");
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
        attributionLogo: true,
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
        horzTouchDrag: true,
        vertTouchDrag: false,
        mouseWheel: true,
      },
      handleScale: {
        pinch: true,
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
      if (this.disposed) return;
      this.chart.resize(container.clientWidth, container.clientHeight);
      this.draw();
      this.priceTimer();
    });
    this.ro.observe(container);
    this.overlayEvents = new AbortController();
    for (const name of ["pointermove", "pointerdown", "wheel", "touchmove"])
      container.addEventListener(name, () => this.scheduleOverlay(), {passive:true, signal:this.overlayEvents.signal});
    root
      .querySelectorAll("[data-tf]")
      .forEach(
        (btn) =>
          (btn.onclick = () => this.change({ interval: btn.dataset.tf })),
      );
    root.querySelector("[data-session]").onchange = (e) =>
      this.change({ extended: e.target.value === "extended" });
    root.querySelector("[data-latest]").onclick = () =>
      this.chart.timeScale().scrollToRealTime();
    root.querySelector("[data-expand]").onclick = (e) => {
      root.classList.toggle("us2-chart-full");
      e.currentTarget.setAttribute(
        "aria-label",
        root.classList.contains("us2-chart-full") ? "收合圖表" : "展開圖表",
      );
      this.draw();
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
    root.querySelectorAll("[data-tool]").forEach(
      (btn) =>
        (btn.onclick = () => {
          this.tool = btn.dataset.tool;
          root
            .querySelectorAll("[data-tool]")
            .forEach((x) => x.setAttribute("aria-pressed", x === btn));
          this.svg.classList.toggle("is-drawing", this.tool !== "cursor");
          this.chart.applyOptions({
            handleScroll: {
              pressedMouseMove: this.tool === "cursor",
              horzTouchDrag: this.tool === "cursor",
            },
          });
        }),
    );
    root.querySelector("[data-magnet]").onclick = (e) => {
      this.magnet = !this.magnet;
      e.currentTarget.setAttribute("aria-pressed", this.magnet);
    };
    root.querySelector("[data-color]").oninput = (e) => {
      this.color = e.target.value;
      this.editSelected();
    };
    root.querySelector("[data-width]").onchange = (e) => {
      this.width = +e.target.value;
      this.editSelected();
    };
    root.querySelector("[data-delete]").onclick = () => {
      if (this.selected >= 0) {
        this.drawings.splice(this.selected, 1);
        this.selected = -1;
        this.persist();
        this.draw();
      }
    };
    root.querySelector("[data-retry]").onclick = () => this.load(true);
    this.svg.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.svg.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.svg.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.svg.addEventListener("pointercancel", () => {
      this.draft = null;
      this.editing = null;
      this.draw();
    });
    this.timer = setInterval(() => this.priceTimer(), 1000);
    this.load();
  }
  key() {
    return `ox-us-v2:drawings:${this.symbol}:twelve-data:${this.result?.adjustment || "pending"}`;
  }
  persist() {
    put(this.key(), this.drawings);
  }
  viewportKey() {
    return `${this.symbol}:${this.interval}:${this.extended}`;
  }
  saveViewport() {
    const r = this.chart?.timeScale().getVisibleLogicalRange();
    if (r) viewports.set(this.viewportKey(), r);
  }
  async change({
    symbol = this.symbol,
    interval = this.interval,
    extended = this.extended,
  } = {}) {
    if (!this.chart) return;
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
    this.drawings = [];
    this.selected = -1;
    this.bars = [];
    this.result = null;
    this.series.setData([]);
    this.volume.setData([]);
    this.ma20.setData([]);
    this.ma50.setData([]);
    this.vwapSeries.setData([]);
    this.chart.applyOptions({
      timeScale: { timeVisible: !["1D", "1W", "1M"].includes(interval) },
    });
    this.root
      .querySelectorAll("[data-tf]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.tf === interval),
      );
    this.onInterval(interval);
    await this.load();
  }
  async load(force = false) {
    if (this.disposed || !this.chart || this.loading) return;
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
      this.applyBars(result.bars, first);
      this.message.hidden = true;
      this.error = false;
      if (first) {
        this.drawings = stored(this.key(), []);
        this.draw();
      }
      this.root.querySelector(".us2-chart-meta").textContent =
        `${result.source} · ${result.feed} · ${this.extended ? "含盤前盤後" : "正常盤"} · ${result.adjustment} · ${this.bars.length} 根 · ${result.volumeScope}`;
      this.onState({ ...result, bars: this.bars, error: null });
    } catch (e) {
      if (controller.signal.aborted || this.disposed || id !== this.request)
        return;
      this.error = true;
      this.message.hidden = false;
      this.message.textContent = `${this.bars.length ? "保留前次資料 · " : ""}${e.status === 429 ? "額度用盡，稍後自動重試" : e.message}`;
      this.onState({ error: e.message, bars: this.bars });
    } finally {
      if (id === this.request) {
        this.loading = false;
        this.controller = null;
        this.schedule();
      }
    }
  }
  schedule() {
    clearTimeout(this.poll);
    if (this.disposed) return;
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
        saved || {
          from: Math.max(0, this.bars.length - (innerWidth < 600 ? 75 : 125)),
          to: this.bars.length + 3,
        },
      );
    }
    this.indicators();
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
      node = this.root.querySelector(".us2-price-label"),
      stage = this.root.querySelector(".us2-chart-stage"),
      y = this.series.priceToCoordinate(c.close);
    node.hidden = y === null || y < 0 || y > stage.clientHeight;
    if (node.hidden) return;
    node.style.transform = `translateY(${Math.max(0, Math.min(stage.clientHeight - 27, y - 13))}px)`;
    node.style.background = c.close >= c.open ? "#116078" : "#ad2350";
    node.style.width = `${Math.max(54, this.chart.priceScale("right").width?.() - 4 || 54)}px`;
    const priceNode = node.querySelector("b"), timerNode = node.querySelector("small");
    const priceText = money(c.close);
    const timer = countdown(c, this.interval, this.extended);
    const compactTimer = {"正常盤已收線":"已收線","等待成交／收線校正":"待校正","交易日曆待更新":"日曆未知"}[timer] || timer;
    const delay = this.result?.delaySeconds === null ? "未確認" : this.result?.delaySeconds > 0 ? `延${Math.round(this.result.delaySeconds / 60)}分` : "輪詢";
    const timerText = this.error ? "舊資料" : `${compactTimer}·${delay}`;
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
    this.root.querySelector("[data-delete]").disabled = this.selected < 0;
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
    this.saveViewport();
    ++this.request;
    this.controller?.abort();
    this.historyController?.abort();
    clearTimeout(this.poll);
    clearInterval(this.timer);
    this.ro?.disconnect();
    this.overlayEvents?.abort();
    cancelAnimationFrame(this.overlayFrame);
    this.chart?.remove();
    this.root.classList.remove("us2-chart-full");
  }
}
