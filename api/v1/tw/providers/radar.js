/*
 * OX v4.0 Modular
 * Taiwan Stock Radar Provider
 *
 * Official sources:
 *
 * TWSE
 * - STOCK_DAY_ALL
 * - t187ap05_L
 *
 * TPEx
 * - tpex_mainboard_daily_close_quotes
 * - mopsfin_t187ap05_O
 *
 *
 * Current Radar v1:
 *
 * - Real stock universe
 * - Real close price
 * - Real daily change %
 * - Real volume
 * - Real turnover
 * - Official industry classification
 * - OX daily relative score
 * - T1 / T2 / T3 classification
 *
 *
 * NOT connected yet:
 *
 * - Historical volume ratio
 * - 20D breakout
 * - Relative strength history
 * - Per-stock institutional flow
 * - Big-order flow
 *
 *
 * IMPORTANT:
 *
 * Missing fields stay null / false.
 * Never manufacture market data.
 */


/* ========================================================================== */
/* Configuration                                                              */
/* ========================================================================== */

const TWSE_QUOTES_URL =
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";


const TPEX_QUOTES_URL =
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes";


const TWSE_INDUSTRY_URL =
  "https://openapi.twse.com.tw/v1/opendata/t187ap05_L";


const TPEX_INDUSTRY_URL =
  "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O";


const DEFAULT_TIMEOUT_MS =
  10000;


const CACHE_TTL_MS =
  60000;


/* ========================================================================== */
/* Cache                                                                      */
/* ========================================================================== */

let universeCache = {

  expiresAt:
    0,

  value:
    null

};


/* ========================================================================== */
/* Error                                                                      */
/* ========================================================================== */

export class TWRadarProviderError
  extends Error {

  constructor(
    message,
    {
      code =
        "TW_RADAR_ERROR",

      source =
        "",

      status =
        0,

      details =
        null,

      cause =
        null
    } = {}
  ) {

    super(
      message
    );


    this.name =
      "TWRadarProviderError";


    this.code =
      code;


    this.source =
      source;


    this.status =
      status;


    this.details =
      details;


    if (
      cause
    ) {

      this.cause =
        cause;
    }
  }
}


/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function textValue(
  value
) {

  if (
    value ===
      null ||
    value ===
      undefined
  ) {

    return "";
  }


  return String(
    value
  ).trim();
}


function numberValue(
  value
) {

  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {

    return null;
  }


  if (
    typeof value ===
      "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }


  const cleaned =
    String(
      value
    )
      .trim()
      .replace(
        /,/g,
        ""
      )
      .replace(
        /%/g,
        ""
      )
      .replace(
        /\+/g,
        ""
      );


  if (
    !cleaned ||
    cleaned ===
      "-" ||
    cleaned ===
      "--" ||
    cleaned ===
      "---" ||
    cleaned ===
      "N/A"
  ) {

    return null;
  }


  const parsed =
    Number(
      cleaned
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}


function pick(
  object,
  keys
) {

  if (
    !object ||
    typeof object !==
      "object"
  ) {

    return undefined;
  }


  for (
    const key
    of keys
  ) {

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          object,
          key
        )
    ) {

      const value =
        object[key];


      if (
        value !==
          undefined &&
        value !==
          null &&
        value !==
          ""
      ) {

        return value;
      }
    }
  }


  return undefined;
}


function clamp(
  value,
  min,
  max
) {

  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


function normalizeLimit(
  value,
  fallback =
    500
) {

  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return fallback;
  }


  return clamp(
    Math.floor(
      number
    ),
    1,
    2000
  );
}


function normalizeMarket(
  value
) {

  const market =
    textValue(
      value
    )
      .toUpperCase();


  if (
    [
      "TWSE",
      "TSE",
      "上市"
    ].includes(
      market
    )
  ) {

    return "TWSE";
  }


  if (
    [
      "TPEX",
      "OTC",
      "上櫃"
    ].includes(
      market
    )
  ) {

    return "TPEX";
  }


  return "ALL";
}


function normalizeTier(
  value
) {

  const tier =
    textValue(
      value
    )
      .toUpperCase();


  if (
    [
      "T1",
      "T2",
      "T3"
    ].includes(
      tier
    )
  ) {

    return tier;
  }


  return "ALL";
}


/* ========================================================================== */
/* Date                                                                       */
/* ========================================================================== */

