import { usProvider } from "./api.js";

/*
 * OX v4.0 Modular
 * US Market Engine
 *
 * Responsibility:
 * - Fetch US market data through usProvider.
 * - Normalize provider-specific responses.
 * - Build a stable OX US Market State.
 *
 * This file does NOT:
 * - store API secrets
 * - call Twelve Data directly
 * - render UI
 * - touch Crypto / TW / Forex
 */

const BENCHMARK_SYMBOLS = Object.freeze([
  "SPY",
  "QQQ",
  "IWM",
  "VIX"
]);

let currentState = Object.freeze({
  market: "us",
  status: "idle",
  provider: usProvider.id,
  updatedAt: null,
  data: null,
  error: null
});

let activeRequest = null;
let activeSignal = null;
let latestRequestId = 0;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function booleanValue(value) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "string") {
    const normalized =
      value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return null;
}

function errorMessage(raw) {
  if (!raw) {
    return "No market data returned.";
  }

  if (
    typeof raw.message === "string"
  ) {
    return raw.message;
  }

  if (
    typeof raw.error === "string"
  ) {
    return raw.error;
  }

  if (
    raw.error &&
    typeof raw.error.message ===
      "string"
  ) {
    return raw.error.message;
  }

  return "Market data unavailable.";
}

/* -------------------------------------------------------------------------- */
/* Benchmark normalization                                                    */
/* -------------------------------------------------------------------------- */

function normalizeBenchmark(
  requestedSymbol,
  raw
) {
  const symbol =
    String(
      raw?.symbol ||
      requestedSymbol
    ).toUpperCase();

  /*
   * Twelve Data may return an error object
   * for a symbol inside an otherwise valid
   * multi-symbol response.
   *
   * VIX currently behaves this way on the
   * selected data plan/provider.
   */
  if (
    !raw ||
    raw.status === "error" ||
    raw.code >= 400
  ) {
    return Object.freeze({
      symbol: requestedSymbol,
      available: false,
      name: null,
      exchange: null,

      price: null,
      previousClose: null,
      change: null,
      changePct: null,

      open: null,
      high: null,
      low: null,
      volume: null,

      isMarketOpen: null,
      timestamp: null,

      error:
        errorMessage(raw)
    });
  }

  const price =
    finiteNumber(
      raw.close ??
      raw.price ??
      raw.last
    );

  /*
   * A quote without a usable price should
   * not be treated as a healthy benchmark.
   */
  if (price === null) {
    return Object.freeze({
      symbol,
      available: false,
      name:
        raw.name || null,

      exchange:
        raw.exchange || null,

      price: null,
      previousClose:
        finiteNumber(
          raw.previous_close
        ),

      change:
        finiteNumber(raw.change),

      changePct:
        finiteNumber(
          raw.percent_change
        ),

      open:
        finiteNumber(raw.open),

      high:
        finiteNumber(raw.high),

      low:
        finiteNumber(raw.low),

      volume:
        finiteNumber(raw.volume),

      isMarketOpen:
        booleanValue(
          raw.is_market_open
        ),

      timestamp:
        raw.timestamp ??
        raw.datetime ??
        null,

      error:
        "Quote returned without a usable price."
    });
  }

  return Object.freeze({
    symbol,

    available: true,

    name:
      raw.name || symbol,

    exchange:
      raw.exchange || null,

    currency:
      raw.currency || "USD",

    price,

    previousClose:
      finiteNumber(
        raw.previous_close
      ),

    change:
      finiteNumber(
        raw.change
      ),

    changePct:
      finiteNumber(
        raw.percent_change
      ),

    open:
      finiteNumber(
        raw.open
      ),

    high:
      finiteNumber(
        raw.high
      ),

    low:
      finiteNumber(
        raw.low
      ),

    volume:
      finiteNumber(
        raw.volume
      ),

    averageVolume:
      finiteNumber(
        raw.average_volume
      ),

    isMarketOpen:
      booleanValue(
        raw.is_market_open
      ),

    timestamp:
      raw.timestamp ??
      raw.datetime ??
      null,

    error: null
  });
}

/* -------------------------------------------------------------------------- */
/* Market session                                                             */
/* -------------------------------------------------------------------------- */

