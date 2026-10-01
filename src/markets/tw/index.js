import { stopResearch, preloadResearch } from "./research-page.js?v=20261001-loading1";
import {
  TW_MODULE_CONFIG
} from "./config.js";

import {
  createTWMarketState,
  refreshTWMarketState
} from "./engine.js?v=20261001-loading1";

import {
  renderTWHome
} from "./home.js?v=20261001-loading1";

import {
  renderTWStrength
} from "./strength.js?v=20261001-loading1";

import {
  renderTWRadar, stopTWRadar
} from "./radar.js?v=20261001-loading1";
import { cancelTWLookup } from "./lookup.js?v=20261001-loading1";
import { stopTWStrength, preloadTWStrength } from "./strength.js?v=20261001-loading1";
import { createPreloader } from "./preload.js";
import { preloadBundle } from "./patterns/bundle.js?v=20261001-loading1";
import { radarNeedsRecovery } from './recovery.js';


/*
 * OX v4.0 Modular
 * Taiwan Market Lifecycle
 *
 *
 * Data flow:
 *
 * Market Router
 *      ↓
 * TW Module
 *      ↓
 * TW Engine
 *      ↓
 * TW Provider
 *      ↓
 * Backend
 *
 *
 * UI flow:
 *
 * TW State
 *   ↓
 * Home / Indicator / Radar
 *
 *
 * Responsibilities:
 *
 * - Enter / leave Taiwan market.
 * - Manage Home / Indicator / Radar.
 * - Start Taiwan market refresh.
 * - Keep shared TW data loading while another market is visible.
 * - Prevent stale requests repainting another market.
 * - Restore shared market host.
 *
 *
 * This file does NOT:
 *
 * - call TWSE directly
 * - call TPEX directly
 * - store API secrets
 * - normalize provider data
 * - modify Crypto / US
 */


/* ========================================================================== */
/* Module state                                                               */
/* ========================================================================== */

let activeView =
  "radar";


let isActive =
  false;


const TW_RADAR_CACHE_KEY = "ox-tw-official-radar-session-v2";
const TW_RADAR_CACHE_MS = 15 * 60 * 1000;

function readRadarCache() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(TW_RADAR_CACHE_KEY) || "null");
    return saved && Number.isFinite(saved.savedAt) && saved.savedAt <= Date.now()
      && Date.now() - saved.savedAt < TW_RADAR_CACHE_MS && Array.isArray(saved.rows)
      ? saved : null;
  } catch { return null; }
}

function cacheRadarState(state) {
  if (typeof sessionStorage === "undefined" || !Array.isArray(state?.data?.radar)
    || state.status === 'error' || state.data.usingCachedRadar || state.data.meta?.sourceErrors?.radar) return;
  try {
    sessionStorage.setItem(TW_RADAR_CACHE_KEY, JSON.stringify({
      savedAt: Date.parse(state.data.radarUpdatedAt) || Date.now(), rows: state.data.radar,
      radarUpdatedAt: state.data.radarUpdatedAt,
      radarModes: state.data.radarModes, radarModesMeta: state.data.radarModesMeta
    }));
  } catch { /* Storage limits never block market rendering. */ }
}


/* ========================================================================== */
/* Shared market host                                                        */
/* ========================================================================== */

const SHARED_HOST_ID =
  "market-unavailable-card";


/*
 * TW Home / Indicator / Radar currently
 * render inside the existing shared:
 *
 * #market-unavailable-card
 *
 *
 * Those renderers replace innerHTML.
 *
 * Therefore when leaving TW,
 * the original shell MUST be restored.
 *
 *
 * MarketController.syncPlaceholder()
 * still expects:
 *
 * #market-unavailable-title
 * #market-unavailable-copy
 */
