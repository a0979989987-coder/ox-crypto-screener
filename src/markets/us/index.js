import { US_MODULE_CONFIG } from "./config.js?v=20261001-us-eod1";
import { createUSMarketState } from "./engine.js?v=20261001-us-eod1";
import { USWorkspace } from "./workspace.js?v=20261003-us-parity1";
const workspace = new USWorkspace();
let active = false,
  entered = false;
function restoreHost() {
  if (typeof document === "undefined") return;
  const root = document.getElementById("market-unavailable-card");
  if (!root) return;
  root.classList.remove("us-radar-root", "us2-root");
  root.innerHTML =
    '<div class="market-unavailable-icon">OX</div><div><div class="page-kicker">OX</div><h2 id="market-unavailable-title">市場</h2><p id="market-unavailable-copy">市場切換中。</p></div>';
  root.hidden = true;
}
export const usModule = Object.freeze({
  id: US_MODULE_CONFIG.id,
  label: US_MODULE_CONFIG.label,
  status: US_MODULE_CONFIG.status,
  activate({ view = "radar" } = {}) {
    active = true;
    const target = entered ? workspace.state.view : "radar";
    entered = true;
    // View changes dispatch synchronously and can re-enter view(). Bind the
    // workspace host before emitting them, including on the first US visit.
    const activation = workspace.activate(target);
    if (typeof window !== "undefined" && document.body.dataset.view !== target)
      window.switchAppView?.(target);
    return activation;
  },
  deactivate() {
    active = false;
    workspace.deactivate();
    restoreHost();
  },
  view(view) {
    if (
      !active &&
      typeof document !== "undefined" &&
      document.body.dataset.market === "us"
    )
      return this.activate({ view });
    if (active) workspace.show(view);
    return createUSMarketState();
  },
  refresh() {
    return createUSMarketState();
  },
  reload() {
    return active
      ? workspace.refreshSnapshot()
      : Promise.resolve(createUSMarketState());
  },
});
if (typeof document !== "undefined") {
  document.addEventListener("ox:us-refresh", () => {
    if (active) workspace.refreshSnapshot();
  });
  document.addEventListener("ox:marketchange", () => {
    if (document.body.dataset.market !== "us" && active) usModule.deactivate();
  });
  document.addEventListener("ox:viewchange", (event) => {
    if (
      active &&
      !["home", "strength", "radar", "data", "media"].includes(event.detail?.to)
    )
      workspace.suspend();
  });
}