function normalizeDate(
  value
) {

  const raw =
    textValue(
      value
    );


  if (
    !raw
  ) {

    return null;
  }


  const digits =
    raw.replace(
      /\D/g,
      ""
    );


  /*
   * Gregorian YYYYMMDD
   */
  if (
    digits.length ===
      8
  ) {

    return `${
      digits.slice(
        0,
        4
      )
    }-${
      digits.slice(
        4,
        6
      )
    }-${
      digits.slice(
        6,
        8
      )
    }`;
  }


  /*
   * ROC YYYMMDD
   */
  if (
    digits.length ===
      7
  ) {

    const year =
      Number(
        digits.slice(
          0,
          3
        )
      ) +
      1911;


    return `${
      year
    }-${
      digits.slice(
        3,
        5
      )
    }-${
      digits.slice(
        5,
        7
      )
    }`;
  }


  return null;
}


/* ========================================================================== */
/* HTTP                                                                       */
/* ========================================================================== */

async function requestJSON(
  url,
  {
    source =
      "official",

    timeoutMs =
      DEFAULT_TIMEOUT_MS
  } = {}
) {

  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () => {

        controller.abort();

      },
      Math.max(
        1000,
        timeoutMs
      )
    );


  try {

    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {

            Accept:
              "application/json",

            "User-Agent":
              "Mozilla/5.0 OX-Market-Command-Center"

          },

          cache:
            "no-store",

          signal:
            controller.signal
        }
      );


    const text =
      await response.text();


    if (
      !response.ok
    ) {

      throw new TWRadarProviderError(
        `${source} returned HTTP ${response.status}.`,
        {
          code:
            "TW_RADAR_HTTP_ERROR",

          source,

          status:
            response.status
        }
      );
    }


    if (
      !text
    ) {

      throw new TWRadarProviderError(
        `${source} returned an empty response.`,
        {
          code:
            "TW_RADAR_EMPTY_RESPONSE",

          source
        }
      );
    }


    try {

      return JSON.parse(
        text
      );

    } catch (
      error
    ) {

      throw new TWRadarProviderError(
        `${source} returned invalid JSON.`,
        {
          code:
            "TW_RADAR_INVALID_JSON",

          source,

          cause:
            error
        }
      );
    }

  } catch (
    error
  ) {

    if (
      error instanceof
      TWRadarProviderError
    ) {

      throw error;
    }


    if (
      error?.name ===
      "AbortError"
    ) {

      throw new TWRadarProviderError(
        `${source} request timed out.`,
        {
          code:
            "TW_RADAR_TIMEOUT",

          source,

          cause:
            error
        }
      );
    }


    throw new TWRadarProviderError(
      `Unable to reach ${source}.`,
      {
        code:
          "TW_RADAR_NETWORK_ERROR",

        source,

        cause:
          error
      }
    );

  } finally {

    clearTimeout(
      timer
    );
  }
}


/* ========================================================================== */
/* Industry map                                                               */
/* ========================================================================== */

function normalizeIndustry(
  value
) {

  const industry =
    textValue(
      value
    );


  if (
    !industry
  ) {

    return "";
  }


  /*
   * Do not expose raw numeric
   * industry codes to the UI.
   */
  if (
    /^\d+$/
      .test(
        industry
      )
  ) {

    return "";
  }


  return industry;
}


function buildIndustryMap(
  payload
) {

  const map =
    new Map();


  if (
    !Array.isArray(
      payload
    )
  ) {

    return map;
  }


  for (
    const row
    of payload
  ) {

    if (
      !row ||
      typeof row !==
        "object"
    ) {

      continue;
    }


    const symbol =
      textValue(
        pick(
          row,
          [
            "公司代號",
            "SecuritiesCompanyCode",
            "CompanyCode",
            "Code"
          ]
        )
      );


    const industry =
      normalizeIndustry(
        pick(
          row,
          [
            "產業別",
            "Industry",
            "IndustryCategory",
            "產業類別"
          ]
        )
      );


    const name =
      textValue(
        pick(
          row,
          [
            "公司名稱",
            "CompanyName",
            "公司簡稱",
            "CompanyAbbreviation"
          ]
        )
      );


    if (
      !symbol ||
      !industry
    ) {

      continue;
    }


    map.set(
      symbol,
      Object.freeze({

        symbol,

        name,

        industry

      })
    );
  }


  return map;
}


/* ========================================================================== */
/* Change %                                                                   */
/* ========================================================================== */

function calculateChangePct(
  close,
  change
) {

  if (
    close ===
      null ||
    change ===
      null
  ) {

    return null;
  }


  const previous =
    close -
    change;


  if (
    !Number.isFinite(
      previous
    ) ||
    previous <=
      0
  ) {

    return null;
  }


  return (
    change /
    previous
  ) *
    100;
}


