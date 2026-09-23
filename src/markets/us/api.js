import { US_MODULE_CONFIG } from "./config.js";

/*
 * OX v4.0 Modular
 * US Market Data Provider
 *
 * Browser-side US market data client.
 *
 * Data flow:
 *
 * GitHub Pages
 *      ↓
 * this provider
 *      ↓
 * OX Vercel Backend
 *      ↓
 * Twelve Data
 *
 * IMPORTANT:
 * Twelve Data API secrets NEVER belong in this file.
 */

const CONTRACT_VERSION = "1";
const API_PREFIX = `/v${CONTRACT_VERSION}/us`;

const DEFAULT_TIMEOUT_MS = 12000;

/*
 * Stable Vercel Production Domain.
 *
 * This is PUBLIC information.
 * It is NOT an API secret.
 *
 * Backend secrets remain stored only inside
 * Vercel Environment Variables.
 */
const DEFAULT_API_BASE =
  "https://ox-crypto-screener.vercel.app/api";

const STORAGE_KEY = "ox-us-data-api-base";
const META_NAME = "ox-us-data-api-base";
const GLOBAL_KEY = "OX_US_DATA_API_BASE";

let runtimeApiBase = "";

/* -------------------------------------------------------------------------- */
/* Error                                                                      */
/* -------------------------------------------------------------------------- */

export class USDataProviderError extends Error {
  constructor(
    message,
    {
      code = "US_DATA_ERROR",
      status = 0,
      details = null,
      cause = null
    } = {}
  ) {
    super(message);

    this.name = "USDataProviderError";
    this.code = code;
    this.status = status;
    this.details = details;

    if (cause) {
      this.cause = cause;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* API base                                                                   */
/* -------------------------------------------------------------------------- */

function normalizeApiBase(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value
    .trim()
    .replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new USDataProviderError(
      "US market data API base must be an absolute URL.",
      {
        code: "US_DATA_INVALID_API_BASE"
      }
    );
  }

  if (
    !["http:", "https:"].includes(
      parsed.protocol
    )
  ) {
    throw new USDataProviderError(
      "US market data API base must use HTTP or HTTPS.",
      {
        code: "US_DATA_INVALID_API_BASE"
      }
    );
  }

  /*
   * GitHub Pages runs over HTTPS.
   * Prevent mixed-content errors.
   */
  if (
    typeof location !== "undefined" &&
    location.protocol === "https:" &&
    parsed.protocol !== "https:" &&
    ![
      "localhost",
      "127.0.0.1"
    ].includes(parsed.hostname)
  ) {
    throw new USDataProviderError(
      "US market data API must use HTTPS when OX is running over HTTPS.",
      {
        code: "US_DATA_INSECURE_API_BASE"
      }
    );
  }

  return trimmed;
}

function readGlobalApiBase() {
  try {
    const value =
      globalThis?.[GLOBAL_KEY];

    return typeof value === "string"
      ? value
      : "";
  } catch {
    return "";
  }
}

function readMetaApiBase() {
  if (
    typeof document === "undefined"
  ) {
    return "";
  }

  try {
    return (
      document
        .querySelector(
          `meta[name="${META_NAME}"]`
        )
        ?.getAttribute("content") ||
      ""
    );
  } catch {
    return "";
  }
}

function readStoredApiBase() {
  if (
    typeof localStorage ===
    "undefined"
  ) {
    return "";
  }

  try {
    return (
      localStorage.getItem(
        STORAGE_KEY
      ) || ""
    );
  } catch {
    return "";
  }
}

export function getUSApiBase() {
  /*
   * Priority:
   *
   * 1. runtime override
   * 2. global override
   * 3. HTML meta override
   * 4. localStorage override
   * 5. production backend
   *
   * This keeps development flexible while
   * giving production a working default.
   */

  const candidate =
    runtimeApiBase ||
    readGlobalApiBase() ||
    readMetaApiBase() ||
    readStoredApiBase() ||
    DEFAULT_API_BASE;

  return normalizeApiBase(
    candidate
  );
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function normalizeSymbol(value) {
  const symbol = String(
    value || ""
  )
    .trim()
    .toUpperCase();

  if (!symbol) {
    throw new USDataProviderError(
      "A US market symbol is required.",
      {
        code:
          "US_DATA_SYMBOL_REQUIRED"
      }
    );
  }

  if (symbol.length > 32) {
    throw new USDataProviderError(
      `Invalid US market symbol: ${symbol}`,
      {
        code:
          "US_DATA_INVALID_SYMBOL"
      }
    );
  }

  /*
   * Symbols such as BRK.B, BRK-B and ^VIX
   * remain valid.
   */
  if (/[\s,?&#=]/.test(symbol)) {
    throw new USDataProviderError(
      `Invalid US market symbol: ${symbol}`,
      {
        code:
          "US_DATA_INVALID_SYMBOL"
      }
    );
  }

  return symbol;
}

function normalizeSymbols(values) {
  const source =
    Array.isArray(values)
      ? values
      : [values];

  const symbols = [
    ...new Set(
      source
        .filter(
          value =>
            value !== null &&
            value !== undefined &&
            value !== ""
        )
        .map(normalizeSymbol)
    )
  ];

  if (!symbols.length) {
    throw new USDataProviderError(
      "At least one US market symbol is required.",
      {
        code:
          "US_DATA_SYMBOLS_REQUIRED"
      }
    );
  }

  return symbols;
}

function normalizeLimit(
  value,
  fallback,
  max = 500
) {
  const parsed =
    Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      max,
      Math.floor(parsed)
    )
  );
}

/* -------------------------------------------------------------------------- */
/* URL                                                                        */
/* -------------------------------------------------------------------------- */

function toQueryValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.join(",");
  }

