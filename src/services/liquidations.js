const LiquidationService = (() => {
  const toNum = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const n = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const pick = (obj, keys) => {
    for (const key of keys) if (obj && obj[key] != null && obj[key] !== "") return toNum(obj[key]);
    return 0;
  };
  const endpoint = () => String(window.OX_LIQUIDATION_PROXY_ENDPOINT || window.OX_CONFIG?.liquidationEndpoint || "").trim();

  function extractRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.exchanges)) return payload.data.exchanges;
    if (Array.isArray(payload?.exchanges)) return payload.exchanges;
    if (Array.isArray(payload?.rows)) return payload.rows;
    return [];
  }
  function normalize(payload) {
    const rawRows = extractRows(payload);
    const baseRows = rawRows.map(row => {
      const long = pick(row, ["long", "longLiquidation", "longLiquidationUsd", "longAmount", "longUsd"]);
      const short = pick(row, ["short", "shortLiquidation", "shortLiquidationUsd", "shortAmount", "shortUsd"]);
      const explicitTotal = pick(row, ["total", "liquidation", "liquidationUsd", "totalLiquidation", "totalAmount", "amount"]);
      const total = explicitTotal > 0 ? explicitTotal : long + short;
      return { exchange: String(row.exchange || row.exchangeName || row.name || row.venue || "Unknown"), total, long, short };
    }).filter(r => r.exchange && r.total > 0);
    const payloadTotal = pick(payload, ["totalMarketLiquidation", "marketTotal", "totalLiquidation", "total"])
      || pick(payload?.data, ["totalMarketLiquidation", "marketTotal", "totalLiquidation", "total"]);
    const totalMarket = payloadTotal > 0 ? payloadTotal : baseRows.reduce((sum,r)=>sum+r.total,0);
    return baseRows.map(r => {
      const directionalTotal = r.long + r.short || r.total;
      return {
        ...r,
        marketShare: totalMarket > 0 ? r.total / totalMarket * 100 : 0,
        longRatio: directionalTotal > 0 ? r.long / directionalTotal * 100 : 0,
        shortRatio: directionalTotal > 0 ? r.short / directionalTotal * 100 : 0
      };
    }).sort((a,b)=>b.total-a.total);
  }

  const CoinglassAdapter = {
    async fetch({ symbol="ALL", interval="4h" }={}) {
      const proxy = endpoint();
      if (!proxy) throw Object.assign(new Error("CoinGlass Proxy 未設定"), { code:"NO_PROXY" });
      const url = new URL(proxy, window.location.href);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("interval", interval);
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 10_000);
      try {
        const res = await fetch(url.toString(), { cache:"no-store", headers:{Accept:"application/json"}, signal:controller.signal });
        if (!res.ok) throw new Error(`CoinGlass Proxy HTTP ${res.status}`);
        const payload = await res.json();
        return { rows:normalize(payload), source:"COINGLASS", completeWindow:true, startedAt:0 };
      } finally { clearTimeout(timer); }
    }
  };

  class RollingLiquidationAggregator {
    constructor(){ this.startedAt=Date.now(); this.buckets=new Map(); }
    add(evt){
      if (!evt || !evt.exchange || !evt.symbol || !Number.isFinite(evt.usdValue) || evt.usdValue <= 0) return;
      const minute=Math.floor((evt.timestamp || Date.now())/60000)*60000;
      const key=`${minute}|${evt.exchange}|${evt.symbol}`;
      const row=this.buckets.get(key)||{minute,exchange:evt.exchange,symbol:evt.symbol,long:0,short:0,total:0};
      if (evt.side === "LONG") row.long += evt.usdValue;
      else if (evt.side === "SHORT") row.short += evt.usdValue;
      row.total += evt.usdValue;
      this.buckets.set(key,row);
      this.prune();
    }
    prune(){ const cutoff=Date.now()-24*60*60*1000; for(const [k,v] of this.buckets){ if(v.minute<cutoff)this.buckets.delete(k); } }
    summary({symbol="ALL",interval="4h"}={}){
      this.prune();
      const hours={"4h":4,"12h":12,"24h":24}[interval]||4;
      const requestedMs=hours*60*60*1000;
      const now=Date.now();
      const cutoff=Math.max(this.startedAt,now-requestedMs);
      const matchSymbol=sym=>symbol==="ALL" || String(sym||"").toUpperCase().replace(/USDT$|USDC$/,'')===String(symbol).toUpperCase();
      const groups=new Map();
      for(const row of this.buckets.values()){
        if(row.minute<cutoff || !matchSymbol(row.symbol))continue;
        const g=groups.get(row.exchange)||{exchange:row.exchange,total:0,long:0,short:0};
        g.total+=row.total; g.long+=row.long; g.short+=row.short; groups.set(row.exchange,g);
      }
      const base=[...groups.values()].filter(x=>x.total>0);
      const totalMarket=base.reduce((sum,x)=>sum+x.total,0);
      const rows=base.map(r=>{
        const d=r.long+r.short||r.total;
        return {...r,marketShare:totalMarket? r.total/totalMarket*100:0,longRatio:d?r.long/d*100:0,shortRatio:d?r.short/d*100:0};
      }).sort((a,b)=>b.total-a.total);
      return { rows, startedAt:this.startedAt, elapsedMs:now-this.startedAt, requestedMs, completeWindow:(now-this.startedAt)>=requestedMs };
    }
  }

  const NativeExchangeAdapter = (()=>{
    const aggregator=new RollingLiquidationAggregator();
    const sockets=new Map();
    const reconnectTimers=new Map();
    let started=false, bybitSignature="";
    const statuses={Binance:"idle",Bybit:"idle",Bitget:"idle"};
    const safeJson=data=>{try{return JSON.parse(data)}catch{return null}};
    const emit=(exchange,symbol,side,price,quantity,usdValue,timestamp)=>aggregator.add({exchange,symbol,side,price:num(price),quantity:num(quantity),usdValue:num(usdValue),timestamp:num(timestamp)||Date.now()});
    const scheduleReconnect=(name,fn)=>{
      clearTimeout(reconnectTimers.get(name));
      reconnectTimers.set(name,setTimeout(fn,5000));
    };
    const attach=(name,ws,reconnect)=>{
      sockets.set(name,ws); statuses[name]="connecting";
      ws.addEventListener("open",()=>{statuses[name]="live";});
      ws.addEventListener("close",()=>{statuses[name]="closed";scheduleReconnect(name,reconnect);});
      ws.addEventListener("error",()=>{statuses[name]="error";});
    };
    function connectBinance(){
      try{
        const ws=new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
        attach("Binance",ws,connectBinance);
        ws.addEventListener("message",e=>{
          const payload=safeJson(e.data); const items=Array.isArray(payload)?payload:[payload];
          items.filter(Boolean).forEach(item=>{
            const o=item.o||item.data?.o||item.data||item;
            if(!o?.s)return;
            const side=String(o.S||"").toUpperCase()==="SELL"?"LONG":String(o.S||"").toUpperCase()==="BUY"?"SHORT":null;
            if(!side)return;
            const price=num(o.ap||o.p); const qty=num(o.z||o.q||o.l); emit("Binance",o.s,side,price,qty,price*qty,o.T||item.E);
          });
        });
      }catch(e){statuses.Binance="error";scheduleReconnect("Binance",connectBinance);}
    }
    function bybitSymbols(){
      const ranked=(state.tickers||[]).filter(t=>isCryptoSymbolAllowed(t.symbol)).sort((a,b)=>num(b.usdtVolume)-num(a.usdtVolume)).slice(0,45).map(t=>t.symbol);
      return Array.from(new Set(["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT",...ranked])).slice(0,50);
    }
    function connectBybit(){
      const symbols=bybitSymbols(); bybitSignature=symbols.join(",");
      try{
        const ws=new WebSocket("wss://stream.bybit.com/v5/public/linear");
        attach("Bybit",ws,connectBybit);
        ws.addEventListener("open",()=>{ws.send(JSON.stringify({op:"subscribe",args:symbols.map(s=>`allLiquidation.${s}`)}));});
        ws.addEventListener("message",e=>{
          const m=safeJson(e.data); if(!Array.isArray(m?.data))return;
          m.data.forEach(x=>{ const side=x.S==="Buy"?"LONG":x.S==="Sell"?"SHORT":null; if(side)emit("Bybit",x.s,side,x.p,x.v,num(x.p)*num(x.v),x.T||m.ts); });
        });
      }catch(e){statuses.Bybit="error";scheduleReconnect("Bybit",connectBybit);}
    }
    function connectBitget(){
      try{
        const ws=new WebSocket("wss://ws.bitget.com/v3/ws/public");
        attach("Bitget",ws,connectBitget);
        ws.addEventListener("open",()=>{ws.send(JSON.stringify({op:"subscribe",args:[{instType:"usdt-futures",topic:"liquidation"}]}));});
        ws.addEventListener("message",e=>{
          const m=safeJson(e.data); if(!Array.isArray(m?.data))return;
          m.data.forEach(x=>{ const sd=String(x.side||"").toLowerCase(); const side=sd==="buy"?"LONG":sd==="sell"?"SHORT":null; if(side)emit("Bitget",x.symbol,side,x.price,0,num(x.amount),x.ts||m.ts); });
        });
      }catch(e){statuses.Bitget="error";scheduleReconnect("Bitget",connectBitget);}
    }
    function ensureStarted(){
      if(!started){started=true;connectBinance();connectBybit();connectBitget();return;}
      const sig=bybitSymbols().join(",");
      if(sig && sig!==bybitSignature){ try{sockets.get("Bybit")?.close();}catch(e){} }
    }
    function summary(opts){ensureStarted(); return {...aggregator.summary(opts),source:"NATIVE",statuses:{...statuses}};}
    return {ensureStarted,summary,statuses};
  })();

  async function fetchSnapshot(opts={}){
    NativeExchangeAdapter.ensureStarted();
    let primaryError=null;
    if(endpoint()){
      try{
        const primary=await CoinglassAdapter.fetch(opts);
        if(primary.rows?.length) return {...primary,configured:true};
      }catch(e){primaryError=e;}
    }
    const native=NativeExchangeAdapter.summary(opts);
    return { configured:true, ...native, primaryError:primaryError?.message || (endpoint()?"CoinGlass 暫無資料":"CoinGlass Proxy 未設定") };
  }

  return { fetchSnapshot, normalize, CoinglassAdapter, NativeExchangeAdapter };
})();

