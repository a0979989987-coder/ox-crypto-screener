import {
  e,
  price,
  pct,
  tone,
  compact,
  fmt,
  toolNames,
  patterns,
  sectorETF,
} from "./view-utils.js";
import { fetchJSON } from "./provider.js";
export const newsViews = {
  async loadNewsData() {
    if (this.newsData) return this.newsData;
    if (this.newsPending) return this.newsPending;
    this.newsController = new AbortController();
    this.newsPending = fetchJSON("data/news.json", {
      signal: this.newsController.signal,
    })
      .then((j) => {
        this.newsData = j;
        return j;
      })
      .finally(() => (this.newsPending = null));
    return this.newsPending;
  },
  renderNews(main) {
    main.innerHTML = `<div class="us2-scope us2-news-tabs"><button data-news-kind="news" aria-pressed="true">市場新聞</button><button data-news-kind="events" aria-pressed="false">總經／財報</button><select data-event-window aria-label="事件範圍"><option value="week">本週</option><option value="today">今日</option><option value="watch">自選</option></select><button data-news-refresh aria-label="重新整理新聞">↻</button></div><div class="us2-news-list"><div class="us2-empty">讀取官方美股消息…</div></div>`;
    this.newsKind = "news";
    main.querySelectorAll("[data-news-kind]").forEach(
      (b) =>
        (b.onclick = () => {
          this.newsKind = b.dataset.newsKind;
          main
            .querySelectorAll("[data-news-kind]")
            .forEach((x) => x.setAttribute("aria-pressed", x === b));
          this.paintNews();
        }),
    );
    main.querySelector("[data-event-window]").onchange = () => this.paintNews();
    main.querySelector("[data-news-refresh]").onclick = () => {
      this.newsData = null;
      this.loadNewsData()
        .then(() => this.paintNews())
        .catch((error) => this.newsError(error));
    };
    this.loadNewsData()
      .then(() => {
        if (this.active && this.state.view === "data") this.paintNews();
      })
      .catch((error) => this.newsError(error));
  },
  newsError(error) {
    const n = this.root?.querySelector(".us2-news-list");
    if (n) n.textContent = `新聞資料無法取得：${error.message}`;
  },
  paintNews() {
    const list = this.root.querySelector(".us2-news-list");
    if (!list) return;
    const events = this.newsKind === "events",
      scope = this.root.querySelector("[data-event-window]").value;
    let rows = (events ? this.newsData?.events : this.newsData?.news) || [];
    rows = rows.filter((x) => x.markets?.includes("us"));
    if (events) {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const taipeiMidnight = Date.parse(`${today}T00:00:00+08:00`);
      const weekday = new Date(taipeiMidnight + 8 * 3600000).getUTCDay();
      const weekStart = taipeiMidnight - ((weekday + 6) % 7) * 86400000;
      const until = weekStart + 7 * 86400000;
      rows = rows.filter((x) => {
        const at = Date.parse(x.occursAt || x.date);
        if (scope === "watch")
          return x.symbols?.some((s) => this.watch.has(s)) && at >= Date.now();
        if (scope === "today")
          return (
            x.occursAt &&
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(x.occursAt)) === today
          );
        return at >= weekStart && at < until;
      });
    }
    const seen = new Set();
    rows = rows
      .filter((x) => {
        const key = x.url || x.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) =>
        events
          ? String(a.occursAt || a.date).localeCompare(
              String(b.occursAt || b.date),
            )
          : String(b.publishedAt).localeCompare(String(a.publishedAt)),
      )
      .slice(0, 60);
    this.newsRows = rows;
    list.innerHTML = rows.length
      ? rows
          .map(
            (x, i) =>
              `<button class="us2-news-card" data-article="${i}"><div><small>${e(x.sourceId || "官方來源")} · ${e(x.impact?.stars ? "★".repeat(x.impact.stars) : "")} ${events ? "事件時間" : "發布時間"} ${fmt(x.occursAt || x.publishedAt)}</small><b>${e(x.titleZh || x.title || "官方消息")}</b><span>${e(x.summaryZh || "")}</span></div><span>↗</span></button>`,
          )
          .join("")
      : `<div class="us2-empty">這個範圍沒有來源已確認的${events ? "事件／財報" : "新聞"}。個股財報時間尚未接入授權來源。</div>`;
    list.onclick = (ev) => {
      const b = ev.target.closest("[data-article]");
      if (b) this.openArticle(rows[+b.dataset.article]);
    };
  },
  openArticle(item) {
    const list = this.root.querySelector(".us2-news-list"),
      y = window.scrollY,
      html = list.innerHTML;
    let url;
    try {
      url = new URL(item.url);
      if (!["http:", "https:"].includes(url.protocol)) url = null;
    } catch {}
    list.innerHTML = `<article class="us2-article"><button class="us2-back" aria-label="返回新聞列表">←</button><small>${e(item.sourceId)} · 發布 ${fmt(item.publishedAt)}${item.occursAt ? " · 事件 " + fmt(item.occursAt) : ""}</small><h2>${e(item.titleZh || item.title)}</h2><p>${e(item.summaryZh || item.summary || "請至原始來源閱讀完整內容。")}</p><div class="us2-scope">${(
      item.symbols || []
    )
      .filter((s) => this.directory.some((x) => x.symbol === s))
      .map((s) => `<button data-symbol="${e(s)}">${e(s)} 圖表</button>`)
      .join(
        "",
      )}</div>${url ? `<a href="${e(url.href)}" target="_blank" rel="noopener noreferrer">閱讀原始來源 ↗</a>` : ""}</article>`;
    list.querySelector(".us2-back").onclick = () => {
      list.innerHTML = html;
      list.onclick = (ev) => {
        const b = ev.target.closest("[data-article]");
        if (b) this.openArticle(this.newsRows[+b.dataset.article]);
      };
      requestAnimationFrame(() => window.scrollTo(0, y));
    };
    this.bindRows(list.querySelector(".us2-scope"));
    window.scrollTo(0, 0);
  },
  renderMedia(main) {
    main.innerHTML = `<div class="us2-media-grid"><section class="us2-card"><header class="us2-section-header"><h3>美股研究與教學</h3><small>OX</small></header><div class="us2-media-content"><div class="us2-empty">讀取已發布的美股內容…</div></div></section><section class="us2-card us2-help"><h3>分析工作流程</h3><button data-help="search">⌕ 搜尋股票、ADR 與 ETF</button><button data-help="patterns">◇ 畫出型態，比對真實 K 線</button><button data-help="watch">☆ 從自選進入分析圖表</button><p>圖表保留每檔股票的畫線。完整日量比與相對 SPY 報酬使用相同交易日。</p></section></div>`;
    main.querySelector('[data-help="search"]').onclick = () =>
      this.root.querySelector("input").focus();
    main.querySelector('[data-help="patterns"]').onclick = () => {
      this.state.tool = "patterns";
      window.switchAppView?.("strength");
    };
    main.querySelector('[data-help="watch"]').onclick = () => {
      this.state.watchOnly = true;
      window.switchAppView?.("radar");
    };
    fetchJSON("data/us-media.json", { signal: this.controller?.signal })
      .then((j) => {
        if (!this.active || this.state.view !== "media") return;
        const node = main.querySelector(".us2-media-content"),
          items = j.items || [];
        node.innerHTML = items.length
          ? items
              .map(
                (x) =>
                  `<article><h4>${e(x.title)}</h4><p>${e(x.summary)}</p><a href="${e(x.url)}" target="_blank" rel="noopener">開啟內容 ↗</a></article>`,
              )
              .join("")
          : '<div class="us2-empty">目前沒有已發布的美股專屬影片或文章。</div>';
      })
      .catch(() => {
        const n = main.querySelector(".us2-media-content");
        if (n) n.textContent = "目前沒有可取得的美股媒體內容。";
      });
  },
};
