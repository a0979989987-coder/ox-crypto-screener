const WATCH_STAR_SVG = '<svg class="watch-star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z"/></svg>';

const RADAR_SNAPSHOT_KEY = 'ox-radar-snapshot-v3-classic1';
function restoreRadarSnapshot() {
  if (state.radarSnapshotChecked) return;
  state.radarSnapshotChecked = true;
  try {
    const snapshot = JSON.parse(localStorage.getItem(RADAR_SNAPSHOT_KEY));
    if (!snapshot || Date.now()-snapshot.savedAt > 5*60*1000 || !Array.isArray(snapshot.rows)) return;
    const tickers = new Map(state.tickers.map(t=>[t.symbol,t]));
    for (const row of snapshot.rows) {
      const ticker=tickers.get(row.symbol);
      if (!ticker || !isCryptoSymbolAllowed(row.symbol) || !OXClassic.qualifyClassicRow(row, row.side)) continue;
      state.analyzedCache.set(row.symbol,{...row,ticker,change24h:num(ticker.change24h)});
    }
    state.radarSnapshotReady = state.analyzedCache.size > 0;
  } catch (_) {}
}
function saveRadarSnapshot() {
  try { localStorage.setItem(RADAR_SNAPSHOT_KEY,JSON.stringify({savedAt:Date.now(),rows:[...state.analyzedCache.values()]})); } catch (_) {}
}

