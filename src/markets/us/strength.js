/*
 * OX v4.0 Modular
 * US Market Strength Renderer
 *
 * Responsibility:
 * - Calculate benchmark strength from real US market data.
 * - Use the existing US Market State only.
 * - Render SPY / QQQ / IWM strength.
 * - Keep desktop and mobile layouts responsive.
 *
 * IMPORTANT:
 * This is BENCHMARK strength.
 * It is NOT full-market breadth.
 *
 * No fake advance / decline data is created.
 */

const ROOT_ID =
  "market-unavailable-card";

const BENCHMARK_CONFIG =
  Object.freeze({
    SPY: {
      label: "S&P 500",
      role: "大型股 / 大盤",
      weight: 0.45
    },

    QQQ: {
      label: "NASDAQ 100",
      role: "科技 / 成長",
      weight: 0.35
    },

    IWM: {
      label: "RUSSELL 2000",
      role: "小型股",
      weight: 0.20
    }
  });

/* -------------------------------------------------------------------------- */
/* Responsive styles                                                          */
/* -------------------------------------------------------------------------- */

const STRENGTH_STYLE = `
<style>
  #market-unavailable-card .us-strength-shell {
    width: min(820px, 100%);
    min-width: 0;
    box-sizing: border-box;
  }

  #market-unavailable-card .us-strength-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    width: 100%;
    min-width: 0;
  }

  #market-unavailable-card .us-strength-head-copy {
    min-width: 0;
    flex: 1 1 auto;
  }

  #market-unavailable-card .us-strength-score-card {
    flex: 0 0 auto;
    width: 108px;
    min-width: 108px;
    padding: 16px 14px;
    border-radius: 18px;
    text-align: center;
    box-sizing: border-box;
  }

  #market-unavailable-card .us-strength-total {
    display: block;
    font-size: 34px;
    line-height: 1;
    font-weight: 900;
  }

  #market-unavailable-card .us-strength-total-label {
    display: block;
    margin-top: 7px;
    font-size: 11px;
    font-weight: 800;
  }

  #market-unavailable-card .us-strength-list {
    margin-top: 20px;
    width: 100%;
    min-width: 0;
  }

  #market-unavailable-card .us-strength-row {
    display: grid;
    grid-template-columns:
      minmax(135px, 1fr)
      minmax(250px, 1.7fr)
      80px;
    gap: 18px;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 18px 0;
    border-bottom:
      1px solid rgba(130,150,175,.15);
    box-sizing: border-box;
  }

  #market-unavailable-card .us-strength-identity,
  #market-unavailable-card .us-strength-main {
    min-width: 0;
  }

  #market-unavailable-card .us-strength-symbol-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  #market-unavailable-card .us-strength-symbol {
    flex: 0 0 auto;
    font-size: 20px;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: .03em;
  }

  #market-unavailable-card .us-strength-name {
    min-width: 0;
    font-size: 10px;
    opacity: .55;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  #market-unavailable-card .us-strength-role {
    margin-top: 5px;
    font-size: 11px;
    opacity: .62;
  }

  #market-unavailable-card .us-strength-track {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(130,150,175,.16);
    overflow: hidden;
  }

  #market-unavailable-card .us-strength-track > i {
    display: block;
    height: 100%;
    border-radius: inherit;
  }

  #market-unavailable-card .us-strength-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 9px;
    font-size: 10px;
    opacity: .72;
  }

  #market-unavailable-card .us-strength-stats span {
    white-space: nowrap;
  }

  #market-unavailable-card .us-strength-stats b {
    font-weight: 800;
  }

  #market-unavailable-card .us-strength-row-score {
    text-align: right;
  }

  #market-unavailable-card .us-strength-row-score strong {
    display: block;
    font-size: 26px;
    line-height: 1;
    font-weight: 900;
  }

  #market-unavailable-card .us-strength-row-score small {
    display: block;
    margin-top: 6px;
    font-size: 10px;
    font-weight: 800;
  }

  #market-unavailable-card .us-strength-note {
    margin-top: 18px;
    padding: 13px 15px;
    border-radius: 14px;
    background: rgba(120,145,175,.07);
    border:
      1px solid rgba(120,145,175,.12);
    font-size: 10px;
    line-height: 1.7;
    opacity: .7;
    box-sizing: border-box;
  }

  /*
   * Tablet
   */
  @media (max-width: 900px) {
    #market-unavailable-card .us-strength-row {
      grid-template-columns:
        minmax(120px, .9fr)
        minmax(190px, 1.5fr)
        68px;
      gap: 14px;
    }

    #market-unavailable-card .us-strength-stats {
      gap: 7px 12px;
    }
  }

  /*
   * Mobile
   *
   * The existing placeholder card is a horizontal
   * icon + content layout. On phones that steals
   * too much width, so Strength becomes a single
   * full-width column.
   */
  @media (max-width: 720px) {
    #market-unavailable-card {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      padding: 22px 18px 24px !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
    }

    #market-unavailable-card > .market-unavailable-icon {
      display: none !important;
    }

    #market-unavailable-card .us-strength-shell {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }

    #market-unavailable-card .us-strength-head {
      gap: 12px;
    }

    #market-unavailable-card .us-strength-head-copy {
      padding-top: 3px;
    }

    #market-unavailable-card .us-strength-head h2 {
      font-size: 24px !important;
      line-height: 1.15 !important;
    }

    #market-unavailable-card .us-strength-head p {
      margin-top: 7px !important;
      font-size: 10px !important;
      line-height: 1.45 !important;
    }

    #market-unavailable-card .us-strength-score-card {
      width: 90px;
      min-width: 90px;
      padding: 13px 9px;
      border-radius: 16px;
    }

    #market-unavailable-card .us-strength-total {
      font-size: 31px;
    }

    #market-unavailable-card .us-strength-total-label {
      margin-top: 6px;
      font-size: 10px;
    }

    #market-unavailable-card .us-strength-list {
      margin-top: 18px;
    }

    /*
     * Key mobile change:
     *
     * Desktop:
     * identity | bar/stats | score
     *
     * Mobile:
     * identity + score
     * full-width bar
     * full-width stats
     */
    #market-unavailable-card .us-strength-row {
      grid-template-columns:
        minmax(0, 1fr)
        auto;
      grid-template-areas:
        "identity score"
        "main main";
      gap: 12px 10px;
      padding: 17px 0;
      align-items: start;
    }

    #market-unavailable-card .us-strength-identity {
      grid-area: identity;
    }

    #market-unavailable-card .us-strength-main {
      grid-area: main;
      width: 100%;
      min-width: 0;
    }

    #market-unavailable-card .us-strength-row-score {
      grid-area: score;
      min-width: 54px;
      padding-top: 1px;
    }

    #market-unavailable-card .us-strength-symbol {
      font-size: 23px;
    }

    #market-unavailable-card .us-strength-name {
      font-size: 10px;
      max-width: 145px;
    }

    #market-unavailable-card .us-strength-role {
      font-size: 11px;
    }

    #market-unavailable-card .us-strength-track {
      height: 9px;
    }

    #market-unavailable-card .us-strength-stats {
      display: grid;
      grid-template-columns:
        repeat(3, minmax(0, 1fr));
      gap: 7px;
      width: 100%;
      margin-top: 10px;
    }

    #market-unavailable-card .us-strength-stats span {
      min-width: 0;
      padding: 8px 7px;
      border-radius: 9px;
      text-align: center;
      white-space: normal;
      line-height: 1.35;
      background:
        rgba(120,145,175,.06);
      box-sizing: border-box;
    }

    #market-unavailable-card .us-strength-stats b {
      display: block;
      margin-top: 2px;
    }

    #market-unavailable-card .us-strength-row-score strong {
      font-size: 25px;
    }

    #market-unavailable-card .us-strength-row-score small {
      font-size: 9px;
    }

    #market-unavailable-card .us-strength-note {
      margin-top: 16px;
      padding: 12px;
      font-size: 9px;
      line-height: 1.65;
    }
  }

  /*
   * 414 / 430 phones
   */
  @media (max-width: 430px) {
    #market-unavailable-card {
      padding:
        20px 15px 22px !important;
    }

    #market-unavailable-card .us-strength-score-card {
      width: 84px;
      min-width: 84px;
    }

    #market-unavailable-card .us-strength-name {
      max-width: 125px;
    }
  }

  /*
   * 375 / 390 phones
   */
  @media (max-width: 390px) {
    #market-unavailable-card {
      padding:
        18px 13px 21px !important;
    }

    #market-unavailable-card .us-strength-head {
      gap: 8px;
    }

    #market-unavailable-card .us-strength-score-card {
      width: 78px;
      min-width: 78px;
      padding:
        12px 7px;
    }

    #market-unavailable-card .us-strength-total {
      font-size: 28px;
    }

    #market-unavailable-card .us-strength-name {
      max-width: 105px;
    }

    #market-unavailable-card .us-strength-stats {
      gap: 5px;
    }

    #market-unavailable-card .us-strength-stats span {
      padding:
        7px 4px;
      font-size: 9px;
    }
  }

  @media (max-width: 375px) {
    #market-unavailable-card .us-strength-head p {
      font-size: 9px !important;
    }

    #market-unavailable-card .us-strength-symbol {
      font-size: 21px;
    }

    #market-unavailable-card .us-strength-name {
      max-width: 95px;
      font-size: 9px;
    }
  }
</style>
`;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clamp(
  value,
  min = 0,
  max = 100
) {
  return Math.min(
    max,
    Math.max(
      min,
      Number(value) || 0
    )
  );
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

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

function formatRatio(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return `${number.toFixed(2)}x`;
}

function getRoot() {
  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }

  return document.getElementById(
    ROOT_ID
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
/* Strength model                                                             */
/* -------------------------------------------------------------------------- */

function intradayChangePct(
  benchmark
) {
  const price =
    finiteNumber(
      benchmark?.price
    );

  const open =
    finiteNumber(
      benchmark?.open
    );

  if (
    price === null ||
    open === null ||
    open === 0
  ) {
    return null;
  }

  return (
    (price - open) /
    open
  ) * 100;
}

function volumeRatio(
  benchmark
) {
  const volume =
    finiteNumber(
      benchmark?.volume
    );

  const average =
    finiteNumber(
      benchmark?.averageVolume
    );

  if (
    volume === null ||
    average === null ||
    average <= 0
  ) {
    return null;
  }

  return volume / average;
}

function strengthLabel(score) {
  const value =
    finiteNumber(score);

  if (value === null) {
    return "無資料";
  }

  if (value >= 80) {
    return "強勢";
  }

  if (value >= 65) {
    return "偏強";
  }

  if (value >= 45) {
    return "中性";
  }

  if (value >= 30) {
    return "偏弱";
  }

  return "弱勢";
}

function calculateBenchmarkStrength(
  benchmark
) {
  if (
    !benchmark ||
    !benchmark.available
  ) {
    return Object.freeze({
      available: false,

      score: null,

      dayChange: null,

      intradayChange: null,

      volumeRatio: null,

      label: "無資料"
    });
  }

  const dayChange =
    finiteNumber(
      benchmark.changePct
    ) ?? 0;

  const intraday =
    intradayChangePct(
      benchmark
    ) ?? 0;

  const volRatio =
    volumeRatio(
      benchmark
    );

  /*
   * Same OX strength model as before.
   *
   * We are NOT changing the calculation
   * in this responsive update.
   */

  const dayComponent =
    clamp(
      dayChange * 12,
      -24,
      24
    );

  const intradayComponent =
    clamp(
      intraday * 8,
      -16,
      16
    );

  let volumeComponent = 0;

  if (volRatio !== null) {
    const volumeIntensity =
      clamp(
        (volRatio - 1) * 8,
        -4,
        8
      );

    const direction =
      dayChange > 0
        ? 1
        : dayChange < 0
          ? -1
          : 0;

    volumeComponent =
      volumeIntensity *
      direction;
  }

  const score =
    clamp(
      50 +
      dayComponent +
      intradayComponent +
      volumeComponent
    );

  return Object.freeze({
    available: true,

    score,

    dayChange,

    intradayChange:
      intraday,

    volumeRatio:
      volRatio,

    label:
      strengthLabel(
        score
      )
  });
}

function calculateMarketStrength(
  benchmarks
) {
  let weightedTotal = 0;
  let usedWeight = 0;

  const detail = {};

  Object.entries(
    BENCHMARK_CONFIG
  ).forEach(
    ([symbol, config]) => {
      const result =
        calculateBenchmarkStrength(
          benchmarks?.[symbol]
        );

      detail[symbol] =
        result;

      if (
        result.available &&
        result.score !== null
      ) {
        weightedTotal +=
          result.score *
          config.weight;

        usedWeight +=
          config.weight;
      }
    }
  );

  const score =
    usedWeight > 0
      ? weightedTotal /
        usedWeight
      : null;

  return Object.freeze({
    score,

    label:
      strengthLabel(
        score
      ),

    detail:
      Object.freeze(
        detail
      )
  });
}

/* -------------------------------------------------------------------------- */
/* Visual helpers                                                             */
/* -------------------------------------------------------------------------- */

function scoreColor(score) {
  const value =
    finiteNumber(score);

  if (value === null) {
    return "#8290a3";
  }

  if (value >= 65) {
    return "#32c79a";
  }

  if (value <= 35) {
    return "#ef647d";
  }

  return "#d7a83e";
}

function scoreBackground(score) {
  const value =
    finiteNumber(score);

  if (value === null) {
    return "rgba(130,144,163,.10)";
  }

  if (value >= 65) {
    return "rgba(50,199,154,.12)";
  }

  if (value <= 35) {
    return "rgba(239,100,125,.12)";
  }

  return "rgba(215,168,62,.10)";
}

/* -------------------------------------------------------------------------- */
/* Benchmark row                                                              */
/* -------------------------------------------------------------------------- */

function renderBenchmarkRow(
  symbol,
  benchmark,
  result
) {
  const config =
    BENCHMARK_CONFIG[
      symbol
    ];

  if (
    !benchmark ||
    !result?.available
  ) {
    return `
      <div
        class="us-strength-row"
        data-us-strength-symbol="${escapeHTML(
          symbol
        )}"
      >
        <div
          class="us-strength-identity"
        >
          <div
            class="us-strength-symbol-line"
          >
            <b
              class="us-strength-symbol"
            >
              ${escapeHTML(
                symbol
              )}
            </b>

            <small
              class="us-strength-name"
            >
              ${escapeHTML(
                config.label
              )}
            </small>
          </div>

          <div
            class="us-strength-role"
          >
            ${escapeHTML(
              config.role
            )}
          </div>
        </div>

        <div
          class="us-strength-main"
        >
          <div
            style="
              font-size:11px;
              opacity:.55;
            "
          >
            DATA UNAVAILABLE
          </div>
        </div>

        <div
          class="us-strength-row-score"
        >
          <strong
            style="
              color:#8290a3;
            "
          >
            —
          </strong>

          <small
            style="
              color:#8290a3;
            "
          >
            無資料
          </small>
        </div>
      </div>
    `;
  }

  const color =
    scoreColor(
      result.score
    );

  return `
    <div
      class="us-strength-row"
      data-us-strength-symbol="${escapeHTML(
        symbol
      )}"
    >
      <div
        class="us-strength-identity"
      >
        <div
          class="us-strength-symbol-line"
        >
          <b
            class="us-strength-symbol"
          >
            ${escapeHTML(
              symbol
            )}
          </b>

          <small
            class="us-strength-name"
          >
            ${escapeHTML(
              config.label
            )}
          </small>
        </div>

        <div
          class="us-strength-role"
        >
          ${escapeHTML(
            config.role
          )}
        </div>
      </div>

      <div
        class="us-strength-main"
      >
        <div
          class="us-strength-track"
        >
          <i
            style="
              width:${clamp(
                result.score
              )}%;
              background:${color};
            "
          ></i>
        </div>

        <div
          class="us-strength-stats"
        >
          <span>
            日漲跌
            <b>
              ${formatPercent(
                result.dayChange
              )}
            </b>
          </span>

          <span>
            開盤後
            <b>
              ${formatPercent(
                result.intradayChange
              )}
            </b>
          </span>

          <span>
            量比
            <b>
              ${formatRatio(
                result.volumeRatio
              )}
            </b>
          </span>
        </div>
      </div>

      <div
        class="us-strength-row-score"
      >
        <strong
          style="
            color:${color};
          "
        >
          ${Math.round(
            result.score
          )}
        </strong>

        <small
          style="
            color:${color};
          "
        >
          ${escapeHTML(
            result.label
          )}
        </small>
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

function renderLoading(
  root
) {
  root.hidden = false;

  root.innerHTML = `
    ${STRENGTH_STYLE}

    <div
      class="market-unavailable-icon"
    >
      US
    </div>

    <div
      class="us-strength-shell"
    >
      <div class="page-kicker">
        US BENCHMARK STRENGTH
      </div>

      <h2>
        美股強弱
      </h2>

      <p>
        正在整理
        SPY / QQQ / IWM
        真實行情…
      </p>
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
    ${STRENGTH_STYLE}

    <div
      class="market-unavailable-icon"
    >
      US
    </div>

    <div
      class="us-strength-shell"
    >
      <div class="page-kicker">
        US STRENGTH · DATA ERROR
      </div>

      <h2>
        美股強弱暫時無法取得
      </h2>

      <p>
        ${escapeHTML(
          state?.error?.message ||
          "目前無法讀取 US Market State。"
        )}
      </p>
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
  const benchmarks =
    state?.data
      ?.benchmarks || {};

  const market =
    calculateMarketStrength(
      benchmarks
    );

  if (
    market.score === null
  ) {
    renderError(
      root,
      {
        error: {
          message:
            "目前沒有足夠的美股基準資料可以計算強弱。"
        }
      }
    );

    return;
  }

  const marketColor =
    scoreColor(
      market.score
    );

  const marketBg =
    scoreBackground(
      market.score
    );

  root.hidden = false;

  root.innerHTML = `
    ${STRENGTH_STYLE}

    <div
      class="market-unavailable-icon"
    >
      US
    </div>

    <div
      class="us-strength-shell"
    >
      <div class="page-kicker">
        US BENCHMARK STRENGTH · REAL DATA
      </div>

      <div
        class="us-strength-head"
      >
        <div
          class="us-strength-head-copy"
        >
          <h2
            style="
              margin:0;
            "
          >
            美股強弱
          </h2>

          <p
            style="
              margin:8px 0 0;
              opacity:.66;
            "
          >
            SPY 45%
            ·
            QQQ 35%
            ·
            IWM 20%
          </p>
        </div>

        <div
          class="us-strength-score-card"
          style="
            background:${marketBg};
            border:
              1px solid ${marketColor}55;
          "
        >
          <strong
            class="us-strength-total"
            style="
              color:${marketColor};
            "
          >
            ${Math.round(
              market.score
            )}
          </strong>

          <small
            class="us-strength-total-label"
            style="
              color:${marketColor};
            "
          >
            ${escapeHTML(
              market.label
            )}
          </small>
        </div>
      </div>

      <div
        class="us-strength-list"
      >
        ${renderBenchmarkRow(
          "SPY",
          benchmarks.SPY,
          market.detail.SPY
        )}

        ${renderBenchmarkRow(
          "QQQ",
          benchmarks.QQQ,
          market.detail.QQQ
        )}

        ${renderBenchmarkRow(
          "IWM",
          benchmarks.IWM,
          market.detail.IWM
        )}
      </div>

      <div
        class="us-strength-note"
      >
        <b>
          OX 說明：
        </b>

        目前強度衡量的是
        SPY / QQQ / IWM
        三個美股基準的方向、
        開盤後表現與成交量確認。

        這不是全市場
        Advance / Decline
        廣度，也不會使用不存在的資料補值。
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Public renderer                                                            */
/* -------------------------------------------------------------------------- */

export function renderUSStrength(
  state
) {
  /*
   * Never modify another market.
   */
  if (!isUSMarket()) {
    return {
      view: "strength",

      status:
        state?.status ||
        "inactive"
    };
  }

  const root =
    getRoot();

  if (!root) {
    return {
      view: "strength",

      status:
        "missing-root"
    };
  }

  if (
    !state ||
    state.status === "idle" ||
    state.status === "loading"
  ) {
    renderLoading(
      root
    );
  } else if (
    state.status === "error"
  ) {
    renderError(
      root,
      state
    );
  } else if (
    state.status === "ready"
  ) {
    renderReady(
      root,
      state
    );
  } else {
    renderLoading(
      root
    );
  }

  return {
    view: "strength",

    status:
      state?.status ||
      "unknown",

    data:
      state?.data ||
      null
  };
}