/* ========================================================================== */
/* TWSE                                                                       */
/* ========================================================================== */

function normalizeTwseStock(
  row,
  industryMap
) {

  const symbol =
    textValue(
      pick(
        row,
        [
          "Code",
          "證券代號"
        ]
      )
    );


  const company =
    industryMap.get(
      symbol
    );


  /*
   * Joining against company industry
   * data naturally removes most ETFs,
   * warrants and non-company products.
   */
  if (
    !company
  ) {

    return null;
  }


  const price =
    numberValue(
      pick(
        row,
        [
          "ClosingPrice",
          "收盤價"
        ]
      )
    );


  const change =
    numberValue(
      pick(
        row,
        [
          "Change",
          "漲跌價差"
        ]
      )
    );


  if (
    price ===
      null ||
    price <=
      0
  ) {

    return null;
  }


  return {

    symbol,

    name:
      textValue(
        pick(
          row,
          [
            "Name",
            "證券名稱"
          ]
        )
      ) ||
      company.name,

    market:
      "TWSE",

    industry:
      company.industry,

    theme:
      company.industry,

    price,

    change,

    changePct:
      calculateChangePct(
        price,
        change
      ),

    volume:
      numberValue(
        pick(
          row,
          [
            "TradeVolume",
            "成交股數"
          ]
        )
      ),

    turnoverTwd:
      numberValue(
        pick(
          row,
          [
            "TradeValue",
            "成交金額"
          ]
        )
      ),

    dataDate:
      normalizeDate(
        pick(
          row,
          [
            "Date",
            "日期"
          ]
        )
      )

  };
}


/* ========================================================================== */
/* TPEx                                                                       */
/* ========================================================================== */

function normalizeTpexStock(
  row,
  industryMap
) {

  const symbol =
    textValue(
      pick(
        row,
        [
          "SecuritiesCompanyCode",
          "Code",
          "證券代號"
        ]
      )
    );


  const company =
    industryMap.get(
      symbol
    );


  if (
    !company
  ) {

    return null;
  }


  const price =
    numberValue(
      pick(
        row,
        [
          "Close",
          "收盤價"
        ]
      )
    );


  const change =
    numberValue(
      pick(
        row,
        [
          "Change",
          "漲跌"
        ]
      )
    );


  if (
    price ===
      null ||
    price <=
      0
  ) {

    return null;
  }


  return {

    symbol,

    name:
      textValue(
        pick(
          row,
          [
            "CompanyName",
            "Name",
            "公司名稱"
          ]
        )
      ) ||
      company.name,

    market:
      "TPEX",

    industry:
      company.industry,

    theme:
      company.industry,

    price,

    change,

    changePct:
      calculateChangePct(
        price,
        change
      ),

    volume:
      numberValue(
        pick(
          row,
          [
            "TradingShares",
            "TradingVolume",
            "成交股數",
            "成交量"
          ]
        )
      ),

    turnoverTwd:
      numberValue(
        pick(
          row,
          [
            "TransactionAmount",
            "TradingValue",
            "TradeValue",
            "成交金額",
            "成交值"
          ]
        )
      ),

    dataDate:
      normalizeDate(
        pick(
          row,
          [
            "Date",
            "資料日期",
            "日期"
          ]
        )
      )

  };
}


/* ========================================================================== */
/* Latest date                                                                */
/* ========================================================================== */

function latestDate(
  rows
) {

  const dates =
    rows
      .map(
        item =>
          item.dataDate
      )
      .filter(
        Boolean
      )
      .sort();


  if (
    !dates.length
  ) {

    return null;
  }


  return dates[
    dates.length -
    1
  ];
}


function keepLatestDate(
  rows
) {

  const date =
    latestDate(
      rows
    );


  if (
    !date
  ) {

    return {

      date:
        null,

      rows

    };
  }


  return {

    date,

    rows:
      rows.filter(
        item =>
          item.dataDate ===
          date
      )

  };
}


/* ========================================================================== */
/* Load TWSE                                                                  */
/* ========================================================================== */

