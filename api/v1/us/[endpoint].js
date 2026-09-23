const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";

const DEFAULT_TIMEOUT_MS = 10000;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://a0979989987-coder.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  return res.end(JSON.stringify(body));
}

function ok(res, data, meta = undefined) {
  return json(res, 200, {
    ok: true,
    data,
    ...(meta ? { meta } : {})
  });
}

function fail(
  res,
  status,
  code,
  message,
  details = undefined
) {
  return json(res, status, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

function getAllowedOrigins() {
  const extra = String(
    process.env.OX_ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  return [
    ...new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...extra
    ])
  ];
}

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (!origin) {
    return true;
  }

  const allowed = getAllowedOrigins();

  if (!allowed.includes(origin)) {
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
    "Content-Type"
  );

  return true;
}

function getApiKey() {
  return String(
    process.env.TWELVE_DATA_API_KEY || ""
  ).trim();
}

function stringParam(value, fallback = "") {
  if (Array.isArray(value)) {
    return String(value[0] || fallback).trim();
  }

  return String(
    value === undefined || value === null
      ? fallback
      : value
  ).trim();
}

function numberParam(
  value,
  fallback,
  min,
  max
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, Math.floor(parsed))
  );
}

function booleanParam(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no"
  ) {
    return false;
  }

  return fallback;
}

