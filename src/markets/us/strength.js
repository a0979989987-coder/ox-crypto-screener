/*
 * OX v4.0 Modular
 * US Market Strength Renderer
 *
 * Responsibility:
 * - Calculate benchmark strength from real US market data.
 * - Use the existing US Market State only.
 * - Render SPY / QQQ / IWM strength.
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
   * OX benchmark strength model:
   *
   * 50 = neutral
   *
   * Daily change:
   * biggest weight because it represents
   * the benchmark's session direction.
   *
   * Intraday open -> last:
   * confirms whether strength continued
   * during the session.
   *
   * Volume:
   * small confirmation adjustment only.
   *
   * This is deliberately simple and
   * explainable. It is not an investment
   * recommendation.
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
    /*
     * High volume strengthens the current
     * direction slightly.
     *
     * It does NOT decide direction itself.
     */
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
        style="
          display:grid;
          grid-template-columns:
            minmax(110px,1fr)
            minmax(90px,.8fr)
            72px;
          gap:14px;
          align-items:center;
          padding:16px 0;
          border-bottom:
            1px solid rgba(130,150,175,.15);
        "
      >
        <div>
          <b
            style="
              font-size:18px;
              letter-spacing:.03em;
            "
          >
            ${escapeHTML(symbol)}
          </b>

          <div
            style="
              margin-top:3px;
              font-size:11px;
              opacity:.62;
            "
          >
            ${escapeHTML(
              config.role
            )}
          </div>
        </div>

        <div
          style="
            font-size:12px;
            opacity:.55;
          "
        >
          DATA UNAVAILABLE
        </div>

        <strong
          style="
            text-align:right;
            color:#8290a3;
          "
        >
          —
        </strong>
      </div>
    `;
  }

  const color =
    scoreColor(
      result.score
    );

  return `
    <div
      style="
        display:grid;
        grid-template-columns:
          minmax(110px,1fr)
          minmax(160px,1.6fr)
          74px;
        gap:14px;
        align-items:center;
        padding:16px 0;
        border-bottom:
          1px solid rgba(130,150,175,.15);
      "
    >
      <div>
        <div
          style="
            display:flex;
            align-items:baseline;
            gap:8px;
          "
        >
          <b
            style="
              font-size:19px;
              letter-spacing:.03em;
            "
          >
            ${escapeHTML(symbol)}
          </b>

          <small
            style="
              opacity:.55;
              font-size:10px;
            "
          >
            ${escapeHTML(
              config.label
            )}
          </small>
        </div>

        <div
          style="
            margin-top:4px;
            font-size:11px;
            opacity:.62;
          "
        >
          ${escapeHTML(
            config.role
          )}
        </div>
      </div>

      <div>
        <div
          style="
            height:8px;
            border-radius:999px;
            background:
              rgba(130,150,175,.16);
            overflow:hidden;
          "
        >
          <i
            style="
              display:block;
              width:${clamp(
                result.score
              )}%;
              height:100%;
              border-radius:999px;
              background:${color};
            "
          ></i>
        </div>

        <div
          style="
            display:flex;
            flex-wrap:wrap;
            gap:8px 14px;
            margin-top:8px;
            font-size:10px;
            opacity:.68;
          "
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
        style="
          text-align:right;
        "
      >
        <strong
          style="
            display:block;
            color:${color};
            font-size:24px;
            line-height:1;
          "
        >
          ${Math.round(
            result.score
          )}
        </strong>

        <small
          style="
            display:block;
            margin-top:5px;
            color:${color};
            font-size:10px;
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
    <div
      class="market-unavailable-icon"
    >
      US
    </div>

    <div>
      <div class="page-kicker">
        US BENCHMARK STRENGTH
      </div>

      <h2>
        美股強弱
      </h2>

      <p>
        正在整理 SPY / QQQ /
        IWM 真實行情…
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
    <div
      class="market-unavailable-icon"
    >
      US
    </div>

    <div>
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
    <div
      class="market-unavailable-icon"
    >
      US
    </div>

    <div
      style="
        width:min(760px,100%);
        min-width:0;
      "
    >
      <div class="page-kicker">
        US BENCHMARK STRENGTH · REAL DATA
      </div>

      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
          margin-top:4px;
        "
      >
        <div>
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
            SPY 45% · QQQ 35% ·
            IWM 20%
          </p>
        </div>

        <div
          style="
            flex:0 0 auto;
            min-width:92px;
            padding:12px 14px;
            border-radius:16px;
            text-align:center;
            background:${marketBg};
            border:
              1px solid ${marketColor}55;
          "
        >
          <strong
            style="
              display:block;
              font-size:30px;
              line-height:1;
              color:${marketColor};
            "
          >
            ${Math.round(
              market.score
            )}
          </strong>

          <small
            style="
              display:block;
              margin-top:6px;
              color:${marketColor};
              font-weight:700;
            "
          >
            ${escapeHTML(
              market.label
            )}
          </small>
        </div>
      </div>

      <div
        style="
          margin-top:18px;
        "
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
        style="
          margin-top:16px;
          padding:12px 14px;
          border-radius:13px;
          background:
            rgba(120,145,175,.07);
          border:
            1px solid
            rgba(120,145,175,.12);
          font-size:10px;
          line-height:1.65;
          opacity:.68;
        "
      >
        <b>
          OX 說明：
        </b>

        目前強度衡量的是
        SPY / QQQ / IWM
        三個美股基準的方向、開盤後表現與成交量確認。

        這不是全市場
        Advance / Decline
        廣度，也不會用不存在的資料補值。
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
