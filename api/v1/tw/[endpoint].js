import {
  getOfficialTWMarketPulse
} from "./providers/official.js";


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


  /*
   * Direct browser / server requests
   * may not send Origin.
   */
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
          "market-pulse"
        ]),

      pendingEndpoints:
        Object.freeze([
          "breadth",
          "money-flow",
          "themes",
          "radar",
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


  /*
   * Current TWSE / TPEx sources are
   * official latest-available market data.
   *
   * They are NOT treated as licensed
   * streaming real-time quotes.
   */
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
/* Not implemented                                                           */
/* ========================================================================== */

function handleNotImplemented(
  res,
  feature
) {

  /*
   * OX never manufactures
   * fake market data.
   */
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

  /* ------------------------------------------------------------------------ */
  /* CORS                                                                     */
  /* ------------------------------------------------------------------------ */

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


  /* ------------------------------------------------------------------------ */
  /* OPTIONS                                                                  */
  /* ------------------------------------------------------------------------ */

  if (
    req.method ===
    "OPTIONS"
  ) {

    res.status(
      204
    );


    return res.end();
  }


  /* ------------------------------------------------------------------------ */
  /* GET only                                                                 */
  /* ------------------------------------------------------------------------ */

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


      /* ==================================================================== */
      /* System                                                               */
      /* ==================================================================== */

      case "health":

        return await handleHealth(
          req,
          res
        );


      /* ==================================================================== */
      /* Home                                                                 */
      /* ==================================================================== */

      case "market-pulse":

        return await handleMarketPulse(
          req,
          res
        );


      case "breadth":

        return handleNotImplemented(
          res,
          "TW market breadth"
        );


      case "money-flow":

        return handleNotImplemented(
          res,
          "TW money flow"
        );


      case "themes":

        return handleNotImplemented(
          res,
          "TW theme flow"
        );


      /* ==================================================================== */
      /* Radar                                                                */
      /* ==================================================================== */

      case "radar":

        return handleNotImplemented(
          res,
          "TW radar"
        );


      /* ==================================================================== */
      /* Indicators                                                           */
      /* ==================================================================== */

      case "indicators":

        return handleNotImplemented(
          res,
          "TW indicators"
        );


      /* ==================================================================== */
      /* Stock data                                                           */
      /* ==================================================================== */

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


      /* ==================================================================== */
      /* Unknown                                                              */
      /* ==================================================================== */

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

    /*
     * Never leak:
     *
     * API keys
     * stack traces
     * credentials
     * backend internals
     */

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


    /*
     * Official Taiwan upstream failure.
     */
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
