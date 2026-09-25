function resizeChartToContainer() {
  const container = document.getElementById("chart");
  if (!state.chart || !container) return;
  // 手機旋轉的全圖模式使用 layout 尺寸，避免 transform 後 bounding rect 寬高互換造成只畫半屏。
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width > 0 && height > 0) {
    state.chart.applyOptions({ width: Math.round(width), height: Math.round(height) });
    applyChartFutureSpace(false);
    requestAnimationFrame(updateKeyLevelVisualLabels);
  }
}

function setChartFocus(enabled) {
  document.body.classList.toggle("chart-focus", enabled);
  const btn = document.getElementById("btn-chart-fullscreen");
  if (btn) btn.textContent = enabled ? "✕ 返回" : (window.matchMedia("(max-width: 900px)").matches ? "展開圖表" : "全螢幕");
  [0, 80, 180, 320].forEach(ms => setTimeout(() => { resizeChartToContainer(); updatePriceTimer(); }, ms));
}

function renderMarketDataStatus() {
  const descriptions = {
    crypto: ['加密市場數據', 'Bitget USDT 永續合約', '行情、K 線與雷達使用既有 Crypto 模組；新聞與事件日曆尚未接入。'],
    us: ['美股市場數據', 'Twelve Data 後端', 'SPY／QQQ／IWM 及單筆個股查價已接入；全市場廣度、類股和股票池雷達目前無資料。'],
    tw: ['台股市場數據', 'TWSE／TPEx 官方日資料', '上市與上櫃使用最新共同完成交易日；請至雷達查個股官方收盤價。'],
    forex: ['外匯市場數據', 'Frankfurter／ECB 每日參考匯率', '已接入每日匯率與貨幣強弱；盤中報價、點差與成交量目前無資料。']
  };
  const [heading, source, availability] = descriptions[state.activeMarket] || descriptions.crypto;
  document.getElementById('ox-data-heading').textContent = heading;
  document.getElementById('ox-data-source').textContent = `資料來源：${source}`;
  document.getElementById('ox-data-availability').textContent = availability;
}
document.addEventListener('ox:marketchange', () => {
  if (state.activeView === 'data') renderMarketDataStatus();
});

function switchAppView(view) {
  if (!['home','strength','radar','data','media','settings','news'].includes(view)) return;
  if (document.body.classList.contains('chart-focus')) setChartFocus(false);

  const previous = state.activeView;
  const order = ['home','strength','radar','data','media','settings'];
  const direction = Math.sign(order.indexOf(view) - order.indexOf(previous));
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  // Switch immediately: holding the old page for its exit animation blocks taps and scrolling.
  document.querySelectorAll('.app-view.ox-view-entering').forEach(el => el.classList.remove('ox-view-entering'));
  {
    state.activeView = view;
    if (view === 'data') renderMarketDataStatus();
    document.querySelectorAll('[data-app-view]').forEach(el => el.classList.toggle('active', el.dataset.appView === view));
    document.querySelectorAll('[data-view-target]').forEach(btn => btn.classList.toggle('active', btn.dataset.viewTarget === view));

    const incoming = document.querySelector(`[data-app-view="${view}"]`);
    if (!reduced && previous !== view && incoming) {
      incoming.style.setProperty('--ox-view-enter-x', `${direction > 0 ? 10 : direction < 0 ? -10 : 0}px`);
      incoming.classList.add('ox-view-entering');
      incoming.addEventListener('animationend', () => incoming.classList.remove('ox-view-entering'), { once: true });
    }

    MarketController.syncPlaceholder();
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'auto' });
    document.dispatchEvent(new CustomEvent('ox:viewchange', { detail: { from: previous, to: view, direction } }));
    // Schedule view-specific work after the new page has had a chance to paint.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (state.activeView !== view) return;
      if (view === 'strength' && state.activeMarket === 'crypto') { renderMarketStrength(); LiquidationModule?.refresh?.(); }
      if (view === 'home' && state.activeMarket === 'crypto') { renderHomeOverview(); HomeMiniChart.ensureAndLoad(false); }
      if (view === 'radar' && state.activeMarket === 'crypto') resizeChartToContainer();
    }));
  }
}