async function loadTwseStocks() {

  const [
    quotePayload,
    industryPayload
  ] =
    await Promise.all([

      requestJSON(
        TWSE_QUOTES_URL,
        {
          source:
            "TWSE-STOCK-DAY-ALL"
        }
      ),

      requestJSON(
        TWSE_INDUSTRY_URL,
        {
          source:
            "TWSE-INDUSTRY"
        }
      )

    ]);


  if (
    !Array.isArray(
      quotePayload
    )
  ) {

    throw new TWRadarProviderError(
      "TWSE quote payload is invalid.",
      {
        code:
          "TWSE_RADAR_INVALID",

        source:
          "TWSE"
      }
    );
  }


  const industryMap =
    buildIndustryMap(
      industryPayload
    );


  const normalized =
    quotePayload
      .map(
        row =>
          normalizeTwseStock(
            row,
            industryMap
          )
      )
      .filter(
        Boolean
      );


  const latest =
    keepLatestDate(
      normalized
    );


  if (
    !latest.rows.length
  ) {

    throw new TWRadarProviderError(
      "TWSE returned no usable Radar stocks.",
      {
        code:
          "TWSE_RADAR_EMPTY",

        source:
          "TWSE"
      }
    );
  }


  return {

    market:
      "TWSE",

    dataDate:
      latest.date,

    rows:
      latest.rows

  };
}


/* ========================================================================== */
/* Load TPEx                                                                  */
/* ========================================================================== */

async function loadTpexStocks() {

  const [
    quotePayload,
    industryPayload
  ] =
    await Promise.all([

      requestJSON(
        TPEX_QUOTES_URL,
        {
          source:
            "TPEX-DAILY-QUOTES"
        }
      ),

      requestJSON(
        TPEX_INDUSTRY_URL,
        {
          source:
            "TPEX-INDUSTRY"
        }
      )

    ]);


  if (
    !Array.isArray(
      quotePayload
    )
  ) {

    throw new TWRadarProviderError(
      "TPEx quote payload is invalid.",
      {
        code:
          "TPEX_RADAR_INVALID",

        source:
          "TPEX"
      }
    );
  }


  const industryMap =
    buildIndustryMap(
      industryPayload
    );


  const normalized =
    quotePayload
      .map(
        row =>
          normalizeTpexStock(
            row,
            industryMap
          )
      )
      .filter(
        Boolean
      );


  const latest =
    keepLatestDate(
      normalized
    );


  if (
    !latest.rows.length
  ) {

    throw new TWRadarProviderError(
      "TPEx returned no usable Radar stocks.",
      {
        code:
          "TPEX_RADAR_EMPTY",

        source:
          "TPEX"
      }
    );
  }


  return {

    market:
      "TPEX",

    dataDate:
      latest.date,

    rows:
      latest.rows

  };
}


/* ========================================================================== */
/* Percentile                                                                 */
/* ========================================================================== */

function numericSorted(
  rows,
  key
) {

  return rows
    .map(
      row =>
        row[key]
    )
    .filter(
      value =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value
        )
    )
    .sort(
      (
        a,
        b
      ) =>
        a -
        b
    );
}


function upperBound(
  values,
  target
) {

  let left =
    0;


  let right =
    values.length;


  while (
    left <
    right
  ) {

    const middle =
      Math.floor(
        (
          left +
          right
        ) /
        2
      );


    if (
      values[middle] <=
      target
    ) {

      left =
        middle +
        1;

    } else {

      right =
        middle;
    }
  }


  return left;
}


function percentileRank(
  value,
  sorted
) {

  if (
    value ===
      null ||
    !sorted.length
  ) {

    return null;
  }


  if (
    sorted.length ===
      1
  ) {

    return 100;
  }


  const count =
    upperBound(
      sorted,
      value
    );


  return clamp(
    (
      count /
      sorted.length
    ) *
    100,
    0,
    100
  );
}


/* ========================================================================== */
/* OX Score v1                                                                */
/* ========================================================================== */

/*
 * Radar v1 score:
 *
 * 70% = same-day price strength percentile
 * 30% = turnover percentile
 *
 * This is NOT a prediction.
 *
 * It is only a cross-sectional
 * ranking of the current trading day.
 */
