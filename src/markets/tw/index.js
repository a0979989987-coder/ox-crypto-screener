import {
  TW_MODULE_CONFIG
} from "./config.js";

import {
  createTWMarketState,
  refreshTWMarketState
} from "./engine.js";

import {
  renderTWHome
} from "./home.js";

import {
  renderTWStrength
} from "./strength.js";

import {
  renderTWRadar
} from "./radar.js";
import { cancelTWLookup } from "./lookup.js";


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
 * - Cancel TW requests when leaving.
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
 * - modify Crypto / US / Forex
 */


/* ========================================================================== */
/* Module state                                                               */
/* ========================================================================== */

let activeView =
  "radar";


let isActive =
  false;


let requestController =
  null;


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
      renderTWRadar

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


  prepareSharedHostForView(
    activeView
  );


  return renderer(
    state
  );
}


/* ========================================================================== */
/* Request lifecycle                                                         */
/* ========================================================================== */

function cancelRequest() {

  if (
    !requestController
  ) {
    return;
  }


  try {

    requestController
      .abort();

  } catch {

    /*
     * Cancellation must never
     * block market switching.
     */
  }


  requestController =
    null;
}


/*
 * Load the complete Taiwan market state.
 *
 *
 * Important:
 *
 * The renderer first gets the current
 * cached/loading state.
 *
 * Then it gets repainted only when:
 *
 * - TW is still active
 * - this is still the latest request
 *
 *
 * This prevents:
 *
 * TW request
 *   ↓
 * user switches to Crypto
 *   ↓
 * old TW request finishes
 *   ↓
 * TW UI paints over Crypto
 *
 * from ever happening.
 */
async function loadMarketData(
  {
    force =
      false
  } = {}
) {

  cancelRequest();


  const controller =
    new AbortController();


  requestController =
    controller;


  const pending =
    refreshTWMarketState({

      signal:
        controller.signal,

      force

    });


  /*
   * refreshTWMarketState()
   * immediately changes the engine
   * to loading / unconfigured.
   *
   * Render that state first.
   */
  if (
    isActive
  ) {

    render(
      createTWMarketState()
    );
  }


  const state =
    await pending;


  /*
   * Only latest active request
   * may repaint the UI.
   */
  if (
    isActive &&
    requestController ===
      controller
  ) {

    render(
      state
    );
  }


  if (
    requestController ===
    controller
  ) {

    requestController =
      null;
  }


  return state;
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
     * Crypto / US / Forex can safely
     * take control.
     */
    deactivate() {

      isActive =
        false;


      cancelRequest();
      cancelTWLookup();


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