function homeStrengthLabel(v) {
  const n = clamp(Math.round(num(v)));
  if (n >= 80) return "強";
  if (n >= 65) return "偏強";
  if (n >= 45) return "中性";
  if (n >= 30) return "偏弱";
  return "弱";
}

function homeMarketState(strength) {
  const btc = num(strength.btcRaw), alt = num(strength.altRaw);
  if (btc >= 68 && alt >= 65) return "偏多趨勢";
  if (btc >= 68 && alt < 52) return "BTC 主導";
  if (alt >= 68 && alt - btc >= 8) return "小幣轉強";
  if (btc <= 38 && alt <= 40) return "偏空環境";
  return "中性整理";
}

function homeStructureText(a, ticker) {
  if (a?.structureLabel) return a.structureLabel;
  if (a?.side === "LONG") return "結構偏多";
  if (a?.side === "SHORT") return "結構偏空";
  if (ticker) return num(ticker.change24h) >= 0 ? "24H 偏強" : "24H 偏弱";
  return "等待分析";
}

function renderHomeOverview() {
  const btc = state.btcTicker;
  const eth = state.ethTicker;
  const btcA = state.analyzedCache.get("BTCUSDT");
  const ethA = state.analyzedCache.get("ETHUSDT");
  const strength = computeMarketStrength();
  const btcStrength = clamp(Math.round(num(strength.btcRaw)));
  const altStrength = clamp(Math.round(num(strength.altRaw)));
  const marketScore = Math.round((btcStrength + altStrength) / 2);
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const setWidth = (id, value) => { const el = document.getElementById(id); if (el) el.style.width = `${clamp(value)}%`; };
  const setChange = (id, ticker) => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = ticker ? fmtPct(ticker.change24h) : "—";
    el.className = ticker ? (num(ticker.change24h) >= 0 ? "positive" : "negative") : "";
  };

  const marketStateText = homeMarketState(strength);
  setText("home-market-state", marketStateText);
  setText("home-market-score", marketScore);
  setText("home-t1-count", (state.tierMap.t1 || []).length);
  setText("home-t2-count", (state.tierMap.t2 || []).length);
  setText("home-surge-count", (state.tierMap.surge || []).length);
  setText("home-side-market-state", marketStateText);
  setText("home-side-market-score", marketScore);
  setText("home-side-t1", (state.tierMap.t1 || []).length);
  setText("home-side-t2", (state.tierMap.t2 || []).length);
  setText("home-side-surge", (state.tierMap.surge || []).length);

  setText("home-btc-price", btc ? fmtPrice(btc.lastPr) : "—"); setChange("home-btc-change", btc);
  setText("home-btc-volume", btc ? `${fmtUsd(btc.usdtVolume)} USDT` : "—");
  const btcHigh24 = btc ? num(btc.high24h ?? btc.high24H ?? btc.highPr ?? btc.highPrice24h) : NaN;
  const btcLow24 = btc ? num(btc.low24h ?? btc.low24H ?? btc.lowPr ?? btc.lowPrice24h) : NaN;
  setText("home-btc-high", Number.isFinite(btcHigh24) && btcHigh24 > 0 ? fmtPrice(btcHigh24) : "—");
  setText("home-btc-low", Number.isFinite(btcLow24) && btcLow24 > 0 ? fmtPrice(btcLow24) : "—");
  setText("home-btc-hero-strength", btcStrength);
  setText("home-btc-market-state", marketStateText);
  setText("home-btc-note", `${homeStructureText(btcA, btc)}${btcA ? ` · OX ${btcA.oxScore}` : ""}`);
  setWidth("home-btc-meter", btcA?.oxScore ?? btcStrength);

  setText("home-eth-price", eth ? fmtPrice(eth.lastPr) : "—"); setChange("home-eth-change", eth);
  setText("home-eth-note", `${homeStructureText(ethA, eth)}${ethA ? ` · OX ${ethA.oxScore}` : ""}`);
  setWidth("home-eth-meter", ethA?.oxScore ?? clamp(50 + num(eth?.change24h) * 350));

  setText("home-btc-strength", btcStrength); setText("home-btc-strength-label", homeStrengthLabel(btcStrength));
  setText("home-btc-strength-note", btcA ? `結構 ${qualitative(btcA.structScore)} · 資金 ${qualitative(btcA.flowScore)} · Setup ${qualitative(btcA.setupScore)}` : "結構 / 資金 / 動能 / Trigger");
  setWidth("home-btc-strength-meter", btcStrength);

  setText("home-alt-strength", altStrength); setText("home-alt-strength-label", homeStrengthLabel(altStrength));
  const altP = strength.altParts;
  setText("home-alt-note", altP ? `已分析 ${strength.sampleSize} · 結構廣度 ${Math.round(altP.structureBreadth)}% · 資金活躍 ${Math.round(altP.moneyBreadth)}%` : `已分析 ${strength.sampleSize} 檔 · 等待更多樣本`);
  setWidth("home-alt-meter", altStrength);

  // 重要資訊：只從現有 analyzedCache / tierMap 產生，不塞假資料
  const events = [];
  const seen = new Set();
  const pushEvent = (coin, type, reason, tag, icon) => {
    if (!coin?.symbol || seen.has(`${coin.symbol}:${type}`) || events.length >= 6) return;
    seen.add(`${coin.symbol}:${type}`); events.push({ symbol:coin.symbol, type, reason, tag, icon });
  };
  for (const c of (state.tierMap.t1 || []).slice(0, 3)) pushEvent(c, "進入 T1", c.triggerType || c.statusText || "Trigger 已確認", "T1", "⚡");
  for (const c of (state.tierMap.surge || []).slice(0, 3)) pushEvent(c, "異常活躍", `1H 放量 ${c.volRatio1h ?? "—"}x · 24H ${fmtPct(c.change24h)}`, "SURGE", "🔥");
  for (const c of (state.tierMap.t2 || []).slice(0, 3)) pushEvent(c, "接近 Trigger", c.setupName || "結構已就緒", "T2", "◎");
  const rsCandidates = Array.from(state.analyzedCache.values()).filter(c => !benchmarkSymbols.has(c.symbol) && num(c.rsScore) >= 75).sort((a,b)=>num(b.rsScore)-num(a.rsScore));
  for (const c of rsCandidates.slice(0,2)) pushEvent(c, "相對 BTC 轉強", `Relative Strength ${c.rsScore}`, "RS", "↗");
  const eventBox = document.getElementById("home-events");
  if (eventBox) eventBox.innerHTML = events.length ? events.map(e => `<button class="v33-event-row" type="button" data-home-symbol="${e.symbol}"><span class="v33-event-icon">${e.icon}</span><span class="v33-row-main"><b>${e.symbol.replace(/USDT$/,"")} · ${e.type}</b><small>${e.reason}</small></span><span class="v33-row-pill">${e.tag}</span></button>`).join("") : `<div class="v33-list-empty">全市場輪巡進行中</div>`;

  // OX 重點觀察：T1 / T2 最多三個
  const watch = [...(state.tierMap.t1 || []), ...(state.tierMap.t2 || [])].filter((c,i,a)=>a.findIndex(x=>x.symbol===c.symbol)===i).slice(0,3);
  const watchBox = document.getElementById("home-watchlist");
  if (watchBox) watchBox.innerHTML = watch.length ? watch.map(c => `<button class="v33-watch-row" type="button" data-home-symbol="${c.symbol}"><span class="v33-row-main"><b>${c.symbol.replace(/USDT$/,"")} · ${c.setupName || "Setup 分析中"}</b><small>${c.structureLabel || c.side || "結構分析中"}</small><span class="v33-watch-stage">${c.tier === "t1" ? "T1 · 即戰力" : "T2 · 蹲點準備"}</span></span><span class="v33-watch-score">OX ${c.oxScore ?? "—"}</span></button>`).join("") : `<div class="v33-list-empty">等待 T1 / T2 候選標的</div>`;

  // 強弱榜：直接讀現有 ticker 排名結果
  const renderRank = (id, list) => {
    const box = document.getElementById(id); if (!box) return;
    const rows = (list || []).slice(0,5);
    box.innerHTML = rows.length ? rows.map((t,i)=>`<button class="v33-rank-row" type="button" data-home-symbol="${t.symbol}"><span class="v33-rank-no">#${i+1}</span><span class="v33-rank-symbol">${t.symbol.replace(/USDT$/,"")}</span><span class="v33-rank-change ${num(t.change24h)>=0?"positive":"negative"}">${fmtPct(t.change24h)}</span></button>`).join("") : `<div class="v33-list-empty">等待 Ticker</div>`;
  };
  renderRank("home-gainers", state.tierMap.gainers);
  renderRank("home-losers", state.tierMap.losers);

  setText("home-radar-t1", (state.tierMap.t1 || []).length);
  setText("home-radar-t2", (state.tierMap.t2 || []).length);
  setText("home-radar-t3", (state.tierMap.t3 || []).length);
  setText("home-radar-surge", (state.tierMap.surge || []).length);
}