function restoreSharedMarketHost() {

  if (
    typeof document ===
    "undefined"
  ) {
    return;
  }


  const root =
    document.getElementById(
      SHARED_HOST_ID
    );


  if (
    !root
  ) {
    return;
  }


  /*
   * Remove every TW-specific
   * root decoration.
   */
  root.classList.remove(
    "tw-home-root",
    "tw-indicator-root",
    "tw-radar-root"
  );


  /*
   * Restore original shared shell.
   */
  root.innerHTML = `

    <div
      class="market-unavailable-icon"
    >
      OX
    </div>


    <div>

      <div
        class="page-kicker"
      >
        MARKET ARCHITECTURE READY
      </div>


      <h2
        id="market-unavailable-title"
      >
        市場
      </h2>


      <p
        id="market-unavailable-copy"
      >
        市場切換中。
      </p>

    </div>

  `;


  /*
   * Destination market decides
   * whether this host should show.
   */
  root.hidden =
    true;
}


/* ========================================================================== */
/* View preparation                                                          */
/* ========================================================================== */

function prepareSharedHostForView(
  view
) {

  if (
    typeof document ===
    "undefined"
  ) {
    return;
  }


  const root =
    document.getElementById(
      SHARED_HOST_ID
    );


  if (
    !root
  ) {
    return;
  }


  /*
   * Prevent one TW view's layout
   * leaking into another.
   */

  if (
    view !==
    "home"
  ) {

    root.classList.remove(
      "tw-home-root"
    );
  }


  if (
    view !==
    "strength"
  ) {

    root.classList.remove(
      "tw-indicator-root"
    );
  }


  if (
    view !==
    "radar"
  ) {

    root.classList.remove(
      "tw-radar-root"
    );
  }
}


/* ========================================================================== */
/* Renderers                                                                  */
/* ========================================================================== */

const renderers =
  Object.freeze({

    home:
      renderTWHome,


    /*
     * IMPORTANT:
     *
     * Internal route remains:
     *
     * strength
     *
     * User-facing name is:
     *
     * 指標
     *
     * Do not rename the internal route
     * until the global navigation
     * architecture is migrated.
     */
    strength:
      renderTWStrength,


    radar:
      renderTWRadar, stopTWRadar

  });


function isValidView(
  view
) {

  return Object.prototype
    .hasOwnProperty
    .call(
      renderers,
      view
    );
}


function render(
  state =
    createTWMarketState()
) {

  if (
    !isActive
  ) {
    return null;
  }


  const renderer =
    renderers[
      activeView
    ];


  if (
    typeof renderer !==
    "function"
  ) {
    return null;
  }


  if (activeView !== "radar") stopTWRadar();
  if (activeView !== "strength") stopTWStrength();
  if (activeView === "radar") stopResearch();
  prepareSharedHostForView(
    activeView
  );


  const previousRows = activeView === "radar" && !state?.data?.radar?.length
    && (!Array.isArray(state?.data?.radar) || state?.data?.meta?.sourceErrors?.radar)
    ? readRadarCache() : null;

  return renderer(previousRows ? {
    ...state,
    data: { ...(state.data || {}), radar: previousRows.rows, radarModes: previousRows.radarModes,
      radarModesMeta: previousRows.radarModesMeta, usingCachedRadar: true,
      radarUpdatedAt: previousRows.radarUpdatedAt || new Date(previousRows.savedAt).toISOString() }
  } : state);
}


/* ========================================================================== */
/* Request lifecycle                                                         */
/* ========================================================================== */

const ensureMarketData = createPreloader(async () => {
  const controller = new AbortController();
  const loading=window.OXLoading?.begin('tw','台股資料載入中');
  try {
  const state = await refreshTWMarketState({
    signal: controller.signal,
    force: true,
    onRadarReady(state) {
      cacheRadarState(state);
      if (isActive && activeView === "radar") render(state);
    }
  });
  cacheRadarState(state);
  if (isActive) render(state);
  return state;
  } finally { loading?.finish(); }
}, { usable: state => ["ready", "partial"].includes(state?.status)
  && Array.isArray(state?.data?.radar) && !radarNeedsRecovery(state) });

