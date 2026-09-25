import { marketRouter } from "./marketRouter.js";
import { cryptoModule } from "../markets/crypto/index.js";
import { usModule } from "../markets/us/index.js";
import { twModule } from "../markets/tw/index.js";
import { forexModule } from "../markets/forex/index.js";

export function bootOXModules(modules = []) {
  modules.forEach(module => marketRouter.register(module));
  return marketRouter;
}

const router = bootOXModules([cryptoModule, usModule, twModule, forexModule]);
let currentView = "radar";
let renderToken = 0;

function scheduleMarketView() {
  const token = ++renderToken;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== renderToken || !["home", "strength", "radar"].includes(currentView)) return;
    const market = document.body.dataset.market || "crypto";
    if (router.current() !== market) router.activate(market, { view: currentView }).then(() => {
      if (token !== renderToken || !["home", "strength", "radar"].includes(currentView)) {
        const host = document.getElementById("market-unavailable-card");
        if (host) host.hidden = true;
        const forex = document.getElementById("ox-forex-module");
        if (forex) forex.hidden = true;
        return;
      }
      if (document.body.dataset.market !== market) scheduleMarketView();
    });
    else router.get(market)?.view?.(currentView);
  }));
}

document.addEventListener("ox:viewchange", event => {
  currentView = event.detail?.to || currentView;
  // Market modules live outside .app-view; hide them synchronously when a
  // Data, News, Media or Settings page opens, even if activation is pending.
  if (!["home", "strength", "radar"].includes(currentView)) {
    ++renderToken;
    for (const id of ["ox-forex-module", "market-unavailable-card"]) {
      const root = document.getElementById(id);
      if (root) root.hidden = true;
    }
  }
  scheduleMarketView();
});

document.addEventListener("ox:marketchange", event => {
  scheduleMarketView();
});

window.OXModules = Object.freeze({ router, forex: forexModule });