function renderOxLive() {
  const el = document.getElementById("ox-live-text");
  if (!el) return;
  if (state.activeMarket && state.activeMarket !== "crypto") {
    el.textContent = ({
      us: "美股 ETF 行情已接入 · 個股雷達資料待接",
      tw: "台股官方日資料已接入 · 非即時",
      forex: "外匯 ECB 每日參考匯率 · 非即時"
    })[state.activeMarket] || "市場資料切換中";
    el.title = el.textContent;
    return;
  }
  const parts = [];

  // 跑馬燈只選 T1 的十則快訊；雷達榜單各 T 分級可顯示最多三十檔。
  const t1Coins = (state.tierMap.t1 || []).slice(0, 10);
  if (t1Coins.length) {
    const t1Text = t1Coins.map((c, idx) => {
      const symbol = String(c.symbol || "").replace(/USDT$/, "") || "—";
      return `#${idx + 1} ${symbol} OX ${c.oxScore ?? "—"} ${fmtPct(c.change24h)}`;
    }).join("　·　");
    parts.push(`⚡ T1 精選快訊 · T1/T2/T3 各最多 10 檔、合計最多 30 檔　${t1Text}`);
  } else {
    parts.push("⚡ T1/T2/T3 各最多 10 檔、合計最多 30 檔 · 輪巡整理中");
  }

  const surge = (state.tierMap.surge || [])[0];
  if (surge) parts.push(`🔥 ${surge.symbol.replace(/USDT$/, "")} 異常活躍 · OX ${surge.oxScore ?? "—"} · 24H ${fmtPct(surge.change24h)}`);
  if (state.btcTicker) parts.push(`BTC ${fmtPrice(state.btcTicker.lastPr)} · ${fmtPct(state.btcTicker.change24h)}`);
  const strength = computeMarketStrength();
  if (Number.isFinite(strength.btcRaw)) parts.push(`BTC 強度 ${Math.round(strength.btcRaw)}`);
  if (Number.isFinite(strength.altRaw)) parts.push(`小幣強度 ${Math.round(strength.altRaw)}`);
  parts.push("新聞功能預留");

  const liveText = parts.join("　｜　");
  el.textContent = liveText || "正在整理市場即時資訊…";
  el.title = liveText;
}

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");