const LiquidationModule = (() => {
  const state = { symbol: "ALL", interval: "24h", loading: false };
  const q = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
  const fmtMoney = value => {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toFixed(0)}`;
  };
  const pct = value => `${(Number(value) || 0).toFixed(2)}%`;
  const dominant = row => row.shortRatio >= row.longRatio
    ? { key: "short", value: row.shortRatio, label: "空單爆倉" }
    : { key: "long", value: row.longRatio, label: "多單爆倉" };

  function setVisibility(mode) {
    const desktop = q("liquidation-desktop");
    const mobile = q("liquidation-mobile");
    const empty = q("liquidation-empty");
    if (desktop) desktop.hidden = mode !== "data";
    if (mobile) mobile.hidden = mode !== "data";
    if (empty) empty.hidden = mode !== "empty";
  }

  function render(rows) {
    const body = q("liquidation-table-body");
    const mobile = q("liquidation-mobile");
    if (!rows.length) {
      setVisibility("empty");
      const status = q("liquidation-status");
      if (status) status.textContent = "目前沒有可顯示的爆倉資料。";
      return;
    }
    setVisibility("data");
    if (body) body.innerHTML = rows.map(row => {
      const d = dominant(row);
      return `<div class="ox-liquidation-row">
        <span class="ox-liq-exchange"><i></i><b>${row.exchange}</b></span>
        <span class="ox-liq-num"><b>${fmtMoney(row.total)}</b></span>
        <span class="ox-liq-num ox-liq-long">${fmtMoney(row.long)}</span>
        <span class="ox-liq-num ox-liq-short">${fmtMoney(row.short)}</span>
        <span class="ox-liq-num">${pct(row.marketShare)}</span>
        <span class="ox-liq-ratio"><b class="ox-liq-${d.key}">${pct(d.value)}</b>${d.label}</span>
      </div>`;
    }).join("");
    if (mobile) mobile.innerHTML = rows.map(row => {
      const d = dominant(row);
      const longW = Math.max(0, Math.min(100, row.longRatio));
      const shortW = Math.max(0, Math.min(100, row.shortRatio));
      return `<div class="ox-liq-mobile-card">
        <div class="ox-liq-mobile-top"><b>${row.exchange.toUpperCase()}</b><span>${pct(row.marketShare)}</span></div>
        <div class="ox-liq-mobile-total">${fmtMoney(row.total)}</div>
        <div class="ox-liq-mobile-split"><span>多單 <b class="ox-liq-long">${fmtMoney(row.long)}</b></span><span>空單 <b class="ox-liq-short">${fmtMoney(row.short)}</b></span></div>
        <div class="ox-liq-bar" aria-label="多空爆倉比例"><i class="long" style="width:${longW}%"></i><i class="short" style="width:${shortW}%"></i></div>
        <div class="ox-liq-mobile-foot"><strong class="${d.key}">${pct(d.value)}</strong> ${d.label}</div>
      </div>`;
    }).join("");
    const status = q("liquidation-status");
    if (status) status.textContent = `${state.symbol === "ALL" ? "全市場" : state.symbol} · ${state.interval.toUpperCase()} · ${rows.length} 間交易所`;
  }

  async function refresh() {
    if (state.loading) return;
    const title = q("liquidation-title");
    if (title) title.textContent = `交易所爆倉`;
    state.loading = true;
    const status = q("liquidation-status");
    if (status) status.textContent = "爆倉資料更新中…";
    try {
      const result = await LiquidationService.fetchSnapshot(state);
      const badge = q("liquidation-source-badge");
      if (badge) { badge.textContent = result.source || "OFFLINE"; badge.dataset.source = result.source || "OFFLINE"; }
      if (result.source === "COINGLASS") {
        if (title) title.textContent = `${state.interval.toUpperCase()} 交易所爆倉`;
        render(result.rows);
        if (status) status.textContent = `${state.symbol === "ALL" ? "全市場" : state.symbol} · ${state.interval.toUpperCase()} · COINGLASS · ${result.rows.length} 間交易所`;
        return;
      }
      if (result.source === "NATIVE") {
        const elapsedMin = Math.max(1, Math.floor((result.elapsedMs || 0) / 60000));
        const rangeText = result.completeWindow ? state.interval.toUpperCase() : `自開啟後 ${elapsedMin}m`;
        if (title) title.textContent = result.completeWindow ? `${state.interval.toUpperCase()} 交易所爆倉` : `LIVE 交易所爆倉`;
        if (result.rows?.length) {
          render(result.rows);
          if (status) status.textContent = `${state.symbol === "ALL" ? "全市場" : state.symbol} · NATIVE · ${rangeText} · Exchange Native Estimate`;
        } else {
          setVisibility("empty");
          const empty = q("liquidation-empty");
          if (empty) empty.innerHTML = `<b>NATIVE · 公共強平流已啟動</b><p>CoinGlass ${result.primaryError ? `暫不可用（${escapeHtml(result.primaryError)}）` : "尚未接通"}。目前直接監聽 Binance / Bybit / Bitget 公共強平流；尚未收到符合篩選條件的事件。</p><code>LIVE · ${rangeText}</code>`;
          if (status) status.textContent = `NATIVE · ${rangeText} · 等待強平事件`;
        }
        return;
      }
      setVisibility("empty");
      if (status) status.textContent = `爆倉資料來源目前不可用`;
    } catch (error) {
      setVisibility("empty");
      if (status) status.textContent = `爆倉資料暫時無法取得：${error.message}`;
    } finally {
      state.loading = false;
    }
  }

  function init() {
    const symbol = q("liquidation-symbol");
    const interval = q("liquidation-interval");
    if (!symbol || !interval) return;
    symbol.value = state.symbol;
    interval.value = state.interval;
    symbol.addEventListener("change", () => { state.symbol = symbol.value; refresh(); });
    interval.addEventListener("change", () => { state.interval = interval.value; refresh(); });
    refresh();
  }

  return { init, refresh };
})();

document.addEventListener("click", e => {
  const star = e.target.closest("[data-watch-symbol]");
  if (star?.dataset.watchSymbol) { e.preventDefault(); e.stopPropagation(); toggleWatchSymbol(star.dataset.watchSymbol); return; }

  const homeSymbol = e.target.closest("[data-home-symbol]");
  if (homeSymbol?.dataset.homeSymbol) {
    if (homeSymbol.dataset.homeSide) {
      setScannerDirectionFilter(homeSymbol.dataset.homeSide);
      setScannerTierFilter('t1');
    }
    switchSymbol(homeSymbol.dataset.homeSymbol);
    return;
  }

  const viewBtn = e.target.closest("[data-view-target]");
  if (viewBtn) { switchAppView(viewBtn.dataset.viewTarget); return; }

  const bench = e.target.closest("[data-benchmark-symbol]");
  if (bench) { switchSymbol(bench.dataset.benchmarkSymbol); return; }
  if (e.target.id === "btn-alert-high") { toggleLevelAlert("high"); return; }
  if (e.target.id === "btn-alert-low") { toggleLevelAlert("low"); return; }

  const card = e.target.closest(".coin-card") || e.target.closest(".trad-row");
  if (card && card.dataset.symbol) {
    switchSymbol(card.dataset.symbol);
    return;
  }

  const tabBtn = e.target.closest(".tab-btn");
  if (tabBtn && tabBtn.dataset.tab) {
    setScannerTierFilter(tabBtn.dataset.tab);
    return;
  }

  const directionToggle = e.target.closest("#direction-toggle");
  if (directionToggle) {
    e.preventDefault();
    e.stopPropagation();
    toggleScannerDirection();
    return;
  }

  const tfBtn = e.target.closest(".btn-tf");
  if (tfBtn && tfBtn.dataset.tf) {
    state.period = tfBtn.dataset.tf;
    document.querySelectorAll(".btn-tf").forEach(b => b.classList.toggle("active", b === tfBtn));
    state.currentLevels = { high: 0, low: 0, sourcePeriod: getKeyLevelPeriod(), highTime: 0, lowTime: 0 };
    state.secondaryLevels = null;
    updateAlertButtons();
    loadSymbolCandles(true);
    return;
  }

  if (e.target.closest("#btn-chart-fullscreen")) {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setChartFocus(!document.body.classList.contains("chart-focus"));
    } else {
      const box = document.querySelector(".chart-box");
      if (!document.fullscreenElement) box.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
    return;
  }

  if (e.target.id === "btn-force-rescan") {
    state.scanIndex = 0;
    refreshMarketTickers();
    return;
  }
});

document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target?.dataset?.homeSymbol) {
    e.preventDefault();
    if (e.target.dataset.homeSide) {
      setScannerDirectionFilter(e.target.dataset.homeSide);
      setScannerTierFilter('t1');
    }
    switchSymbol(e.target.dataset.homeSymbol); return;
  }
  if ((e.key === "Enter" || e.key === " ") && e.target?.classList?.contains("coin-card") && e.target.dataset.symbol) {
    e.preventDefault(); switchSymbol(e.target.dataset.symbol);
  }
});

document.getElementById("chk-vol").addEventListener("change", e => state.volumeSeries.applyOptions({ visible: e.target.checked }));
document.getElementById("chk-ox-markers").addEventListener("change", () => renderChartData(state.candleData, false));
