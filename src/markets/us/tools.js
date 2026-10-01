import { revealStyledShadow } from '../../components/style-ready.js?v=20261001-loading1';
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
} from "./view-utils.js?v=20261001-us-eod1";
import { USBubbles, bindPatternBoard } from "./visuals.js?v=20261001-us-eod1";
import { tierResults, matchPath } from "./analysis.js?v=20261001-classic3";
import { createToolsRail } from "../../components/strength/tools-rail.js?v=20261001-tiercomb1";
import { candleChart } from "../crypto/patterns/charts.js";
import { createToolChart } from "../crypto/analytics/tools-charts.js";
import { icon, openDialog, closeDialog } from "./ui.js?v=20261001-us-eod1";
export const toolsViews = {
  renderTools(main) {
    main.innerHTML = '<div class="us2-tools-nav"></div><div class="us2-tool-content"></div>';
    this.toolsRail?.destroy();
    this.toolsRail=createToolsRail({tabs:Object.entries(toolNames).concat([["advanced","進階"]]),selected:this.state.tool,label:"美股指標分類",attribute:"data-tool-tab",onSelect:tool=>{
      this.state.tool=tool;this.persist();this.renderToolContent();
    }});
    main.querySelector(".us2-tools-nav").append(this.toolsRail.element);
    this.renderToolContent();
  },
  renderToolContent() {
    this.patternLoading?.finish();
    ++this.workerId;
    this.heatChart?.destroy();this.heatChart=null;this.toolsLife?.abort();this.toolsSurface=null;
    this.patternCharts?.forEach(chart=>chart.destroy());this.patternCharts=[];this.patternSurface=null;
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
    if(this.state.tool==="advanced"){this.showAdvanced();return;}
    const rows = this.toolRows();
    c.innerHTML = '<div class="us2-analytics-host"></div><div class="us2-tool-list"></div>';
    const surface=c.querySelector('.us2-analytics-host').attachShadow({mode:'open'});
    this.toolsSurface=surface;this.toolsLife=new AbortController();
    surface.innerHTML = `<link rel="stylesheet" href="${new URL('../crypto/analytics/flow.css',import.meta.url).href}"><style>.cfx{min-height:0;background:transparent}.cfx-heatmap canvas{display:block;width:100%;height:100%}.us2-tool-visual{min-width:0}.us2-visual-legend{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;color:var(--muted);padding:10px 2px}.us2-visual-legend button{min-height:34px;flex:none;padding:0 9px;border:1px solid var(--line);border-radius:8px}.us2-bubble-plot{display:block;width:100%;height:440px;touch-action:none}.us2-up{color:#00b8d4}.us2-down{color:#ff3078}</style><main class="cfx"><div class="cfx-toolbar"><div class="cfx-controls">${[
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
      )}</div></div><section class="us2-tool-visual"></section></main>`;
    revealStyledShadow(surface,this.toolsLife.signal);
    surface.querySelectorAll("[data-scope]").forEach(
      (b) =>
        (b.onclick = () => {
          this.state.scope = b.dataset.scope;
          this.persist();
          this.renderToolContent();
        }),
    );
    const visual = surface.querySelector(".us2-tool-visual");
    if (!rows.length) {
      visual.innerHTML =
        '<div class="cfx-empty">尚無這個範圍的日線分析資料；可搜尋股票查看圖表。</div>';
      return;
    }
    if (this.state.tool === "bubbles")
      this.bubbles = new USBubbles(visual, rows, (s) => this.openStock(s));
    else if (this.state.tool === "heatmap") {
      visual.innerHTML='<div class="cfx-chart-meta"><span>完整日漲跌 · 藍＋／紅−</span><span>面積：20日平均成交額</span></div><div class="cfx-heatmap us2-heatmap"><canvas role="img" aria-label="美股熱力圖，面積為20日平均成交額，顏色為完整日漲跌"></canvas></div><div class="cfx-heat-list"></div>';
      this.heatChart=createToolChart(visual.querySelector('canvas'),{signal:this.toolsLife.signal,heatColors:['0,184,212','255,48,120'],onSelect:s=>this.openStock(s)});
      this.updateHeatmap();
    } else if (this.state.tool === "relative") {
      visual.innerHTML =
        '<div class="cfx-chart-meta"><span>相對 SPY</span><span>20個共同交易日報酬差</span></div>';
    } else {
      visual.innerHTML = `<div class="cfx-controls">${[
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
    list.innerHTML = this.state.tool==='heatmap' ? '' : sorted
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
  updateHeatmap() {
    if(!this.heatChart||!this.toolsSurface)return;
    const rows=this.toolRows().slice(0,100);
    this.heatChart.update({type:'heatmap',weight:'volume',grouped:false,rows:rows.map(r=>({...r,base:r.symbol,returnPct:r.changePct,volume:r.liquidity}))});
    const list=this.toolsSurface.querySelector('.cfx-heat-list');
    list.innerHTML=rows.map(r=>`<button data-symbol="${e(r.symbol)}"><b>${e(r.symbol)}</b><span class="${tone(r.changePct)}">${pct(r.changePct)}</span></button>`).join('');
    this.bindRows(list);
  },
  renderPatterns(c) {
    this.patternCharts?.forEach(chart=>chart.destroy());
    c.innerHTML='<div class="us2-pattern-host"></div>';
    const host=c.firstElementChild, surface=host.attachShadow({mode:"open"});
    this.patternSurface=surface;this.toolsLife=new AbortController();
    surface.innerHTML=`<link rel="stylesheet" href="${new URL("../crypto/patterns/patterns.css?v=20261001-twlayout1",import.meta.url)}"><style>:host{font-family:inherit}.px-status-row{width:65%}.us-pattern-empty{padding:38px 12px 14px;line-height:1.6;font-size:11px;color:#969e9f;text-align:center}.us-pattern-star{border:0;background:none;color:#a6adad;font-size:18px;padding:4px;min-width:30px;min-height:30px;position:absolute;right:7px;bottom:7px}.us-pattern-star.is-saved{color:#f4c65b}.px-card{position:relative}.px-card canvas{pointer-events:none}.px-down{color:#ff3078}.px-up{color:#00b8d4}</style><main class="px"><section class="px-board us2-pattern-board" aria-label="美股型態畫板"><canvas tabindex="0" aria-label="在整個畫板繪製走勢"></canvas><div class="px-controls"><button class="px-control" data-open-frames aria-haspopup="dialog"><span data-pattern-frame-label>${this.state.patternInterval}</span>${icon("down")}</button><button class="px-control" data-open-patterns aria-haspopup="dialog"><span data-pattern-label>${this.state.pattern==="all"?"型態":patterns[this.state.pattern]}</span>${icon("down")}</button></div><span class="px-hint">畫出走勢，或選擇型態</span><div class="px-board-bottom"><button class="px-mode-toggle" data-pattern-mode aria-label="切換型態條件／相似路徑"><span class="px-mode-glyph">⌁</span><span data-mode-label>${this.state.patternMode==="path"?"相似路徑":"型態條件"}</span></button><button class="px-icon" data-clear aria-label="清除畫板">${icon("undo")}</button><div class="px-tier-filters" role="group" aria-label="OX 品質分級">${["all","T1","T2","T3"].map(t=>`<button data-pattern-tier="${t}" aria-pressed="${t==="all"}">${t==="all"?"全部":t}</button>`).join("")}</div></div></section><button class="px-refresh-pill" data-scan aria-label="重新掃描"><span class="px-refresh-glyph">${icon("scan")}</span></button><div class="px-results"><div class="px-status-row"><span class="px-local-loading" hidden></span><span class="px-status us2-pattern-status" role="status"></span></div><section class="px-grid us2-pattern-results" aria-label="依 T1 T2 T3 排列的美股"></section></div><dialog class="px-dialog px-settings" aria-label="分析時間級別"><div class="px-dialog-head"><span>時間級別</span><button class="px-icon" data-close-pattern-dialog aria-label="關閉">${icon("close")}</button></div><div class="px-dialog-body"><div class="px-frames">${["1D","1W","1M"].map(tf=>`<button class="px-frame-option" data-pattern-interval="${tf}" aria-pressed="${tf===this.state.patternInterval}">${tf}</button>`).join("")}</div><p class="px-count-status">依共用快照的實際級別分析；未收集的級別不以其他 K 線代替。</p></div></dialog><dialog class="px-dialog px-presets" aria-label="型態條件"><div class="px-dialog-head"><span>型態</span><button class="px-icon" data-close-pattern-dialog aria-label="關閉">${icon("close")}</button></div><div class="px-dialog-body"><div class="px-options">${Object.entries(patterns).map(([v,l])=>`<button class="px-option" data-pattern="${v}" aria-pressed="${v===this.state.pattern}"><span>${l}</span></button>`).join("")}</div></div></dialog></main>`;
    revealStyledShadow(surface,this.toolsLife.signal);
    this.board=bindPatternBoard(surface.querySelector(".px-board"),points=>{this.points=points;this.state.patternMode=points.length>1?"path":"conditions";surface.querySelector("[data-mode-label]").textContent=this.state.patternMode==="path"?"相似路徑":"型態條件";this.scanPatterns();});
    for(const [attr,selector] of [["frames",".px-settings"],["patterns",".px-presets"]]) surface.querySelector(`[data-open-${attr}]`).onclick=ev=>openDialog(surface.querySelector(selector),ev.currentTarget);
    surface.querySelectorAll("[data-close-pattern-dialog]").forEach(button=>button.onclick=()=>closeDialog(button.closest("dialog")));
    surface.querySelector("[data-pattern-mode]").onclick=()=>{this.state.patternMode=this.state.patternMode==="path"?"conditions":"path";surface.querySelector("[data-mode-label]").textContent=this.state.patternMode==="path"?"相似路徑":"型態條件";this.scanPatterns();};
    surface.querySelectorAll("[data-pattern]").forEach(button=>button.onclick=()=>{
      this.state.pattern=button.dataset.pattern;this.state.patternMode="conditions";surface.querySelector("[data-pattern-label]").textContent=patterns[this.state.pattern];
      surface.querySelectorAll("[data-pattern]").forEach(x=>x.setAttribute("aria-pressed",x===button));closeDialog(button.closest("dialog"));this.persist();this.scanPatterns();
    });
    surface.querySelectorAll("[data-pattern-interval]").forEach(button=>button.onclick=()=>{
      this.state.patternInterval=button.dataset.patternInterval;surface.querySelector("[data-pattern-frame-label]").textContent=this.state.patternInterval;
      surface.querySelectorAll("[data-pattern-interval]").forEach(x=>x.setAttribute("aria-pressed",x===button));closeDialog(button.closest("dialog"));this.persist();this.scanPatterns();
    });
    surface.querySelector("[data-clear]").onclick=()=>this.board.clear();
    surface.querySelector("[data-scan]").onclick=()=>this.scanPatterns();
    surface.querySelectorAll("[data-pattern-tier]").forEach(button=>button.onclick=()=>{
      surface.querySelectorAll("[data-pattern-tier]").forEach(x=>x.setAttribute("aria-pressed",x===button));this.paintPatternResults(this.patternRows||[],button.dataset.patternTier);
    });
    this.scanPatterns();
  },
  showAdvanced() {
    const c=this.root.querySelector(".us2-tool-content");
    c.innerHTML='<div class="us2-empty">逐筆訂單流／L2 需獨立授權；目前未接通，不以 OHLCV 冒充。</div>';
  },
  async scanPatterns() {
    const c = this.patternSurface,
      status = c?.querySelector(".us2-pattern-status"),
      pill = c?.querySelector("[data-scan]");
    if (!status) return;
    const id=++this.workerId;
    c.querySelector(".px-hint").hidden=!!this.points?.length||this.state.pattern!=="all";
    c.querySelector(".px-mode-toggle").hidden=!this.points?.length&&this.state.pattern==="all";
    c.querySelector("[data-clear]").disabled=!this.points?.length;
    const rows = (this.snapshot?.analyses || []).filter(
      (x) => x.interval === this.state.patternInterval,
    );
    if(!rows.length){
      if(this.cap.chartMode === 'widget'){
        this.patternPhase='unavailable';status.textContent='免費圖表不提供原始 K 線，OX 型態掃描目前無資料。';
        pill.classList.remove('is-scanning');this.patternRows=[];this.paintPatternResults([]);return;
      }
      this.patternPhase=this.snapshotError?"error":this.snapshot?"unavailable":"loading";
      status.textContent=this.snapshotError?"共用分析取得失敗":this.snapshot?`${this.state.patternInterval} · 尚無分析資料（需至少 60 根完整 K 線）`:"取得盤後分析…";
      pill.classList.remove("is-scanning");this.patternRows=[];this.paintPatternResults([]);return;
    }
    const loading=this.patternLoading=window.OXLoading?.begin('us','盤後型態分析',{done:0,total:rows.length,views:['strength'],target:this.patternSurface.querySelector('.px-local-loading')});
    this.patternPhase="analyzing";
    pill.classList.add("is-scanning");
    status.textContent = `分析 ${rows.length} 個已具備真實 K 線的標的…`;
    const points =
        this.state.patternMode === "path" && this.points?.length > 1
          ? this.points
          : null;
    try {
      let result;
      if (typeof Worker === "function") {
        if (!this.worker) {
          this.worker = new Worker(new URL("./worker.js?v=20261001-classic3", import.meta.url), {
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
          ? matchPath(rows, points, this.state)
          : tierResults(rows, this.state);
      if (id !== this.workerId || !this.active) return;
      loading?.finish();
      this.patternPhase="complete";
      this.patternRows = result;
      this.paintPatternResults(result);
      status.textContent = `${rows.length} 檔分析 · ${result.length} 結果 · ${this.state.patternInterval}${this.snapshot?.asOf ? " · " + fmt(this.snapshot.asOf) : ""}`;
    } catch (error) {
      if(id!==this.workerId||!this.active)return;
      loading?.finish();this.patternPhase="error";
      status.textContent = error.message;
    } finally {
      if (id === this.workerId) pill.classList.remove("is-scanning");
    }
  },
  paintPatternResults(rows, tier = "all") {
    const list = this.patternSurface?.querySelector(".us2-pattern-results");
    if (!list) return;
    this.patternCharts?.forEach(chart=>chart.destroy());this.patternCharts=[];
    this.patternSurface.querySelector(".px-tier-filters").hidden = rows.length === 0;
    const filtered=tier==="all"?rows:rows.filter(x=>x.tier===tier);
    let last="";
    const messages={loading:"正在取得盤後分析資料。",analyzing:"正在分析已完成的收盤 K 線。",unavailable:this.cap.chartMode==='widget'?"可在首頁／雷達看免費行情；型態掃描需要原始 K 線資料。":`${this.state.patternInterval} 尚無共用分析資料。`,error:"共用分析取得失敗，可稍後重新掃描。",complete:"已完成分析，目前沒有符合條件的標的。"};
    list.innerHTML=filtered.length?filtered.map((r,i)=>{
      const heading=last!==r.tier?`<div class="px-tier-heading" data-tier-heading="${r.tier.slice(1)}">${e(r.tier)}<span>${r.forming?"形成中":"已收線觀察"}</span></div>`:"";last=r.tier;
      return `${heading}<article class="px-card" data-tier="${r.tier.slice(1)}" data-symbol="${e(r.symbol)}" data-interval="${e(r.interval)}" tabindex="0" role="button" aria-label="開啟 ${e(r.symbol)} ${e(r.interval)} 圖表"><div class="px-card-top"><span class="px-symbol">${e(r.symbol)}<span class="px-frame">${e(r.interval)}</span></span><span class="px-card-right"><b class="px-tier-badge">${e(r.tier)}</b><span class="px-change ${r.changePct>=0?"px-up":"px-down"}">${pct(r.changePct)}</span></span></div><div class="px-match"><span>${e(r.setup||"型態觀察")}</span><span>${price(r.price)}</span></div><canvas aria-label="${e(r.symbol)} 真實 OHLCV"></canvas><div class="px-turnover"><span>20日平均成交額</span><b>${compact(r.liquidity)} USD</b></div><button class="us-pattern-star ${this.watch.has(r.symbol)?"is-saved":""}" data-watch="${e(r.symbol)}" aria-label="收藏 ${e(r.symbol)}">${this.watch.has(r.symbol)?"★":"☆"}</button></article>`;
    }).join(""):`<div class="us-pattern-empty">${messages[this.patternPhase]||messages.unavailable}</div>`;
    for(const card of list.querySelectorAll(".px-card")){
      const r=filtered.find(row=>row.symbol===card.dataset.symbol&&row.interval===card.dataset.interval);
      if(r?.bars?.length)this.patternCharts.push(candleChart(card.querySelector("canvas"),{candles:r.bars,market:"us"},{palette:{up:"#00b8d4",down:"#ff3078"}}));
      card.onkeydown=ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();this.openStock(card.dataset.symbol,{interval:card.dataset.interval,collapse:true});}};
    }
    this.bindRows(list, { collapse: true });
  },
};
