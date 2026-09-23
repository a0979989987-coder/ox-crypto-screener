import {
  getOfficialTWMarketPulse
} from "./providers/official.js";


import {
  getOfficialTWBreadth
} from "./providers/breadth.js";


import {
  getOfficialTWMoneyFlow
} from "./providers/money-flow.js";


import {
  getOfficialTWThemes
} from "./providers/themes.js";


import {
  getOfficialTWRadar
} from "./providers/radar.js";


/*
 * OX v4.0 Modular
 * Taiwan Market Backend Gateway
 *
 * Route:
 *
 * /api/v1/tw/:endpoint
 *
 *
 * Current responsibility:
 *
 * - Provide the server-side TW API gateway.
 * - Apply CORS.
 * - Connect official Taiwan market data.
 * - Keep API credentials on the server.
 * - Define the stable OX TW backend contract.
 * - Never return fake Taiwan market data.
 *
 *
 * Current upstream providers:
 *
 * TWSE
 * TPEx
 *
 *
 * Current implemented data:
 *
 * - Market Pulse
 * - Market Breadth
 * - Money Flow
 * - Themes / Industry Rotation
 * - Stock Radar
 *
 *
 * Future upstream providers:
 *
 * TAIFEX
 * FinMind
 * Fugle
 * Broker APIs
 *
 *
 * IMPORTANT:
 *
 * The browser only talks to this backend.
 *
 * Provider API keys must NEVER be
 * returned to GitHub Pages.
 */


/* ========================================================================== */
/* Configuration                                                              */
/* ========================================================================== */

const DEFAULT_ALLOWED_ORIGINS =
  Object.freeze([
    "https://a0979989987-coder.github.io",

    "http://localhost:3000",
    "http://localhost:5173",

    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
  ]);


/* ========================================================================== */
/* Response helpers                                                           */
/* ========================================================================== */

function json(
  res,
  status,
  body
) {

  res.status(
    status
  );


  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );


  return res.end(
    JSON.stringify(
      body
    )
  );
}


function ok(
  res,
  data,
  meta =
    undefined
) {

  return json(
    res,
    200,
    {

      ok:
        true,

      data,

      ...(
        meta
          ? {
              meta
            }
          : {}
      )

    }
  );
}


function fail(
  res,
  status,
  code,
  message,
  details =
    undefined
) {

  return json(
    res,
    status,
    {

      ok:
        false,

      error: {

        code,

        message,

        ...(
          details
            ? {
                details
              }
            : {}
        )

      }

    }
  );
}


/* ========================================================================== */
/* CORS                                                                       */
/* ========================================================================== */

function getAllowedOrigins() {

  const extra =
    String(
      process.env
        .OX_ALLOWED_ORIGINS ||
      ""
    )
      .split(
        ","
      )
      .map(
        value =>
          value.trim()
      )
      .filter(
        Boolean
      );


  return [
    ...new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...extra
    ])
  ];
}


function applyCors(
  req,
  res
) {

  const origin =
    req.headers
      .origin;


  if (
    !origin
  ) {

    return true;
  }


  const allowed =
    getAllowedOrigins();


  if (
    !allowed.includes(
      origin
    )
  ) {

    return false;
  }


  res.setHeader(
    "Access-Control-Allow-Origin",
    origin
  );


  res.setHeader(
    "Vary",
    "Origin"
  );


  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );


  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );


  return true;
}


/* ========================================================================== */
/* Parameters                                                                 */
/* ========================================================================== */

function stringParam(
  value,
  fallback =
    ""
) {

  if (
    Array.isArray(
      value
    )
  ) {

    return String(
      value[0] ||
      fallback
    ).trim();
  }


  return String(
    value ===
      undefined ||
    value ===
      null
      ? fallback
      : value
  ).trim();
}


function numberParam(
  value,
  fallback,
  {
    min =
      1,

    max =
      100
  } = {}
) {

  const raw =
    Array.isArray(
      value
    )
      ? value[0]
      : value;


  const parsed =
    Number(
      raw
    );


  if (
    !Number.isFinite(
      parsed
    )
  ) {

    return fallback;
  }


  return Math.max(
    min,
    Math.min(
      max,
      Math.floor(
        parsed
      )
    )
  );
}


/* ========================================================================== */
/* Cache                                                                      */
/* ========================================================================== */

