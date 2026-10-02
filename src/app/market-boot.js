(() => {
  "use strict";
  const entry = new URL("./app.js?v=20261002-etffast1", document.currentScript.src);
  entry.search = new URL(document.currentScript.src).search;
  const state = { status: "loading", message: "" };
  window.OXMarketBoot = state;
  let timer;

  function showFailure(message) {
    if (document.body.dataset.market !== "us") return;
    const root = document.getElementById("market-unavailable-card");
    if (!root) return;
    root.hidden = false;
    root.classList.remove("market-unavailable-card", "us2-root");
    root.classList.add("us-boot-status");
    root.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = state.status === "loading" ? "美股介面連線較慢" : "美股介面未能啟動";
    const copy = document.createElement("p");
    copy.textContent = state.status === "loading" ? "介面程式尚未完整載入。" : "介面啟動中斷，請重新載入。";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重新載入";
    retry.onclick = () => window.location.reload();
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "啟動診斷";
    const reason = document.createElement("p");
    reason.textContent = message || "介面程式下載超過 10 秒，請檢查網路連線。";
    details.append(summary, reason);
    root.append(title, copy, retry, details);
    const live = document.getElementById("ox-live-text");
    if (live) live.textContent = "美股 · 介面尚未連線";
  }

  function sync() {
    clearTimeout(timer);
    if (document.body.dataset.market !== "us") return;
    if (state.status === "failed") showFailure(state.message);
    else if (state.status === "loading") timer = setTimeout(() => showFailure(), 10000);
  }
  document.addEventListener("ox:marketchange", sync);
  document.addEventListener("ox:marketerror", event => {
    if (event.detail?.market !== "us") return;
    state.status = "failed";
    state.message = event.detail.message;
    showFailure(state.message);
  });
  // The module script and this import share the exact URL and module instance.
  // Catch graph/initialization errors that a bare <script type=module> cannot show.
  import(entry.href).then(() => {
    state.status = "ready";
    clearTimeout(timer);
  }).catch(error => {
    state.status = "failed";
    state.message = error?.message || "介面程式下載失敗";
    sync();
  });
  sync();
})();
