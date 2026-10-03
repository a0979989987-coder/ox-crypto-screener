import {
  e,
  price,
  pct,
  tone,
  compact,
  fmt,
  read,
  save,
  prefsKey,
  watchKey,
  toolNames,
  patterns,
  sectorETF,
  sourceInfo,
  nativeAllowed,
} from "./view-utils.js?v=20261003-us-live1";
import { toolsViews } from "./tools.js?v=20261003-us-live1";
import { newsViews } from "./news.js?v=20261003-us-live1";
import { USAdapter, fetchJSON } from "./provider.js?v=20261003-us-live1";
import { subscribeEquity } from './live-equity.js?v=20261003-us-live1';
import { DeviceEOD } from "./device-eod.js?v=20261003-us-live1";
import { USChart } from "./chart.js?v=20261003-us-live1";
import { USWidgetChart } from "./widget-chart.js?v=20261001-tiercomb1";
import { usDisplayCapabilities } from "./widget-config.js?v=20261001-us-device1";
import { EOD_CAPABILITIES, EOD_INTERVALS, eodFreshness } from "./eod.js?v=20261003-us-parity1";
import { searchDirectory, quoteStatus } from "./model.js?v=20261003-us-live1";
import { sessionAt, nyParts } from "./calendar.js?v=20261001-us-eod1";
import { catalogueMode, cataloguePage, stockName } from "./directory-view.js?v=20261001-us-names1";

import { tierResults, timeframeTierResults, stockClassic } from "./analysis.js?v=20261003-us-live1";
import { icon, openDialog, closeDialog } from "./ui.js?v=20261001-us-eod1";

// These are measured breadth ratios for the available stock pool, not a
// fabricated market score or an estimate of stocks absent from the snapshot.
export function usHomeMarketMetrics(analyses = []) {
  const stocks = [...new Map(analyses.filter(row => row.interval === '1D' &&
    row.type !== 'ETF' && !row.complex && row.symbol && Number.isFinite(row.changePct))
    .map(row => [row.symbol, row])).values()];
  const advancing = stocks.filter(row => row.changePct > 0).length;
  const declining = stocks.filter(row => row.changePct < 0).length;
  const maRows = stocks.filter(row => Number.isFinite(row.price) && Number.isFinite(row.ma20) && row.ma20 > 0);
  const aboveMA = maRows.filter(row => row.price > row.ma20).length;
  return { total: stocks.length, advancing, declining, unchanged: stocks.length - advancing - declining,
    maTotal: maRows.length, aboveMA,
    advanceRatio: stocks.length ? advancing / stocks.length * 100 : null,
    aboveMARatio: maRows.length ? aboveMA / maRows.length * 100 : null };
}

