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

document.addEventListener("ox:viewchange", event => {
  currentView = event.detail?.to || currentView;
  router.get(router.current())?.view?.(currentView);
});

document.addEventListener("ox:marketchange", event => {
  const market = event.detail?.market || "crypto";
  router.activate(market, { view: currentView });
});

window.OXModules = Object.freeze({ router, forex: forexModule });