function normalizeSymbol(value) {
  const symbol = stringParam(value)
    .toUpperCase();

  if (!symbol) {
    throw new Error("SYMBOL_REQUIRED");
  }

  if (
    symbol.length > 32 ||
    /[\s,?&#=]/.test(symbol)
  ) {
    throw new Error("INVALID_SYMBOL");
  }

  return symbol;
}

function normalizeSymbols(value) {
  const symbols = String(value || "")
    .split(",")
    .map(symbol => symbol.trim())
    .filter(Boolean)
    .map(normalizeSymbol);

  return [...new Set(symbols)];
}

/* -------------------------------------------------------------------------- */
/* Twelve Data                                                                */
/* -------------------------------------------------------------------------- */

async function twelveDataRequest(
  pathname,
  params = {},
  {
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = {}
) {
  const apiKey = getApiKey();

  if (!apiKey) {
    const error = new Error(
      "TWELVE_DATA_API_KEY is not configured."
    );

    error.code = "API_KEY_MISSING";

    throw error;
  }

  const url = new URL(
    pathname,
    TWELVE_DATA_BASE_URL
  );

  Object.entries(params).forEach(
    ([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return;
      }

      url.searchParams.set(
        key,
        String(value)
      );
    }
  );

  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(
      url.toString(),
      {
        method: "GET",

        headers: {
          Accept: "application/json",

          /*
           * IMPORTANT:
           *
           * API Key stays on the server.
           * It is NEVER returned to the browser.
           */
          Authorization:
            `apikey ${apiKey}`
        },

        signal: controller.signal
      }
    );

    const text =
      await response.text();

    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        const error = new Error(
          "Twelve Data returned invalid JSON."
        );

        error.code =
          "UPSTREAM_INVALID_JSON";

        throw error;
      }
    }

    /*
     * Twelve Data may return API errors
     * inside a JSON payload.
     */
    if (
      !response.ok ||
      payload?.status === "error"
    ) {
      const error = new Error(
        payload?.message ||
        `Twelve Data HTTP ${response.status}`
      );

      error.code =
        payload?.code ||
        "UPSTREAM_ERROR";

      error.status =
        response.status;

      error.details =
        payload;

      throw error;
    }

    return payload;
  } catch (error) {
    if (
      error?.name === "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Twelve Data request timed out."
        );

      timeoutError.code =
        "UPSTREAM_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

function setShortCache(res, seconds = 10) {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${seconds}, stale-while-revalidate=${Math.max(
      10,
      seconds * 2
    )}`
  );
}

/* -------------------------------------------------------------------------- */
/* Quote                                                                      */
/* -------------------------------------------------------------------------- */

async function handleQuote(req, res) {
  const symbol =
    normalizeSymbol(
      req.query.symbol
    );

  const data =
    await twelveDataRequest(
      "/quote",
      {
        symbol
      }
    );

  setShortCache(res, 5);

  return ok(res, data, {
    provider: "twelve-data"
  });
}

/* -------------------------------------------------------------------------- */
/* Quotes                                                                     */
/* -------------------------------------------------------------------------- */

async function handleQuotes(req, res) {
  const symbols =
    normalizeSymbols(
      req.query.symbols
    );

  if (!symbols.length) {
    return fail(
      res,
      400,
      "SYMBOLS_REQUIRED",
      "At least one symbol is required."
    );
  }

  if (symbols.length > 20) {
    return fail(
      res,
      400,
      "TOO_MANY_SYMBOLS",
      "A maximum of 20 symbols can be requested at once."
    );
  }

  const data =
    await twelveDataRequest(
      "/quote",
      {
        symbol: symbols.join(",")
      }
    );

  setShortCache(res, 5);

  return ok(res, data, {
    provider: "twelve-data"
  });
}

/* -------------------------------------------------------------------------- */
/* Candles                                                                    */
/* -------------------------------------------------------------------------- */

function mapInterval(interval) {
  const value =
    String(interval || "1D")
      .trim();

  const map = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",

    "1H": "1h",
    "1h": "1h",

    "2H": "2h",
    "2h": "2h",

    "4H": "4h",
    "4h": "4h",

    "1D": "1day",
    "1d": "1day",
    "1day": "1day",

    "1W": "1week",
    "1w": "1week",
    "1week": "1week"
  };

  return map[value] || "1day";
}

function outputSizeFromRange(
  range,
  interval
) {
  const normalizedRange =
    String(range || "3M")
      .toUpperCase();

  const normalizedInterval =
    mapInterval(interval);

  /*
   * These values are not trading signals.
   * They only decide how many candles
   * the backend requests.
   */
  const daily = {
    "5D": 10,
    "1M": 35,
    "3M": 100,
    "6M": 190,
    "YTD": 300,
    "1Y": 380,
    "2Y": 760,
    "5Y": 1400,
    "MAX": 5000
  };

  if (
    normalizedInterval === "1day" ||
    normalizedInterval === "1week"
  ) {
    return daily[normalizedRange] || 100;
  }

  const intraday = {
    "1D": 500,
    "5D": 1000,
    "1M": 1500,
    "3M": 2500,
    "6M": 3500
  };

  return intraday[normalizedRange] || 500;
}

async function handleCandles(req, res) {
  const symbol =
    normalizeSymbol(
      req.query.symbol
    );

  const interval =
    mapInterval(
      req.query.interval
    );

  const range =
    stringParam(
      req.query.range,
      "3M"
    );

  const requestedLimit =
    req.query.limit
      ? numberParam(
          req.query.limit,
          100,
          1,
          5000
        )
      : null;

  const outputsize =
    requestedLimit ||
    outputSizeFromRange(
      range,
      interval
    );

  const from =
    stringParam(
      req.query.from
    );

  const to =
    stringParam(
      req.query.to
    );

  const extendedHours =
    booleanParam(
      req.query.extendedHours,
      false
    );

  const params = {
    symbol,
    interval,
    outputsize,
    format: "JSON",
    timezone:
      "America/New_York"
  };

  if (from) {
    params.start_date = from;
  }

  if (to) {
    params.end_date = to;
  }

  /*
   * Twelve Data documents prepost for
   * supported US-equity plans.
   *
   * We only send it when OX explicitly
   * requests extended-hours data.
   */
  if (extendedHours) {
    params.prepost = "true";
  }

  const data =
    await twelveDataRequest(
      "/time_series",
      params
    );

  setShortCache(
    res,
    interval === "1day"
      ? 60
      : 10
  );

  return ok(res, data, {
    provider: "twelve-data",
    interval
  });
}

/* -------------------------------------------------------------------------- */
/* Symbol search                                                              */
/* -------------------------------------------------------------------------- */

async function handleSearch(req, res) {
  const query =
    stringParam(req.query.q);

  if (!query) {
    return ok(res, []);
  }

  const limit =
    numberParam(
      req.query.limit,
      12,
      1,
      50
    );

  const data =
    await twelveDataRequest(
      "/symbol_search",
      {
        symbol: query,
        outputsize: limit
      }
    );

  const rows =
    Array.isArray(data?.data)
      ? data.data
      : [];

  /*
   * OX US market should not suddenly
   * mix foreign listings into US search.
   */
  const usOnly =
    rows.filter(item => {
      const country =
        String(
          item?.country || ""
        ).toLowerCase();

      return (
        !country ||
        country === "united states" ||
        country === "usa" ||
        country === "us"
      );
    });

  setShortCache(res, 300);

  return ok(res, usOnly, {
    provider: "twelve-data"
  });
}

/* -------------------------------------------------------------------------- */
/* Market Pulse                                                               */
/* -------------------------------------------------------------------------- */

async function handleMarketPulse(
  req,
  res
) {
  /*
   * These are the four benchmarks already
   * planned for OX US Market:
   *
   * SPY = broad US large-cap market
   * QQQ = Nasdaq / growth-heavy market
   * IWM = US small caps
   * VIX = volatility index
   */

  const symbols = [
    "SPY",
    "QQQ",
    "IWM",
    "VIX"
  ];

  const data =
    await twelveDataRequest(
      "/quote",
      {
        symbol: symbols.join(",")
      }
    );

  setShortCache(res, 5);

  return ok(res, {
    benchmarks: data
  }, {
    provider: "twelve-data"
  });
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

async function handleHealth(req, res) {
  const configured =
    Boolean(getApiKey());

  return ok(res, {
    service:
      "ox-us-market-data",

    status:
      configured
        ? "ready"
        : "missing-api-key",

    provider:
      "twelve-data",

    apiKeyConfigured:
      configured,

    timestamp:
      new Date().toISOString()
  });
}

/* -------------------------------------------------------------------------- */
/* Not implemented yet                                                        */
/* -------------------------------------------------------------------------- */

function handleNotImplemented(
  res,
  feature
) {
  /*
   * IMPORTANT:
   *
   * We deliberately do NOT manufacture
   * fake market breadth / sector / radar
   * data.
   *
   * Those will be wired to real data
   * in later steps.
   */

  return fail(
    res,
    501,
    "US_DATA_NOT_IMPLEMENTED",
    `${feature} real-data integration has not been connected yet.`
  );
}

/* -------------------------------------------------------------------------- */
/* Main handler                                                               */
/* -------------------------------------------------------------------------- */

export default async function handler(
  req,
  res
) {
  if (!applyCors(req, res)) {
    return fail(
      res,
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed to access the OX US market API."
    );
  }

  if (req.method === "OPTIONS") {
    res.status(204);
    return res.end();
  }

  if (req.method !== "GET") {
    return fail(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Only GET requests are supported."
    );
  }

  const endpoint =
    stringParam(
      req.query.endpoint
    ).toLowerCase();

  try {
    switch (endpoint) {
      case "health":
        return await handleHealth(
          req,
          res
        );

      case "quote":
        return await handleQuote(
          req,
          res
        );

      case "quotes":
        return await handleQuotes(
          req,
          res
        );

      case "candles":
        return await handleCandles(
          req,
          res
        );

      case "search":
        return await handleSearch(
          req,
          res
        );

      case "market-pulse":
        return await handleMarketPulse(
          req,
          res
        );

      case "breadth":
        return handleNotImplemented(
          res,
          "US market breadth"
        );

      case "sectors":
        return handleNotImplemented(
          res,
          "US sector strength"
        );

      case "radar":
        return handleNotImplemented(
          res,
          "US radar"
        );

      default:
        return fail(
          res,
          404,
          "ENDPOINT_NOT_FOUND",
          `Unknown US market endpoint: ${endpoint || "(empty)"}`
        );
    }
  } catch (error) {
    if (
      error?.message ===
      "SYMBOL_REQUIRED"
    ) {
      return fail(
        res,
        400,
        "SYMBOL_REQUIRED",
        "A symbol is required."
      );
    }

    if (
      error?.message ===
      "INVALID_SYMBOL"
    ) {
      return fail(
        res,
        400,
        "INVALID_SYMBOL",
        "The supplied symbol is invalid."
      );
    }

    if (
      error?.code ===
      "API_KEY_MISSING"
    ) {
      return fail(
        res,
        503,
        "US_DATA_API_KEY_MISSING",
        "The server-side Twelve Data API key has not been configured."
      );
    }

    if (
      error?.code ===
      "UPSTREAM_TIMEOUT"
    ) {
      return fail(
        res,
        504,
        "US_DATA_UPSTREAM_TIMEOUT",
        "The US market data provider timed out."
      );
    }

    /*
     * Do not leak API credentials,
     * stack traces or server internals
     * to the browser.
     */
    console.error(
      "[OX US API]",
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

    return fail(
      res,
      502,
      "US_DATA_UPSTREAM_ERROR",
      error?.message ||
      "Unable to retrieve US market data."
    );
  }
}