function getSavedThemeMode() {
  const saved = localStorage.getItem("ox-ui-theme");
  return ["dark", "light", "system"].includes(saved) ? saved : "system";
}

function applyTheme(themeMode = "system") {
  const mode = ["dark", "light", "system"].includes(themeMode) ? themeMode : "system";
  const resolved = mode === "system" ? (systemThemeQuery.matches ? "light" : "dark") : mode;
  const light = resolved === "light";

  document.body.classList.toggle("theme-light", light);
  document.body.dataset.themeMode = mode;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", resolved);
  document.querySelectorAll("[data-theme-choice]").forEach(btn => btn.classList.toggle("active", btn.dataset.themeChoice === mode));
  document.dispatchEvent(new CustomEvent("ox:themechange", { detail: { mode, resolved } }));

  if (state.chart) {
    state.chart.applyOptions({
      layout: { background: { type: "solid", color: light ? "#edf3f7" : "#090e17" }, textColor: light ? "#4f647b" : "#8b9db7" },
      grid: { vertLines: { color: light ? "rgba(92,120,148,.13)" : "#162335" }, horzLines: { color: light ? "rgba(92,120,148,.13)" : "#162335" } },
      rightPriceScale: { borderColor: light ? "#c2ced9" : "#223147" },
      timeScale: { borderColor: light ? "#c2ced9" : "#223147" }
    });
  }
}

