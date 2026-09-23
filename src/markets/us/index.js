import { US_MODULE_CONFIG } from "./config.js";
import { createUSMarketState } from "./engine.js";
import { renderUSHome } from "./home.js";
import { renderUSStrength } from "./strength.js";
import { renderUSRadar } from "./radar.js";

let activeView = "radar";
const renderers = Object.freeze({ home: renderUSHome, strength: renderUSStrength, radar: renderUSRadar });
const render = () => renderers[activeView]?.(createUSMarketState());

export const usModule = Object.freeze({
  id: US_MODULE_CONFIG.id,
  label: US_MODULE_CONFIG.label,
  status: US_MODULE_CONFIG.status,
  activate({ view = activeView } = {}) { activeView = view; render(); },
  deactivate() {},
  view(view) { activeView = view; render(); },
  refresh() { return createUSMarketState(); }
});
