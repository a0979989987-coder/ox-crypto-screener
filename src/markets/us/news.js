import { icon } from "./ui.js?v=20260930-us-data4";
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
} from "./view-utils.js?v=20260930-us-data4";
import { fetchJSON } from "./provider.js?v=20260930-us-data4";
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
    main.innerHTML = `<div class="media-page"><div class="media-card"><div class="ox-news-controls"><div class="ox-news-tabs us2-news-tabs"><button data-news-kind="news" class="active" aria-pressed="true">市場新聞</button><button data-news-kind="events" aria-pressed="false">總經／財報</button></div><div class="ox-news-control-row"><select class="ox-news-filter" data-event-window aria-label="事件範圍"><option value="week">本週</option><option value="today">今日</option><option value="watch">自選</option></select><button class="ox-news-filter" data-news-refresh aria-label="重新整理新聞">↻</button></div></div><details class="ox-calendar-disclosure"><summary>事件行事曆</summary><div class="ox-mini-calendar us2-calendar"></div></details><div class="us2-news-list ox-news-list"><div class="ox-news-empty">讀取官方美股消息…</div></div></div></div>`;
    this.calendarMonth ||= new Date(new Date().getFullYear(),new Date().getMonth(),1);
    this.paintCalendar();
    this.newsKind = "news";
    main.querySelectorAll("[data-news-kind]").forEach(
      (b) =>
        (b.onclick = () => {
          this.newsKind = b.dataset.newsKind;
          main
            .querySelectorAll("[data-news-kind]")
            .forEach((x) => {x.setAttribute("aria-pressed", x === b);x.classList.toggle("active",x===b);});
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
        if(this.calendarDate)return (x.date||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(x.occursAt)))===this.calendarDate;
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
        const key = x.link || x.url || x.id;
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
              `<article class="ox-news-card us2-news-card" data-article="${i}"><div class="ox-news-meta"><span class="ox-news-source">${e(x.source || x.sourceId || "官方來源")}</span><time>${fmt(x.occursAt || x.publishedAt)}</time>${x.impact?.stars?`<span class="ox-news-impact" title="${e(x.impact.reason||"")}">${"★".repeat(x.impact.stars)}</span>`:""}</div><h3>${e(x.titleZh || x.title || "官方消息")}</h3><p class="ox-news-detail">${events?"事件時間":"發布時間"} · ${e(x.summaryZh || (events?(x.status==="confirmed"?"官方排程已確認":"時間待確認"):"官方消息"))}</p><div class="ox-news-actions"><button data-article="${i}" aria-label="閱讀 ${e(x.titleZh||x.title)}">閱讀詳情 ↗</button>${(x.symbols||[]).map(s=>`<button data-symbol="${e(s)}">${e(s)} 圖表</button>`).join("")}</div></article>`,
          )
          .join("")
      : `<div class="us2-empty">這個範圍沒有來源已確認的${events ? "事件／財報" : "新聞"}。個股財報時間尚未接入授權來源。</div>`;
    list.onclick = (ev) => {
      const stock=ev.target.closest("[data-symbol]");if(stock){this.openStock(stock.dataset.symbol);return;}
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
      url = new URL(item.link || item.url);
      if (!["http:", "https:"].includes(url.protocol)) url = null;
    } catch {}
    list.innerHTML = `<article class="us2-article"><header><button class="us2-back" aria-label="返回新聞列表">←</button></header><small>${e(item.sourceId)} · 發布 ${fmt(item.publishedAt)}${item.occursAt ? " · 事件 " + fmt(item.occursAt) : ""}</small><h2>${e(item.titleZh || item.title)}</h2><p>${e(item.summaryZh || item.summary || "請至原始來源閱讀完整內容。")}</p><div class="us2-scope">${(
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
  paintCalendar() {
    const node=this.root.querySelector(".us2-calendar");if(!node)return;
    const m=this.calendarMonth,y=m.getFullYear(),month=m.getMonth(),first=new Date(y,month,1).getDay(),days=new Date(y,month+1,0).getDate();
    node.innerHTML=`<div class="ox-mini-calendar-toolbar"><button data-month="-1" aria-label="上個月">‹</button><strong>${y} / ${month+1}</strong><button data-month="1" aria-label="下個月">›</button></div><div class="ox-mini-calendar-grid">${["日","一","二","三","四","五","六"].map(d=>`<span class="ox-mini-weekday">${d}</span>`).join("")}${"<span class=\"ox-mini-spacer\"></span>".repeat(first)}${Array.from({length:days},(_,i)=>{const date=`${y}-${String(month+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`;return `<button class="ox-mini-day ${date===this.calendarDate?"is-selected":""}" data-date="${date}">${i+1}</button>`;}).join("")}</div><button class="ox-mini-calendar-clear" data-date="">清除日期篩選</button>`;
    node.onclick=ev=>{const b=ev.target.closest("button");if(!b)return;if(b.dataset.month){this.calendarMonth=new Date(y,month+Number(b.dataset.month),1);}else{this.calendarDate=b.dataset.date;this.newsKind="events";this.root.querySelectorAll("[data-news-kind]").forEach(x=>{x.classList.toggle("active",x.dataset.newsKind==="events");x.setAttribute("aria-pressed",x.dataset.newsKind==="events");});this.paintNews();}this.paintCalendar();};
  },
  renderMedia(main) {
    main.innerHTML = `<div class="media-page"><div class="media-card"><div class="media-intro"><div class="media-logo"><img src="ox-logo.png" alt="OX" width="150" height="150"></div><div><h1>少一點雜訊。<br>多一點判斷。</h1><p>美股研究、教學與操作案例。</p><button class="ox-news-open" data-media-news>查看美股官方消息</button></div></div><div class="media-sections"><section class="media-section"><h2>美股研究與教學</h2><div class="us2-media-content"><div class="us2-empty">讀取已發布內容…</div></div></section><section class="media-section"><h2>分析工作流程</h2><div class="media-function-list us2-media-workflow"><button class="media-function-item" data-help="search"><b>搜尋標的</b><span>普通股、ADR 與 ETF</span></button><button class="media-function-item" data-help="patterns"><b>型態畫板</b><span>比對真實 K 線</span></button><button class="media-function-item" data-help="watch"><b>自選雷達</b><span>開啟收藏的分析圖表</span></button></div></section></div></div></div>`;
    main.querySelector("[data-media-news]").onclick=()=>window.switchAppView?.("data");
    main.querySelector('[data-help="search"]').onclick = () =>
      this.openSearch(main.querySelector('[data-help="search"]'));
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
