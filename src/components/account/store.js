const OX_GUEST_PREFS_KEY = "ox-guest-prefs-v1";
const OX_USERS_KEY = "ox-local-users-v1";
const OX_SESSION_KEY = "ox-local-session-v1";

function normalizeEmail(v) { return String(v || "").trim().toLowerCase(); }
function safeAccountToken(email) { try { return btoa(unescape(encodeURIComponent(email))).replace(/=+$/g, "").replace(/\+/g,"-").replace(/\//g,"_"); } catch { return email.replace(/[^a-z0-9]/gi,"_"); } }
function currentLocalAccountEmail() { return normalizeEmail(localStorage.getItem(OX_SESSION_KEY) || ""); }
function watchStorageKey() { const e = currentLocalAccountEmail(); return e ? `ox-user-watchlist:${safeAccountToken(e)}` : "ox-watchlist"; }
function getWatchlistRecords() { try { const v = JSON.parse(localStorage.getItem(watchStorageKey()) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.symbol) : []; } catch { return []; } }
function isWatchlisted(symbol) { return getWatchlistRecords().some(x => x.symbol === symbol); }
function syncWatchBadge() { const el = document.getElementById("badge-watch"); if (el) el.textContent = getWatchlistRecords().length; }
function saveWatchlistRecords(list) { localStorage.setItem(watchStorageKey(), JSON.stringify(list)); syncWatchBadge(); AccountStore.capturePrefs(); }
function watchSnapshot(symbol) {
  const c = state.analyzedCache.get(symbol) || {};
  const t = state.tickers.find(x => x.symbol === symbol) || {};
  return { symbol, side:c.side || "—", tier:c.displayTier || c.tier || "t3", displayTier:c.displayTier || c.tier || "t3", oxScore:c.oxScore ?? null, change24h:t.change24h ?? c.change24h ?? 0, lastPr:t.lastPr ?? c.lastPr ?? 0, savedAt:Date.now() };
}
function toggleWatchSymbol(symbol) {
  const list = getWatchlistRecords();
  const i = list.findIndex(x => x.symbol === symbol);
  if (i >= 0) { list.splice(i,1); showToast(`☆ 已從觀察移除 ${symbol.replace(/USDT$/,'')}`); }
  else { list.unshift(watchSnapshot(symbol)); showToast(`★ 已加入觀察 ${symbol.replace(/USDT$/,'')}`); }
  saveWatchlistRecords(list.slice(0,100));
  renderCurrentTab();
}

const AccountStore = (() => {
  const loadUsers = () => { try { const v = JSON.parse(localStorage.getItem(OX_USERS_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
  const saveUsers = users => localStorage.setItem(OX_USERS_KEY, JSON.stringify(users));
  const sha256 = async value => { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join(""); };
  const collectPrefs = () => {
    const settings = {};
    ["breakout","tiers","alt50","alt75","btc50","btc75","btcAnalysis","news"].forEach(k => settings[k] = localStorage.getItem(`ox-setting-${k}`));
    return {
      theme: localStorage.getItem("ox-ui-theme") || "system",
      keyLevels: localStorage.getItem("ox-chart-key-levels-visible") !== "0",
      notifications: localStorage.getItem("ox-control-notifications-enabled") === "1",
      sound: localStorage.getItem("ox-alert-sound-enabled") !== "0",
      settings,
      emailSetting: localStorage.getItem("ox-setting-email") || "",
      phoneSetting: localStorage.getItem("ox-setting-phone") || "",
      frequency: localStorage.getItem("ox-setting-frequency") || "1h",
      filters: {
        tier: localStorage.getItem("ox-scanner-tier-filter") || state.currentTab || "t1",
        direction: ["long","short"].includes(localStorage.getItem("ox-scanner-direction-filter")) ? localStorage.getItem("ox-scanner-direction-filter") : (state.directionFilter || "long")
      },
      market: localStorage.getItem("ox-active-market") || state.activeMarket || "crypto",
      levelAlerts: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith("ox-level-alert:")).map(k => [k, localStorage.getItem(k)]))
    };
  };
  const applyPrefs = prefs => {
    if (!prefs) return;
    if (prefs.theme) localStorage.setItem("ox-ui-theme", prefs.theme);
    localStorage.setItem("ox-chart-key-levels-visible", prefs.keyLevels === false ? "0" : "1");
    localStorage.setItem("ox-control-notifications-enabled", prefs.notifications ? "1" : "0");
    localStorage.setItem("ox-alert-sound-enabled", prefs.sound === false ? "0" : "1");
    Object.entries(prefs.settings || {}).forEach(([k,v]) => { if (v !== null && v !== undefined) localStorage.setItem(`ox-setting-${k}`, String(v)); });
    if (prefs.emailSetting !== undefined) localStorage.setItem("ox-setting-email", prefs.emailSetting);
    if (prefs.phoneSetting !== undefined) localStorage.setItem("ox-setting-phone", prefs.phoneSetting);
    if (prefs.frequency) localStorage.setItem("ox-setting-frequency", prefs.frequency);
    if (prefs.filters?.tier && ["t1","t2","t3","surge","watch"].includes(prefs.filters.tier)) { state.currentTab = prefs.filters.tier; localStorage.setItem("ox-scanner-tier-filter", prefs.filters.tier); }
    if (prefs.filters?.direction) { const dir = ["long","short"].includes(prefs.filters.direction) ? prefs.filters.direction : "long"; state.directionFilter = dir; localStorage.setItem("ox-scanner-direction-filter", dir); }
    Object.keys(localStorage).filter(k => k.startsWith("ox-level-alert:")).forEach(k => localStorage.removeItem(k));
    Object.entries(prefs.levelAlerts || {}).forEach(([k,v]) => { if (k.startsWith("ox-level-alert:") && v !== null) localStorage.setItem(k, String(v)); });

    applyTheme(getSavedThemeMode());
    setKeyLevelsVisible(localStorage.getItem("ox-chart-key-levels-visible") !== "0");
    const notify = document.getElementById("ox-control-notify-toggle"); if (notify) notify.checked = localStorage.getItem("ox-control-notifications-enabled") === "1";
    const sound = document.getElementById("ox-control-sound-toggle"); if (sound) sound.checked = localStorage.getItem("ox-alert-sound-enabled") !== "0";
    const email = document.getElementById("setting-email"); if (email) email.value = localStorage.getItem("ox-setting-email") || "";
    const phone = document.getElementById("setting-phone"); if (phone) phone.value = localStorage.getItem("ox-setting-phone") || "";
    const freq = document.getElementById("setting-frequency"); if (freq) freq.value = localStorage.getItem("ox-setting-frequency") || "1h";
    document.querySelectorAll("[data-setting-key]").forEach(input => { const v=localStorage.getItem(`ox-setting-${input.dataset.settingKey}`); if(v!==null) input.checked = v === "1"; });
    syncScannerFilterUI();
    // Account preferences must not override the startup Crypto Radar default.
    syncNotificationPermissionUI(); syncWatchBadge(); renderCurrentTab();
  };
  const capturePrefs = () => {
    const email = currentLocalAccountEmail(); if (!email) return;
    const users = loadUsers(); if (!users[email]) return;
    users[email].prefs = collectPrefs(); users[email].updatedAt = Date.now(); saveUsers(users);
  };
  const saveGuest = () => localStorage.setItem(OX_GUEST_PREFS_KEY, JSON.stringify(collectPrefs()));
  const restoreGuest = () => { try { const p=JSON.parse(localStorage.getItem(OX_GUEST_PREFS_KEY)||"null"); if(p) applyPrefs(p); } catch{} };
  const register = async (email, password) => {
    email=normalizeEmail(email); if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error("請輸入有效 Email"); if(String(password).length<6) throw new Error("密碼至少 6 碼");
    const users=loadUsers(); if(users[email]) throw new Error("這個 Email 已在此裝置註冊"); saveGuest();
    const guestWatch = getWatchlistRecords();
    const passwordHash=await sha256(`${email}::${password}`); users[email]={passwordHash,createdAt:Date.now(),updatedAt:Date.now(),prefs:collectPrefs()}; saveUsers(users); localStorage.setItem(OX_SESSION_KEY,email);
    localStorage.setItem(watchStorageKey(), JSON.stringify(guestWatch));
    updateAccountUI(); syncWatchBadge(); renderCurrentTab(); return email;
  };
  const login = async (email,password) => {
    email=normalizeEmail(email); const users=loadUsers(); const u=users[email]; if(!u) throw new Error("此裝置找不到這個帳號"); const h=await sha256(`${email}::${password}`); if(h!==u.passwordHash) throw new Error("密碼不正確"); saveGuest(); localStorage.setItem(OX_SESSION_KEY,email); applyPrefs(u.prefs); updateAccountUI(); return email;
  };
  const logout = () => { capturePrefs(); localStorage.removeItem(OX_SESSION_KEY); restoreGuest(); updateAccountUI(); syncWatchBadge(); renderCurrentTab(); };
  return { loadUsers, collectPrefs, applyPrefs, capturePrefs, register, login, logout, currentEmail:currentLocalAccountEmail };
})();

function updateAccountUI() {
  const email = currentLocalAccountEmail();
  const title = document.getElementById("ox-account-title"), sub=document.getElementById("ox-account-sub"), tag=document.getElementById("ox-account-action-tag");
  const out=document.getElementById("ox-auth-logged-out"), inn=document.getElementById("ox-auth-logged-in"), cur=document.getElementById("ox-auth-current-email");
  if (email) { if(title) title.textContent=email; if(sub) sub.textContent="本機帳號已登入 · 個人偏好綁定中"; if(tag) tag.textContent="SIGNED IN"; if(out) out.hidden=true; if(inn) inn.hidden=false; if(cur) cur.textContent=email; }
  else { if(title) title.textContent="登入 / 註冊"; if(sub) sub.textContent="第一版本機帳號，可保持登入並綁定個人偏好。"; if(tag) tag.textContent="LOCAL"; if(out) out.hidden=false; if(inn) inn.hidden=true; }
  try { window.syncAccountSummary?.(); } catch (e) {}
}

const MarketController = (() => {
  const labels={crypto:"加密貨幣",us:"美股",tw:"台股",forex:"外匯"};
  const setMarket = (market,{toast=true,kick=true}={}) => {
    if(!labels[market]) return;
    if (state.activeMarket === market && document.body.dataset.market === market) return;
    state.activeMarket=market; localStorage.setItem("ox-active-market",market); document.body.dataset.market=market;
    document.dispatchEvent(new CustomEvent("ox:marketchange",{detail:{market}}));
    document.querySelectorAll("[data-market-choice]").forEach(b=>b.classList.toggle("active",b.dataset.marketChoice===market));
    const st=document.getElementById("ox-market-status-text"); if(st) st.textContent = market==="crypto" ? "加密市場行情已連線" : market==="forex" ? "外匯每日參考匯率 · 非即時" : market==="tw" ? "台股官方收盤資料已連線" : "美股 ETF 行情已連線 · 廣度與類股待接";
    syncPlaceholder(); renderOxLive();
    if (market === "crypto" && kick) { refreshMarketTickers(); if(state.activeView==="radar") loadSymbolCandles(true); if(state.activeView==="home") HomeMiniChart.ensureAndLoad(true); }
    if(toast) showMarketToast(`已切換至${labels[market]}`);
    try { AccountStore.capturePrefs(); } catch (e) {}
  };
  const syncPlaceholder = () => {
    const marketView = ["home","strength","radar"].includes(state.activeView);
    const nonCrypto = state.activeMarket !== "crypto" && marketView;
    const unsupported = ["us","tw"].includes(state.activeMarket) && marketView;
    document.body.classList.toggle("market-data-unavailable", unsupported);
    document.querySelectorAll("[data-app-view]").forEach(v => { if(["home","strength","radar"].includes(v.dataset.appView)) v.style.display = nonCrypto ? "none" : ""; });
    const card=document.getElementById("market-unavailable-card"); if(card) { card.hidden=!unsupported; if(unsupported){ const name=labels[state.activeMarket]; const title=card.querySelector("#market-unavailable-title"), copy=card.querySelector("#market-unavailable-copy"); if(title) title.textContent=`${name}市場`; if(copy) copy.textContent=`正在讀取${name}市場資料…`; } }
  };
  const cycle = () => { const order=["crypto","us","tw","forex"]; const i=order.indexOf(state.activeMarket); setMarket(order[(i+1)%order.length]); };
  const init=()=>{ state.activeMarket="crypto"; setMarket("crypto",{toast:false,kick:false}); };
  return {setMarket,syncPlaceholder,cycle,init,labels};
})();
window.OXMarketController = MarketController;

function showMarketToast(msg){ let el=document.getElementById("market-switch-toast"); if(!el){ el=document.createElement("div"); el.id="market-switch-toast"; el.className="market-switch-toast"; document.body.appendChild(el); } el.textContent=msg; el.classList.add("show"); clearTimeout(showMarketToast._t); showMarketToast._t=setTimeout(()=>el.classList.remove("show"),1500); }

const HomeChartVariant = (()=>{
  let chart=null, series=null, volumeSeries=null, period="1H", loading=false, ro=null;
  const theme=()=>document.body.classList.contains("theme-light");
  const chartColors=()=> theme() ? {
    bg:"rgba(255,255,255,0)", text:"#777d79",
    grid:"rgba(65,72,68,.10)", cross:"rgba(65,72,68,.24)"
  } : {
    bg:"rgba(0,0,0,0)", text:"#a2a8a3",
    grid:"rgba(195,201,191,.085)", cross:"rgba(211,213,202,.22)"
  };

  const ensure=()=>{
    const el=document.getElementById("home-btc-mini-chart"); if(!el||chart) return !!chart;
    const c=chartColors();
    chart=LightweightCharts.createChart(el,{
      width:el.clientWidth||640,
      height:el.clientHeight||175,
      layout:{background:{type:"solid",color:c.bg},textColor:c.text,fontSize:9},
      grid:{vertLines:{color:c.grid},horzLines:{color:c.grid}},
      rightPriceScale:{
        visible:true,borderVisible:false,
        scaleMargins:{top:.08,bottom:.24},
        minimumWidth:52
      },
      timeScale:{
        visible:true,borderVisible:false,timeVisible:true,secondsVisible:false,
        rightOffset:window.matchMedia("(max-width:720px)").matches?5:7,fixRightEdge:false,barSpacing:window.matchMedia("(max-width:720px)").matches?4.15:5.8,minBarSpacing:window.matchMedia("(max-width:720px)").matches?2:2.6,lockVisibleTimeRangeOnResize:true
      },
      crosshair:{
        mode:LightweightCharts.CrosshairMode.Normal,
        vertLine:{color:c.cross,width:1,style:2,labelVisible:false},
        horzLine:{color:c.cross,width:1,style:2,labelVisible:false}
      },
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
      handleScale:{axisPressedMouseMove:false,mouseWheel:true,pinch:true}
    });
    series=chart.addCandlestickSeries({
      upColor:theme()?"#00778a":"#00b8d4",downColor:theme()?"#b81550":"#ff3078",
      borderVisible:false,wickUpColor:theme()?"#00778a":"#00b8d4",wickDownColor:theme()?"#b81550":"#ff3078",
      priceLineVisible:true,lastValueVisible:true
    });
    volumeSeries=chart.addHistogramSeries({
      priceFormat:{type:"volume"},
      priceScaleId:"",
      lastValueVisible:false,
      priceLineVisible:false
    });
    volumeSeries.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
    ro=new ResizeObserver(()=>{
      if(el.clientWidth&&el.clientHeight) chart.applyOptions({width:el.clientWidth,height:el.clientHeight});
    });
    ro.observe(el);
    return true;
  };

  const applyThemeHome=()=>{
    if(!chart) return;
    const c=chartColors();
    const up=theme()?"#00778a":"#00b8d4",down=theme()?"#b81550":"#ff3078";
    series?.applyOptions({upColor:up,downColor:down,wickUpColor:up,wickDownColor:down});
    chart.applyOptions({
      layout:{background:{type:"solid",color:c.bg},textColor:c.text,fontSize:9},
      grid:{vertLines:{color:c.grid},horzLines:{color:c.grid}},
      crosshair:{
        vertLine:{color:c.cross,width:1,style:2,labelVisible:false},
        horzLine:{color:c.cross,width:1,style:2,labelVisible:false}
      }
    });
  };

  const load=async(force=false)=>{
    if(state.activeMarket!=="crypto"||loading||!ensure()) return;
    loading=true;
    try{
      const data=await BitgetAPI.fetchCandles("BTCUSDT",period,260);
      if(data.length){
        series.setData(data);
        volumeSeries?.setData(data.map(c=>({
          time:c.time,
          value:num(c.quoteVolume || c.volume),
          color:c.close>=c.open ? "rgba(0,184,212,.29)" : "rgba(255,48,120,.27)"
        })));
        const mobile = window.matchMedia("(max-width:720px)").matches;
        const compact = window.matchMedia("(max-width:430px)").matches;
        const visibleBars = compact ? 92 : mobile ? 108 : 118;
        const rightOffset = mobile ? 5 : 7;
        chart.timeScale().applyOptions({
          rightOffset,
          barSpacing: mobile ? 4.15 : 5.8,
          minBarSpacing: mobile ? 2.0 : 2.6,
          fixRightEdge:false,
          lockVisibleTimeRangeOnResize:true
        });
        const to = Math.max(0, data.length - 1 + rightOffset);
        const from = Math.max(0, data.length - visibleBars);
        try { chart.timeScale().setVisibleLogicalRange({from, to}); } catch(e) { chart.timeScale().fitContent(); }
      }
    }catch(e){}finally{loading=false;}
  };

  const setPeriod=p=>{
    if(!["1H","4H","1D","1W"].includes(p)) return;
    period=p;
    document.querySelectorAll("[data-home-mini-tf]").forEach(b=>b.classList.toggle("active",b.dataset.homeMiniTf===p));
    load(true);
  };

  document.addEventListener("ox:themechange",applyThemeHome);
  return {ensureAndLoad:load,setPeriod,applyTheme:applyThemeHome};
})();
const HomeMiniChart = HomeChartVariant;
