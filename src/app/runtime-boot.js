const keyLevelVisibilityToggle = document.getElementById("chk-key-levels");
syncKeyLevelVisibilityUI();
keyLevelVisibilityToggle?.addEventListener("change", e => setKeyLevelsVisible(e.target.checked));

window.addEventListener("DOMContentLoaded", () => {
  const unlockAudioFromGesture = async () => {
    const ok = await primeAlertAudio(true);
    if (ok) {
      document.removeEventListener("pointerdown", unlockAudioFromGesture, true);
      document.removeEventListener("touchstart", unlockAudioFromGesture, true);
      document.removeEventListener("keydown", unlockAudioFromGesture, true);
    }
  };
  document.addEventListener("pointerdown", unlockAudioFromGesture, true);
  document.addEventListener("touchstart", unlockAudioFromGesture, true);
  document.addEventListener("keydown", unlockAudioFromGesture, true);
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
  renderMarketStrength();
  renderOxLive();
  renderHomeOverview();
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

window.visualViewport?.addEventListener("resize", () => {
  if (state.activeView === "radar" || document.body.classList.contains("chart-focus")) {
    [50, 160, 300].forEach(ms => setTimeout(resizeChartToContainer, ms));
  }
});

window.addEventListener("orientationchange", () => {
  [80, 220, 420].forEach(ms => setTimeout(resizeChartToContainer, ms));
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.body.classList.contains("chart-focus")) setChartFocus(false);
});