function resolveMarketSession(
  benchmarks
) {
  const core = [
    benchmarks.SPY,
    benchmarks.QQQ,
    benchmarks.IWM
  ].filter(Boolean);

  if (
    core.some(
      item =>
        item.available &&
        item.isMarketOpen === true
    )
  ) {
    return "REGULAR";
  }

  /*
   * The current Twelve Data quote response
   * reliably tells us whether the regular
   * session is open.
   *
   * It does NOT give us enough information
   * here to safely label PRE-MARKET versus
   * AFTER-HOURS.
   *
   * Do not manufacture that distinction.
   */
  return "CLOSED";
}

/* -------------------------------------------------------------------------- */
/* Market Pulse normalization                                                 */
/* -------------------------------------------------------------------------- */

export function analyzeUSMarketPulse(
  payload
) {
  const rawBenchmarks =
    payload?.benchmarks &&
    typeof payload.benchmarks ===
      "object"
      ? payload.benchmarks
      : {};

  const benchmarks = {};

  BENCHMARK_SYMBOLS.forEach(
    symbol => {
      benchmarks[symbol] =
        normalizeBenchmark(
          symbol,
          rawBenchmarks[symbol]
        );
    }
  );

  const availableSymbols =
    BENCHMARK_SYMBOLS.filter(
      symbol =>
        benchmarks[symbol]
          ?.available
    );

  const unavailableSymbols =
    BENCHMARK_SYMBOLS.filter(
      symbol =>
        !benchmarks[symbol]
          ?.available
    );

  return Object.freeze({
    benchmarks:
      Object.freeze(benchmarks),

    availableSymbols:
      Object.freeze(
        availableSymbols
      ),

    unavailableSymbols:
      Object.freeze(
        unavailableSymbols
      ),

    session:
      resolveMarketSession(
        benchmarks
      ),

    /*
     * VIX remains a first-class benchmark
     * slot even when the current provider
     * cannot supply the real CBOE VIX.
     *
     * We intentionally do NOT substitute
     * VIXY / VIXM or another ETF.
     */
    volatility:
      benchmarks.VIX,

    broadMarket:
      benchmarks.SPY,

    growthMarket:
      benchmarks.QQQ,

    smallCaps:
      benchmarks.IWM
  });
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

function setState(next) {
  currentState =
    Object.freeze({
      market: "us",
      provider:
        usProvider.id,
      ...next
    });

  return currentState;
}

function emitState(state) {
  if (
    typeof document ===
    "undefined"
  ) {
    return;
  }

  try {
    document.dispatchEvent(
      new CustomEvent(
        "ox:us-market-state",
        {
          detail: state
        }
      )
    );
  } catch {
    /*
     * State delivery must not fail
     * because an event listener is absent.
     */
  }
}

/* -------------------------------------------------------------------------- */
/* Public state API                                                           */
/* -------------------------------------------------------------------------- */

export function createUSMarketState() {
  return currentState;
}

export async function refreshUSMarketState({
  signal = null,
  force = false
} = {}) {
  /*
   * Avoid duplicate requests if multiple
   * US views ask for data at the same time.
   */
  if (
    activeRequest &&
    !force &&
    !activeSignal?.aborted
  ) {
    return activeRequest;
  }

  setState({
    status: "loading",

    updatedAt:
      currentState.updatedAt,

    data:
      currentState.data,

    error: null
  });

  emitState(currentState);

  const requestId = ++latestRequestId;
  activeSignal = signal;
  activeRequest =
    usProvider
      .getMarketPulse({
        signal
      })
      .then(payload => {
        if (signal?.aborted || requestId !== latestRequestId) return currentState;
        const data =
          analyzeUSMarketPulse(
            payload
          );

        const readyState =
          setState({
            status: "ready",

            updatedAt:
              new Date()
                .toISOString(),

            data,

            error: null
          });

        emitState(
          readyState
        );

        return readyState;
      })
      .catch(error => {
        if (signal?.aborted || requestId !== latestRequestId) return currentState;
        const errorState =
          setState({
            status: "error",

            updatedAt:
              currentState.updatedAt,

            data:
              currentState.data,

            error:
              Object.freeze({
                code:
                  error?.code ||
                  "US_MARKET_DATA_ERROR",

                message:
                  error?.message ||
                  "Unable to load US market data.",

                status:
                  Number(
                    error?.status
                  ) || 0
              })
          });

        emitState(
          errorState
        );

        return errorState;
      })
      .finally(() => {
        if (requestId === latestRequestId) {
          activeRequest = null;
          activeSignal = null;
        }
      });

  return activeRequest;
}

/*
 * Alias for code that prefers "load"
 * terminology.
 */
export const loadUSMarketState =
  refreshUSMarketState;
