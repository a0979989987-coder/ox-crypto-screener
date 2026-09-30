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
} from "./view-utils.js";
import { toolsViews } from "./tools.js";
import { newsViews } from "./news.js";
import { USAdapter, fetchJSON } from "./provider.js";
import { USChart } from "./chart.js";
import { searchDirectory, quoteStatus } from "./model.js";
import { sessionAt, nyParts } from "./calendar.js";

import { tierResults } from "./analysis.js";
export class USWorkspace {
  constructor() {
    const p = read(prefsKey, {});
    this.state = {
      view: "radar",
      symbol: p.symbol || "SPY",
      interval: p.interval || "1D",
      homeSymbol: p.homeSymbol || "SPY",
      homeInterval: p.homeInterval || "1D",
      side: "long",
      tier: "all",
      mode: p.mode || "classic",
      scanInterval: p.scanInterval || "1D",
      type: p.type || "stock",
      tool: p.tool || "patterns",
      scope: p.scope || "all",
      rank: "change",
      pattern: "all",
      patternInterval: "1D",
      patternMode: "conditions",
      watchOnly: false,
    };
    this.watch = new Set(read(watchKey, []));
    this.directory = [];
    this.snapshot = null;
    this.cap = {};
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
    document.body.dataset.usWorkspace = "1";
    this.controller?.abort();
    clearTimeout(this.refreshTimer);
    this.controller = new AbortController();
    this.show(view || this.state.view);
    const signal = this.controller.signal;
    const jobs = [
      USAdapter.directory({ signal }).then((d) => {
        this.directory = d.items;
        this.directoryDate = d.receivedAt;
        this.updateCounts();
        this.updateIdentity();
      }),
      USAdapter.capabilities({ signal }).then((c) => {
        this.cap = c;
        if (this.chart) this.chart.capabilities = c;
        this.updateCounts();
      }),
      USAdapter.snapshot({ signal })
        .then((s) => {
          this.snapshot = s;
          for (const q of s.quotes || []) this.quotes.set(q.symbol, q);
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
      this.refreshTimer = setTimeout(() => this.refreshSnapshot(), 300000);
    }
  }
  persist() {
    save(prefsKey, this.state);
  }
  destroyTools() {
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
    this.destroyTools();
    delete document.body.dataset.usWorkspace;
    this.root?.classList.remove("us2-root");
  }
  suspend() {
    this.destroyTools();
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
    this.root.innerHTML = `<div class="us2-shell"><header class="us2-header"><div class="us2-market-label"><span class="us2-session">${e(sessionAt().label)}</span><span class="us2-data-state">美股 · ${e({ home: "市場總覽", strength: "指標工具", radar: "OX 經典雷達", data: "新聞與事件", media: "研究與教學" }[view])}</span></div><form class="us2-search" role="search"><input aria-label="搜尋美股" placeholder="代號、公司名稱／中文別名" autocomplete="off" spellcheck="false"><button type="submit" aria-label="搜尋股票">⌕</button></form><div class="us2-search-results" hidden role="listbox" aria-label="美股搜尋結果"></div></header><div class="us2-counts" role="status"></div><main class="us2-main"></main></div>`;
    this.bindSearch();
    this.renderMain();
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
    node.textContent = `可搜尋 ${this.directory.length.toLocaleString()} · 有效報價 ${counts?.quoted ?? 0} · 實際分析 ${counts?.scanned ?? 0}${this.snapshot?.asOf ? " · 快照 " + fmt(this.snapshot.asOf) : ""}${this.snapshotError ? " · 共用掃描快照未取得" : ""}`;
    node.title = `報價／分析數是上次共用收集實際通過驗證的數量。${this.directoryDate ? "目錄更新 " + fmt(this.directoryDate) : ""}`;
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
      const benchmarks = ["SPY", "QQQ", "IWM"]
        .map((s) => this.quotes.get(s))
        .filter(Boolean);
      live.textContent = `美股 · ${sessionAt().label} · ${benchmarks.map((q) => `${q.symbol} ETF ${price(q.price)} ${pct(q.changePct)}`).join("　｜　") || "選擇股票查看真實 OHLCV"} · ${this.snapshot?.asOf ? "共用掃描 " + fmt(this.snapshot.asOf) : "掃描快照未取得"}`;
      live.title = live.textContent;
      live.dataset.usText = live.textContent;
    }
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
        : `<div class="us2-empty">${this.directory.length ? "找不到支援的股票、ADR 或 ETF；請檢查代號。" : "股票目錄載入中…"}</div>`;
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
    if (this.state.view !== "radar") {
      window.switchAppView?.("radar");
      this.show("radar");
    } else {
      this.chart?.change({ symbol, interval });
      this.updateIdentity();
      this.paintList();
    }
    this.applyPatternGuide(symbol, interval);
    this.lookupQuote(symbol);
    if (collapse)
      this.root
        .querySelector(".us2-radar-layout")
        ?.classList.add("is-collapsed");
  }
  async lookupQuote(symbol) {
    this.quoteController?.abort();
    const c = new AbortController();
    this.quoteController = c;
    try {
      const q = await USAdapter.quote(symbol, { signal: c.signal });
      if (c.signal.aborted || !this.active) return;
      this.quotes.set(symbol, q);
      this.updateIdentity();
      this.updateLive();
    } catch (error) {
      if (!c.signal.aborted) {
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
    this.root
      .querySelectorAll(`[data-watch="${CSS.escape(symbol)}"]`)
      .forEach((b) => {
        b.classList.toggle("is-saved", this.watch.has(symbol));
        b.textContent = this.watch.has(symbol) ? "★" : "☆";
        b.setAttribute("aria-pressed", this.watch.has(symbol));
      });
  }
  rowHTML(row, { reasons = false, tierStart = false, tierEnd = false } = {}) {
    return `<article class="us2-stock-row ${row.symbol === this.state.symbol ? "is-current" : ""} ${tierEnd ? "is-tier-end" : ""}"><button type="button" class="us2-stock-open" data-symbol="${e(row.symbol)}" data-interval="${e(row.interval || "1D")}"><span class="us2-stock-identity"><b>${e(row.symbol)}</b><small>${e(row.alias || row.name || "")}</small></span><span class="us2-stock-numbers"><b>${price(row.price)}</b><small class="${tone(row.changePct)}">${pct(row.changePct)}</small></span>${row.setup ? `<span class="us2-stock-setup">${tierStart ? `<strong class="us2-tier-inline">${e(row.tier)}</strong>` : ""}${e(row.setup)} · ${e(row.interval)}${row.forming ? " · 形成中" : ""}</span>` : ""}${reasons ? `<span class="us2-stock-reasons">${(row.reasons || []).map(e).join(" · ")}</span>` : ""}</button><button type="button" class="us2-star ${this.watch.has(row.symbol) ? "is-saved" : ""}" data-watch="${e(row.symbol)}" aria-label="收藏 ${e(row.symbol)}" aria-pressed="${this.watch.has(row.symbol)}">${this.watch.has(row.symbol) ? "★" : "☆"}</button></article>`;
  }
  bindRows(container, { collapse = false } = {}) {
    container.onclick = (ev) => {
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
    const guide = [...(row?.patterns?.[this.state.side] || [])].sort(
      (a, b) => a.distance - b.distance,
    )[0];
    this.chart?.setGuide(guide);
  }
  chartIn(container, symbol, interval) {
    this.chart = new USChart(container, {
      symbol,
      interval,
      capabilities: this.cap,
      onInterval: (tf) => {
        this.state[this.state.view === "home" ? "homeInterval" : "interval"] = tf;
        this.persist();
      },
      onState: (result) => {
        if (!this.active) return;
        if (!result.error && result.bars?.length)
          this.lookupQuote(result.symbol || this.chart?.symbol || symbol);
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
  renderRadar(main) {
    main.innerHTML = `<section class="us2-ticker"><div class="us2-selected-identity"></div><div class="us2-selected-price"></div><button type="button" class="us2-star" data-watch="${e(this.state.symbol)}" aria-label="收藏目前股票">☆</button><div class="us2-quote-status">查詢行情時間…</div></section><div class="us2-radar-layout ${this.state.collapsed ? "is-collapsed" : ""}"><section class="us2-card us2-chart-root"></section><aside class="us2-card us2-scanner"><div class="us2-radar-controls"><button class="us2-tier" type="button" aria-label="雷達分組：全部，短按循環，長按兩秒展開" aria-haspopup="menu" aria-expanded="false">◎<small>▾</small><span>全部</span></button><button type="button" data-watch-filter aria-pressed="${this.state.watchOnly}">自選 <small>${this.watch.size}</small></button><button type="button" data-side aria-label="切換多空" class="${this.state.side === "long" ? "us2-up" : "us2-down"}">${this.state.side === "long" ? "↑ 多" : "↓ 空"}</button><button type="button" data-collapse aria-label="收起雷達清單">⇥</button></div><div class="us2-tier-menu" role="menu" hidden>${["all", "T1", "T2", "T3"].map((t) => `<button role="menuitem" data-tier="${t}">${t === "all" ? "全部" : t}</button>`).join("")}</div><div class="us2-filter-line"><select data-mode aria-label="雷達策略">${Object.entries(
      {
        classic: "OX 經典",
        ma: "均線排列",
        breakout: "放量突破",
        gap: "跳空觀察",
        rs: "相對 SPY 強弱",
      },
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${this.state.mode === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select><select data-type aria-label="資產類型"><option value="stock" ${this.state.type === "stock" ? "selected" : ""}>股票／ADR</option><option value="ETF" ${this.state.type === "ETF" ? "selected" : ""}>一般 ETF</option><option value="all" ${this.state.type === "all" ? "selected" : ""}>兩者</option></select><select data-scan-interval aria-label="雷達分析級別">${(this.snapshot?.analysisIntervals || ["1D"]).map((tf) => `<option value="${tf}" ${tf === this.state.scanInterval ? "selected" : ""}>${tf}</option>`).join("")}</select></div><div class="us2-radar-list"></div><div class="us2-list-note"></div></aside><button type="button" class="us2-show-list" aria-label="展開雷達清單">◎ 雷達</button></div>`;
    const layout = main.querySelector(".us2-radar-layout");
    const collapse = () => {
      this.state.collapsed = !this.state.collapsed;
      layout.classList.toggle("is-collapsed", this.state.collapsed);
    };
    main.querySelector("[data-collapse]").onclick = collapse;
    main.querySelector(".us2-show-list").onclick = collapse;
    this.chartIn(
      main.querySelector(".us2-chart-root"),
      this.state.symbol,
      this.state.interval,
    );
    this.updateIdentity();
    this.lookupQuote(this.state.symbol);
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
      ev.currentTarget.textContent =
        this.state.side === "long" ? "↑ 多" : "↓ 空";
      ev.currentTarget.className =
        this.state.side === "long" ? "us2-up" : "us2-down";
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
    const identity = main.querySelector(".us2-selected-identity");
    if (identity)
      identity.innerHTML = `<b>${e(symbol)}</b><small>${e(item?.alias || item?.name || q?.name || "美股")} · ${e(item?.type || "股票")} · ${e(item?.exchange || q?.exchange || "")}</small>`;
    const numbers = main.querySelector(".us2-selected-price");
    if (numbers)
      numbers.innerHTML = `<b>${price(q?.price)}</b><small class="${tone(q?.changePct)}">${pct(q?.changePct)}</small>`;
    const status = main.querySelector(".us2-quote-status");
    if (status)
      status.textContent = q
        ? `${quoteStatus(q)} · 行情 ${fmt(q.marketTime * 1000)} · 取得 ${fmt(q.receivedAt)}`
        : "等待有效行情…";
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
    const analyses = (this.snapshot?.analyses || []).filter(
      (x) => x.interval === this.state.scanInterval,
    );
    let rows = tierResults(analyses, this.state);
    if (this.state.watchOnly)
      rows = [...this.watch].map(
        (symbol) =>
          (this.snapshot?.analyses || []).find((x) => x.symbol === symbol) || {
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
      : `<div class="us2-empty">${this.state.watchOnly ? "自選尚無標的。搜尋股票並點星星收藏。" : this.snapshot?.analyses?.length ? "目前沒有符合條件的候選，請切換策略或多空。" : "共用掃描資料尚未取得。搜尋股票可查看真實報價與完整 K 線。"}</div>`;
    list.scrollTop = y;
    this.bindRows(list);
    const control = this.root.querySelector(".us2-tier span");
    if (control)
      control.textContent =
        this.state.tier === "all" ? "全部" : this.state.tier;
    this.root.querySelector(".us2-list-note").textContent =
      `${rows.length} 個結果 · 每組最多10檔 · ${this.state.scanInterval} 已收線分析${this.snapshot?.asOf ? " · " + fmt(this.snapshot.asOf) : ""}`;
  }
  renderHome(main) {
    main.innerHTML = `<div class="us2-benchmarks" role="group" aria-label="市場基準 ETF">${["SPY", "QQQ", "IWM"].map((s) => `<button type="button" data-benchmark="${s}" aria-pressed="${this.state.homeSymbol === s}"><b>${s}</b><small>ETF</small><span>${price(this.quotes.get(s)?.price)}</span><em class="${tone(this.quotes.get(s)?.changePct)}">${pct(this.quotes.get(s)?.changePct)}</em></button>`).join("")}</div><section class="us2-card us2-chart-root us2-home-chart"></section><div class="us2-home-grid"><section class="us2-card"><header class="us2-section-header"><h3>自選摘要</h3><button type="button" data-home-watch>查看雷達</button></header><div class="us2-home-watch"></div></section><section class="us2-card"><header class="us2-section-header"><h3>類股 ETF</h3><small>ETF 代理，非市場廣度</small></header><div class="us2-home-sectors"></div></section><section class="us2-card"><header class="us2-section-header"><h3>重要事件</h3><button type="button" data-home-events>數據</button></header><div class="us2-home-events"></div></section></div>`;
    this.chartIn(
      main.querySelector(".us2-chart-root"),
      this.state.homeSymbol,
      this.state.homeInterval,
    );
    main.querySelectorAll("[data-benchmark]").forEach(
      (b) =>
        (b.onclick = () => {
          this.state.homeSymbol = b.dataset.benchmark;
          this.chart.change({ symbol: this.state.homeSymbol, interval: this.state.homeInterval });
          main
            .querySelectorAll("[data-benchmark]")
            .forEach((x) => x.setAttribute("aria-pressed", x === b));
          this.persist();
        }),
    );
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
      : '<div class="us2-empty">類股 ETF 快照尚未收集。</div>';
    this.bindRows(sectors);
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
      } else if (!this.root.querySelector(".us2-tool-list [data-symbol]"))
        this.renderToolContent();
    }
    if (this.state.view === "home") this.updateHome();
  }
  async refreshSnapshot() {
    if (!this.active) return;
    try {
      const s = await USAdapter.snapshot({ signal: this.controller.signal });
      if (this.active) {
        this.snapshot = s;
        this.updateCounts();
        this.updateSections();
        this.updateLive();
      }
    } catch {}
    if (this.active)
      this.refreshTimer = setTimeout(() => this.refreshSnapshot(), 300000);
  }
}

Object.assign(USWorkspace.prototype, toolsViews, newsViews);
