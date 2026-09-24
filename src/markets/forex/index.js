import { FOREX_MODULE_CONFIG, FOREX_PAIRS } from "./config.js";
import { fetchForexHistory } from "./api.js";
import { analyzeForexHistory } from "./engine.js";
import { renderForexHome } from "./home.js";
import { renderForexStrength } from "./strength.js";
import { renderForexRadar } from "./radar.js";
import { STORAGE_KEYS } from "../../core/config.js";
import { storageService } from "../../services/storage.js";

let root = null;
let analysis = null;
let loading = false;
let selectedPair = storageService.get(STORAGE_KEYS.forexPair, FOREX_MODULE_CONFIG.defaultPair);
let activeView = "radar";
let refreshTimer = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function ensureRoot() {
  if (root) return root;
  root = document.createElement("section");
  root.id = "ox-forex-module";
  root.className = "fx-module";
  root.hidden = true;
  const anchor = document.getElementById("market-unavailable-card");
  anchor?.insertAdjacentElement("afterend", root);
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-fx-pair]");
    if (!button) return;
    selectedPair = button.dataset.fxPair;
    storageService.set(STORAGE_KEYS.forexPair, selectedPair);
    render();
  });
  return root;
}

function renderLoading(message = "正在讀取外匯市場資料…") {
  ensureRoot().innerHTML = `<article class="fx-panel fx-state"><span class="fx-spinner"></span><h2>${message}</h2><p>資料來源：Frankfurter / ECB reference rates</p></article>`;
}

function renderError(error) {
  const message = String(error?.message || "請稍後再試");
  document.dispatchEvent(new CustomEvent("ox:forex:error", { detail: { error: message } }));
  if (analysis) {
    render();
    const banner = document.createElement("div");
    banner.className = "fx-stale-banner";
    banner.textContent = `更新失敗，保留 ${analysis.updatedAt} 的每日參考資料：${message}`;
    root.querySelector(".fx-module-head")?.after(banner);
    return;
  }
  ensureRoot().innerHTML = `<article class="fx-panel fx-state fx-error"><b>FOREX DATA UNAVAILABLE</b><h2>外匯資料目前無法取得</h2><p>${escapeHtml(message)}</p><button type="button" data-fx-retry>重新載入</button></article>`;
  root.querySelector("[data-fx-retry]")?.addEventListener("click", () => refresh(true));
}

function render() {
  if (!analysis) return;
  ensureRoot().innerHTML = `
    <div class="fx-module-head">
      <div><span>OX FOREX</span><h1>外匯市場指揮中心</h1><p>${analysis.source} · 更新 ${analysis.updatedAt}</p></div>
      <label>貨幣對<select id="fx-pair-select">${FOREX_PAIRS.map(pair => `<option value="${pair.id}" ${pair.id === selectedPair ? "selected" : ""}>${pair.id}</option>`).join("")}</select></label>
    </div>
    <div id="fx-home"></div><div id="fx-strength"></div><div id="fx-radar"></div>`;
  renderForexHome(root.querySelector("#fx-home"), analysis, selectedPair);
  renderForexStrength(root.querySelector("#fx-strength"), analysis);
  renderForexRadar(root.querySelector("#fx-radar"), analysis, selectedPair);
  root.querySelector("#fx-pair-select")?.addEventListener("change", event => {
    selectedPair = event.target.value;
    storageService.set(STORAGE_KEYS.forexPair, selectedPair);
    render();
  });
  syncView();
}

function syncView() {
  if (!root) return;
  const show = id => { const node = root.querySelector(id); if (node) node.hidden = false; };
  root.querySelectorAll("#fx-home,#fx-strength,#fx-radar").forEach(node => { node.hidden = true; });
  if (activeView === "home") { show("#fx-home"); show("#fx-radar"); }
  else if (activeView === "strength") show("#fx-strength");
  else if (activeView === "radar") { show("#fx-home"); show("#fx-strength"); show("#fx-radar"); }
}

async function refresh(force = false) {
  if (loading || (analysis && !force)) return;
  loading = true;
  if (!analysis) renderLoading();
  try {
    analysis = analyzeForexHistory(await fetchForexHistory());
    document.dispatchEvent(new CustomEvent("ox:forex:update", { detail: { timestamp: analysis.updatedAt, provider: analysis.provider } }));
    render();
  } catch (error) {
    renderError(error);
  } finally {
    loading = false;
  }
}

export const forexModule = {
  id: FOREX_MODULE_CONFIG.id,
  label: FOREX_MODULE_CONFIG.label,
  async activate(context = {}) {
    activeView = context.view || activeView;
    ensureRoot().hidden = !["home", "strength", "radar"].includes(activeView);
    await refresh(false);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(true), FOREX_MODULE_CONFIG.refreshMs);
  },
  deactivate() {
    if (root) root.hidden = true;
    clearInterval(refreshTimer);
  },
  view(view) {
    activeView = view;
    if (root) root.hidden = !["home", "strength", "radar"].includes(view);
    syncView();
  },
  refresh: () => refresh(true)
};