export class USWorkspace {
  constructor() {
    const storedPrefs = read(prefsKey, {});
    const p = storedPrefs && typeof storedPrefs === "object" && !Array.isArray(storedPrefs)
      ? storedPrefs : {};
    this.state = {
      view: "radar",
      symbol: p.symbol || "SPY",
      interval: EOD_INTERVALS.includes(p.interval) ? p.interval : "1D",
      homeSymbol: p.homeSymbol || "SPY",
      homeInterval: EOD_INTERVALS.includes(p.homeInterval) ? p.homeInterval : "1D",
      side: "long",
      collapsed: Boolean(p.collapsed),
      tier: "all",
      mode: p.mode || "classic",
      scanInterval: EOD_INTERVALS.includes(p.scanInterval) ? p.scanInterval : "1D",
      type: p.type || "stock",
      tool: p.tool || "patterns",
      scope: p.scope || "all",
      rank: "change",
      pattern: "all",
      patternInterval: "1D",
      patternMode: "conditions",
      watchOnly: false,
    };
    const storedWatch = read(watchKey, []);
    this.watch = new Set(Array.isArray(storedWatch)
      ? storedWatch.map(item => typeof item === "string" ? item : item?.symbol)
        .filter(symbol => typeof symbol === "string" && /^[A-Z0-9.-]{1,15}$/.test(symbol)) : []);
    this.directory = [];
    this.catalogueOffset = 0;
    this.snapshot = null;
    this.cap = usDisplayCapabilities(EOD_CAPABILITIES);
    this.quotes = new Map();
    this.scrolls = {};
    this.active = false;
    this.workerId = 0;
    this.workerPending = new Map();
  }
  async activate(view) {
    this.active = true;
    this.root = document.getElementById("market-unavailable-card");
    if (!this.root) return;
    this.root.classList.add("us2-root");
    this.root.classList.remove("us-boot-status");
    this.root.classList.remove("market-unavailable-card");
    document.body.dataset.usWorkspace = "1";
    this.controller?.abort();
    clearTimeout(this.refreshTimer);
    this.controller = new AbortController();
    const signal = this.controller.signal;
    await USAdapter.deviceReady();
    if (signal.aborted || !this.active) return;
    const initialCap = usDisplayCapabilities(DeviceEOD.active?.capabilities || EOD_CAPABILITIES);
    if (initialCap.chartMode !== this.cap.chartMode) this.renderedView = null;
    this.cap = initialCap;
    this.show(view || this.state.view);
    const jobs = [
      this.loadDirectory(signal),
      USAdapter.capabilities({ signal }).then((c) => {
        if(signal.aborted)return;
        const displayCap = usDisplayCapabilities(c);
        const changedMode = this.cap.chartMode !== displayCap.chartMode;
        this.cap = {...displayCap,sessionDate:this.snapshot?.sessionDate};
        if(c.source==='binance-equity'&&c.rawDataAvailable) this.loadDirectory(signal);
        this.root?.querySelectorAll('[data-us-home-tf]').forEach(button => {
          button.hidden = Boolean(c.intervals && !c.intervals.includes(button.dataset.usHomeTf));
        });
        if (changedMode && this.chart) {
          const old=this.chart,root=old.root,symbol=old.symbol,interval=old.interval;
          old.destroy();this.chartIn(root,symbol,interval);
          if(this.state.view==='home')root.querySelector('.us2-chart-toolbar').hidden=true;
          if(this.state.view==='radar')this.setScannerCollapsed(this.state.collapsed);
        } else this.chart?.setCapabilities(this.cap);
        this.updateIdentity();
        if(changedMode)this.lookupQuote(this.state.view==='home'?this.state.homeSymbol:this.state.symbol);
        this.updateCounts();
        this.paintList();
        this.updateSections();
        this.updateLive();
      }),
      USAdapter.snapshot({ signal })
        .then((s) => {
          if(signal.aborted)return;
          this.snapshotError=s.error || null;
          this.snapshot = s;
          this.cap={...this.cap,sessionDate:s.sessionDate};
          this.chart?.setCapabilities(this.cap);
          this.acceptSnapshotQuotes(s);
          this.updateIdentity();
          this.updateCounts();
          this.updateSections();
        })
        .catch((error) => {
          if (!signal.aborted) {
            this.snapshotError = error.message;
            this.updateCounts();
            this.updateSections();
          }
        }),
    ];
    await Promise.allSettled(jobs);
    if (!signal.aborted && this.active) {
      this.updateLive();
      this.scheduleSnapshot();
      // Closing snapshots refresh on entry or explicit user action, never intraday polling.
    }
  }
  async loadDirectory(signal = this.controller?.signal) {
    this.directoryError = null;
    try {
      const source=this.cap.source;
      const d = await USAdapter.directory({ signal, capabilities:this.cap });
      if (signal?.aborted || !this.active) return;
      if(source!==this.cap.source)return;
      this.directory = d.items; this.directoryDate = d.receivedAt;
      this.startQuoteStream();
      if (this.chart instanceof USWidgetChart && !this.chart.entry) {
        this.chart.asset = this.directory.find(x => x.symbol === this.chart.symbol) || {}; this.chart.mount();
      }
      this.updateCounts(); this.updateIdentity(); this.paintList();
    } catch (error) {
      if (!signal?.aborted && this.active) { this.directoryError = error; this.updateCounts(); this.paintList(); }
    }
  }
  bindDeviceData() {
    const dialog = this.root.querySelector('.us2-device-dialog');
    const input = dialog.querySelector('input');
    const status = dialog.querySelector('[data-device-status]');
    const remove = dialog.querySelector('[data-device-remove]');
    remove.hidden = !DeviceEOD.active;
    status.textContent = DeviceEOD.active
      ? `${DeviceEOD.active.snapshot.sessionDate} · ${DeviceEOD.active.snapshot.counts.quoted} 檔 · 已保存在這個瀏覽器`
      : '匯入後，OX 原生 K 線、雷達、泡泡、型態畫板與首頁共用這份收盤資料。';
    this.root.querySelector('[data-device-open]').onclick = event => openDialog(dialog, event.currentTarget);
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      input.disabled = true; remove.disabled = true;
      status.textContent = '讀取盤後資料…';
      try {
        await DeviceEOD.importFile(file, percent => { status.textContent = `驗證收盤資料與計算 OX 掃描 ${percent}%`; });
        closeDialog(dialog); await this.restartDataSource();
      } catch (error) { status.textContent = error.message; }
      finally { input.disabled = false; remove.disabled = false; input.value = ''; }
    };
    remove.onclick = async () => {
      remove.disabled = true;
      try { await DeviceEOD.clear(); closeDialog(dialog); await this.restartDataSource(); }
      catch (error) { status.textContent = error.message; remove.disabled = false; }
    };
  }
  async restartDataSource() {
    if (!this.active || document.body.dataset.market !== 'us') return;
    this.snapshot = null; this.snapshotError = null; this.quotes.clear();
    this.directory = []; this.directoryError = null; this.chartError = null; this.chartErrorCode = null;
    if (DeviceEOD.active) for (const key of ['symbol', 'homeSymbol'])
      if (!DeviceEOD.active.series.has(this.state[key])) this.state[key] = 'SPY';
    this.renderedView = null;
    await this.activate(this.state.view);
  }
  persist() {
    save(prefsKey, this.state);
  }
  startQuoteStream() {
    this.quoteStreamStop?.();this.quoteStreamStop=null;
    if(this.cap.stream!=='binance-equity'||!nativeAllowed(this.cap)||!this.active)return;
    const items=this.directory.filter(row=>row.source==='binance-equity'&&row.contractSymbol);
    if(!items.length)return;
    this.quoteStreamStop=subscribeEquity({items,onReconnect:()=>this.refreshSnapshot(),
      onQuote:quote=>{
        if(!this.active)return;
        const old=this.quotes.get(quote.symbol);
        if(old&&old.marketTime>quote.marketTime)return;
        this.quotes.set(quote.symbol,quote);
        if(this.quotePaint)return;
        this.quotePaint=setTimeout(()=>{
          this.quotePaint=null;if(!this.active)return;
          this.updateIdentity();this.updateLive();this.bubbles?.draw();
          for(const node of this.root.querySelectorAll('.us2-stock-row[data-symbol]')) {
            const value=this.quotes.get(node.dataset.symbol);if(!value)continue;
            const amount=node.querySelector('.coin-ox-value'),change=node.querySelector('.coin-change');
            if(amount)amount.textContent=price(value.price);
            if(change){change.textContent=pct(value.changePct);change.className=`coin-change ${tone(value.changePct)}`;}
          }
        },500);
      }});
  }
  scheduleSnapshot() {
    clearTimeout(this.refreshTimer);
    if(this.active&&this.cap.mode==='perpetual')this.refreshTimer=setTimeout(()=>{
      if(!document.hidden&&!this.root?.hidden)this.refreshSnapshot();else this.scheduleSnapshot();
    },300000);
  }
  acceptSnapshotQuotes(snapshot) {
    if(snapshot.mode!=='perpetual')this.quotes.clear();
    const present=new Set();
    for(const quote of snapshot.quotes||[]) {
      present.add(quote.symbol);
      const old=this.quotes.get(quote.symbol);
      if(!old||old.source!==quote.source||old.marketTime<=quote.marketTime)this.quotes.set(quote.symbol,quote);
    }
    if(snapshot.mode==='perpetual')for(const symbol of this.quotes.keys())if(!present.has(symbol))this.quotes.delete(symbol);
  }
  destroyTools() {
    this.patternLoading?.finish();
    ++this.workerId;
    this.heatChart?.destroy();this.heatChart=null;this.toolsLife?.abort();this.toolsSurface=null;
    this.toolsRail?.destroy();this.toolsRail=null;
    this.patternCharts?.forEach(chart=>chart.destroy());this.patternCharts=[];
    this.patternSurface=null;
    this.chart?.destroy();
    this.chart = null;
    this.bubbles?.destroy();
    this.bubbles = null;
    this.board?.destroy();
    this.board = null;
    clearTimeout(this.searchTimer);
    this.quoteController?.abort();
    this.newsController?.abort();
    this.worker?.terminate();
    this.worker = null;
    for (const callback of this.workerPending.values())
      callback({ error: "分析已取消" });
    this.workerPending.clear();
  }
  deactivate() {
    this.active = false;
    this.renderedView = null;
    this.controller?.abort();
    clearTimeout(this.refreshTimer);
    this.quoteStreamStop?.();this.quoteStreamStop=null;clearTimeout(this.quotePaint);this.quotePaint=null;
    this.destroyTools();
    delete document.body.dataset.usWorkspace;
    this.root?.classList.remove("us2-root");
    this.root?.classList.add("market-unavailable-card");
  }
  suspend() {
    this.destroyTools();
    this.quoteStreamStop?.();this.quoteStreamStop=null;clearTimeout(this.quotePaint);this.quotePaint=null;
    if (this.root) this.root.hidden = true;
  }
  show(view) {
    if (!["home", "strength", "radar", "data", "media"].includes(view)) {
      this.suspend();
      return;
    }
    if (this.root && !this.root.hidden && this.renderedView === view) return;
    this.scrolls[this.state.view] = window.scrollY;
    this.destroyTools();
    this.state.view = view;
    this.renderedView = view;
    this.root.hidden = false;
    document.body.dataset.usWorkspace = "1";
    this.root.innerHTML = `<div class="us2-shell"><div class="us2-eod-summary" role="status"><strong>美股盤後</strong><span data-eod-date>取得收盤快照…</span><button class="ox-text-button" data-eod-refresh aria-label="更新收盤快照">↻</button></div><main class="us2-main us2-${view}-pane"></main><dialog class="chart-tools-dialog us2-search-dialog" aria-label="搜尋美股"><header><b>搜尋美股</b><button data-close-dialog aria-label="關閉搜尋">${icon("close")}</button></header><form class="us2-search" role="search"><input aria-label="搜尋美股" placeholder="代號、公司名稱／中文別名" autocomplete="off" spellcheck="false"><button type="submit" aria-label="搜尋股票">⌕</button></form><div class="us2-search-results" hidden role="listbox" aria-label="美股搜尋結果"></div></dialog><dialog class="chart-tools-dialog us2-data-dialog" aria-label="美股資料狀態"><header><b>資料與股票詳情</b><button data-close-dialog aria-label="關閉資料狀態">${icon("close")}</button></header><div class="us2-stock-detail"></div><div class="us2-quote-status"></div><div class="us2-counts" role="status"></div><div class="us2-provider-detail"></div></dialog></div>`;
    this.root.querySelectorAll("[data-close-dialog]").forEach(button => button.onclick = () => closeDialog(button.closest("dialog")));
    this.root.querySelector("[data-eod-refresh]").onclick=()=>this.refreshSnapshot();
    const dataButton = document.createElement('button');
    dataButton.type = 'button'; dataButton.className = 'ox-text-button'; dataButton.dataset.deviceOpen = '';
    dataButton.textContent = '盤後檔'; dataButton.setAttribute('aria-label', '匯入本機盤後資料');
    this.root.querySelector('.us2-eod-summary').insertBefore(dataButton, this.root.querySelector('[data-eod-refresh]'));
    this.root.querySelector('.us2-shell').insertAdjacentHTML('beforeend', `<dialog class="chart-tools-dialog us2-device-dialog" aria-label="本機盤後資料"><header><b>OX 本機盤後資料</b><button data-close-device aria-label="關閉本機盤後資料">${icon('close')}</button></header><p>資料保存在這個瀏覽器，只供個人使用，不會上傳。匯入新檔可更新收盤行情。</p><label class="us2-device-picker">選擇 OX 盤後 JSON 檔<input type="file" accept=".json,application/json" aria-label="選擇 OX 盤後資料檔"></label><p data-device-status role="status"></p><button class="chart-tools-save" data-device-remove hidden>移除本機資料，改用公開圖表</button></dialog>`);
    this.root.querySelector('[data-close-device]').onclick = () => closeDialog(this.root.querySelector('.us2-device-dialog'));
    this.bindDeviceData();
    this.bindSearch();
    this.renderMain();
    this.startQuoteStream();
    this.updateCounts();
    this.persist();
    requestAnimationFrame(() => {
      if (this.active && this.renderedView === view)
        window.scrollTo(0, this.scrolls[view] || 0);
    });
  }
  updateCounts() {
    if (!this.active || !this.root) return;
    const node = this.root.querySelector(".us2-counts");
    if (!node) return;
    const counts = this.snapshot?.counts;
    node.textContent = `可搜尋 ${this.directory.length.toLocaleString()} · 有效收盤 ${counts?.quoted ?? 0} · 盤後分析 ${counts?.scanned ?? 0}${this.snapshot?.asOf ? " · 快照 " + fmt(this.snapshot.asOf) : ""}${this.snapshotError ? " · 共用掃描快照未取得" : ""}`;
    if(this.cap.chartMode === 'widget')node.textContent=`股票參考目錄 ${this.directory.length.toLocaleString()} · 行情由圖表更新 · OX 實際掃描 0`;
    node.title = `報價／分析數是上次共用收集實際通過驗證的數量。${this.directoryDate ? "目錄更新 " + fmt(this.directoryDate) : ""}`;
    const dateNode=this.root.querySelector('[data-eod-date]');
    if(dateNode)dateNode.textContent=this.snapshot?.sessionDate ? `交易日 ${this.snapshot.sessionDate} · 已收盤` : this.directory.length ? `股票名錄 ${this.directory.length.toLocaleString()} 檔 · 收盤行情待開通` : this.snapshotError || '收盤快照尚未建立';
    if(dateNode)dateNode.title=this.snapshotError || '';
    if (dateNode && this.cap.dataScope === 'device' && this.snapshot?.sessionDate)
      dateNode.textContent = `${this.snapshot.sessionDate} 已收盤 · 本機 ${this.snapshot.counts.quoted} 檔`;
    const freshness = eodFreshness(this.snapshot?.sessionDate);
    if (dateNode && freshness.status === 'stale') {
      dateNode.textContent = `${freshness.sessionDate} · 待更新${this.cap.dataScope === 'device' ? ` · 本機 ${this.snapshot.counts.quoted} 檔` : ''}`;
      dateNode.title = `目前資料：${freshness.sessionDate} 收盤；最近完整交易日：${freshness.expectedSessionDate}。${this.snapshotError || ''}`;
    }
    const widget=this.cap.chartMode === 'widget';
    const heading=this.root.querySelector('.us2-eod-summary strong');
    if(heading)heading.textContent=widget?'美股圖表':'美股盤後';
    if(widget && dateNode) {
      dateNode.textContent='日／週／月 K 線 · 當日可能尚未收盤';
      dateNode.title='行情由 TradingView 更新，延遲與資料來源依圖表標示；OX 盤後掃描另需原始行情。';
    }
    this.root.querySelector('[data-eod-refresh]')?.setAttribute('aria-label',widget?'重新連線圖表與更新盤後快照':'更新收盤快照');
    if(this.cap.mode==='perpetual'&&!widget) {
      if(heading)heading.textContent='美股合約';
      if(dateNode)dateNode.textContent=this.snapshotError||`幣安 · ${counts?.quoted??0} 檔 · 24h 漲跌`;
      if(dateNode)dateNode.title='股票永續合約價格與成交量；非美股現貨。K 線使用 UTC，雷達使用已完成日 K。';
      node.textContent=`幣安合約 ${this.directory.length} · 有報價 ${counts?.quoted??0} · 已完成日 K 分析 ${counts?.scanned??0}`;
      this.root.querySelector('[data-eod-refresh]')?.setAttribute('aria-label','更新合約行情與掃描');
    }
    this.updateDataBrief();
    const selector = this.root.querySelector("[data-scan-interval]");
    if (selector)
      selector.innerHTML = (this.snapshot?.analysisIntervals || ["1D"])
        .map(
          (tf) =>
            `<option value="${e(tf)}" ${tf === this.state.scanInterval ? "selected" : ""}>${e(tf)}</option>`,
        )
        .join("");
  }
  updateLive() {
    if (!this.active || document.body.dataset.market !== "us") return;
    const live = document.getElementById("ox-live-text");
    if (live) {
      if(this.cap.mode==='perpetual'&&this.cap.chartMode!=='widget') {
        const quotes=['SPY','QQQ',this.state.symbol].filter((s,i,a)=>a.indexOf(s)===i).map(s=>this.quotes.get(s)).filter(Boolean);
        live.textContent=`幣安股票永續合約 · USDT · 24h ${quotes.map(q=>`${q.symbol} ${price(q.price)} ${pct(q.changePct)}`).join(' ｜ ')||'等待行情連線'}`;
        live.title=live.textContent;live.dataset.usText=live.textContent;return;
      }
      if (this.cap.mode === 'eod' && this.cap.chartMode !== 'widget') {
        const quotes=['SPY','QQQ','IWM'].map(s=>this.quotes.get(s)).filter(Boolean);
        live.textContent=`美股盤後${this.cap.privateValidation?' · 私人驗證':''} · ${this.snapshot?.sessionDate || '收盤資料待建立'} · ${quotes.map(q=>`${q.symbol} 收盤 ${price(q.price)} ${pct(q.changePct)}`).join(' ｜ ') || '盤中資訊已停止'}`;
        live.title=live.textContent;live.dataset.usText=live.textContent;return;
      }
      if (this.cap.chartMode === "widget") {
        live.textContent='美股 · TradingView 日／週／月圖表 · 當日可能尚未收盤 · 延遲依圖表標示';
        live.title=live.textContent;live.dataset.usText=live.textContent;return;
      }
      if (!nativeAllowed(this.cap) || this.chartErrorCode === "US_DATA_DISPLAY_RIGHTS_REQUIRED") {
        live.textContent = "美股 · 行情展示未開通 · 股票搜尋與收藏可用";
        live.title = live.textContent;
        live.dataset.usText = live.textContent;
        return;
      }
      const benchmarks = ["SPY", "QQQ", "IWM"]
        .map((s) => this.quotes.get(s))
        .filter(Boolean);
      live.textContent = `美股${this.cap.privateValidation ? ' · 私人驗證' : ''} · ${sessionAt().label} · ${benchmarks.map((q) => `${q.symbol} ETF ${price(q.price)} ${pct(q.changePct)}`).join("　｜　") || "選擇股票查看真實 OHLCV"} · ${this.snapshot?.asOf ? "共用掃描 " + fmt(this.snapshot.asOf) : "掃描快照未取得"}`;
      live.title = live.textContent;
      live.dataset.usText = live.textContent;
    }
  }
  openSearch(opener) {
    const dialog=this.root.querySelector(".us2-search-dialog");
    openDialog(dialog,opener); dialog.querySelector("input").focus();
  }
  openData(opener) { this.updateDataBrief(); openDialog(this.root.querySelector(".us2-data-dialog"),opener); }
  updateDataBrief() {
    const error=this.chartError || this.quoteError;
    const label=this.cap.chartMode === "widget" ? "資料" : this.cap.mode === "eod" ? (this.snapshot?.sessionDate ? "收盤 " + this.snapshot.sessionDate : "盤後資料待建立") : (!nativeAllowed(this.cap) || this.chartErrorCode === "US_DATA_DISPLAY_RIGHTS_REQUIRED")?"行情未開通":error?.includes("授權")?"授權未確認":error?"資料異常":this.cap.mode==='perpetual'?'合約 24h':this.cap.privateValidation?"私人驗證":sessionAt().label;
    this.root?.querySelectorAll("[data-data-open]").forEach(node=>{node.textContent=label;node.title=error||"查看行情時間、來源、股票資料與掃描狀態";});
    const symbol=this.state.view==="home"?this.state.homeSymbol:this.state.symbol;
    const item=this.directory.find(x=>x.symbol===symbol),q=this.quotes.get(symbol);
    const detail=this.root?.querySelector(".us2-stock-detail");
    if(detail)detail.textContent=[symbol,item?.alias||item?.name,item?.type,item?.exchange].filter(Boolean).join(" · ");
    this.root?.querySelectorAll(".us2-display-source").forEach(n=>n.textContent=sourceInfo(this.cap.displaySource || this.cap.source).label);
    const provider=this.root?.querySelector(".us2-provider-detail");
    if(provider)provider.textContent=this.cap.chartMode === "widget" ? "TradingView 官方免費圖表。價格、行情時間與延遲狀態由圖表標示；不將單一交易所資料稱為全市場。搜尋目錄沿用既有公司資料，實際涵蓋以圖表為準。免費圖表不提供原始 K 線給 OX 掃描。" : `來源 ${q?.source||this.cap?.source||"盤後資料源"} · feed ${q?.feed||"未確認"} · ${q?.volumeScope||"成交量口徑未確認"} · ${this.snapshotError||"共用掃描快照狀態可查閱上方統計"}`;
    if (provider && this.cap.dataScope === 'device') provider.textContent = `本機盤後檔 · ${this.cap.feed} · 交易日 ${this.snapshot?.sessionDate || this.cap.sessionDate} · 只供個人使用 · 日／週／月線依完整收盤資料計算。資料不會上傳；匯入新檔可更新。`;
    if(provider&&this.cap.mode==='perpetual'&&this.cap.chartMode!=='widget')provider.textContent='來源：幣安股票永續合約。USDT 計價；漲跌為滾動 24 小時，成交量為合約量。原生圖表以 WebSocket 更新，斷線時定時補抓。掃描使用已完成 UTC 日 K；美股休市時合約仍可能波動。';
  }
  bindSearch() {
    const form = this.root.querySelector("form"),
      input = form.querySelector("input"),
      box = this.root.querySelector(".us2-search-results");
    const search = () => {
      const q = input.value.trim();
      if (!q) {
        box.hidden = true;
        return;
      }
      const rows = searchDirectory(this.directory, q);
      box.hidden = false;
      box.innerHTML = rows.length
        ? rows
            .map(
              (r) =>
                `<button type="button" role="option" data-open-symbol="${e(r.symbol)}"><b>${e(r.symbol)}</b><span>${e(r.alias || r.name)}</span><small>${e(r.type)} · ${e(r.exchange)}${r.complex ? " · 槓桿／反向" : ""}</small></button>`,
            )
            .join("")
        : `<div class="us2-empty">${this.directory.length ? "找不到支援的股票、ADR 或 ETF；請檢查代號。" : this.directoryError ? "股票目錄取得失敗，請重新載入。" : "股票目錄載入中…"}</div>`;
    };
    input.oninput = () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(search, 120);
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const exact = this.directory.find(
        (x) => x.symbol === input.value.trim().toUpperCase(),
      );
      if (exact) this.openStock(exact.symbol);
      else search();
    };
    input.onkeydown = (ev) => {
      if (ev.key === "Escape") box.hidden = true;
    };
    box.onclick = (ev) => {
      const b = ev.target.closest("[data-open-symbol]");
      if (b) this.openStock(b.dataset.openSymbol);
    };
  }
  openStock(symbol, { interval = this.state.interval, collapse = false } = {}) {
    this.state.symbol = symbol;
    this.state.interval = interval;
    this.state.collapsed = collapse;
    this.persist();
    this.root?.querySelector(".us2-search-results")?.setAttribute("hidden", "");
    this.root?.querySelector(".us2-search-dialog[open]")?.close();
    if (this.state.view !== "radar") {
      window.switchAppView?.("radar");
      this.show("radar");
    } else {
      this.chart?.change({ symbol, interval, asset:this.directory.find(x=>x.symbol===symbol)||{} });
      this.updateIdentity();
      this.paintList();
    }
    this.applyPatternGuide(symbol, interval);
    this.lookupQuote(symbol);
    this.setScannerCollapsed(collapse);
  }
  async lookupQuote(symbol) {
    this.quoteController?.abort();
    if (this.cap.chartMode === "widget") {this.quoteError=null;this.updateIdentity();return;}
    if (!nativeAllowed(this.cap)) {
      this.quoteError = "盤後資料公開使用權尚待確認。";
      this.updateDataBrief();
      return;
    }
    const c = new AbortController();
    this.quoteController = c;
    try {
      const q = await USAdapter.quote(symbol, { signal: c.signal, capabilities: this.cap });
      if (c.signal.aborted || !this.active) return;
      this.quoteError = null;
      const previous=this.quotes.get(symbol);
      if(!previous||previous.source!==q.source||previous.marketTime<=q.marketTime)this.quotes.set(symbol,q);
      this.updateIdentity();
      this.updateLive();
    } catch (error) {
      if (!c.signal.aborted) {
        this.quoteError = error.message;
        this.updateDataBrief();
        const node = this.root?.querySelector(".us2-quote-status");
        if (node) node.textContent = error.message;
      }
    }
  }
  toggleWatch(symbol) {
    if (this.watch.has(symbol)) this.watch.delete(symbol);
    else this.watch.add(symbol);
    save(watchKey, [...this.watch]);
    const badge = this.root.querySelector("[data-watch-filter] small");
    if (badge) badge.textContent = this.watch.size;
    [this.root,this.patternSurface].filter(Boolean).forEach(surface=>surface.querySelectorAll(`[data-watch="${CSS.escape(symbol)}"]`).forEach((b) => {
        b.classList.toggle("is-saved", this.watch.has(symbol));
        b.classList.toggle("is-starred", this.watch.has(symbol));
        b.textContent = this.watch.has(symbol) ? "★" : "☆";
        b.setAttribute("aria-pressed", this.watch.has(symbol));
      }));
    if(this.state.watchOnly && catalogueMode(this.snapshot))this.paintList();
  }
  rowHTML(row, { reasons = false, tierStart = false, tierEnd = false } = {}) {
    const quote=this.cap.mode==='perpetual'?this.quotes.get(row.symbol):null;
    if(quote)row={...row,price:quote.price,changePct:quote.changePct};
    const name=stockName({...this.directory.find(item=>item.symbol===row.symbol),...row});
    if(this.state.view==="radar")return `<article class="coin-card us2-stock-row ${row.symbol===this.state.symbol?"selected":""} ${tierStart?"is-tier-start":""} ${tierEnd?"is-tier-end":""}" data-symbol="${e(row.symbol)}" data-interval="${e(row.interval||this.state.interval)}" tabindex="0" role="button" aria-label="開啟 ${e(row.symbol)} ${e(name)} 圖表">${tierStart?`<span class="coin-tier-heading">${e(row.tier)}</span>`:""}<div class="coin-top"><div class="coin-title"><span class="coin-symbol-mobile">${e(row.symbol)}</span></div><div class="coin-top-right"><div class="coin-ox"><span class="coin-ox-label">${this.cap.currency==='USDT'?'USDT':'USD'}</span><b class="coin-ox-value">${price(row.price)}</b></div></div></div><div class="coin-mid"><small class="us2-row-name" title="${e(name)}">${e(name)}</small><span class="mobile-coin-volume">${e(row.setup||row.type||"自選")} · ${e(row.interval||this.state.interval)}</span></div><div class="coin-mobile-bottom"><span class="coin-change ${tone(row.changePct)}">${pct(row.changePct)}</span><button class="watch-star watch-star-mobile us2-star ${this.watch.has(row.symbol)?"is-starred is-saved":""}" data-watch="${e(row.symbol)}" aria-label="收藏 ${e(row.symbol)}" aria-pressed="${this.watch.has(row.symbol)}">${this.watch.has(row.symbol)?"★":"☆"}</button></div></article>`;

    return `<article class="us2-stock-row ${row.symbol === this.state.symbol ? "is-current" : ""} ${tierEnd ? "is-tier-end" : ""}"><button type="button" class="us2-stock-open" data-symbol="${e(row.symbol)}" data-interval="${e(row.interval || "1D")}"><span class="us2-stock-identity"><b>${e(row.symbol)}</b><small>${e(row.alias || row.name || "")}</small></span><span class="us2-stock-numbers"><b>${price(row.price)}</b><small class="${tone(row.changePct)}">${pct(row.changePct)}</small></span>${row.setup ? `<span class="us2-stock-setup">${tierStart ? `<strong class="us2-tier-inline">${e(row.tier)}</strong>` : ""}${e(row.setup)} · ${e(row.interval)}${row.forming ? " · 形成中" : ""}</span>` : ""}${reasons ? `<span class="us2-stock-reasons">${(row.reasons || []).map(e).join(" · ")}</span>` : ""}</button><button type="button" class="us2-star ${this.watch.has(row.symbol) ? "is-saved" : ""}" data-watch="${e(row.symbol)}" aria-label="收藏 ${e(row.symbol)}" aria-pressed="${this.watch.has(row.symbol)}">${this.watch.has(row.symbol) ? "★" : "☆"}</button></article>`;
  }
  bindRows(container, { collapse = false } = {}) {
    container.onkeydown = ev => {
      const card = ev.target.closest("article[data-symbol]");
      if(card && ev.target === card && (ev.key === "Enter" || ev.key === " ")) {ev.preventDefault();this.openStock(card.dataset.symbol,{interval:card.dataset.interval,collapse});}
    };
    container.onclick = (ev) => {
      const pageButton=ev.target.closest('[data-directory-page]');
      if (pageButton) {
        this.catalogueOffset += pageButton.dataset.directoryPage==='next'?50:-50;
        this.paintList();
        container.scrollTop=0;
        return;
      }
      const star = ev.target.closest("[data-watch]");
      if (star) {
        this.toggleWatch(star.dataset.watch);
        return;
      }
      const b = ev.target.closest("[data-symbol]");
      if (b)
        this.openStock(b.dataset.symbol, {
          interval: b.dataset.interval || this.state.interval,
          collapse,
        });
    };
  }
  applyPatternGuide(symbol, interval) {
    const row = this.snapshot?.analyses?.find(
      (x) => x.symbol === symbol && x.interval === interval,
    );
    // Current pressure comes from the shared engine in USChart. Geometry must
    // not redraw an obsolete horizontal/diagonal line over that decision.
    const guide = stockClassic(row || {}, this.state.side)?.eligible ? [...(row?.patterns?.[this.state.side] || [])]
      .filter(pattern => !["horizontal", "trend"].includes(pattern.id)).sort(
      (a, b) => a.distance - b.distance,
    )[0] : null;
    this.chart?.setGuide(guide);
  }
  chartIn(container, symbol, interval) {
    const Chart=this.cap.chartMode === "widget" ? USWidgetChart : USChart;
    this.chart = new Chart(container, {
      symbol,
      interval,
      capabilities: this.cap,
      asset: this.directory.find(x=>x.symbol===symbol)||{},
      onCollapse: this.state.view === "radar" ? () => this.toggleList?.() : null,
      onTierFilter: () => this.paintList(),
      onInterval: (tf) => {
        this.state[this.state.view === "home" ? "homeInterval" : "interval"] = tf;
        if(this.state.view==='home')this.root.querySelectorAll('[data-us-home-tf]').forEach(b=>b.classList.toggle('active',b.dataset.usHomeTf===tf));
        this.persist();
      },
      onState: (result) => {
        if (!this.active) return;
        if(result.stream&&result.quote) {
          const previous=this.quotes.get(result.quote.symbol);
          if(!previous||previous.marketTime<=result.quote.marketTime)this.quotes.set(result.quote.symbol,result.quote);
          this.quoteError=null;this.updateIdentity();this.updateLive();return;
        }
        if (!result.error && !result.stale && result.bars?.length)
          this.lookupQuote(result.symbol || this.chart?.symbol || symbol);
        const hadError = Boolean(this.chartError);
        this.chartError = result.stale ? '更新暫停 · 保留前次 K 線' : result.error;
        this.chartErrorStatus = result.errorStatus;
        this.chartErrorCode = result.errorCode;
        const empty = !result.widget && !!result.error && !result.bars?.length;
        const homeWrap = container.closest(".btc-premium-chart-wrap,.us2-unavailable-chart-wrap");
        if (homeWrap) {
          homeWrap.classList.toggle("btc-premium-chart-wrap", !empty);
          homeWrap.classList.toggle("us2-unavailable-chart-wrap", empty);
          homeWrap.closest(".ox-home-chart").style.minHeight = empty ? "0" : "";
        }
        this.root.querySelector(".us2-radar-layout")?.classList.toggle("is-unavailable", empty);
        this.root.querySelector(".us2-radar-layout")?.classList.toggle("is-widget", !!result.widget);
        if (result.error || hadError) this.paintList();
        this.updateIdentity();
        this.updateLive();
      },
    });
    this.applyPatternGuide(symbol, interval);
  }

  renderMain() {
    const main = this.root.querySelector("main");
    const view = this.state.view;
    if (view === "radar") this.renderRadar(main);
    else if (view === "home") this.renderHome(main);
    else if (view === "strength") this.renderTools(main);
    else if (view === "data") this.renderNews(main);
    else this.renderMedia(main);
  }
  setScannerCollapsed(collapsed) {
    this.state.collapsed = Boolean(collapsed);
    const main = this.root?.querySelector('.us2-radar-pane');
    if (!main) return;
    main.classList.toggle('ox-scanner-collapsed', this.state.collapsed);
    main.querySelector('.us2-radar-layout')?.classList.toggle('is-collapsed', this.state.collapsed);
    const scanner = main.querySelector('.us2-scanner');
    if (scanner) { scanner.inert = this.state.collapsed; scanner.setAttribute('aria-hidden', String(this.state.collapsed)); }
    const button = main.querySelector('[data-collapse]');
    if (button) {
      button.setAttribute('aria-expanded', String(!this.state.collapsed));
      button.setAttribute('aria-label', this.state.collapsed ? '展開雷達清單' : '收起雷達清單');
      button.title = button.getAttribute('aria-label');
    }
    this.persist();
  }
  renderRadar(main) {
    const filters = `<label>策略<select data-mode aria-label="雷達策略">${Object.entries({classic:"OX 經典",ma:"均線排列",breakout:"放量突破",gap:"跳空觀察",rs:"相對 SPY 強弱"}).map(([v,l])=>`<option value="${v}" ${this.state.mode===v?"selected":""}>${l}</option>`).join("")}</select></label><label>資產<select data-type aria-label="資產類型"><option value="stock">股票／ADR</option><option value="ETF">一般 ETF</option><option value="all">兩者</option></select></label><label>分析級別<select data-scan-interval aria-label="雷達分析級別"><option value="1D">1D</option></select></label>`;
    main.innerHTML = `<section class="top-summary compact-summary us2-ticker"><div class="metric-card market-line-card"><div class="market-line-item market-line-price"><button class="us2-symbol-picker" data-search-open aria-label="搜尋並選擇股票">${e(this.state.symbol)} <span>▾</span></button><strong class="us2-quote-value">—</strong></div><div class="market-line-item"><label>當日 · <button class="us2-data-brief" data-data-open>盤後</button></label><strong class="us2-quote-change">—</strong></div><div class="market-line-item us2-volume-cell"><label>成交量</label><strong class="us2-quote-volume">—</strong><button type="button" class="watch-star us2-star" data-watch="${e(this.state.symbol)}" aria-label="收藏目前股票">☆</button></div><div class="market-line-item radar-analysis-cell"><label>雷達策略</label><strong>OX 經典</strong><small>共用結構與量能判斷</small></div><div class="market-line-item radar-analysis-cell"><label>分析級別</label><strong>${e(this.state.scanInterval)}</strong><small>依已收線 K 線</small></div></div></section><div class="workspace us2-radar-layout ${this.state.collapsed ? "is-collapsed" : ""}"><article class="panel chart-box us2-chart-root"></article><aside class="panel us2-scanner"><div class="scanner-tabs"><button class="tab-btn radar-combined-tab us2-tier active" type="button" aria-label="雷達分組：全部，短按循環，長按兩秒展開" aria-haspopup="menu" aria-expanded="false"><span class="radar-combined-mark"><span class="radar-combined-logo">${icon("radar")}</span><span class="radar-tier-current"></span><small class="radar-combined-chevron">▼</small></span></button><button class="tab-btn" type="button" data-strategy-open aria-label="雷達策略與股票池">${icon("settings")}</button><button class="tab-btn" type="button" data-watch-filter aria-label="自選清單" aria-pressed="${this.state.watchOnly}">${icon("star")}<small hidden>${this.watch.size}</small></button><button class="direction-toggle-btn chart-tool-icon us2-side-control ${this.state.side === "long" ? "is-long" : "is-short"}" type="button" data-side aria-label="切換多空"><span class="direction-toggle-icon">${this.state.side === "long" ? "↑" : "↓"}</span></button></div><div class="us2-tier-menu" role="menu" hidden>${["all","T1","T2","T3"].map(t=>`<button role="menuitem" data-tier="${t}">${t==="all"?"全部":t}</button>`).join("")}</div><div class="us2-radar-list scanner-body"></div><small class="us2-list-note" hidden></small></aside></div><dialog class="chart-tools-dialog us2-strategy-dialog" aria-label="雷達策略"><header><b>策略與股票池</b><button data-close-strategy aria-label="關閉策略">${icon("close")}</button></header><div class="us2-dialog-fields">${filters}</div><p class="us2-muted">OX 經典先確認有效壓力、當下方向與同向量能；T123 為品質分級，突破階段另列。其他策略各自篩選。</p></dialog>`;
    const strategy = main.querySelector(".us2-strategy-dialog");
    main.querySelector("[data-strategy-open]").onclick = event => openDialog(strategy, event.currentTarget);
    main.querySelector("[data-close-strategy]").onclick = () => closeDialog(strategy);
    main.querySelector("[data-type]").value = this.state.type;
    main.querySelector("[data-search-open]").onclick = event => this.openSearch(event.currentTarget);
    main.querySelector("[data-data-open]").onclick = event => this.openData(event.currentTarget);
    this.toggleList = () => this.setScannerCollapsed(!this.state.collapsed);
    this.chartIn(
      main.querySelector(".us2-chart-root"),
      this.state.symbol,
      this.state.interval,
    );
    this.updateIdentity();
    this.lookupQuote(this.state.symbol);
    this.setScannerCollapsed(this.state.collapsed);
    const menu = main.querySelector(".us2-tier-menu"),
      tier = main.querySelector(".us2-tier");
    let timer,
      suppress = false,
      start;
    const clear = () => clearTimeout(timer);
    tier.onpointerdown = (ev) => {
      if (ev.button !== 0) return;
      start = { x: ev.clientX, y: ev.clientY };
      timer = setTimeout(() => {
        suppress = true;
        menu.hidden = false;
        tier.setAttribute("aria-expanded", "true");
      }, 2000);
    };
    tier.onpointermove = (ev) => {
      if (start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 12)
        clear();
    };
    tier.onpointerup = clear;
    tier.onpointercancel = clear;
    tier.oncontextmenu = (ev) => ev.preventDefault();
    tier.onclick = () => {
      if (suppress) {
        suppress = false;
        return;
      }
      const groups = ["all", "T1", "T2", "T3"];
      this.state.tier = groups[(groups.indexOf(this.state.tier) + 1) % 4];
      this.paintList();
    };
    tier.onkeydown = (ev) => {
      if (ev.key === "ArrowDown") {
        menu.hidden = false;
        tier.setAttribute("aria-expanded", "true");
        menu.querySelector("button").focus();
      }
    };
    menu.onclick = (ev) => {
      const b = ev.target.closest("[data-tier]");
      if (b) {
        this.state.tier = b.dataset.tier;
        menu.hidden = true;
        tier.setAttribute("aria-expanded", "false");
        this.paintList();
      }
    };
    main.querySelector("[data-watch-filter]").onclick = (ev) => {
      this.state.watchOnly = !this.state.watchOnly;
      ev.currentTarget.setAttribute("aria-pressed", this.state.watchOnly);
      this.paintList();
    };
    main.querySelector("[data-side]").onclick = (ev) => {
      this.state.side = this.state.side === "long" ? "short" : "long";
      ev.currentTarget.querySelector(".direction-toggle-icon").textContent = this.state.side === "long" ? "↑" : "↓";
      ev.currentTarget.classList.toggle("is-long",this.state.side === "long");
      ev.currentTarget.classList.toggle("is-short",this.state.side === "short");
      this.paintList();
    };
    main.querySelector("[data-scan-interval]").onchange = (ev) => {
      this.state.scanInterval = ev.target.value;
      this.persist();
      this.paintList();
    };
    for (const key of ["mode", "type"])
      main.querySelector(`[data-${key}]`).onchange = (ev) => {
        this.state[key] = ev.target.value;
        this.persist();
        this.paintList();
      };
    main.querySelector(".us2-ticker [data-watch]").onclick = () =>
      this.toggleWatch(this.state.symbol);
    this.paintList();
  }
  updateIdentity() {
    if (!this.active) return;
    const main = this.root?.querySelector("main");
    if (!main) return;
    const symbol =
        this.state.view === "home" ? this.state.homeSymbol : this.state.symbol,
      item = this.directory.find((x) => x.symbol === symbol),
      q = this.quotes.get(symbol);
    if (this.state.view === "home") {
      const ticker=main.querySelector(".us2-home-symbol");if(ticker)ticker.textContent=symbol;
      if(ticker) {
        let name=main.querySelector('.us2-home-name');
        if(!name){name=document.createElement('small');name.className='us2-home-name';ticker.after(name);}
        name.textContent=stockName(item || {symbol});name.title=name.textContent;
      }
      main.querySelectorAll("[data-benchmark]").forEach((button) => {
        const quote = this.quotes.get(button.dataset.benchmark);
        const value = button.querySelector("span"), change = button.querySelector("em");
        if (value) value.textContent = price(quote?.price);
        if (change) {
          change.textContent = pct(quote?.changePct);
          change.className = tone(quote?.changePct);
        }
      });
    }
    this.updateDataBrief();
    const picker = main.querySelector(".us2-symbol-picker");
    if (picker) picker.textContent = symbol; // shared Crypto selector supplies its own chevron
    const value = main.querySelector(".us2-quote-value"), change = main.querySelector(".us2-quote-change"), volume = main.querySelector(".us2-quote-volume");
    const widget=this.cap.chartMode === "widget";
    main.classList.toggle('us2-free-display',widget);
    const ticker=main.querySelector('.us2-ticker');
    if(ticker) {
      const card=ticker.querySelector('.metric-card,.us2-widget-summary');
      card.classList.toggle('metric-card',!widget);
      card.classList.toggle('panel',widget);
      card.classList.toggle('market-line-card',!widget);
      card.classList.toggle('us2-widget-summary',widget);
      const identityCell=ticker.querySelector('.market-line-price');
      let name=identityCell.querySelector('.us2-ticker-name');
      if(!name){name=document.createElement('span');name.className='us2-ticker-name';identityCell.append(name);}
      name.hidden=false;name.textContent=stockName(item || {symbol});name.title=name.textContent;
      if(widget)identityCell.append(ticker.querySelector('[data-watch]'));
      else ticker.querySelector('.us2-volume-cell').append(ticker.querySelector('[data-watch]'));
      let reserved=card.querySelector('[data-native-summary]');
      if(widget) {
        if(!reserved){reserved=document.createElement('div');reserved.dataset.nativeSummary='';reserved.hidden=true;card.append(reserved);}
        for(const field of card.querySelectorAll('.us2-volume-cell,.radar-analysis-cell'))reserved.append(field);
      } else if(reserved) {
        card.append(...reserved.children);reserved.remove();
      }
    }
    if (value) {
      value.textContent = widget ? "行情見圖表" : price(q?.price);
      value.hidden=widget;
      const homePrice=value.closest('.ox-home-price');if(homePrice)homePrice.hidden=widget;
      if(homePrice)homePrice.querySelector('small').textContent=this.cap.currency||'USD';
    }
    if (change) {change.hidden=widget;change.textContent = widget ? "依圖表標示" : pct(q?.changePct);change.className = `us2-quote-change ${widget?'':tone(q?.changePct)}`;}
    if (volume) {volume.textContent = widget ? "見圖表" : q?.volume == null ? "—" : compact(q.volume); volume.title = q?.volumeScope || "成交量口徑未確認";}
    if (!widget && Number.isFinite(q?.changePct)) {
      main.dataset.priceDirection = q.changePct >= 0 ? 'up' : 'down';
      main.dataset.glowLevel = String(Math.abs(q.changePct) >= 5 ? 3 : Math.abs(q.changePct) >= 2 ? 2 : 1);
    } else { delete main.dataset.priceDirection; delete main.dataset.glowLevel; }
    const identity = main.querySelector(".us2-selected-identity");
    if (identity)
      identity.innerHTML = `<b>${e(symbol)}</b><small>${e(item?.alias || item?.name || q?.name || "美股")} · ${e(item?.type || "股票")} · ${e(item?.exchange || q?.exchange || "")}</small>`;
    const numbers = main.querySelector(".us2-selected-price");
    if (numbers)
      numbers.innerHTML = `<b>${price(q?.price)}</b><small class="${tone(q?.changePct)}">${pct(q?.changePct)}</small>`;
    const status = this.root.querySelector(".us2-quote-status");
    if (status)
      status.textContent = widget ? "TradingView 自行更新行情；資料來源與延遲以圖表標示為準。" : this.quoteError || (q
        ? `${quoteStatus(q)} · 行情 ${fmt(q.marketTime * 1000)} · 取得 ${fmt(q.receivedAt)}`
        : "尚無有效行情");
    const star = main.querySelector(".us2-ticker [data-watch]");
    if (star) {
      star.dataset.watch = symbol;
      star.textContent = this.watch.has(symbol) ? "★" : "☆";
      star.classList.toggle("is-saved", this.watch.has(symbol));
      star.setAttribute("aria-pressed", this.watch.has(symbol));
    }
  }
  paintList() {
    const list = this.root?.querySelector(".us2-radar-list");
    if (!list) return;
    const y = list.scrollTop;
    const summary = this.root.querySelectorAll('.radar-analysis-cell strong');
    if (summary[0]) summary[0].textContent = {classic:'OX 經典',ma:'均線排列',breakout:'放量突破',gap:'跳空觀察',rs:'相對 SPY 強弱'}[this.state.mode] || 'OX 經典';
    if (summary[1]) summary[1].textContent = this.state.scanInterval;
    const referenceOnly = catalogueMode(this.snapshot);
    const tierButton=this.root.querySelector('.us2-tier');
    const sideButton=this.root.querySelector('[data-side]');
    for(const control of [tierButton,sideButton,this.root.querySelector('[data-mode]'),this.root.querySelector('[data-scan-interval]')])
      if(control)control.disabled=referenceOnly;
    if(tierButton)tierButton.setAttribute('aria-label',referenceOnly?'股票名錄，未進行型態掃描':`雷達分組：${this.state.tier==='all'?'全部':this.state.tier}，短按循環，長按兩秒展開`);
    if(referenceOnly) {
      const key=`${this.state.type}:${this.state.watchOnly}`;
      if(this.catalogueKey!==key){this.catalogueKey=key;this.catalogueOffset=0;}
      const page=cataloguePage(this.directory,{...this.state,watch:this.watch,offset:this.catalogueOffset});
      this.catalogueOffset=page.offset;
      const typeLabel={stock:'股票',ADR:'ADR',ETF:'ETF'};
      const pager=page.total>50?`<nav class="us2-directory-pages" aria-label="股票名錄分頁"><span>${page.offset+1}–${page.offset+page.items.length} / ${page.total.toLocaleString()}</span><button type="button" data-directory-page="prev" ${page.offset===0?'disabled':''}>上一批</button><button type="button" data-directory-page="next" ${page.offset+page.items.length>=page.total?'disabled':''}>下一批</button></nav>`:'';
      list.innerHTML=page.items.length ? `<div class="us2-catalogue-note">股票名錄 · 未掃描<span>${this.cap.chartMode==="widget"?"點選股票查看 K 線；OX 掃描待開通":"股名可瀏覽；價格及 K 線待開通"}</span></div>`+page.items.map(item=>`<article class="coin-card us2-stock-row us2-directory-row ${item.symbol===this.state.symbol?'selected':''}" data-symbol="${e(item.symbol)}" data-interval="1D" role="button" tabindex="0" aria-label="選擇 ${e(item.symbol)} ${e(stockName(item))}"><div class="us2-directory-top"><b class="us2-directory-symbol">${e(item.symbol)}</b><button class="watch-star us2-star ${this.watch.has(item.symbol)?'is-saved':''}" data-watch="${e(item.symbol)}" aria-label="收藏 ${e(item.symbol)}" aria-pressed="${this.watch.has(item.symbol)}">${this.watch.has(item.symbol)?'★':'☆'}</button></div><small class="us2-row-name" title="${e(stockName(item))}">${e(stockName(item))}</small><small class="us2-directory-meta">${e(item.exchange)} · ${typeLabel[item.type] || e(item.type)}</small></article>`).join('')+pager : `<div class="us2-empty">${this.directoryError?'股票名錄暫時無法載入。<button type="button" class="us2-directory-retry" data-directory-retry>重試載入股票名錄</button>':this.directory.length?'自選尚無標的，可從搜尋或名錄收藏。':'股票名錄載入中…'}</div>`;
      list.scrollTop=y;
      list.querySelector('[data-directory-retry]')?.addEventListener('click', () => { this.loadDirectory(); this.paintList(); });
      this.bindRows(list);
      const label=tierButton?.querySelector('.radar-tier-current');if(label)label.textContent='股名';
      const note=this.root.querySelector('.us2-list-note');if(note)note.textContent=`名錄 ${page.total.toLocaleString()} 檔 · 非雷達分析結果`;
      return;
    }
    const analyses = (this.snapshot?.analyses || []).filter(
      (x) => x.interval === this.state.scanInterval,
    );
    const combination=globalThis.OXTierFilters?.get('us');
    let rows = timeframeTierResults(this.snapshot?.analyses||[],this.state,combination);
    if (this.state.watchOnly && combination?.enabled) rows=rows.filter(row=>this.watch.has(row.symbol));
    else if (this.state.watchOnly)
      rows = [...this.watch].map(
        (symbol) =>
          analyses.find((x) => x.symbol === symbol) || {
            ...this.directory.find((x) => x.symbol === symbol),
            ...this.quotes.get(symbol),
            symbol,
            interval: this.state.interval,
            setup: "自選 · 尚無共用分析",
          },
      );
    if (this.state.tier !== "all" && !this.state.watchOnly)
      rows = rows.filter((x) => x.tier === this.state.tier);
    let previous = "";
    list.innerHTML = rows.length
      ? rows
          .map((row, i) => {
            const tierStart = row.tier && row.tier !== previous;
            previous = row.tier;
            return this.rowHTML(row, {reasons:true, tierStart, tierEnd: row.tier && rows[i + 1]?.tier !== row.tier});
          })
          .join("")
      : `<div class="us2-empty">${this.state.watchOnly ? "自選尚無標的。搜尋股票並點星星收藏。" : this.snapshot?.analyses?.length ? "目前沒有符合條件的候選，請切換策略或多空。" : this.cap.chartMode === "widget" ? "免費圖表可看盤。OX 經典掃描需另接原始 K 線；目前沒有掃描結果。" : (!nativeAllowed(this.cap) || this.chartErrorCode === "US_DATA_DISPLAY_RIGHTS_REQUIRED") ? "盤後快照尚未開通。可先搜尋股票、建立自選。" : "收盤快照尚未取得，暫無盤後分析。"}</div>`;
    list.scrollTop = y;
    this.bindRows(list);
    const control = this.root.querySelector(".us2-tier .radar-tier-current");
    if (control)
      control.textContent =
        this.state.tier === "all" ? "全部" : this.state.tier;
    this.root.querySelector(".us2-list-note").textContent =
      `${rows.length} 個結果 · ${combination?.enabled?combination.rules.map(r=>r.frame+' '+r.tier).join(combination.match==='any'?'／':'＋'):this.state.scanInterval} 已收線分析${this.snapshot?.sessionDate ? " · 交易日 " + this.snapshot.sessionDate : ""}`;
  }
  renderHome(main) {
    main.innerHTML = `<div class="ox-editorial-home"><section class="ox-home-main" aria-label="美股市場主圖與摘要"><article class="ox-home-chart us2-home-chart"><div class="ox-home-quote"><div class="ox-home-identity"><div><span class="ox-home-ticker us2-home-symbol">${e(this.state.homeSymbol)}</span><small>美股 ETF · <span class="us2-display-source">收盤資料</span> <button class="us2-data-brief" data-data-open>盤後</button></small></div></div><div class="ox-home-price"><strong class="us2-quote-value">—</strong><small>USD</small><span class="us2-quote-change">—</span></div></div><div class="ox-chart-heading"><nav class="us2-benchmarks" role="group" aria-label="市場基準 ETF">${["SPY","QQQ","IWM"].map(s=>`<button data-benchmark="${s}" aria-pressed="${this.state.homeSymbol===s}"><b>${s}</b></button>`).join("")}</nav><div class="v34-home-main-toolbar" aria-label="首頁主圖週期">${EOD_INTERVALS.map(tf=>`<button class="v34-home-mini-tf ${this.state.homeInterval===tf?"active":""}" type="button" data-us-home-tf="${tf}">${tf}</button>`).join("")}</div><button class="ox-text-button" data-home-analyze aria-label="在雷達分析目前 ETF">↗</button></div><div class="btc-premium-chart-wrap"><div class="us2-chart-root"></div></div></article><section class="ox-home-t1" aria-label="自選與類股摘要"><div class="ox-home-t1-side"><div class="ox-home-t1-head"><span>自選摘要</span><button class="ox-text-button" data-home-watch aria-label="查看自選雷達">↗</button></div><div class="us2-home-watch ox-home-t1-list"></div></div><div class="ox-home-t1-side"><div class="ox-home-t1-head"><span>類股 ETF</span><small>代理指標</small></div><div class="us2-home-sectors ox-home-t1-list"></div></div></section><aside class="ox-home-analysis"><div class="ox-analysis-heading"><h2>重要事件</h2><button class="ox-text-button" data-home-events aria-label="查看美股事件">↗</button></div><div class="us2-home-events"></div></aside></section></div>`;
    // Match Crypto's chart / paired candidates / market readings arrangement.
    // Public widget mode keeps its existing event and reference-only content.
    const events = main.querySelector('.ox-home-analysis');
    events.className = 'us2-home-events-section';
    events.insertAdjacentHTML('beforebegin', `<aside class="ox-home-analysis us2-home-native-analysis" aria-label="美股收盤市場強度" hidden><div class="ox-analysis-heading"><div><span class="ox-eyebrow">MARKET INTELLIGENCE</span><h2>市場強度</h2></div><button type="button" class="ox-text-button" data-home-indicators aria-label="查看美股市場指標">↗</button></div><div class="ox-strength-duo">${[['advance','上漲家數比'],['ma','站上 20 日線']].map(([key,label])=>`<div class="ox-strength-reading"><svg class="ox-strength-gauge" viewBox="0 0 160 104" aria-hidden="true"><path class="ox-gauge-track" d="M15 85 A67 67 0 1 1 145 85" pathLength="100"/><path class="ox-gauge-value" data-home-arc="${key}" d="M15 85 A67 67 0 1 1 145 85" pathLength="100" stroke-dasharray="0 100"/></svg><small>${label}</small><div><strong data-home-ratio="${key}">—</strong><span>%</span></div><span data-home-ratio-note="${key}">等待收盤資料</span></div>`).join('')}</div><div class="ox-strength-context"><span data-home-breadth-note>依有行情的股票觀察池計算</span><span data-home-session-note>收盤資料待取得</span></div><div class="ox-score-panel"><span class="ox-eyebrow">OX RADAR <span class="ox-score-index">收盤觀察池</span></span><div class="ox-score-reading"><strong data-home-pool-count>—</strong><span>檔</span></div><span class="us2-home-pool-note" data-home-pool-note>等待真實行情</span><div class="ox-meter" role="meter" aria-label="觀察池上漲比例" aria-valuemin="0" aria-valuemax="100"><i data-home-breadth-meter></i></div></div></aside>`);
    main.querySelector('[data-home-indicators]').onclick = () => window.switchAppView?.('strength');
    main.querySelector("[data-data-open]").onclick = event => this.openData(event.currentTarget);
    this.chartIn(
      main.querySelector(".us2-chart-root"),
      this.state.homeSymbol,
      this.state.homeInterval,
    );
    main.querySelector('.us2-chart-toolbar').hidden=true;
    main.querySelectorAll('[data-us-home-tf]').forEach(b=>{
      b.hidden = Boolean(this.cap.intervals && !this.cap.intervals.includes(b.dataset.usHomeTf));
      b.onclick=()=>this.chart.change({interval:b.dataset.usHomeTf});
    });
    const analyze=main.querySelector("[data-home-analyze]");
    analyze.setAttribute("aria-label","在雷達分析目前 ETF");
    analyze.onclick=()=>this.openStock(this.state.homeSymbol,{interval:this.state.homeInterval,collapse:true});
    main.querySelectorAll("[data-benchmark]").forEach(
      (b) =>
        (b.onclick = () => {
          this.state.homeSymbol = b.dataset.benchmark;
          this.chart.change({ symbol: this.state.homeSymbol, interval: this.state.homeInterval });
          main
            .querySelectorAll("[data-benchmark]")
            .forEach((x) => x.setAttribute("aria-pressed", x === b));
          this.updateIdentity();this.lookupQuote(this.state.homeSymbol);this.persist();
        }),
    );
    this.updateIdentity();this.lookupQuote(this.state.homeSymbol);
    main.querySelector("[data-home-watch]").onclick = () => {
      this.state.watchOnly = true;
      window.switchAppView?.("radar");
    };
    main.querySelector("[data-home-events]").onclick = () =>
      window.switchAppView?.("data");
    this.updateHome();
    this.loadNewsData()
      .then(() => this.updateHome())
      .catch(() => {});
  }
  updateHome() {
    const rows = (this.snapshot?.analyses || []).filter(
        (x) => x.interval === "1D",
      ),
      node = this.root.querySelector(".us2-home-watch");
    if (!node) return;
    this.updateHomeMarket(rows);
    if (this.cap.chartMode !== 'widget') {
      this.renderHomeCandidates(rows, node, 'long');
      this.renderHomeCandidates(rows, this.root.querySelector('.us2-home-sectors'), 'short');
      const headings = this.root.querySelectorAll('.ox-home-t1-head');
      headings[0].querySelector('span').textContent = '上漲 · T1 / T2 / T3';
      headings[1].querySelector('span').textContent = '下跌 · T1 / T2 / T3';
      headings[1].querySelector('small').hidden = true;
      this.root.querySelector('.ox-home-t1').setAttribute('aria-label', 'T1 T2 T3 上漲與下跌候選');
      const shortcut = this.root.querySelector('[data-home-watch]');
      shortcut.setAttribute('aria-label', '查看上漲候選雷達');
      shortcut.onclick = () => {
        this.state.side = 'long'; this.state.watchOnly = false;
        this.state.scanInterval = '1D'; this.state.tier = 'all';
        window.switchAppView?.('radar');
      };
    } else {
    const headings = this.root.querySelectorAll('.ox-home-t1-head');
    headings[0].querySelector('span').textContent = '自選摘要';
    headings[1].querySelector('span').textContent = '類股 ETF';
    headings[1].querySelector('small').hidden = false;
    this.root.querySelector('.ox-home-t1').setAttribute('aria-label', '自選與類股摘要');
    const watched = [...this.watch]
      .slice(0, 5)
      .map(
        (symbol) =>
          rows.find((x) => x.symbol === symbol) || {
            ...this.directory.find((x) => x.symbol === symbol),
            ...this.quotes.get(symbol),
            symbol,
          },
      );
    node.innerHTML = watched.length
      ? watched.map((r) => this.rowHTML(r)).join("")
      : '<div class="us2-empty">搜尋股票，點星星建立自選。</div>';
    this.bindRows(node);
    const sectors = this.root.querySelector(".us2-home-sectors"),
      sectorRows = rows.filter((x) => sectorETF[x.symbol]);
    sectors.innerHTML = sectorRows.length
      ? sectorRows
          .map(
            (r) =>
              `<button data-symbol="${e(r.symbol)}"><span>${sectorETF[r.symbol]} ${r.symbol}</span><b class="${tone(r.changePct)}">${pct(r.changePct)}</b></button>`,
          )
          .join("")
      : this.cap.chartMode === 'widget' ? Object.entries(sectorETF).map(([symbol,name])=>`<button data-symbol="${e(symbol)}"><span>${e(name)} ${e(symbol)}</span><small>查看行情 ↗</small></button>`).join('') : '<div class="us2-empty">類股 ETF 快照尚未收集。</div>';
    this.bindRows(sectors);
    }
    const events = (this.newsData?.events || [])
      .filter(
        (x) =>
          x.markets?.includes("us") &&
          x.occursAt &&
          Date.parse(x.occursAt) > Date.now(),
      )
      .sort((a, b) => a.occursAt.localeCompare(b.occursAt))
      .slice(0, 4);
    this.root.querySelector(".us2-home-events").innerHTML = events.length
      ? events
          .map(
            (x) =>
              `<p><b>${e(x.titleZh || x.title)}</b><small>${fmt(x.occursAt)}</small></p>`,
          )
          .join("")
      : '<div class="us2-empty">目前沒有來源已確認的近期事件。</div>';
  }
  updateHomeMarket(rows) {
    const panel = this.root.querySelector('.us2-home-native-analysis');
    if (!panel) return;
    panel.hidden = this.cap.chartMode === 'widget';
    if (panel.hidden) return;
    const data = usHomeMarketMetrics(rows);
    for (const [key, value, note] of [
      ['advance', data.advanceRatio, data.total ? `${data.advancing} 漲 · ${data.declining} 跌 · ${data.unchanged} 平` : '尚無有效收盤資料'],
      ['ma', data.aboveMARatio, data.maTotal ? `${data.aboveMA} / ${data.maTotal} 檔站上均線` : '尚無足夠日 K 線'],
    ]) {
      panel.querySelector(`[data-home-ratio="${key}"]`).textContent = value === null ? '—' : value.toFixed(0);
      panel.querySelector(`[data-home-ratio-note="${key}"]`).textContent = note;
      panel.querySelector(`[data-home-arc="${key}"]`).setAttribute('stroke-dasharray', `${value ?? 0} 100`);
    }
    panel.querySelector('[data-home-pool-count]').textContent = data.total ? data.total.toLocaleString() : '—';
    panel.querySelector('[data-home-pool-note]').textContent = data.total ? `${data.advancing} 檔上漲 · ${data.declining} 檔下跌` : '等待真實行情';
    panel.querySelector('[data-home-breadth-note]').textContent = data.total ? `觀察池 ${data.total.toLocaleString()} 檔股票 · 不含 ETF` : '依有行情的股票觀察池計算';
    const freshness = eodFreshness(this.snapshot?.sessionDate);
    panel.querySelector('[data-home-session-note]').textContent = this.cap.mode==='perpetual'
      ? (this.snapshot?.asOf?'幣安合約 · 已完成 UTC 日 K':'合約日 K 資料待取得')
      : this.snapshot?.sessionDate ? `${this.snapshot.sessionDate} 已收盤${freshness.status === 'stale' ? ' · 待更新' : ''}` : '收盤資料待取得';
    const meter = panel.querySelector('[data-home-breadth-meter]');
    meter.style.width = `${data.advanceRatio ?? 0}%`;
    if (data.advanceRatio === null) meter.parentElement.removeAttribute('aria-valuenow');
    else meter.parentElement.setAttribute('aria-valuenow', data.advanceRatio.toFixed(1));
  }
  renderHomeCandidates(rows, box, side) {
    if (!box) return;
    const candidates = tierResults(rows, { side, mode: 'classic', type: 'stock' })
      .filter(row => side === 'long' ? row.changePct > 0 : row.changePct < 0);
    const existing = new Map([...box.querySelectorAll('[data-symbol]')].map(row => [row.dataset.symbol, row]));
    const displayed = [];
    let previousTier = null;
    for (const candidate of candidates) {
      const row = existing.get(candidate.symbol) || document.createElement('button');
      const starts = candidate.tier !== previousTier;
      previousTier = candidate.tier;
      row.type = 'button'; row.className = `ox-home-t1-row${starts ? ' is-tier-start' : ''}`;
      row.dataset.symbol = candidate.symbol; row.dataset.interval = '1D';
      row.dataset.homeTier = candidate.tier;
      row.title = `${candidate.symbol} ${candidate.name || ''} · ${candidate.setup} · 距關鍵位 ${Number.isFinite(candidate.distance) ? candidate.distance.toFixed(2) + ' ATR' : '—'}`;
      const markup = `<small class="ox-home-row-tier" ${starts ? '' : 'hidden'}>${e(candidate.tier)}</small><span class="ox-home-t1-identity"><strong>${e(candidate.symbol)}</strong></span><small>距 ${Number.isFinite(candidate.distance)?candidate.distance.toFixed(2)+" ATR":"—"}</small><em class="${tone(candidate.changePct)}">${pct(candidate.changePct)}</em>`;
      if (row._markup !== markup) { row.innerHTML = markup; row._markup = markup; }
      displayed.push(row);
    }
    if (!displayed.length) {
      const empty = document.createElement('span'); empty.className = 'ox-home-t1-empty';
      empty.textContent = this.snapshotError || `目前沒有${side === 'long' ? '上漲' : '下跌'}型態候選`;
      box.replaceChildren(empty);
    } else {
      displayed.forEach((row, i) => { if (box.children[i] !== row) box.insertBefore(row, box.children[i] || null); });
      for (const child of [...box.children]) if (!displayed.includes(child)) child.remove();
      box.style.setProperty('--home-five-rows', `${displayed.slice(0, 5).reduce((sum, row) => sum + (row.classList.contains('is-tier-start') ? 64 : 51), 0) + Math.max(0, Math.min(displayed.length, 5) - 1) * 9}px`);
    }
    box.onclick = event => {
      const row = event.target.closest('[data-symbol]');
      if (!row) return;
      this.state.side = side; this.state.watchOnly = false;
      this.state.tier = 'all'; this.state.scanInterval = '1D';
      this.openStock(row.dataset.symbol, { interval: '1D', collapse: true });
    };
  }
  toolRows() {
    let rows = (this.snapshot?.analyses || []).filter(
      (x) => x.interval === "1D",
    );
    if (this.state.scope === "watch")
      rows = rows.filter((r) => this.watch.has(r.symbol));
    else if (this.state.scope === "sector")
      rows = rows.filter((r) => sectorETF[r.symbol]);
    return rows.filter((r) => !r.complex);
  }
  updateSections() {
    if (!this.active) return;
    if (this.state.view === "radar") this.paintList();
    if (this.state.view === "strength") {
      if (this.state.tool === "patterns") this.scanPatterns();
      else if (this.bubbles) {
        this.bubbles.rows = this.toolRows();
        this.bubbles.draw();
      } else if (this.heatChart) this.updateHeatmap();
      else if (!this.root.querySelector(".us2-tool-list [data-symbol]"))
        this.renderToolContent();
    }
    if (this.state.view === "home") this.updateHome();
  }
  async refreshSnapshot() {
    if (!this.active || this.refreshingSnapshot) return;
    this.refreshingSnapshot = true;
    const signal = this.controller.signal;
    const refresh = this.root.querySelector('[data-eod-refresh]');
    if (refresh) { refresh.disabled = true; refresh.setAttribute('aria-busy', 'true'); }
    this.root.querySelector('.us2-eod-summary')?.classList.add('is-refreshing');
    if (this.directoryError || !this.directory.length) this.loadDirectory();
    try {
      const s = await USAdapter.snapshot({ signal });
      if (this.active && !signal.aborted) {
        this.snapshotError=s.error||null;
        this.snapshot = s;
        this.cap={...this.cap,sessionDate:s.sessionDate};
        this.chart?.setCapabilities(this.cap);
        this.chart?.load(true);
        this.acceptSnapshotQuotes(s);
        this.updateIdentity();
        this.updateCounts();
        this.updateSections();
        this.updateLive();
      }
    } catch (error) {
      if (this.active && !signal.aborted) {
        this.snapshotError = error.message || '收盤資料更新失敗';
        this.updateCounts();
      }
    } finally {
      this.refreshingSnapshot = false;
      if (refresh) { refresh.disabled = false; refresh.removeAttribute('aria-busy'); }
      this.root?.querySelector('.us2-eod-summary')?.classList.remove('is-refreshing');
    }
    // Closing snapshots refresh on entry or explicit user action, never intraday polling.
    this.scheduleSnapshot();
  }
}

Object.assign(USWorkspace.prototype, toolsViews, newsViews);
