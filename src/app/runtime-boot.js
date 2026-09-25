const keyLevelVisibilityToggle = document.getElementById("chk-key-levels");
syncKeyLevelVisibilityUI();
keyLevelVisibilityToggle?.addEventListener("change", e => setKeyLevelsVisible(e.target.checked));

window.addEventListener("DOMContentLoaded", () => {
  // A fresh visit always opens in the dark Crypto Radar; theme can still be changed in-session.
  localStorage.setItem("ox-ui-theme", "dark");
  const unlockAudioFromGesture = async () => {
    const ok = await primeAlertAudio(true);
    if (ok) {
      document.removeEventListener("click", unlockAudioFromGesture, true);
    }
  };
  // Initial touch gestures are usually scrolls; do not start audio work on them.
  document.addEventListener("click", unlockAudioFromGesture, true);
  window.addEventListener("focus", syncNotificationPermissionUI);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNotificationPermissionUI(); });
  const fullscreenBtn = document.getElementById("btn-chart-fullscreen");
  if (fullscreenBtn && window.matchMedia("(max-width: 900px)").matches) fullscreenBtn.textContent = "展開圖表";
  initSettings();
  OXControlPanel.init();
  OXFeaturePack.init();
  LiquidationModule.init();
  syncScannerFilterUI();
  const oxMarkerToggle = document.getElementById("chk-ox-markers");
  if (oxMarkerToggle) oxMarkerToggle.checked = false;
  setKeyLevelsVisible(false, { persist: true });
  initChart();
  applyTheme(getSavedThemeMode());
  switchAppView("radar");
  if (state.activeMarket === "crypto") {
    loadSymbolCandles(true);
    refreshMarketTickers();
  }
  renderBenchmarkBar();
  // Offscreen summaries are calculated when their view opens, so startup can paint sooner.
  renderOxLive();
  updateAlertButtons();
  setInterval(refreshMarketTickers, CONFIG.tickerRefreshMs);
  setInterval(renderOxLive, CONFIG.tickerRefreshMs);
  setInterval(updatePriceTimer, 1000);
  setInterval(checkLevelAlerts, 5000);
});

window.addEventListener("resize", () => {
  if (state.activeView === "radar" || document.body.classList.contains("chart-focus")) {
    setTimeout(resizeChartToContainer, 60);
  }
});

// Safari changes visualViewport height while hiding its toolbar on every
// vertical swipe. The chart's ResizeObserver handles actual container changes.

window.addEventListener("orientationchange", () => {
  [80, 220, 420].forEach(ms => setTimeout(resizeChartToContainer, ms));
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.body.classList.contains("chart-focus")) setChartFocus(false);
});