function applyOXScore(
  rows
) {

  const changeValues =
    numericSorted(
      rows,
      "changePct"
    );


  const turnoverValues =
    numericSorted(
      rows,
      "turnoverTwd"
    );


  return rows.map(
    row => {

      const priceRank =
        percentileRank(
          row.changePct,
          changeValues
        );


      const turnoverRank =
        percentileRank(
          row.turnoverTwd,
          turnoverValues
        );


      let oxScore =
        null;


      if (
        priceRank !==
          null
      ) {

        oxScore =
          (
            priceRank *
            0.70
          ) +
          (
            (
              turnoverRank ??
              0
            ) *
            0.30
          );


        oxScore =
          Math.round(
            clamp(
              oxScore,
              0,
              100
            ) *
            10
          ) /
          10;
      }


      let tier =
        "";


      if (
        oxScore !==
          null
      ) {

        if (
          oxScore >=
          80
        ) {

          tier =
            "T1";

        } else if (
          oxScore >=
          65
        ) {

          tier =
            "T2";

        } else if (
          oxScore >=
          50
        ) {

          tier =
            "T3";
        }
      }


      let setup =
        "";


      if (
        row.changePct !==
          null &&
        row.changePct >=
          5
      ) {

        setup =
          "當日強勢";

      } else if (
        row.changePct !==
          null &&
        row.changePct >=
          3 &&
        row.turnoverTwd !==
          null &&
        row.turnoverTwd >=
          500000000
      ) {

        setup =
          "強勢高成交";

      } else if (
        row.turnoverTwd !==
          null &&
        row.turnoverTwd >=
          1000000000
      ) {

        setup =
          "高成交關注";

      } else if (
        row.changePct !==
          null &&
        row.changePct <=
          -5
      ) {

        setup =
          "當日弱勢";
      }


      return Object.freeze({

        symbol:
          row.symbol,

        name:
          row.name,

        market:
          row.market,

        industry:
          row.industry,

        theme:
          row.theme,

        price:
          row.price,

        changePct:
          row.changePct,

        volume:
          row.volume,

        turnoverTwd:
          row.turnoverTwd,


        /*
         * Historical data not yet
         * connected.
         */
        volumeRatio:
          null,

        rs:
          null,

        breakout:
          false,

        breakoutState:
          "",


        /*
         * Current-day limit distance
         * source is not yet connected.
         */
        nearLimitUp:
          false,

        distanceToLimitUpPct:
          null,


        /*
         * Per-stock institutional flow
         * will be connected later.
         */
        foreignNet:
          null,

        trustNet:
          null,

        dealerNet:
          null,


        bigOrderBias:
          "",

        setup,

        oxScore,

        tier,

        updatedAt:
          row.dataDate ||
          null

      });

    }
  );
}


/* ========================================================================== */
/* Source errors                                                              */
/* ========================================================================== */

function errorSummary(
  result
) {

  if (
    result.status ===
      "fulfilled"
  ) {

    return null;
  }


  return Object.freeze({

    code:
      result.reason
        ?.code ||
      "UNKNOWN",

    source:
      result.reason
        ?.source ||
      "",

    message:
      result.reason
        ?.message ||
      "Unknown provider error"

  });
}


/* ========================================================================== */
/* Universe                                                                   */
/* ========================================================================== */

async function buildUniverse() {

  const now =
    Date.now();


  if (
    universeCache.value &&
    universeCache.expiresAt >
      now
  ) {

    return universeCache
      .value;
  }


  const [
    twseResult,
    tpexResult
  ] =
    await Promise
      .allSettled([

        loadTwseStocks(),

        loadTpexStocks()

      ]);


  const twse =
    twseResult.status ===
      "fulfilled"
      ? twseResult.value
      : null;


  const tpex =
    tpexResult.status ===
      "fulfilled"
      ? tpexResult.value
      : null;


  if (
    !twse &&
    !tpex
  ) {

    throw new TWRadarProviderError(
      "All Taiwan Radar sources failed.",
      {
        code:
          "TW_RADAR_ALL_FAILED",

        source:
          "official-tw",

        details: {

          TWSE:
            errorSummary(
              twseResult
            ),

          TPEX:
            errorSummary(
              tpexResult
            )

        }
      }
    );
  }


  /*
   * Never mix two exchanges
   * from different trading days.
   */
  if (
    twse &&
    tpex &&
    twse.dataDate &&
    tpex.dataDate &&
    twse.dataDate !==
      tpex.dataDate
  ) {

    throw new TWRadarProviderError(
      "TWSE and TPEx Radar trading dates do not match.",
      {
        code:
          "TW_RADAR_DATE_MISMATCH",

        source:
          "official-tw",

        details: {

          TWSE:
            twse.dataDate,

          TPEX:
            tpex.dataDate

        }
      }
    );
  }


  const baseRows =
    [

      ...(
        twse
          ? twse.rows
          : []
      ),

      ...(
        tpex
          ? tpex.rows
          : []
      )

    ];


  const radar =
    Object.freeze(
      applyOXScore(
        baseRows
      )
    );


  const result =
    Object.freeze({

      radar,

      dataDate:
        twse
          ?.dataDate ||
        tpex
          ?.dataDate ||
        null,

      updatedAt:
        new Date()
          .toISOString(),

      meta:
        Object.freeze({

          provider:
            "official-tw",

          methodology:
            "daily-relative-strength-activity-v1",

          partial:
            !twse ||
            !tpex,

          total:
            radar.length,

          scoreWeights:
            Object.freeze({

              priceStrength:
                0.70,

              turnover:
                0.30

            }),

          tierThresholds:
            Object.freeze({

              T1:
                80,

              T2:
                65,

              T3:
                50

            }),

          historicalIndicatorsConnected:
            false,

          institutionalByStockConnected:
            false,

          sources:
            Object.freeze({

              TWSE:
                twse
                  ? "ready"
                  : "error",

              TPEX:
                tpex
                  ? "ready"
                  : "error"

            }),

          errors:
            Object.freeze({

              TWSE:
                errorSummary(
                  twseResult
                ),

              TPEX:
                errorSummary(
                  tpexResult
                )

            })

        })

    });


  universeCache = {

    expiresAt:
      now +
      CACHE_TTL_MS,

    value:
      result

  };


  return result;
}