function loadMarketData(options = {}) {
  const pending = ensureMarketData(options);
  if (isActive) render(createTWMarketState());
  return pending;
}

let lastRecoveryAt = -Infinity;
function recoverMarketData(force = false) {
  if (!isActive || typeof document === 'undefined' || document.hidden
    || typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!force && (!radarNeedsRecovery(createTWMarketState()) || Date.now() - lastRecoveryAt < 15000)) return;
  lastRecoveryAt = Date.now();
  return loadMarketData({ force: true });
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => recoverMarketData());
  window.addEventListener('focus', () => recoverMarketData());
  document.addEventListener('visibilitychange', () => recoverMarketData());
  document.addEventListener('ox:tw-retry', () => recoverMarketData(true));
}

function preload() {
  // UI modules and the bundled official snapshot can load while Crypto is visible.
  preloadTWStrength().catch(() => {});
  return Promise.allSettled([loadMarketData(), preloadResearch(), preloadBundle()]);
}


/* ========================================================================== */
/* Taiwan module                                                              */
/* ========================================================================== */

export const twModule =
  Object.freeze({

    id:
      TW_MODULE_CONFIG.id,


    label:
      TW_MODULE_CONFIG.label,


    status:
      TW_MODULE_CONFIG.status,


    /*
     * ================================================================ *
     * Enter Taiwan Market                                              *
     * ================================================================ *
     */
    preload,

    async activate(
      {
        view =
          activeView
      } = {}
    ) {

      isActive =
        true;


      if (
        isValidView(
          view
        )
      ) {

        activeView =
          view;
      }


      prepareSharedHostForView(
        activeView
      );


      /*
       * Render cached state immediately.
       *
       * This makes market switching
       * feel instant.
       */
      render(
        createTWMarketState()
      );


      /*
       * Then request fresh data.
       *
       * If backend is not configured,
       * Engine returns:
       *
       * status: "unconfigured"
       *
       * without crashing.
       */
      return loadMarketData();
    },


    /*
     * ================================================================ *
     * Leave Taiwan Market                                              *
     * ================================================================ *
     *
     * This MUST stay synchronous.
     *
     * Market Router calls deactivate()
     * before the next market finishes
     * activation.
     *
     * Restore the DOM immediately so
     * Crypto / US can safely
     * take control.
     */
    deactivate() {

      isActive =
        false;


      stopTWStrength();
      stopTWRadar();
      cancelTWLookup();
      stopResearch();


      restoreSharedMarketHost();
    },


    /*
     * ================================================================ *
     * Change TW View                                                   *
     * ================================================================ *
     *
     * Switching:
     *
     * Home
     * ↕
     * Indicator
     * ↕
     * Radar
     *
     * does NOT refetch the entire
     * Taiwan market every time.
     *
     * All views consume the same
     * normalized TW state.
     */
    view(
      view
    ) {

      if (view !== "radar") cancelTWLookup();

      if (
        isValidView(
          view
        )
      ) {

        activeView =
          view;
      }


      if (
        !isActive
      ) {

        return null;
      }


      prepareSharedHostForView(
        activeView
      );


      return render(
        createTWMarketState()
      );
    },


    /*
     * ================================================================ *
     * Current synchronous state                                       *
     * ================================================================ *
     */
    refresh() {

      return createTWMarketState();
    },


    /*
     * ================================================================ *
     * Explicit fresh reload                                           *
     * ================================================================ *
     *
     * Future refresh buttons can call:
     *
     * window.OXModules
     *   .router
     *   .get("tw")
     *   .reload()
     */
    reload() {

      if (
        !isActive
      ) {

        return Promise.resolve(
          createTWMarketState()
        );
      }


      return loadMarketData({
        force:
          true
      });
    }

  });
