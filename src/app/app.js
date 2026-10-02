import { marketRouter } from "./marketRouter.js?v=20261002-nav6";
import { cryptoModule } from "../markets/crypto/index.js";
import { usModule } from "../markets/us/index.js?v=20261002-finance4r3";
import { twModule } from "../markets/tw/index.js?v=20261002-rail1";

export function bootOXModules(modules = []) {
  modules.forEach(module => marketRouter.register(module));
  return marketRouter;
}

const router = bootOXModules([cryptoModule, usModule, twModule]);
let currentView = document.body.dataset.view || "home";
let renderToken = 0;
const isMarketView = () => ["home", "strength", "radar"].includes(currentView) || (document.body.dataset.market === "us" && ["data", "media"].includes(currentView));

function scheduleMarketView() {
  const token = ++renderToken;
  const activate = () => {
    if (token !== renderToken || !isMarketView()) return;
    const market = document.body.dataset.market || "crypto";
    const onFailure = error => {
      if (token !== renderToken || document.body.dataset.market !== market) return;
      document.dispatchEvent(new CustomEvent("ox:marketerror", { detail: { market, message: error?.message || "市場介面啟動失敗" } }));
    };
    if (router.current() !== market) router.activate(market, { view: currentView }).then(() => {
      if (token !== renderToken) return;
      if (!isMarketView()) {
        const host = document.getElementById("market-unavailable-card");
        if (host) host.hidden = true;
        return;
      }
      if (document.body.dataset.market !== market) scheduleMarketView();
    }).catch(onFailure);
    else {
      try {
        Promise.resolve(router.get(market)?.view?.(currentView)).catch(onFailure);
      } catch (error) { onFailure(error); }
    }
  };
  // US and Taiwan replace the temporary market placeholder with their own
  // stable shell before awaiting data. Mount it in the same task as the market
  // switch so mobile users never land on the centered architecture screen.
  if (["us", "tw"].includes(document.body.dataset.market)) activate();
  else requestAnimationFrame(() => requestAnimationFrame(activate));
}

document.addEventListener("ox:viewchange", event => {
  currentView = event.detail?.to || currentView;
  // Market modules live outside .app-view; hide them synchronously when a
  // Data, News, Media or Settings page opens, even if activation is pending.
  if (!isMarketView()) {
    ++renderToken;
    for (const id of ["market-unavailable-card"]) {
      const root = document.getElementById(id);
      if (root) root.hidden = true;
    }
  }
  scheduleMarketView();
});

document.addEventListener("ox:marketchange", event => {
  scheduleMarketView();
});

window.OXModules = Object.freeze({ router });

// A slow module graph may finish after the user already selected a market.
// Restore the actual DOM context instead of requiring another market gesture.
const restoreMarketView = () => {
  currentView = document.body.dataset.view || currentView;
  scheduleMarketView();
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restoreMarketView, { once: true });
else restoreMarketView();

// Preload before the user opens Taiwan; idle scheduling leaves initial UI paint free.
const preloadTaiwan = () => { if (!document.hidden) twModule.preload(); };
if ('requestIdleCallback' in window) window.requestIdleCallback(preloadTaiwan, { timeout: 1200 });
else setTimeout(preloadTaiwan, 300);
document.addEventListener('visibilitychange', () => { if (!document.hidden) preloadTaiwan(); });

// Keep the next Taiwan switch warm during longer sessions in another market.
setInterval(() => { if (document.body.dataset.market !== 'tw') preloadTaiwan(); }, 300000);