  if (typeof value === "boolean") {
    return value
      ? "true"
      : "false";
  }

  return String(value);
}

function buildURL(
  endpoint,
  params = {}
) {
  const base =
    getUSApiBase();

  if (!base) {
    throw new USDataProviderError(
      "US market data backend has not been configured yet.",
      {
        code:
          "US_DATA_API_UNCONFIGURED"
      }
    );
  }

  const cleanEndpoint =
    String(endpoint || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

  const url = new URL(
    `${base}${API_PREFIX}/${cleanEndpoint}`
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
        toQueryValue(value)
      );
    }
  );

  return url;
}

/* -------------------------------------------------------------------------- */
/* Response                                                                   */
/* -------------------------------------------------------------------------- */

async function parseResponse(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new USDataProviderError(
      "US market data backend returned invalid JSON.",
      {
        code:
          "US_DATA_INVALID_RESPONSE",

        status:
          response.status
      }
    );
  }
}

function extractErrorMessage(
  payload,
  fallback
) {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return fallback;
  }

  if (
    typeof payload.message ===
    "string"
  ) {
    return payload.message;
  }

  if (
    typeof payload.error ===
    "string"
  ) {
    return payload.error;
  }

  if (
    payload.error &&
    typeof payload.error.message ===
      "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

function unwrapPayload(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === false
  ) {
    throw new USDataProviderError(
      extractErrorMessage(
        payload,
        "US market data request failed."
      ),
      {
        code:
          payload?.error?.code ||
          payload?.code ||
          "US_DATA_BACKEND_ERROR",

        details:
          payload
      }
    );
  }

  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(
      payload,
      "data"
    )
  ) {
    return payload.data;
  }

  return payload;
}

/* -------------------------------------------------------------------------- */
/* Request                                                                    */
/* -------------------------------------------------------------------------- */