function flashSettingsSaved() {
  const el = document.getElementById("settings-status");
  if (!el) return;
  el.textContent = "已儲存在這台裝置。";
  clearTimeout(flashSettingsSaved._t);
  flashSettingsSaved._t = setTimeout(() => { el.textContent = "設定會自動保存在目前瀏覽器。"; }, 1800);
}

function initSettings() {
  const theme = getSavedThemeMode();
  applyTheme(theme);

  const email = document.getElementById("setting-email");
  const phone = document.getElementById("setting-phone");
  const freq = document.getElementById("setting-frequency");
  if (email) email.value = localStorage.getItem("ox-setting-email") || "";
  if (phone) phone.value = localStorage.getItem("ox-setting-phone") || "";
  if (freq) freq.value = localStorage.getItem("ox-setting-frequency") || "1h";

  email?.addEventListener("change", () => { localStorage.setItem("ox-setting-email", email.value.trim()); flashSettingsSaved(); });
  phone?.addEventListener("change", () => { localStorage.setItem("ox-setting-phone", phone.value.trim()); flashSettingsSaved(); });
  freq?.addEventListener("change", () => { localStorage.setItem("ox-setting-frequency", freq.value); flashSettingsSaved(); });

  document.querySelectorAll("[data-setting-key]").forEach(input => {
    const key = `ox-setting-${input.dataset.settingKey}`;
    const stored = localStorage.getItem(key);
    if (stored !== null) input.checked = stored === "1";
    input.addEventListener("change", () => { localStorage.setItem(key, input.checked ? "1" : "0"); flashSettingsSaved(); });
  });

  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    btn.addEventListener("click", () => {
      localStorage.setItem("ox-ui-theme", btn.dataset.themeChoice);
      applyTheme(btn.dataset.themeChoice);
      flashSettingsSaved();
    });
  });

  const requestNotificationBtn = document.getElementById("btn-request-notification");
  const testNotificationBtn = document.getElementById("btn-test-notification");
  const testSoundBtn = document.getElementById("btn-test-sound");
  requestNotificationBtn?.addEventListener("click", async () => {
    await primeAlertAudio(true);
    const permission = await maybeRequestNotificationPermission({ interactive: true });
    if (permission === "granted") {
      localStorage.setItem("ox-control-notifications-enabled", "1");
      showToast("瀏覽器通知已授權");
    } else if (permission === "denied") {
      showToast("通知已被瀏覽器封鎖，請到網站 / 系統權限重新允許");
    } else {
      showToast("此環境目前無法取得瀏覽器通知權限");
    }
    syncNotificationPermissionUI();
  });
  testNotificationBtn?.addEventListener("click", async () => {
    await primeAlertAudio(true);
    let permission = notificationPlatformInfo().permission;
    if (permission === "default") permission = await maybeRequestNotificationPermission({ interactive: true });
    if (permission !== "granted") {
      syncNotificationPermissionUI();
      return showToast("尚未取得瀏覽器通知權限");
    }
    const sent = await sendBrowserNotification("OX 通知測試", { body: "如果你看到這則通知，瀏覽器 Notification API 已正常工作。", icon: "ox-logo.png", tag: "ox-test-notification" }, { bypassMaster: true });
    showToast(sent ? "測試通知已送出" : "瀏覽器沒有成功顯示通知；請查看下方權限狀態");
  });
  testSoundBtn?.addEventListener("click", async () => {
    const unlocked = await primeAlertAudio(true);
    const played = unlocked ? await playAlertTone("high") : false;
    showToast(played ? "🔔 測試鈴聲已播放" : "瀏覽器尚未解鎖音效，請再點一次或檢查靜音 / 音量");
  });
  syncNotificationPermissionUI();
}

// 系統深淺色改變時，若使用者選擇「隨系統」，即時跟著切換，不需重新整理。
const onSystemThemeChange = () => {
  if (getSavedThemeMode() === "system") applyTheme("system");
};
if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener("change", onSystemThemeChange);
else if (systemThemeQuery.addListener) systemThemeQuery.addListener(onSystemThemeChange);



/* ===== Asset Classification: Crypto radar must be crypto-only before OX analysis ===== */
