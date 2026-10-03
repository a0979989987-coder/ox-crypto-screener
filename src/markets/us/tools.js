import { revealStyledShadow } from '../../components/style-ready.js?v=20261001-loading1';
import {
  e,
  pct,
  tone,
  compact,
  toolNames,
} from "./view-utils.js?v=20261003-us-bitget1";
import { mountUSBubbles } from "./visuals.js?v=20261003-us-bitget1";
import { mountPatternSearch } from "../crypto/patterns/view.js?v=20261003-us-parity1";
import { createUSPatternSource, patternSourceKey } from "./patterns/source.js?v=20261003-us-bitget1";
import { createToolsRail } from "../../components/strength/tools-rail.js?v=20261001-tiercomb1";
import { createToolChart } from "../crypto/analytics/tools-charts.js";
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
    if(this.state.tool==="bubbles"){
      c.innerHTML='<div class="us2-bubbles-host"></div>';
      this.bubbles=mountUSBubbles(c.firstElementChild,{getContext:()=>this.patternContext(),watching:()=>this.watch,
        onOpenRadar:symbol=>this.openStock(symbol,{interval:'1D',collapse:true}),refresh:()=>this.refreshSnapshot()});
      return;
    }
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
    if (this.state.tool === "heatmap") {
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
  patternContext() {
    return { capabilities:this.cap, snapshot:this.snapshot, directory:this.directory, quotes:this.quotes, error:this.snapshotError };
  },
  renderPatterns(c) {
    this.board?.destroy();
    c.innerHTML='<div class="us2-pattern-host"></div>';
    const host=c.firstElementChild;
    this.patternSourceKey=patternSourceKey(this.patternContext());
    const {source,cache}=createUSPatternSource({getContext:()=>this.patternContext()});
    this.board=mountPatternSearch(host,{source,cache,onOpenRadar:(symbol,interval)=>this.openStock(symbol,{interval,collapse:true})});
    this.patternSurface=host.shadowRoot;
  },
  showAdvanced() {
    const c=this.root.querySelector(".us2-tool-content");
    c.innerHTML='<div class="us2-empty">逐筆訂單流／L2 需獨立授權；目前未接通，不以 OHLCV 冒充。</div>';
  },
  scanPatterns() {
    const content=this.root.querySelector(".us2-tool-content");
    if(!content||this.state.tool!=="patterns")return;
    // Snapshot updates remount only a changed source. Returning to a tool uses
    // the shared cached session and never flashes another foreground scan.
    if(!this.board||this.patternSourceKey!==patternSourceKey(this.patternContext()))this.renderPatterns(content);
  },
};