function closedTierCandles(candles,frame,now=Date.now()) {
 const duration=({m:60,H:3600,D:86400,W:604800})[frame.slice(-1)]*Number(frame.slice(0,-1));
 return candles.filter(c=>{
  const local=new Date(c.time*1000+8*3600000);
  const end=frame.endsWith('M')?Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+Number(frame.slice(0,-1)),1)/1000-8*3600:c.time+duration;
  return Number.isFinite(end)&&end<=now/1000;
 });
}
function cryptoClassicBars(candles,frame,now=Date.now()) {
 const sorted=[...new Map(candles.filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.time<=now/1000&&
   Math.min(c.open,c.low,c.close)>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time);
 const duration=({m:60,H:3600,D:86400,W:604800})[frame.slice(-1)]*Number(frame.slice(0,-1));
 let start=0;
 for(let i=1;i<sorted.length;i++)if(Number.isFinite(duration)&&sorted[i].time-sorted[i-1].time!==duration)start=i;
 const tail=sorted.slice(start);
 if(Number.isFinite(duration)&&(!tail.length||now/1000-tail.at(-1).time>duration*2))return [];
 const closed=new Set(closedTierCandles(tail,frame,now).map(c=>c.time));
 return tail.map(c=>({...c,...(!closed.has(c.time)?{provisional:true}:{})}));
}
function classifyTierFrame(candles,frame) {
 const row=OXEngine.analyzeCandles(cryptoClassicBars(candles,frame),{frame});
 return {...row,at:Date.now(),closedAt:row.classicSignal.closedAt};
}
function cryptoFrameTier(row,frame,side) {
 const data=row.timeframeTiers?.[frame];
 return data&&data.eligible&&Date.now()-data.at<=300000&&(!side||data.side?.toLowerCase()===side.toLowerCase())?data:null;
}
async function refreshMarketTickers() {
  if (state.activeMarket && state.activeMarket !== "crypto") return;
  const loading=window.OXLoading?.begin('crypto','加密行情載入中',{views:['home','strength','radar']});
  try {
    const rawTickers = await BitgetAPI.fetchTickers();
    if (!state.contracts.size) {
      const [contractList, instrumentMetadata] = await Promise.all([
        BitgetAPI.fetchContracts(),
        BitgetAPI.fetchInstrumentMetadata()
      ]);
      const metaBySymbol = new Map((instrumentMetadata || []).map(m => [m.symbol, m]));
      state.instrumentCatalog.clear();
      state.contracts.clear();
      state.assetClassCounts = { crypto: 0, stock: 0, etf: 0, commodity: 0, index: 0, other: 0 };

      contractList.forEach(c => {
        const meta = metaBySymbol.get(c.symbol) || {};
        const merged = {
          ...c,
          assetSymbolType: meta.symbolType || "",
          isRwa: meta.isRwa ?? c.isRwa,
          assetClass: undefined
        };
        const assetClass = classifyInstrument(merged);
        const tagged = { ...merged, assetClass };
        state.instrumentCatalog.set(tagged.symbol, tagged);
        state.assetClassCounts[assetClass] = (state.assetClassCounts[assetClass] || 0) + 1;
        if (assetClass === ASSET_CLASS.CRYPTO) state.contracts.set(tagged.symbol, tagged);
      });
    }

    state.tickers = rawTickers.filter(t => 
      state.contracts.has(t.symbol) && 
      isCryptoSymbolAllowed(t.symbol) &&
      [t.lastPr, t.change24h, t.usdtVolume].every(v => Number.isFinite(num(v)))
    );

    // Purge any stale non-crypto records before rebuilding ranking / scanner state.
    for (const symbol of Array.from(state.analyzedCache.keys())) {
      if (!isCryptoSymbolAllowed(symbol)) state.analyzedCache.delete(symbol);
    }
    state.scanQueue = state.scanQueue.filter(isCryptoSymbolAllowed);

    state.btcTicker = state.tickers.find(t => t.symbol === "BTCUSDT") || null;
    state.ethTicker = state.tickers.find(t => t.symbol === "ETHUSDT") || null;
    captureStrengthSnapshot();

    const eligible = state.tickers.filter(t => num(t.usdtVolume) >= CONFIG.liquidity.minUsdtVolume24h);
    eligible.sort((a, b) => num(b.usdtVolume) - num(a.usdtVolume));
    
    if (!state.scanQueue.length) {
      state.scanQueue = eligible.map(t => t.symbol);
      state.scanIndex = 0;
    }

    restoreRadarSnapshot();
    rebuildTierLists();
    if (state.activeView === 'radar') {
      renderCurrentTab();
      updateHeaderHUD();
      renderBenchmarkBar();
    }
    checkLevelAlerts();

    if (!state.isQueueRunning) {
      state.isQueueRunning = true;
      runScanQueueLoop();
    }
  } catch (e) {
    document.getElementById("scan-status").textContent = `行情取得失敗：${e.message}`;
    document.getElementById("dot").style.background = "#ee617c";
  } finally { loading?.finish(); }
}

let lastRadarBatchPaint = 0, initialScanLoading=null;
async function runScanQueueLoop() {
  while (true) {
    // Keep the ranking data, but do not spend CPU scanning Crypto in the
    // background while another market, page, or browser tab is visible.
    if (document.hidden || state.activeMarket !== 'crypto' || !['home','strength','radar'].includes(state.activeView)) {
      await new Promise(r => setTimeout(r, document.hidden ? 15000 : 8000));
      continue;
    }
    if (!state.scanQueue.length) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    if(!state.radarSnapshotReady&&!initialScanLoading)initialScanLoading=window.OXLoading?.begin('crypto','掃描幣種',{done:0,total:state.scanQueue.length,views:['home','strength','radar']});
    const batchSymbols = [];
    const remaining = state.scanQueue.length-state.scanIndex;
    for (let i = 0; i < Math.min(CONFIG.queueBatchSize, remaining); i++) {
      batchSymbols.push(state.scanQueue[state.scanIndex]);
      state.scanIndex++;
    }

    document.getElementById("scan-status").textContent = `輪巡 ${state.scanIndex}/${state.scanQueue.length}`;
    document.getElementById("dot").style.background = "#38c99b";

    const batchStarted=performance.now();
    await Promise.allSettled(batchSymbols.map(async symbol => {
      const ticker = state.tickers.find(t => t.symbol === symbol);
      if (!ticker) return;

      try {
        const [candles,contextBars] = await Promise.all([
          BitgetAPI.fetchCandles(symbol, '1H', 180), BitgetAPI.fetchCandles(symbol, '4H', 180)
        ]);
        const frames={'1H':cryptoClassicBars(candles,'1H'),'4H':cryptoClassicBars(contextBars,'4H')};
        const classic=Object.fromEntries(['long','short'].map(side=>[side,OXClassic.evaluateFrames(frames,{side,setupFrame:'4H',triggerFrame:'1H'})]));
        const candidates=Object.values(classic).filter(s=>s.eligible).sort(OXClassic.compareClassic);
        const signal=candidates[0]||classic.long;
        const row=OXEngine.describe(signal,classic),liq=OXEngine.computeLiquidity(ticker,state.tickers),rs=OXEngine.computeRelativeStrength(ticker,state.btcTicker);
        const timeframeTiers=Object.fromEntries(Object.entries(frames).map(([frame,bars])=>[frame,classifyTierFrame(bars,frame)]));
        const tierConfig=globalThis.OXTierFilters?.get('crypto');
        if(tierConfig?.enabled)await Promise.all(tierConfig.rules.filter(r=>!frames[r.frame]).map(async rule=>{
          try {timeframeTiers[rule.frame]=classifyTierFrame(await BitgetAPI.fetchCandles(symbol,rule.frame,180),rule.frame);}
          catch {timeframeTiers[rule.frame]=null;}
        }));
        state.analyzedCache.set(symbol, {
          ...row,timeframeTiers,symbol,ticker,at:Date.now(),lastPrice:candles.at(-1)?.close,
          signalFrame:'4H',triggerFrame:'1H',sparkline:candles.slice(-24).map(c=>c.close),
          liqScore:liq.score,rsScore:rs.score,quoteVol:liq.quoteVol,liqPercentile:liq.percentileStr,
          reasons:['4H 結構＋1H 上攻確認',...row.reasons],
          change24h:num(ticker.change24h),ret1h:candleReturn(candles,1),ret4h:candleReturn(candles,4),
          ret24h:candleReturn(candles,24),
        });
      } catch (e) {} finally { const n=(initialScanLoading?.done||0)+1;if(initialScanLoading){initialScanLoading.done=n;initialScanLoading.update(n,state.scanQueue.length);} }
    }));

    const completed = state.scanIndex >= state.scanQueue.length;
    // The first visible ranking is a complete pass, never a partial five-coin list.
    if (completed) {
      initialScanLoading?.finish();initialScanLoading=null;
      state.scanIndex = 0;
      state.radarSnapshotReady = true;
      saveRadarSnapshot();
    }
    if (state.radarSnapshotReady) {
      rebuildTierLists();
      if (state.activeView === 'radar') {
        const now=performance.now();
        if (completed || !lastRadarBatchPaint || now-lastRadarBatchPaint >= 8000) {
          renderCurrentTab(); updateHeaderHUD(); renderBenchmarkBar(); lastRadarBatchPaint=now;
        }
      }
    } else if (state.activeView === 'radar') renderCurrentTab();
    // Warm-up is rate-limited to at most 20 candle requests per second.
    await new Promise(r=>setTimeout(r,state.radarSnapshotReady?Math.max(CONFIG.batchIntervalMs,500*(2+(globalThis.OXTierFilters?.get('crypto').enabled?globalThis.OXTierFilters.get('crypto').rules.filter(r=>r.frame!=='1H').length:0))):Math.max(0,500*Math.max(2,2+(globalThis.OXTierFilters?.get('crypto').enabled?globalThis.OXTierFilters.get('crypto').rules.filter(r=>r.frame!=='1H').length:0))-(performance.now()-batchStarted))));
  }
}

function rebuildTierLists() {
  if (state.isQueueRunning && !state.radarSnapshotReady && !globalThis.OXTierFilters?.get('crypto').enabled) return;
  const tierConfig=globalThis.OXTierFilters?.get('crypto');
  const rankedPool=Array.from(state.analyzedCache.values()).filter(c=>{
    if(benchmarkSymbols.has(c.symbol)||(!tierConfig?.enabled&&!OXClassic.qualifyClassicRow(c,c.side)))return false;
    const signal=c.classicSignal,price=num(state.tickers.find(t=>t.symbol===c.symbol)?.lastPr)||c.lastPrice;
    if(!tierConfig?.enabled&&price&&signal?.invalidation?.level){const dir=c.side==='SHORT'?-1:1;
      if(dir*(price-signal.invalidation.level)<-.2*signal.atr||c.lastPrice&&dir*(price-c.lastPrice)<-.9*signal.atr)return false;}
    return !c.at||Date.now()-c.at<=300000;
  });
  const allAnalyzed=tierConfig?.enabled?rankedPool.flatMap(c=>{
    const match=globalThis.OXTierFilters.resolve(c,tierConfig,cryptoFrameTier);
    if(!match)return [];
    // All requested frames must agree with the selected setup's direction.
    const directional=globalThis.OXTierFilters.resolve(c,tierConfig,cryptoFrameTier,match.value.side);
    if(!directional)return [];
    const selected={...c,...directional.value,reasons:[`${directional.frame} 時間組合`,...(directional.value.reasons||[])]};
    const price=num(state.tickers.find(t=>t.symbol===c.symbol)?.lastPr)||c.lastPrice,signal=selected.classicSignal,dir=selected.side==='SHORT'?-1:1;
    if(price&&signal?.invalidation?.level&&dir*(price-signal.invalidation.level)<-.2*signal.atr)return [];
    return [selected];
  }):rankedPool;
  const buildTierSet = pool => {
    const ranked = OXClassic.rankClassicTiers(pool, { compare: (a,b) =>
      OXClassic.compareClassic(a,b) || (b.oxScore || 0) - (a.oxScore || 0) });
    return Object.fromEntries(['t1','t2','t3'].map(tier => [tier, ranked
      .filter(row => row.tier.toLowerCase() === tier).map(row => ({...row,tier,displayTier:tier}))]));
  };

  // 保留原本 combined tierMap 供首頁、OX LIVE、其他既有模組讀取。
  const combined = buildTierSet(allAnalyzed.filter(c => c.side === "LONG"));
  const longPool = allAnalyzed.filter(c => String(c.side || "").toUpperCase() === "LONG");
  const shortPool = allAnalyzed.filter(c => String(c.side || "").toUpperCase() === "SHORT");
  // 雷達則使用獨立六榜：LONG T1/T2/T3 與 SHORT T1/T2/T3，各自從全市場符合方向者重新排名。
  state.tierMapBySide = {
    long: buildTierSet(longPool),
    short: buildTierSet(shortPool)
  };

  const surge = allAnalyzed.filter(c => c.isSurge).sort((a, b) => b.flowScore - a.flowScore).slice(0, 15);
  const gainers = state.tickers.filter(t => num(t.change24h) > 0 && !benchmarkSymbols.has(t.symbol))
    .sort((a, b) => num(b.change24h) - num(a.change24h)).slice(0, 15);
  const losers = state.tickers.filter(t => num(t.change24h) < 0 && !benchmarkSymbols.has(t.symbol))
    .sort((a, b) => num(a.change24h) - num(b.change24h)).slice(0, 15);

  state.tierMap = { ...combined, surge, gainers, losers };
  syncDirectionalBadges();
  syncWatchBadge();
  if (state.activeView === 'strength') renderMarketStrength();
  if (state.activeView === 'home') renderHomeOverview();
  renderOxLive();
}

function renderCurrentTab() {
  const container = document.getElementById("screener-list");
  const tab = state.currentTab;
  if (!container) return;
  syncScannerFilterUI();

  if (tab === "surge") {
    const top = state.tickers
      .filter(t => Number.isFinite(num(t.usdtVolume)) && num(t.usdtVolume) > 0)
      .sort((a, b) => num(b.usdtVolume) - num(a.usdtVolume))
      .slice(0, 50);
    document.getElementById("pool-count").textContent = `24H 成交額前 ${top.length} 檔`;
    if (!top.length) {
      container.innerHTML = '<div class="turnover-empty">正在取得合約成交額…</div>';
      return;
    }
    container.innerHTML = top.map((t, index) => `<div class="coin-card turnover-card ${t.symbol === state.symbol ? 'selected' : ''}" data-symbol="${t.symbol}" role="button" tabindex="0" aria-label="第 ${index + 1} 名 ${t.symbol}，24 小時成交額 ${fmtCryptoVolume(t.usdtVolume)} USDT，最新價格 ${fmtPrice(t.lastPr)}，漲跌 ${fmtPct(t.change24h)}">
      <div class="turnover-name"><span class="turnover-rank">#${index + 1}</span><span class="turnover-symbol" title="${t.symbol}">${t.symbol.replace(/USDT$/, '')}</span></div>
      <div class="turnover-volume">24H ${fmtCryptoVolume(t.usdtVolume)} USDT</div>
      <div class="turnover-price">${fmtPrice(t.lastPr)}</div>
      <div class="turnover-change ${num(t.change24h) >= 0 ? 'positive' : 'negative'}">${fmtPct(t.change24h)}</div>
    </div>`).join('');
    return;
  }

  if (tab === "watch") {
    const savedAll = getWatchlistRecords().filter(rec => state.activeMarket !== "crypto" || isCryptoSymbolAllowed(rec.symbol));
    const saved = savedAll.filter(rec => {
      const analyzed = state.analyzedCache.get(rec.symbol);
      return passesDirectionFilter(analyzed?.side || rec.side || "—");
    });
    document.getElementById("pool-count").textContent = `${saved.length} 檔${state.directionFilter === "long" ? "多頭" : "空頭"}收藏`;
    syncWatchBadge();
    if (!saved.length) {
      const dir = state.directionFilter === "long" ? "LONG" : "SHORT";
      container.innerHTML = `<div style="padding:30px 16px;text-align:center;color:var(--muted)"><b>${savedAll.length ? `觀察列表目前沒有 ${dir} 標的` : "還沒有收藏標的"}</b><p style="font-size:11px">在 T1 / T2 / T3 點 ☆ 即可加入 ⭐觀察。</p></div>`;
      return;
    }
    container.innerHTML = saved.map((rec, idx) => {
      const analyzed = state.analyzedCache.get(rec.symbol);
      const ticker = state.tickers.find(t => t.symbol === rec.symbol);
      const c = analyzed || rec;
      const current=analyzed&&OXClassic.qualifyClassicRow(analyzed,analyzed.side);
      const tier = current?.tier?.toLowerCase() || "待確認";
      const side = c.side || rec.side || "—";
      const price = ticker ? ticker.lastPr : (c.lastPr || rec.lastPr);
      const change = ticker ? ticker.change24h : (c.change24h ?? rec.change24h);
      return `<div class="coin-card watch-list-card ${rec.symbol === state.symbol ? 'selected' : ''}" data-symbol="${rec.symbol}" role="button" tabindex="0">
        <div class="watch-card-main">
          <div class="watch-card-copy">
            <div class="coin-title watch-coin-title"><span class="coin-rank">#${idx+1}</span><span class="watch-symbol" title="${rec.symbol}">${rec.symbol.replace(/USDT$/, "")}</span><span class="badge badge-${side === 'SHORT' ? 'short' : 'long'}">${side}</span><span class="badge badge-${['t1','t2','t3'].includes(tier)?tier:'t3'}">${tier.toUpperCase()}</span></div>
            <div class="watch-metrics">
              <span class="watch-metric"><label>最新價格</label><strong>${fmtPrice(price)}</strong></span>
              <span class="watch-metric"><label>24H 漲跌</label><strong class="${num(change)>=0?'positive':'negative'}">${fmtPct(change)}</strong></span>
              <span class="watch-metric"><label>OX 分數</label><strong style="color:var(--gold)">${c.oxScore ?? rec.oxScore ?? '—'}</strong></span>
            </div>
          </div>
          <button class="watch-star is-starred" type="button" data-watch-symbol="${rec.symbol}" aria-pressed="true" aria-label="移除 ${rec.symbol} 收藏">${WATCH_STAR_SVG}</button>
        </div>
      </div>`;
    }).join('');
    return;
  }

  if (!state.radarSnapshotReady && state.isQueueRunning) {
    document.getElementById("pool-count").textContent = '整理完整榜單中';
    container.innerHTML = '<div class="turnover-empty" role="status">正在整理全市場榜單… '+state.scanIndex+'/'+state.scanQueue.length+'</div>';
    return;
  }
  const isTierTab = ["t1","t2","t3"].includes(tab);
  // The all entry opens the combined radar. Reuse the already
  // ranked directional results; never rebuild, sort or mutate them here.
  const combinedRadar = tab === "all";
  const sideTiers = state.tierMapBySide?.[state.directionFilter] || {};
  const tierGroups = combinedRadar ? ["t1", "t2", "t3"].map(tier => sideTiers[tier] || []) : [];
  const sourceList = combinedRadar ? tierGroups.flat() : isTierTab
    ? (sideTiers[tab] || [])
    : (state.tierMap[tab] || []).filter(c => passesDirectionFilter(c.side));
  const list = window.OXChartToolbar?.filterList(sourceList) || sourceList;
  const directionLabel = state.directionFilter === "long" ? "多頭" : "空頭";
  document.getElementById("pool-count").textContent = `${list.length} 檔${directionLabel}`;
  syncWatchBadge();
  if (!list.length) {
    container.innerHTML = `<div style="padding:30px 16px;text-align:center;color:var(--muted)"><b>目前沒有符合 OX 經典的${directionLabel}標的</b><p style="font-size:11px">符合條件後會依${combinedRadar ? " T1 → T2 → T3 順序" : `目前 T${isTierTab ? tab.slice(1) : ""} 排名`}顯示。</p></div>`;
    return;
  }

  container.innerHTML = list.map((c, idx) => {
    const displayTier = tab === "surge" ? (c.tier !== "none" ? c.tier : "t3") : (c.displayTier || c.tier || "t3");
    const status = tab === "surge" ? "SURGE" : (c.rankStatus || c.statusText || "WATCH");
    const fit = displayTier === "t1" ? c.t1Fit : displayTier === "t2" ? c.t2Fit : c.t3Fit;
    const allowStar = combinedRadar || isTierTab;
    const starred = isWatchlisted(c.symbol);
    const previousTier=idx>0?(list[idx-1].displayTier||list[idx-1].tier||'t3'):null;
    const startsTier=displayTier!==previousTier;
    // Follow real group boundaries even while a scan or custom filter has fewer results.
    const nextTier=list[idx+1] && (list[idx+1].displayTier||list[idx+1].tier||'t3');
    const endsTier=combinedRadar && nextTier && nextTier!==displayTier;
    return `<div class="coin-card ${startsTier?'is-tier-start ':''}${endsTier?'is-tier-end ':''}${c.symbol === state.symbol ? 'selected' : ''}" data-symbol="${c.symbol}" data-tier="${displayTier}" role="button" tabindex="0">
      ${startsTier?`<small class="coin-tier-heading">${displayTier.toUpperCase()}</small>`:''}
      <div class="coin-top">
        <span class="coin-title">
          <span class="coin-rank">#${idx + 1}</span>
          <span class="coin-symbol-full">${c.symbol}</span><span class="coin-symbol-mobile" title="${c.symbol.replace(/USDT$/, "")}">${c.symbol.replace(/USDT$/, "")}</span>
          <span class="badge badge-${c.side === 'SHORT' ? 'short' : 'long'}">${c.side}</span>
          <span class="badge badge-${displayTier}">${displayTier.toUpperCase()}</span>
          ${c.isSurge ? '<span class="badge badge-surge">🔥</span>' : ''}
        </span>
        <span class="coin-top-right"><span class="coin-ox" aria-label="OX 分數 ${c.oxScore}"><span class="coin-ox-label">OX</span> <strong class="coin-ox-value">${c.oxScore}</strong></span>${allowStar ? `<button class="watch-star watch-star-desktop ${starred?'is-starred':''}" type="button" data-watch-symbol="${c.symbol}" aria-pressed="${starred}" aria-label="${starred?'移除':'加入'} ${c.symbol} 收藏">${WATCH_STAR_SVG}</button>` : ''}</span>
      </div>
      <div class="coin-mid">
        <span class="meta desktop-coin-meta">${status} · Fit ${fit ?? '—'} · 24H 量 ${fmtCryptoVolume(c.quoteVol)} USDT</span>
        <span class="mobile-coin-volume" title="24H 成交量 ${fmtCryptoVolume(c.quoteVol)} USDT" aria-label="24 小時成交量 ${fmtCryptoVolume(c.quoteVol)} USDT"><span class="coin-volume-label">24H 量</span><span class="coin-volume-value">${fmtCryptoVolume(c.quoteVol).replaceAll(",", "")}</span></span>
        <span class="coin-change desktop-coin-change ${c.change24h >= 0 ? 'positive' : 'negative'}" style="font-weight:700">${fmtPct(c.change24h)}</span>
      </div>
      <div class="coin-mobile-bottom">
        ${allowStar ? `<button class="watch-star watch-star-mobile ${starred?'is-starred':''}" type="button" data-watch-symbol="${c.symbol}" aria-pressed="${starred}" aria-label="${starred?'移除':'加入'} ${c.symbol} 收藏">${WATCH_STAR_SVG}</button>` : '<span></span>'}
        <span class="coin-change ${c.change24h >= 0 ? 'positive' : 'negative'}" style="font-weight:700">${fmtPct(c.change24h)}</span>
      </div>
      <div class="coin-reason"><div class="setup-head">${c.setupName}</div><div>• ${c.reasons.join('</div><div>• ')}</div></div>
      <div class="score-pills">
        <span class="score-pill">流動 ${c.liqScore}</span><span class="score-pill">資金 ${c.flowScore}</span>
        <span class="score-pill">結構 ${c.structScore}</span><span class="score-pill">RS ${c.rsScore}</span>
        <span class="score-pill">Progress ${c.setupProgress ?? '—'}%</span>
      </div>
    </div>`;
  }).join('');
}

if(typeof document!=='undefined')document.addEventListener('ox:timeframe-tier-change',event=>{
 if(event.detail.market!=='crypto')return;
 state.scanIndex=0;rebuildTierLists();if(state.activeMarket==='crypto'&&state.activeView==='radar')renderCurrentTab();
});
