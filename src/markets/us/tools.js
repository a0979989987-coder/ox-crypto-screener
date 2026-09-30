import {
  e,
  price,
  pct,
  tone,
  compact,
  fmt,
  toolNames,
  patterns,
  sectorETF,
} from "./view-utils.js";
import { USBubbles, bindPatternBoard } from "./visuals.js";
import { tierResults, matchPath } from "./analysis.js";
export const toolsViews = {
  renderTools(main) {
    main.innerHTML = `<nav class="us2-tools-nav" aria-label="美股指標工具">${Object.entries(
      toolNames,
    )
      .map(
        ([v, l]) =>
          `<button type="button" data-tool-tab="${v}" aria-pressed="${this.state.tool === v}">${l}</button>`,
      )
      .join(
        "",
      )}<details class="us2-advanced"><summary>進階</summary><p>逐筆訂單流、深度與訂單熱力圖需要逐筆成交／L2 訂閱；目前來源未提供，未以 OHLCV 冒充。</p></details></nav><div class="us2-tool-content"></div>`;
    main.querySelectorAll("[data-tool-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          this.state.tool = b.dataset.toolTab;
          main
            .querySelectorAll("[data-tool-tab]")
            .forEach((x) => x.setAttribute("aria-pressed", x === b));
          this.persist();
          this.renderToolContent();
        }),
    );
    this.renderToolContent();
  },
  renderToolContent() {
    this.bubbles?.destroy();
    this.bubbles = null;
    this.board?.destroy();
    this.board = null;
    const c = this.root.querySelector(".us2-tool-content");
    if (!c) return;
    if (this.state.tool === "patterns") {
      this.renderPatterns(c);
      return;
    }
    const rows = this.toolRows();
    c.innerHTML = `<div class="us2-filter-line"><div class="us2-scope">${[
      ["sector", "類股 ETF"],
      ["watch", "自選"],
      ["all", "全部"],
    ]
      .map(
        ([v, l]) =>
          `<button type="button" data-scope="${v}" aria-pressed="${this.state.scope === v}">${l}</button>`,
      )
      .join(
        "",
      )}</div><small>完整日 K · 排除槓桿／反向 ETF</small></div><section class="us2-card us2-tool-visual"></section><div class="us2-tool-list"></div>`;
    c.querySelectorAll("[data-scope]").forEach(
      (b) =>
        (b.onclick = () => {
          this.state.scope = b.dataset.scope;
          this.persist();
          this.renderToolContent();
        }),
    );
    const visual = c.querySelector(".us2-tool-visual");
    if (!rows.length) {
      visual.innerHTML =
        '<div class="us2-empty">這個範圍沒有已完成分析的 OHLCV；可先搜尋股票查看圖表。</div>';
      return;
    }
    if (this.state.tool === "bubbles")
      this.bubbles = new USBubbles(visual, rows, (s) => this.openStock(s));
    else if (this.state.tool === "heatmap") {
      visual.innerHTML = `<div class="us2-heatmap">${rows
        .slice(0, 100)
        .map(
          (r) =>
            `<button data-symbol="${e(r.symbol)}" class="${tone(r.changePct)}" style="flex-grow:${Math.max(1, Math.log10(Math.max(1, r.liquidity || 1)))}"><b>${e(r.symbol)}</b><strong>${pct(r.changePct)}</strong><small>${e(r.type)} · ${compact(r.liquidity)} USD</small></button>`,
        )
        .join(
          "",
        )}</div><small>顏色：完整日漲跌 · 區塊权重：20日平均成交額對數，非市值。</small>`;
      this.bindRows(visual);
    } else if (this.state.tool === "relative") {
      visual.innerHTML =
        '<div class="us2-section-header"><h3>相對 SPY</h3><small>20個共同交易日報酬差</small></div>';
    } else {
      visual.innerHTML = `<div class="us2-scope">${[
        ["change", "漲跌"],
        ["rvol", "完整日量比"],
        ["liquidity", "流動性"],
        ["gap", "跳空"],
      ]
        .map(
          ([v, l]) =>
            `<button data-rank="${v}" aria-pressed="${this.state.rank === v}">${l}</button>`,
        )
        .join("")}</div>`;
      visual.querySelectorAll("[data-rank]").forEach(
        (b) =>
          (b.onclick = () => {
            this.state.rank = b.dataset.rank;
            this.renderToolContent();
          }),
      );
    }
    const sorted = [...rows]
      .filter((r) => this.state.tool !== "relative" || r.rs !== null)
      .sort((a, b) => {
        const key =
          this.state.tool === "relative"
            ? "rs"
            : {
                rvol: "rvol",
                liquidity: "liquidity",
                change: "changePct",
                gap: "gapPct",
              }[this.state.rank];
        return (b[key] ?? -Infinity) - (a[key] ?? -Infinity);
      })
      .slice(0, 50);
    const list = c.querySelector(".us2-tool-list");
    list.innerHTML = sorted
      .map((r) =>
        this.rowHTML({
          ...r,
          setup:
            this.state.tool === "relative"
              ? `相對 SPY ${pct(r.rs)}`
              : this.state.tool === "ranking"
                ? {
                    rvol: `已收線量比 ${r.rvol === null ? "—" : r.rvol.toFixed(2) + "x"}`,
                    liquidity: `平均成交額 ${compact(r.liquidity)} USD`,
                    gap: `跳空 ${pct(r.gapPct)}`,
                    change: "完整日漲跌",
                  }[this.state.rank]
                : null,
        }),
      )
      .join("");
    this.bindRows(list);
  },
  renderPatterns(c) {
    c.innerHTML = `<section class="us2-pattern-board" aria-label="美股型態畫板"><canvas></canvas><div class="us2-board-controls"><select data-pattern-interval aria-label="型態分析級別"><option value="1D">日線</option><option value="1H">1H${this.snapshot?.analysisIntervals?.includes("1H") ? "" : " · 尚無共用分析"}</option><option value="4H">4H${this.snapshot?.analysisIntervals?.includes("4H") ? "" : " · 尚無共用分析"}</option></select><button data-pattern-mode type="button">◇ ${this.state.patternMode === "path" ? "相似路徑" : "型態條件"}</button><select data-pattern aria-label="型態條件">${Object.entries(
      patterns,
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${this.state.pattern === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select><button data-clear aria-label="清除畫板">↶</button></div><span class="us2-board-hint">畫出走勢，或選擇型態</span><button class="us2-scan-pill" data-scan aria-label="重新掃描"><span>⟳</span> 掃描</button></section><div class="us2-pattern-summary"><div class="us2-scope">${["all", "T1", "T2", "T3"].map((t) => `<button data-pattern-tier="${t}" aria-pressed="${t === "all"}">${t === "all" ? "全部" : t}</button>`).join("")}</div><small class="us2-pattern-status">預先分類真實 K 線</small></div><div class="us2-pattern-results"></div>`;
    this.board = bindPatternBoard(
      c.querySelector(".us2-pattern-board"),
      (points) => {
        this.points = points;
        if (points.length > 1) this.state.patternMode = "path";
        this.scanPatterns();
      },
    );
    c.querySelector("[data-pattern-mode]").onclick = (ev) => {
      this.state.patternMode =
        this.state.patternMode === "path" ? "conditions" : "path";
      ev.currentTarget.textContent = `◇ ${this.state.patternMode === "path" ? "相似路徑" : "型態條件"}`;
      this.scanPatterns();
    };
    c.querySelector("[data-pattern]").onchange = (ev) => {
      this.state.pattern = ev.target.value;
      this.state.patternMode = "conditions";
      this.scanPatterns();
    };
    c.querySelector("[data-pattern-interval]").value =
      this.state.patternInterval;
    c.querySelector("[data-pattern-interval]").onchange = (ev) => {
      this.state.patternInterval = ev.target.value;
      this.scanPatterns();
    };
    c.querySelector("[data-clear]").onclick = () => this.board.clear();
    c.querySelector("[data-scan]").onclick = () => this.scanPatterns();
    c.querySelectorAll("[data-pattern-tier]").forEach(
      (b) =>
        (b.onclick = () => {
          c.querySelectorAll("[data-pattern-tier]").forEach((x) =>
            x.setAttribute("aria-pressed", x === b),
          );
          this.paintPatternResults(
            this.patternRows || [],
            b.dataset.patternTier,
          );
        }),
    );
    this.scanPatterns();
  },
  async scanPatterns() {
    const c = this.root.querySelector(".us2-tool-content"),
      status = c?.querySelector(".us2-pattern-status"),
      pill = c?.querySelector("[data-scan]");
    if (!status) return;
    const rows = (this.snapshot?.analyses || []).filter(
      (x) => x.interval === this.state.patternInterval,
    );
    pill.classList.add("is-scanning");
    status.textContent = `分析 ${rows.length} 個已具備真實 K 線的標的…`;
    const points =
        this.state.patternMode === "path" && this.points?.length > 1
          ? this.points
          : null,
      id = ++this.workerId;
    try {
      let result;
      if (typeof Worker === "function") {
        if (!this.worker) {
          this.worker = new Worker(new URL("./worker.js", import.meta.url), {
            type: "module",
          });
          this.worker.onmessage = (ev) => {
            const callback = this.workerPending.get(ev.data.id);
            this.workerPending.delete(ev.data.id);
            callback?.(ev.data);
          };
        }
        const data = await new Promise((resolve) => {
          this.workerPending.set(id, resolve);
          this.worker.postMessage({
            id,
            rows,
            points,
            options: { ...this.state, pattern: this.state.pattern },
          });
        });
        if (data.error) throw Error(data.error);
        result = data.rows;
      } else
        result = points
          ? matchPath(rows, points)
          : tierResults(rows, this.state);
      if (id !== this.workerId || !this.active) return;
      this.patternRows = result;
      this.paintPatternResults(result);
      status.textContent = `${rows.length} 檔分析 · ${result.length} 結果 · ${this.state.patternInterval}${this.snapshot?.asOf ? " · " + fmt(this.snapshot.asOf) : ""}`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      if (id === this.workerId) pill.classList.remove("is-scanning");
    }
  },
  paintPatternResults(rows, tier = "all") {
    const list = this.root.querySelector(".us2-pattern-results");
    if (!list) return;
    let last = "";
    const filtered =
      tier === "all" ? rows : rows.filter((x) => x.tier === tier);
    list.innerHTML = filtered.length
      ? filtered
          .map((r, i) => {
            const tierStart = last !== r.tier;
            last = r.tier;
            return this.rowHTML(r, {reasons:true,tierStart,tierEnd:filtered[i + 1]?.tier !== r.tier});
          })
          .join("")
      : `<div class="us2-empty">${this.snapshot?.analyses?.some((x) => x.interval === this.state.patternInterval) ? "目前沒有符合這個型態／分組的標的。" : "此級別沒有已收集的共用分析資料。請選日線或完成後端收集。"}</div>`;
    this.bindRows(list, { collapse: true });
  },
};
