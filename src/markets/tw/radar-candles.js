import { twProvider } from "./api.js?v=20261001-loading1";
import { escapeTW, renderTWCandles, renderTWCurrentCandle } from "./radar-card.js";

const cache = new Map();
const pending = new Map();
let observer;
let generation = 0;
let inFlight = 0;
const queue = [];

export function resetTWMiniCandles() {
  generation++;
  observer?.disconnect();
}

function schedule(symbol) {
  if (cache.has(symbol)) return Promise.resolve(cache.get(symbol));
  if (pending.has(symbol)) return pending.get(symbol);
  const promise = new Promise(resolve => {
    queue.push(async () => {
      try {
        const result = await twProvider.getCandles(symbol, { interval: "1D", range: "1M", limit: 24, adjusted: false });
        const entry = { candles: result?.candles || [], error: false };
        cache.set(symbol, entry);
        resolve(entry);
      } catch {
        const entry = { candles: [], error: true };
        cache.set(symbol, entry);
        resolve(entry);
      } finally {
        pending.delete(symbol);
        inFlight--;
        pump();
      }
    });
    pump();
  });
  pending.set(symbol, promise);
  return promise;
}

function pump() {
  while (inFlight < 2 && queue.length) {
    inFlight++;
    queue.shift()();
  }
}

function paintMini(node, entry) {
  const chart = renderTWCurrentCandle(entry.candles);
  node.innerHTML = chart || "—";
  node.title = chart ? "最近交易日日 K · 非即時" : entry.error ? "日 K 暫時無法載入" : "日 K 尚無資料";
  node.setAttribute("aria-label", node.title);
}

export function observeTWMiniCandles(root) {
  resetTWMiniCandles();
  const current = generation;
  const nodes = root.querySelectorAll("[data-twr-mini]");
  if (!nodes.length) return;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const node = entry.target;
      const symbol = node.dataset.twrMini;
      if (cache.has(symbol)) paintMini(node, cache.get(symbol));
      else schedule(symbol).then(result => {
        if (current === generation && node.isConnected) paintMini(node, result);
      });
    }
  }, { rootMargin: "120px" });
  nodes.forEach(node => observer.observe(node));
}

export async function openTWStockDetail(root, row) {
  if (!row) return;
  root.querySelector(".tw-stock-detail")?.remove();
  const scrollY = window.scrollY;
  const dialog = document.createElement("div");
  const disposition = row.disposition || {};
  const officialLink = url => {
    try { const value = new URL(url); return value.protocol === 'https:' && ['www.twse.com.tw','www.tpex.org.tw'].includes(value.hostname) ? value.href : ''; }
    catch { return ''; }
  };
  const sourceUrl = officialLink(disposition.sourceUrl || disposition.riskSourceUrl);
  const announcement = `<div class="tw-stock-announcement">${disposition.riskBasis ? `<p><b>${escapeTW(disposition.riskLevel || '官方注意累計')}</b><br>${escapeTW(disposition.riskBasis)}<br>須後續再達官方注意標準，才可能進入處置。</p>` : ''}${disposition.detail ? `<details><summary>查看處置公告</summary><p>${escapeTW(disposition.detail)}</p></details>` : ''}${sourceUrl ? `<a href="${escapeTW(sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告 ↗</a>` : ''}</div>`;
  dialog.className = "tw-stock-detail";
  dialog.innerHTML = `<div class="tw-stock-detail-scrim" data-twr-close></div><section class="tw-stock-detail-panel" role="dialog" aria-modal="true" aria-label="${escapeTW(row.name || row.symbol)} K 線"><header><div><small>OX TW · 官方日 K</small><h3>${escapeTW(row.name || row.symbol)} <span>${escapeTW(row.symbol)}</span></h3></div><button type="button" data-twr-close aria-label="返回雷達">×</button></header><div class="tw-stock-detail-chart">日 K 載入中…</div><p>歷史日 K，非即時行情。出關倒數依公告迄日與官方交易日曆計算。</p>${announcement}</section>`;
  root.append(dialog);
  dialog.querySelector("[data-twr-close]:last-child")?.focus({ preventScroll: true });
  const close = () => {
    dialog.classList.remove("visible");
    setTimeout(() => dialog.remove(), 190);
    window.scrollTo(0, scrollY);
    root.querySelector(`[data-twr-symbol="${CSS.escape(row.symbol)}"]`)?.focus({ preventScroll: true });
  };
  dialog.addEventListener("click", event => { if (event.target.closest("[data-twr-close]")) close(); });
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  requestAnimationFrame(() => dialog.classList.add("visible"));
  const result = await schedule(row.symbol);
  if (!dialog.isConnected) return;
  const chart = renderTWCandles(result.candles, { width: 760, height: 330, count: 60 });
  dialog.querySelector(".tw-stock-detail-chart").innerHTML = chart || (result.error ? "官方日 K 暫時無法載入" : "官方日 K 尚無資料");
}
