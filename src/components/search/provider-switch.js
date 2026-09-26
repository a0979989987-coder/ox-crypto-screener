(() => {
  "use strict";
  const q=s=>document.querySelector(s);
  const compact=v=>{try{return new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(Number(v)||0)}catch{return String(v||"—")}};
  const closeControl=()=>document.getElementById("ox-control-close")?.click();

  function flashTarget(selector){
    if(!selector)return;
    const el=document.querySelector(selector);
    if(!el)return;
    el.scrollIntoView({behavior:"smooth",block:"center"});
    el.classList.add("ox-feature-highlight");
    setTimeout(()=>el.classList.remove("ox-feature-highlight"),1550);
  }

  const registryRows=[
    {id:"account",title:"帳號 / 登入",keywords:["帳號","登入","註冊","會員","account","login"],category:"帳號",icon:"👤",target:"#ox-control-account-open",action:"account"},
    {id:"notifications",title:"通知設定",keywords:["通知","提醒","notification","前高前低"],category:"設定",icon:"🔔",target:"#notification-permission-state",view:"settings"},
    {id:"sound",title:"通知鈴聲",keywords:["鈴聲","聲音","sound","alert"],category:"設定",icon:"♪",target:"#btn-test-sound",view:"settings"},
    {id:"theme",title:"主題 / 深色 / 白色 / 自動",keywords:["主題","深色","黑色","白色","淺色","自動","dark","light","theme"],category:"外觀",icon:"◐",target:".theme-buttons",view:"settings"},
    {id:"market",title:"加密市場",keywords:["市場","加密","crypto"],category:"市場",icon:"◎",target:"#view-radar .top-summary",view:"radar"},
    {id:"exchange",title:"交易所 / 合約資料源",keywords:["交易所","合約","bitget","binance","bybit","永續","provider"],category:"雷達",icon:"⇄",target:"#chart-provider-trigger",view:"radar",action:"provider"},
    {id:"feedback",title:"回饋 / 意見",keywords:["回饋","意見","建議","feedback"],category:"支援",icon:"💬",action:"feedback"},
    {id:"ox",title:"OX 指標",keywords:["ox","ox 指標","指標","突破","signal"],category:"雷達",icon:"OX",target:"#chk-ox-markers",view:"radar"},
    {id:"levels",title:"前高前低",keywords:["前高","前低","前高前低","支撐","壓力","swing"],category:"雷達",icon:"↕",target:"#chk-key-levels",view:"radar"},
    {id:"watch",title:"收藏 / 觀察列表",keywords:["收藏","觀察","watchlist","watch"],category:"雷達",icon:"☆",target:'.tab-btn[data-tab="watch"]',view:"radar",action:"watch"},
    {id:"us",title:"美股",keywords:["美股","us","stock"],category:"市場",icon:"US",available:false},
    {id:"tw",title:"台股",keywords:["台股","tw"],category:"市場",icon:"TW",available:false},
    {id:"forex",title:"外匯市場",keywords:["外匯","forex","fx"],category:"市場",icon:"FX",action:"forex"},
    {id:"pro",title:"OX PRO",keywords:["pro","專業版"],category:"版本",icon:"P",available:false},
    {id:"simple",title:"簡單版",keywords:["簡單版","簡易","simple"],category:"版本",icon:"S",available:false},
    {id:"position",title:"倉位計算機",keywords:["倉位","計算機","風控","position"],category:"工具",icon:"⌗",available:false}
  ];

  try{
    if(typeof OXFeatureRegistry!=="undefined"&&Array.isArray(OXFeatureRegistry)){
      OXFeatureRegistry.splice(0,OXFeatureRegistry.length,...registryRows);
    }
  }catch(e){}
  function registry(){
    try{return(typeof OXFeatureRegistry!=="undefined"&&Array.isArray(OXFeatureRegistry))?OXFeatureRegistry:registryRows}
    catch{return registryRows}
  }

  function insertFeatureSearch(){
    const main=q('.ox-control-view[data-control-view="main"]');
    if(!main||q("#ox-feature-search-v38"))return;
    const wrap=document.createElement("div");
    wrap.className="ox-feature-search-wrap";
    wrap.id="ox-feature-search-v38";
    wrap.innerHTML='<div class="ox-feature-search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.4-3.4"></path></svg><input id="ox-feature-search-input-v38" type="search" autocomplete="off" placeholder="搜尋功能或工具…" aria-label="搜尋 OX 功能或工具"></div><div class="ox-feature-results" id="ox-feature-results-v38"></div>';
    main.insertBefore(wrap,main.firstChild);
    const input=q("#ox-feature-search-input-v38"),results=q("#ox-feature-results-v38");
    const render=()=>{
      const needle=String(input.value||"").trim().toLowerCase();
      const rows=registry().filter(x=>{
        if(!needle)return["account","notifications","theme","exchange","ox","levels"].includes(x.id);
        return[x.title,x.category,...(x.keywords||[])].join(" ").toLowerCase().includes(needle);
      }).slice(0,9);
      results.innerHTML=rows.length?rows.map(x=>
        '<button type="button" class="ox-feature-result" data-feature-id="'+x.id+'"><span class="ox-feature-result-icon">'+x.icon+'</span><span class="ox-feature-result-copy"><b>'+x.title+'</b><small>'+x.category+'</small></span><span class="ox-feature-result-state'+(x.available===false?' unavailable':'')+'">'+(x.available===false?'未開放':'前往')+'</span></button>'
      ).join(""):'<div class="ox-feature-empty">找不到符合的功能</div>';
      results.classList.add("show");
    };
    input.addEventListener("input",render);
    input.addEventListener("focus",render);
    wrap.addEventListener("click",async e=>{
      const btn=e.target.closest("[data-feature-id]");if(!btn)return;
      const item=registry().find(x=>x.id===btn.dataset.featureId);if(!item)return;
      if(item.available===false){closeControl();setTimeout(()=>showToast(item.title+" 尚未開放"),180);return}
      if(item.action==="account"){q("#ox-control-account-open")?.click();return}
      closeControl();
      setTimeout(async()=>{
        if(item.view&&typeof switchAppView==="function")switchAppView(item.view);
        await new Promise(r=>setTimeout(r,110));
        if(item.action==="provider"){ProviderController.openPicker();return}
        if(item.action==="forex"){window.OXMarketController?.setMarket("forex");return}
        if(item.action==="watch")q('.tab-btn[data-tab="watch"]')?.click();
        if(item.action==="feedback"){
          document.getElementById("ox-control-open")?.click();
          setTimeout(()=>document.getElementById("ox-control-feedback-open")?.click(),120);
          return;
        }
        flashTarget(item.target);
      },190);
    });
    document.addEventListener("click",e=>{if(!wrap.contains(e.target))results.classList.remove("show")});
  }

  const OXChartDataAdapters={
    bitget:{
      id:"bitget",name:"Bitget",contractType:"USDT Perpetual",
      async ticker(symbol){
        const r=await fetch("https://api.bitget.com/api/v2/mix/market/ticker?symbol="+encodeURIComponent(symbol)+"&productType=USDT-FUTURES",{cache:"no-store"});
        const j=await r.json(),d=Array.isArray(j.data)?j.data[0]:null;
        if(j.code!=="00000"||!d)throw new Error("Bitget unavailable");
        return{price:+d.lastPr,change24h:+d.change24h,quoteVolume:+(d.usdtVolume||0),baseVolume:+(d.baseVolume||0)};
      },
      async candles(symbol,period,limit=160,endTime=null){
        let url="https://api.bitget.com/api/v2/mix/market/candles?symbol="+encodeURIComponent(symbol)+"&productType=USDT-FUTURES&granularity="+encodeURIComponent(period)+"&limit="+limit;
        if(endTime)url+="&endTime="+endTime;
        const r=await fetch(url,{cache:"no-store"}),j=await r.json();
        if(j.code!=="00000"||!Array.isArray(j.data)||!j.data.length)throw new Error("Bitget candles unavailable");
        return j.data.map(d=>({time:Math.floor(+d[0]/1000),open:+d[1],high:+d[2],low:+d[3],close:+d[4],volume:+d[5],quoteVolume:+(d[6]||0)})).filter(x=>Number.isFinite(x.open)&&x.open>0).sort((a,b)=>a.time-b.time);
      }
    },
    binance:{
      id:"binance",name:"Binance",contractType:"USDT Perpetual",
      map:{"1m":"1m","5m":"5m","15m":"15m","1H":"1h","4H":"4h","1D":"1d","1W":"1w"},
      async ticker(symbol){
        const r=await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr?symbol="+encodeURIComponent(symbol),{cache:"no-store"});
        if(!r.ok)throw new Error("Binance unavailable");
        const d=await r.json();
        if(!d||!d.symbol||!Number.isFinite(+d.lastPrice))throw new Error("Binance ticker unavailable");
        return{price:+d.lastPrice,change24h:+d.priceChangePercent/100,quoteVolume:+d.quoteVolume,baseVolume:+d.volume};
      },
      async candles(symbol,period,limit=160,endTime=null){
        const iv=this.map[period];if(!iv)throw new Error("Unsupported timeframe");
        let url="https://fapi.binance.com/fapi/v1/klines?symbol="+encodeURIComponent(symbol)+"&interval="+iv+"&limit="+limit;
        if(endTime)url+="&endTime="+endTime;
        const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error("Binance candles unavailable");
        const a=await r.json();if(!Array.isArray(a)||!a.length)throw new Error("Binance candles unavailable");
        return a.map(d=>({time:Math.floor(+d[0]/1000),open:+d[1],high:+d[2],low:+d[3],close:+d[4],volume:+d[5],quoteVolume:+(d[7]||0)})).filter(x=>Number.isFinite(x.open)&&x.open>0).sort((a,b)=>a.time-b.time);
      }
    },
    bybit:{
      id:"bybit",name:"Bybit",contractType:"USDT Perpetual",
      map:{"1m":"1","5m":"5","15m":"15","1H":"60","4H":"240","1D":"D","1W":"W"},
      async ticker(symbol){
        const r=await fetch("https://api.bybit.com/v5/market/tickers?category=linear&symbol="+encodeURIComponent(symbol),{cache:"no-store"});
        if(!r.ok)throw new Error("Bybit unavailable");
        const j=await r.json(),d=j?.result?.list?.[0];
        if(j?.retCode!==0||!d||!Number.isFinite(+d.lastPrice))throw new Error("Bybit ticker unavailable");
        return{price:+d.lastPrice,change24h:+d.price24hPcnt,quoteVolume:+d.turnover24h,baseVolume:+d.volume24h};
      },
      async candles(symbol,period,limit=160,endTime=null){
        const iv=this.map[period];if(!iv)throw new Error("Unsupported timeframe");
        let url="https://api.bybit.com/v5/market/kline?category=linear&symbol="+encodeURIComponent(symbol)+"&interval="+iv+"&limit="+limit;
        if(endTime)url+="&end="+endTime;
        const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error("Bybit candles unavailable");
        const j=await r.json(),a=j?.result?.list;
        if(j?.retCode!==0||!Array.isArray(a)||!a.length)throw new Error("Bybit candles unavailable");
        return a.map(d=>({time:Math.floor(+d[0]/1000),open:+d[1],high:+d[2],low:+d[3],close:+d[4],volume:+d[5],quoteVolume:+(d[6]||0)})).filter(x=>Number.isFinite(x.open)&&x.open>0).sort((a,b)=>a.time-b.time);
      }
    }
  };
  window.OXChartDataAdapters=OXChartDataAdapters;

  const originalLoadSymbolCandles=typeof loadSymbolCandles==="function"?loadSymbolCandles:null;
  const originalLoadMoreHistoricalCandles=typeof loadMoreHistoricalCandles==="function"?loadMoreHistoricalCandles:null;
  const originalRefreshKeyLevels=typeof refreshKeyLevels==="function"?refreshKeyLevels:null;
  const originalUpdateHeaderHUD=typeof updateHeaderHUD==="function"?updateHeaderHUD:null;

  const ProviderController={
    active:(localStorage.getItem("ox-chart-data-provider")||"bitget").toLowerCase(),
    ticker:null,timer:0,requestId:0,
    adapter(){return OXChartDataAdapters[this.active]||OXChartDataAdapters.bitget},
    label(){return this.adapter().name},
    applyLabels(){
      const p=this.adapter(),pair=q("#ticker-pair");
      if(pair)pair.textContent=state.symbol+" · "+p.name+" USDT 永續";
      const trigger=q("#chart-provider-trigger");
      if(trigger)trigger.textContent=state.symbol+" · "+p.name+" 永續合約";
    },
    applyTicker(t){
      if(!t)return;this.ticker=t;
      updateRadarMarketGlow();
      const price=q("#price"),chg=q("#change"),quote=q("#quote"),meta=q("#ticker-meta"),rank=q("#quote-rank");
      if(price)price.textContent=fmtPrice(t.price);
      if(chg){chg.textContent=fmtPct(t.change24h);chg.classList.toggle("positive",t.change24h>=0);chg.classList.toggle("negative",t.change24h<0)}
      if(quote)quote.textContent=Number.isFinite(t.quoteVolume)?compact(t.quoteVolume)+" USDT":"—";
      if(meta)meta.textContent=this.label()+" · "+this.adapter().contractType;
      if(rank&&this.active!=="bitget")rank.textContent="目前 Data Provider";
      this.applyLabels();
    },
    async refreshTicker({quiet=false}={}){
      const id=++this.requestId;
      try{
        const t=await this.adapter().ticker(state.symbol);
        if(id!==this.requestId)return null;
        this.applyTicker(t);return t;
      }catch(e){if(!quiet)showToast(this.label()+" 行情目前 unavailable");return null}
    },
    restartTicker(){
      clearInterval(this.timer);this.timer=0;
      this.refreshTicker({quiet:true});
      this.timer=setInterval(()=>{if(state.activeView==="radar")this.refreshTicker({quiet:true})},6000);
    },
    async select(id){
      id=String(id||"").toLowerCase();
      const ad=OXChartDataAdapters[id];if(!ad)return;
      try{await ad.ticker(state.symbol)}catch(e){showToast(ad.name+" 此標的目前 unavailable");return}
      this.active=id;
      localStorage.setItem("ox-chart-data-provider",id);
      this.closePicker();
      this.applyLabels();
      state.currentLevels={high:0,low:0,sourcePeriod:getKeyLevelPeriod(),highTime:0,lowTime:0};
      state.secondaryLevels=null;
      await loadSymbolCandles(true);
      await this.refreshTicker({quiet:false});
      this.restartTicker();
      showToast("已切換至 "+ad.name+" · "+state.symbol);
    },
    ensureTitleTrigger(){
      const head=q("#chart-head-title");if(!head)return;
      let trigger=q("#chart-provider-trigger");
      if(!trigger){
        const first=head.querySelector("span:first-child");if(!first)return;
        trigger=document.createElement("button");
        trigger.type="button";trigger.id="chart-provider-trigger";trigger.setAttribute("aria-label","切換交易所與合約資料源");
        first.replaceWith(trigger);
        trigger.addEventListener("click",()=>this.openPicker());
      }
      this.applyLabels();
    },
    ensurePicker(){
      if(q("#ox-provider-picker"))return;
      const backdrop=document.createElement("div");
      backdrop.className="ox-provider-backdrop";backdrop.id="ox-provider-backdrop";
      const picker=document.createElement("div");
      picker.className="ox-provider-picker";picker.id="ox-provider-picker";
      picker.innerHTML='<div class="ox-provider-head"><div><b id="ox-provider-title">交易所 / 合約</b><small>真正切換 K 線與行情 Data Provider</small></div><button type="button" class="ox-provider-close" aria-label="關閉">×</button></div><div class="ox-provider-list" id="ox-provider-list"><div class="ox-provider-loading">正在確認可用資料源…</div></div>';
      document.body.append(backdrop,picker);
      backdrop.addEventListener("click",()=>this.closePicker());
      picker.querySelector(".ox-provider-close").addEventListener("click",()=>this.closePicker());
      picker.addEventListener("click",e=>{const b=e.target.closest("[data-provider-id]");if(b&&!b.disabled)this.select(b.dataset.providerId)});
    },
    positionPicker(){
      const picker=q("#ox-provider-picker"),trigger=q("#chart-provider-trigger");
      if(!picker||!trigger)return;
      if(window.matchMedia("(max-width:720px)").matches){picker.style.left="";picker.style.top="";return}
      const r=trigger.getBoundingClientRect(),width=Math.min(390,window.innerWidth-24);
      const left=Math.max(12,Math.min(window.innerWidth-width-12,r.left));
      picker.style.left=left+"px";picker.style.top=(r.bottom+8)+"px";
    },
    async openPicker(){
      this.ensurePicker();this.ensureTitleTrigger();
      const picker=q("#ox-provider-picker"),backdrop=q("#ox-provider-backdrop"),list=q("#ox-provider-list");
      if(!picker||!list)return;
      q("#ox-provider-title").textContent=state.symbol+" · 交易所 / 合約";
      this.positionPicker();picker.classList.add("show");
      if(window.matchMedia("(max-width:720px)").matches)backdrop.classList.add("show");
      list.innerHTML='<div class="ox-provider-loading">正在讀取 Bitget / Binance / Bybit…</div>';
      const ids=["bitget","binance","bybit"];
      const checks=await Promise.all(ids.map(async id=>{
        const ad=OXChartDataAdapters[id];
        try{return{id,ok:true,t:await ad.ticker(state.symbol)}}catch(e){return{id,ok:false,t:null}}
      }));
      list.innerHTML=checks.map(x=>{
        const ad=OXChartDataAdapters[x.id],t=x.t;
        return '<button type="button" class="ox-provider-option'+(this.active===x.id?' active':'')+'" data-provider-id="'+x.id+'" '+(!x.ok?'disabled':'')+'><span><span class="ox-provider-name">'+ad.name+'</span><span class="ox-provider-meta">'+state.symbol+' · '+ad.contractType+'</span></span><span class="ox-provider-stats">'+(x.ok?'<b>'+fmtPrice(t.price)+'</b><small>'+compact(t.quoteVolume)+' USDT · '+fmtPct(t.change24h)+'</small>':'<b class="ox-provider-unavailable">unavailable</b><small>無可用即時資料</small>')+'</span></button>';
      }).join("");
    },
    closePicker(){
      q("#ox-provider-picker")?.classList.remove("show");
      q("#ox-provider-backdrop")?.classList.remove("show");
    },
    boot(){
      this.ensureTitleTrigger();
      this.ensurePicker();
      this.restartTicker();
      window.addEventListener("resize",()=>this.positionPicker(),{passive:true});
    }
  };
  window.OXProviderController=ProviderController;

  if(originalLoadSymbolCandles){
    loadSymbolCandles=async function(isInitial=true){
      if(ProviderController.active==="bitget")return originalLoadSymbolCandles(isInitial);
      if(state.activeMarket&&state.activeMarket!=="crypto")return;
      state.abortCtrl?.abort();state.abortCtrl=new AbortController();
      const overlay=q("#chart-loading");if(isInitial)overlay?.classList.add("show");
      try{
        const raw=await ProviderController.adapter().candles(state.symbol,state.period,window.matchMedia("(max-width:720px)").matches?160:100);
        if(!raw.length)throw new Error("無可用 K 線");
        state.candleData=raw;state.oldestCandleTime=raw[0].time;state.hasMoreHistory=true;
        renderChartData(raw,isInitial);
        await ProviderController.refreshTicker({quiet:true});
      }catch(e){showToast(ProviderController.label()+" K 線 unavailable")}
      finally{overlay?.classList.remove("show")}
    };
  }

  if(originalLoadMoreHistoricalCandles){
    loadMoreHistoricalCandles=async function(){
      if(ProviderController.active==="bitget")return originalLoadMoreHistoricalCandles();
      if(state.isLoadingOlder||!state.hasMoreHistory)return;
      state.isLoadingOlder=true;
      const overlay=q("#chart-loading");overlay?.classList.add("show");
      try{
        const older=await ProviderController.adapter().candles(state.symbol,state.period,100,(state.oldestCandleTime-1)*1000);
        if(!older.length){state.hasMoreHistory=false;return}
        state.oldestCandleTime=older[0].time;
        const combined=[...older,...state.candleData].filter((c,i,a)=>!i||c.time!==a[i-1].time);
        state.candleData=combined;renderChartData(combined,false);
      }catch(e){state.hasMoreHistory=false}
      finally{state.isLoadingOlder=false;overlay?.classList.remove("show")}
    };
  }

  if(originalRefreshKeyLevels){
    refreshKeyLevels=async function(chartCandles){
      if(ProviderController.active==="bitget")return originalRefreshKeyLevels(chartCandles);
      if(!state.candleSeries)return;
      const symbolAtRequest=state.symbol,sourcePeriods=getKeyLevelPeriods();
      clearKeyLevelPriceLines();
      state.currentLevels={high:0,low:0,sourcePeriod:sourcePeriods[0],highTime:0,lowTime:0};
      state.secondaryLevels=null;
      updateAlertButtons();updateQuickStats();
      try{
        const results=[];
        for(const sourcePeriod of sourcePeriods){
          const sourceCandles=state.period===sourcePeriod?chartCandles:await ProviderController.adapter().candles(symbolAtRequest,sourcePeriod,100);
          if(state.symbol!==symbolAtRequest||!getKeyLevelPeriods().includes(sourcePeriod))return;
          results.push({sourcePeriod,levels:findStructuralPivotLevels(sourceCandles,sourcePeriod)});
        }
        const primary=results[0];
        state.currentLevels={...primary.levels,sourcePeriod:primary.sourcePeriod};
        if(results[1])state.secondaryLevels={...results[1].levels,sourcePeriod:results[1].sourcePeriod};
        renderKeyLevelPriceLinesFromState();updateAlertButtons();updateQuickStats();renderOxDetail();requestAnimationFrame(updateKeyLevelVisualLabels);
      }catch(e){console.warn("Provider key levels unavailable",ProviderController.active,e)}
    };
  }

  if(originalUpdateHeaderHUD){
    updateHeaderHUD=function(...args){
      const r=originalUpdateHeaderHUD.apply(this,args);
      ProviderController.ensureTitleTrigger();
      ProviderController.applyLabels();
      if(ProviderController.active!=="bitget"){
        if(ProviderController.ticker) ProviderController.applyTicker(ProviderController.ticker);
        ProviderController.refreshTicker({quiet:true});
      }
      return r;
    };
  }

  function boot(){
    insertFeatureSearch();
    ProviderController.boot();
    const observer=new MutationObserver(()=>{insertFeatureSearch();ProviderController.ensureTitleTrigger()});
    const control=q("#ox-control-panel");
    if(control)observer.observe(control,{childList:true,subtree:true});
    document.addEventListener("ox:viewchange",()=>{
      if(state.activeView==="radar"){
        ProviderController.ensureTitleTrigger();
        ProviderController.refreshTicker({quiet:true});
      }
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
