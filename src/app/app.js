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
    if (router.current() !== market) router.activate(market, { view: currentView });
    else router.get(market)?.view?.(currentView);
  }));
}

document.addEventListener("ox:viewchange", event => {
  currentView = event.detail?.to || currentView;
  scheduleMarketView();
});

document.addEventListener("ox:marketchange", event => {
  scheduleMarketView();
});

window.OXModules = Object.freeze({ router, forex: forexModule });
