/*
 * OX v4.0 Modular
 * US Market Home Renderer
 *
 * Responsibility:
 * - Render real US Market Pulse data.
 * - Read only from US Market State.
 * - Never call Twelve Data directly.
 * - Never touch Crypto / TW / Forex data.
 *
 * Current real-data coverage:
 * - SPY
 * - QQQ
 * - IWM
 *
 * VIX remains unavailable when the current
 * provider does not supply the real CBOE VIX.
 */

const HOME_CARD_ID =
  "market-unavailable-card";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function escapeHTML(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function formatPrice(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(number);
}

function formatPercent(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return `${
    number > 0 ? "+" : ""
  }${number.toFixed(2)}%`;
}

function formatVolume(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      notation: "compact",
      maximumFractionDigits: 1
    }
  ).format(number);
}

function formatUpdatedAt(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "zh-TW",
      {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).format(date);
  } catch {
    return date.toISOString();
  }
}

function changeClass(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "";
  }

  if (number > 0) {
    return "positive";
  }

  if (number < 0) {
    return "negative";
  }

  return "";
}

function sessionLabel(session) {
  switch (session) {
    case "REGULAR":
      return "REGULAR";

    case "CLOSED":
      return "CLOSED";

    default:
      return "UNKNOWN";
  }
}

export function deriveUSRiskRegime(benchmarks = {}) {
  const changes = ["SPY", "QQQ", "IWM"].map(symbol => {
    const quote = benchmarks[symbol];
    return quote?.available ? finiteNumber(quote.changePct) : null;
  });
  if (changes.some(value => value === null)) {
    return { label: "資料不足", tone: "unknown", positive: null };
  }
  const positive = changes.filter(value => value > 0).length;
  const negative = changes.filter(value => value < 0).length;
  return {
    label: positive === 3 ? "風險偏好升溫" : negative === 3 ? "風險偏好降溫" : "方向分歧",
    tone: positive === 3 ? "positive" : negative === 3 ? "negative" : "neutral",
    positive
  };
}

/* -------------------------------------------------------------------------- */
/* DOM                                                                        */
/* -------------------------------------------------------------------------- */

function getRoot() {
  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }

  return document.getElementById(
    HOME_CARD_ID
  );
}

function isUSMarket() {
  if (
    typeof document ===
    "undefined"
  ) {
    return false;
  }

  return (
    document.body
      ?.dataset
      ?.market === "us"
  );
}

/* -------------------------------------------------------------------------- */
/* Benchmark card                                                             */
/* -------------------------------------------------------------------------- */