/* ========================================================================== */
/* Sorting                                                                    */
/* ========================================================================== */

function numericSort(
  a,
  b,
  key
) {

  const av =
    a[key];


  const bv =
    b[key];


  if (
    av ===
      null &&
    bv ===
      null
  ) {

    return 0;
  }


  if (
    av ===
      null
  ) {

    return 1;
  }


  if (
    bv ===
      null
  ) {

    return -1;
  }


  return bv -
    av;
}


function sortRadar(
  rows,
  sort
) {

  const output =
    [
      ...rows
    ];


  switch (
    textValue(
      sort
    )
  ) {

    case "changePct":

      output.sort(
        (
          a,
          b
        ) =>
          numericSort(
            a,
            b,
            "changePct"
          )
      );

      break;


    case "turnoverTwd":

      output.sort(
        (
          a,
          b
        ) =>
          numericSort(
            a,
            b,
            "turnoverTwd"
          )
      );

      break;


    case "volume":

      output.sort(
        (
          a,
          b
        ) =>
          numericSort(
            a,
            b,
            "volume"
          )
      );

      break;


    case "symbol":

      output.sort(
        (
          a,
          b
        ) =>
          a.symbol.localeCompare(
            b.symbol,
            "zh-TW"
          )
      );

      break;


    case "oxScore":

    default:

      output.sort(
        (
          a,
          b
        ) =>
          numericSort(
            a,
            b,
            "oxScore"
          )
      );

      break;
  }


  return output;
}


/* ========================================================================== */
/* Public                                                                     */
/* ========================================================================== */

export async function getOfficialTWRadar(
  {
    market =
      "ALL",

    tier =
      "ALL",

    sort =
      "oxScore",

    limit =
      500
  } = {}
) {

  const requestedMarket =
    normalizeMarket(
      market
    );


  const requestedTier =
    normalizeTier(
      tier
    );


  const requestedLimit =
    normalizeLimit(
      limit,
      500
    );


  const source =
    await buildUniverse();


  let rows =
    [
      ...source.radar
    ];


  if (
    requestedMarket !==
      "ALL"
  ) {

    rows =
      rows.filter(
        row =>
          row.market ===
          requestedMarket
      );
  }


  if (
    requestedTier !==
      "ALL"
  ) {

    rows =
      rows.filter(
        row =>
          row.tier ===
          requestedTier
      );
  }


  rows =
    sortRadar(
      rows,
      sort
    )
      .slice(
        0,
        requestedLimit
      );


  return Object.freeze({

    radar:
      Object.freeze(
        rows
      ),

    dataDate:
      source.dataDate,

    updatedAt:
      source.updatedAt,

    meta:
      Object.freeze({

        ...source.meta,

        returned:
          rows.length,

        request:
          Object.freeze({

            market:
              requestedMarket,

            tier:
              requestedTier,

            sort:
              textValue(
                sort
              ) ||
              "oxScore",

            limit:
              requestedLimit

          })

      })

  });
}


/* ========================================================================== */
/* Provider descriptor                                                        */
/* ========================================================================== */

export const officialTWRadarProvider =
  Object.freeze({

    id:
      "official-tw-radar",

    market:
      "tw",

    realtime:
      false,

    secretRequired:
      false,

    getRadar:
      getOfficialTWRadar

  });
