import { TW_MODULE_CONFIG } from "./config.js";
import { createTWMarketState } from "./engine.js";
import { renderTWHome } from "./home.js";
import { renderTWStrength } from "./strength.js";
import { renderTWRadar } from "./radar.js";

let activeView = "radar";
function renderCurrentView() {
  const renderer = { home: renderTWHome, strength: renderTWStrength, radar: renderTWRadar }[activeView];
  return renderer?.(createTWMarketState());
}

export const twModule = Object.freeze({
  id: TW_MODULE_CONFIG.id,
  label: TW_MODULE_CONFIG.label,
  status: TW_MODULE_CONFIG.status,
  activate(context = {}) { activeView = context.view || activeView; renderCurrentView(); },
  deactivate() {},
  view(view) { activeView = view; renderCurrentView(); },
  refresh() { return createTWMarketState(); }
});