function renderBenchmark(
  benchmark,
  {
    primary = false
  } = {}
) {
  if (!benchmark) {
    return "";
  }

  if (!benchmark.available) {
    return `
      <article
        class="us-market-pulse-item us-market-pulse-unavailable"
        data-us-symbol="${escapeHTML(
          benchmark.symbol
        )}"
      >
        <div class="us-market-pulse-symbol">
          <strong>${escapeHTML(
            benchmark.symbol
          )}</strong>

          <small>
            DATA UNAVAILABLE
          </small>
        </div>

        <div class="us-market-pulse-price">
          <b>—</b>
          <span>—</span>
        </div>

        <p>
          ${
            benchmark.symbol === "VIX"
              ? "目前資料源無真正 CBOE VIX；不以 VIX ETF 代替。"
              : escapeHTML(
                  benchmark.error ||
                  "目前無可用行情"
                )
          }
        </p>
      </article>
    `;
  }

  const change =
    benchmark.changePct;

  return `
    <article
      class="us-market-pulse-item ${
        primary
          ? "us-market-pulse-primary"
          : ""
      }"
      data-us-symbol="${escapeHTML(
        benchmark.symbol
      )}"
    >
      <div class="us-market-pulse-symbol">
        <strong>
          ${escapeHTML(
            benchmark.symbol
          )}
        </strong>

        <small>
          ${escapeHTML(
            benchmark.name ||
            benchmark.exchange ||
            "US MARKET"
          )}
        </small>
      </div>

      <div class="us-market-pulse-price">
        <b>
          $${formatPrice(
            benchmark.price
          )}
        </b>

        <span class="${changeClass(
          change
        )}">
          ${formatPercent(
            change
          )}
        </span>
      </div>

      <div class="us-market-pulse-meta">
        <span>
          O
          <b>${formatPrice(
            benchmark.open
          )}</b>
        </span>

        <span>
          H
          <b>${formatPrice(
            benchmark.high
          )}</b>
        </span>

        <span>
          L
          <b>${formatPrice(
            benchmark.low
          )}</b>
        </span>

        <span>
          VOL
          <b>${formatVolume(
            benchmark.volume
          )}</b>
        </span>
      </div>
    </article>
  `;
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

function renderLoading(
  root,
  state
) {
  root.hidden = false;

  root.innerHTML = `
    <div class="market-unavailable-icon">
      OX
    </div>

    <div class="us-market-home-content">
      <div class="page-kicker">
        US MARKET · CONNECTING
      </div>

      <h2 id="market-unavailable-title">
        美股市場
      </h2>

      <p id="market-unavailable-copy">
        正在透過 OX Backend 讀取
        SPY、QQQ、IWM 市場行情…
      </p>

      <div class="us-market-loading">
        REAL DATA PIPELINE
        ·
        ${escapeHTML(
          state.provider ||
          "US PROVIDER"
        )}
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Error                                                                      */
/* -------------------------------------------------------------------------- */

function renderError(
  root,
  state
) {
  root.hidden = false;

  root.innerHTML = `
    <div class="market-unavailable-icon">
      OX
    </div>

    <div class="us-market-home-content">
      <div class="page-kicker">
        US MARKET · DATA ERROR
      </div>

      <h2 id="market-unavailable-title">
        美股行情暫時無法取得
      </h2>

      <p id="market-unavailable-copy">
        ${escapeHTML(
          state.error
            ?.message ||
          "US Market Backend 暫時無法回傳資料。"
        )}
      </p>

      <small>
        Provider：
        ${escapeHTML(
          state.provider ||
          "unknown"
        )}
      </small>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Ready                                                                      */
/* -------------------------------------------------------------------------- */

function renderReady(
  root,
  state
) {
  const data =
    state.data;

  if (!data) {
    renderLoading(
      root,
      state
    );

    return;
  }

  const benchmarks =
    data.benchmarks || {};

  const spy =
    benchmarks.SPY;

  const qqq =
    benchmarks.QQQ;

  const iwm =
    benchmarks.IWM;

  const vix =
    benchmarks.VIX;

  const regime =
    deriveUSRiskRegime(benchmarks);

  root.hidden = false;

  root.innerHTML = `
    <div class="us-market-home-content">
      <div class="page-kicker">
        US MARKET PULSE · REAL DATA
      </div>

      <h2 id="market-unavailable-title">
        美股市場
      </h2>

      <p id="market-unavailable-copy">
        SPY / QQQ / IWM ETF 行情
        ·
        ${sessionLabel(
          data.session
        )}
        ·
        Twelve Data via OX Backend
      </p>

      ${state.status === "loading" ? '<p class="us-market-state-note">正在更新；下方保留前一次行情。</p>' : state.status === "error" ? `<p class="us-market-state-note is-error">更新失敗，顯示前一次行情：${escapeHTML(state.error?.message || "資料源暫時不可用")}</p>` : ""}

      <div class="us-market-pulse-grid">
        ${renderBenchmark(
          spy,
          {
            primary: true
          }
        )}

        ${renderBenchmark(
          qqq
        )}

        ${renderBenchmark(
          iwm
        )}

        ${renderBenchmark(
          vix
        )}
      </div>

      <div class="us-market-insights">
        <article class="us-market-insight">
          <div class="page-kicker">RISK REGIME · ETF PROXY</div>
          <h3 class="${regime.tone}">${regime.label}</h3>
          <p>${regime.positive === null ? "核心 ETF 尚未全部取得有效報價。" : `SPY、QQQ、IWM 中 ${regime.positive} / 3 上漲；三者同漲視為升溫、同跌視為降溫，其餘為分歧。`}</p>
        </article>
        <article class="us-market-insight">
          <div class="page-kicker">MARKET BREADTH</div>
          <h3>全市場廣度待接</h3>
          <p>目前僅有 ETF 報價，不能推算上漲家數、新高家數或均線以上家數。</p>
        </article>
        <article class="us-market-insight">
          <div class="page-kicker">SECTOR ROTATION</div>
          <h3>類股輪動待接</h3>
          <p>現有資料方案每分鐘限額不足以同時取得 11 檔類股 ETF；不顯示不完整排名。</p>
        </article>
      </div>

      <div class="us-market-home-footer">
        <span>
          MARKET SESSION
          <b>
            ${sessionLabel(
              data.session
            )}
          </b>
        </span>

        <span>
          AVAILABLE
          <b>
            ${
              data
                .availableSymbols
                ?.length ?? 0
            } / 4
          </b>
        </span>

        <span>
          UPDATED
          <b>
            ${formatUpdatedAt(
              state.updatedAt
            )}
          </b>
        </span>
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Public renderer                                                            */
/* -------------------------------------------------------------------------- */

export function renderUSHome(
  state
) {
  /*
   * Never touch another market's UI.
   */
  if (!isUSMarket()) {
    return {
      view: "home",
      status:
        state?.status ||
        "inactive"
    };
  }

  const root =
    getRoot();

  if (!root) {
    return {
      view: "home",
      status:
        state?.status ||
        "missing-root"
    };
  }

  if (
    !state ||
    state.status === "idle" ||
    (state.status === "loading" && !state.data)
  ) {
    renderLoading(
      root,
      state || {}
    );
  } else if (
    state.status === "error" && !state.data
  ) {
    renderError(
      root,
      state
    );
  } else if (
    ["ready", "loading", "error"].includes(state.status)
  ) {
    renderReady(
      root,
      state
    );
  } else {
    renderLoading(
      root,
      state
    );
  }

  return {
    view: "home",
    status:
      state?.status ||
      "unknown",

    data:
      state?.data ||
      null
  };
}