async function request(
  endpoint,
  {
    params = {},
    signal = null,
    timeoutMs =
      DEFAULT_TIMEOUT_MS
  } = {}
) {
  if (
    typeof fetch !== "function"
  ) {
    throw new USDataProviderError(
      "Fetch API is not available in this environment.",
      {
        code:
          "US_DATA_FETCH_UNAVAILABLE"
      }
    );
  }

  const url =
    buildURL(
      endpoint,
      params
    );

  const controller =
    new AbortController();

  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        onExternalAbort,
        {
          once: true
        }
      );
    }
  }

  const timer =
    setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(
      1000,
      Number(timeoutMs) ||
        DEFAULT_TIMEOUT_MS
    ));

  try {
    const response =
      await fetch(
        url.toString(),
        {
          method: "GET",

          mode: "cors",

          credentials:
            "omit",

          cache:
            "no-store",

          headers: {
            Accept:
              "application/json"
          },

          signal:
            controller.signal
        }
      );

    const payload =
      await parseResponse(
        response
      );

    if (!response.ok) {
      throw new USDataProviderError(
        extractErrorMessage(
          payload,
          `US market data request failed with HTTP ${response.status}.`
        ),
        {
          code:
            "US_DATA_HTTP_ERROR",

          status:
            response.status,

          details:
            payload
        }
      );
    }

    return unwrapPayload(
      payload
    );
  } catch (error) {
    if (
      error instanceof
      USDataProviderError
    ) {
      throw error;
    }

    if (timedOut) {
      throw new USDataProviderError(
        "US market data request timed out.",
        {
          code:
            "US_DATA_TIMEOUT",

          cause:
            error
        }
      );
    }

    if (signal?.aborted) {
      throw new USDataProviderError(
        "US market data request was cancelled.",
        {
          code:
            "US_DATA_ABORTED",

          cause:
            error
        }
      );
    }

    throw new USDataProviderError(
      "Unable to reach the US market data backend.",
      {
        code:
          "US_DATA_NETWORK_ERROR",

        cause:
          error
      }
    );
  } finally {
    clearTimeout(timer);

    if (signal) {
      signal.removeEventListener(
        "abort",
        onExternalAbort
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Provider methods                                                           */
/* -------------------------------------------------------------------------- */

function configure({
  apiBase = "",
  persist = false
} = {}) {
  runtimeApiBase =
    normalizeApiBase(
      apiBase
    );

  if (
    persist &&
    typeof localStorage !==
      "undefined"
  ) {
    try {
      if (runtimeApiBase) {
        localStorage.setItem(
          STORAGE_KEY,
          runtimeApiBase
        );
      } else {
        localStorage.removeItem(
          STORAGE_KEY
        );
      }
    } catch {
      /*
       * Storage failure must not
       * break market data.
       */
    }
  }

  return Object.freeze({
    apiBase:
      getUSApiBase(),

    available:
      Boolean(
        getUSApiBase()
      )
  });
}

function clearConfiguration({
  clearStored = false
} = {}) {
  runtimeApiBase = "";

  if (
    clearStored &&
    typeof localStorage !==
      "undefined"
  ) {
    try {
      localStorage.removeItem(
        STORAGE_KEY
      );
    } catch {
      /*
       * Ignore storage errors.
       */
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

function health(
  options = {}
) {
  return request(
    "health",
    options
  );
}

/* -------------------------------------------------------------------------- */
/* Quotes                                                                     */
/* -------------------------------------------------------------------------- */

function getQuote(
  symbol,
  options = {}
) {
  return request(
    "quote",
    {
      ...options,

      params: {
        ...options.params,

        symbol:
          normalizeSymbol(
            symbol
          )
      }
    }
  );
}

function getQuotes(
  symbols,
  options = {}
) {
  return request(
    "quotes",
    {
      ...options,

      params: {
        ...options.params,

        symbols:
          normalizeSymbols(
            symbols
          )
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Candles                                                                    */
/* -------------------------------------------------------------------------- */

function getCandles(
  symbol,
  {
    interval = "1D",
    range = "3M",
    from = null,
    to = null,
    limit = null,
    adjusted = true,
    extendedHours = false,
    signal = null,
    timeoutMs =
      DEFAULT_TIMEOUT_MS
  } = {}
) {
  return request(
    "candles",
    {
      signal,
      timeoutMs,

      params: {
        symbol:
          normalizeSymbol(
            symbol
          ),

        interval,
        range,
        from,
        to,
        limit,
        adjusted,
        extendedHours
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Market Pulse                                                               */
/* -------------------------------------------------------------------------- */

function getMarketPulse({
  signal = null,
  timeoutMs =
    DEFAULT_TIMEOUT_MS
} = {}) {
  return request(
    "market-pulse",
    {
      signal,
      timeoutMs
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Breadth                                                                    */
/* -------------------------------------------------------------------------- */

function getBreadth({
  universe = "us",
  exchange = null,
  signal = null,
  timeoutMs =
    DEFAULT_TIMEOUT_MS
} = {}) {
  return request(
    "breadth",
    {
      signal,
      timeoutMs,

      params: {
        universe,
        exchange
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Sectors                                                                    */
/* -------------------------------------------------------------------------- */

function getSectors({
  benchmark = "SPY",
  signal = null,
  timeoutMs =
    DEFAULT_TIMEOUT_MS
} = {}) {
  return request(
    "sectors",
    {
      signal,
      timeoutMs,

      params: {
        benchmark:
          normalizeSymbol(
            benchmark
          )
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Radar                                                                      */
/* -------------------------------------------------------------------------- */

function getRadar({
  universe = "sp500",
  limit = 100,
  direction = "all",
  sort = "score",
  session = "regular",
  signal = null,
  timeoutMs =
    DEFAULT_TIMEOUT_MS
} = {}) {
  return request(
    "radar",
    {
      signal,
      timeoutMs,

      params: {
        universe,

        limit:
          normalizeLimit(
            limit,
            100,
            500
          ),

        direction,
        sort,
        session
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

function searchSymbols(
  query,
  {
    limit = 12,
    signal = null,
    timeoutMs =
      DEFAULT_TIMEOUT_MS
  } = {}
) {
  const q =
    String(query || "")
      .trim();

  if (!q) {
    return Promise.resolve([]);
  }

  return request(
    "search",
    {
      signal,
      timeoutMs,

      params: {
        q,

        limit:
          normalizeLimit(
            limit,
            12,
            50
          )
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Public provider                                                            */
/* -------------------------------------------------------------------------- */

export const usProvider =
  Object.freeze({
    /*
     * Existing market-module contract
     * stays intact.
     */
    id:
      US_MODULE_CONFIG.provider,

    market:
      "us",

    contract:
      "ox-us-market-data-v1",

    contractVersion:
      CONTRACT_VERSION,

    transport:
      "server-proxy",

    /*
     * Twelve Data requires a secret,
     * but that secret exists ONLY
     * inside Vercel.
     */
    secretRequired:
      true,

    frontendSecretAllowed:
      false,

    requiresServerProxy:
      true,

    get available() {
      try {
        return Boolean(
          getUSApiBase()
        );
      } catch {
        return false;
      }
    },

    get apiBase() {
      return getUSApiBase();
    },

    configure,
    clearConfiguration,

    health,

    getQuote,
    quote:
      getQuote,

    getQuotes,
    quotes:
      getQuotes,

    getCandles,
    candles:
      getCandles,

    getMarketPulse,
    marketPulse:
      getMarketPulse,

    getBreadth,
    breadth:
      getBreadth,

    getSectors,
    sectors:
      getSectors,

    getRadar,
    radar:
      getRadar,

    search:
      searchSymbols
  });