function setShortCache(
  res,
  seconds =
    10
) {

  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${seconds}, stale-while-revalidate=${Math.max(
      10,
      seconds * 2
    )}`
  );
}


/* ========================================================================== */
/* Health                                                                     */
/* ========================================================================== */

async function handleHealth(
  req,
  res
) {

  return ok(
    res,
    {

      service:
        "ox-tw-market-data",

      status:
        "ready",

      market:
        "tw",

      provider:
        "official-tw",

      upstreamConfigured:
        true,

      sources:
        Object.freeze([
          "TWSE",
          "TPEx"
        ]),

      implementedEndpoints:
        Object.freeze([
          "health",
          "market-pulse",
          "breadth",
          "money-flow",
          "themes",
          "radar"
        ]),

      pendingEndpoints:
        Object.freeze([
          "indicators",
          "quote",
          "quotes",
          "candles",
          "search"
        ]),

      timestamp:
        new Date()
          .toISOString()

    },
    {

      contract:
        "ox-tw-market-data-v1",

      version:
        1

    }
  );
}


/* ========================================================================== */
/* Market Pulse                                                               */
/* ========================================================================== */

async function handleMarketPulse(
  req,
  res
) {

  const data =
    await getOfficialTWMarketPulse();


  setShortCache(
    res,
    60
  );


  return ok(
    res,
    data,
    {

      provider:
        "official-tw",

      realtime:
        false

    }
  );
}


/* ========================================================================== */
/* Market Breadth                                                             */
/* ========================================================================== */

async function handleBreadth(
  req,
  res
) {

  const requestedMarket =
    stringParam(
      req.query
        .market,
      "ALL"
    )
      .toUpperCase();


  const data =
    await getOfficialTWBreadth();


  setShortCache(
    res,
    60
  );


  if (
    requestedMarket ===
      "TWSE" ||
    requestedMarket ===
      "TPEX"
  ) {

    const marketData =
      data
        ?.markets
        ?.[requestedMarket] ||
      null;


    if (
      !marketData
    ) {

      return fail(
        res,
        503,
        "TW_BREADTH_MARKET_UNAVAILABLE",
        `${requestedMarket} breadth data is currently unavailable.`
      );
    }


    return ok(
      res,
      {

        breadth: {

          advancers:
            marketData
              .advancers ??
            null,

          decliners:
            marketData
              .decliners ??
            null,

          unchanged:
            marketData
              .unchanged ??
            null,

          limitUp:
            marketData
              .limitUp ??
            null,

          limitDown:
            marketData
              .limitDown ??
            null,

          newHigh20:
            null,

          newLow20:
            null,

          surgeCount:
            null,

          turnoverTwd:
            null

        },

        market:
          marketData,

        updatedAt:
          data
            .updatedAt,

        meta:
          data
            .meta

      },
      {

        provider:
          "official-tw",

        market:
          requestedMarket,

        realtime:
          false

      }
    );
  }


  return ok(
    res,
    data,
    {

      provider:
        "official-tw",

      market:
        "ALL",

      realtime:
        false

    }
  );
}


/* ========================================================================== */
/* Money Flow                                                                 */
/* ========================================================================== */

async function handleMoneyFlow(
  req,
  res
) {

  const requestedMarket =
    stringParam(
      req.query
        .market,
      "ALL"
    )
      .toUpperCase();


  const data =
    await getOfficialTWMoneyFlow();


  setShortCache(
    res,
    60
  );


  if (
    requestedMarket ===
      "TWSE" ||
    requestedMarket ===
      "TPEX"
  ) {

    const marketData =
      data
        ?.markets
        ?.[requestedMarket] ||
      null;


    if (
      !marketData
    ) {

      return fail(
        res,
        503,
        "TW_MONEY_FLOW_MARKET_UNAVAILABLE",
        `${requestedMarket} money flow data is currently unavailable.`
      );
    }


    return ok(
      res,
      {

        moneyFlow: {

          foreignNetTwd:
            marketData
              .foreignNetTwd ??
            null,

          trustNetTwd:
            marketData
              .trustNetTwd ??
            null,

          dealerNetTwd:
            marketData
              .dealerNetTwd ??
            null,

          marginChangeTwd:
            null,

          bigOrderBias:
            ""

        },

        market:
          marketData,

        dataDate:
          marketData
            .dataDate ??
          null,

        updatedAt:
          data
            .updatedAt,

        meta:
          data
            .meta

      },
      {

        provider:
          "official-tw",

        market:
          requestedMarket,

        realtime:
          false

      }
    );
  }


  return ok(
    res,
    data,
    {

      provider:
        "official-tw",

      market:
        "ALL",

      realtime:
        false

    }
  );
}


/* ========================================================================== */
/* Themes                                                                     */
/* ========================================================================== */

async function handleThemes(
  req,
  res
) {

  const limit =
    numberParam(
      req.query
        .limit,
      30,
      {
        min:
          1,

        max:
          100
      }
    );


  const data =
    await getOfficialTWThemes(
      {
        limit
      }
    );


  setShortCache(
    res,
    120
  );


  return ok(
    res,
    data,
    {

      provider:
        "official-tw",

      methodology:
        "official-industry-constituent-average",

      realtime:
        false,

      limit

    }
  );
}


/* ========================================================================== */
/* Radar                                                                      */
/* ========================================================================== */

async function handleRadar(
  req,
  res
) {

  const market =
    stringParam(
      req.query
        .market,
      "ALL"
    )
      .toUpperCase();


  const tier =
    stringParam(
      req.query
        .tier,
      "ALL"
    )
      .toUpperCase();


  const sort =
    stringParam(
      req.query
        .sort,
      "oxScore"
    );


  const limit =
    numberParam(
      req.query
        .limit,
      500,
      {
        min:
          1,

        max:
          2000
      }
    );


  const data =
    await getOfficialTWRadar(
      {
        market,
        tier,
        sort,
        limit
      }
    );


  setShortCache(
    res,
    60
  );


  return ok(
    res,
    data,
    {

      provider:
        "official-tw",

      methodology:
        "daily-relative-strength-activity-v1",

      realtime:
        false,

      market,

      tier,

      sort,

      limit

    }
  );
}


/* ========================================================================== */
/* Not implemented                                                           */
/* ========================================================================== */

function handleNotImplemented(
  res,
  feature
) {

  return fail(
    res,
    501,
    "TW_DATA_NOT_IMPLEMENTED",
    `${feature} real-data integration has not been connected yet.`
  );
}


/* ========================================================================== */
/* Main handler                                                               */
/* ========================================================================== */

export default async function handler(
  req,
  res
) {

  if (
    !applyCors(
      req,
      res
    )
  ) {

    return fail(
      res,
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed to access the OX TW market API."
    );
  }


  if (
    req.method ===
      "OPTIONS"
  ) {

    res.status(
      204
    );


    return res.end();
  }


  if (
    req.method !==
      "GET"
  ) {

    return fail(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Only GET requests are supported."
    );
  }


  const endpoint =
    stringParam(
      req.query
        .endpoint
    )
      .toLowerCase();


  try {

    switch (
      endpoint
    ) {


      case "health":

        return await handleHealth(
          req,
          res
        );


      case "market-pulse":

        return await handleMarketPulse(
          req,
          res
        );


      case "breadth":

        return await handleBreadth(
          req,
          res
        );


      case "money-flow":

        return await handleMoneyFlow(
          req,
          res
        );


      case "themes":

        return await handleThemes(
          req,
          res
        );


      case "radar":

        return await handleRadar(
          req,
          res
        );


      case "indicators":

        return handleNotImplemented(
          res,
          "TW indicators"
        );


      case "quote":

        return handleNotImplemented(
          res,
          "TW quote"
        );


      case "quotes":

        return handleNotImplemented(
          res,
          "TW quotes"
        );


      case "candles":

        return handleNotImplemented(
          res,
          "TW candles"
        );


      case "search":

        return handleNotImplemented(
          res,
          "TW symbol search"
        );


      default:

        return fail(
          res,
          404,
          "ENDPOINT_NOT_FOUND",
          `Unknown TW market endpoint: ${
            endpoint ||
            "(empty)"
          }`
        );

    }

  } catch (
    error
  ) {

    console.error(
      "[OX TW API]",
      {

        endpoint,

        code:
          error?.code ||
          "UNKNOWN",

        message:
          error?.message ||
          "Unknown error"

      }
    );


    const errorCode =
      String(
        error?.code ||
        ""
      );


    if (
      errorCode.startsWith(
        "TW_"
      ) ||
      errorCode.startsWith(
        "TWSE_"
      ) ||
      errorCode.startsWith(
        "TPEX_"
      )
    ) {

      return fail(
        res,
        502,
        "TW_DATA_UPSTREAM_ERROR",
        "Unable to retrieve Taiwan official market data."
      );
    }


    return fail(
      res,
      500,
      "TW_DATA_SERVER_ERROR",
      "Unable to process the Taiwan market data request."
    );

  }
}
