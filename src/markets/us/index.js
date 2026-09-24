import { US_MODULE_CONFIG } from "./config.js";

import {
  createUSMarketState,
  refreshUSMarketState
} from "./engine.js";

import { renderUSHome } from "./home.js";
import { renderUSStrength } from "./strength.js";
import { renderUSRadar, cancelUSQuoteLookup } from "./radar.js";

/*
 * OX v4.0 Modular
 * US Market Lifecycle
 *
 * Responsibility:
 * - Receive activation from the market router.
 * - Start / stop the US market engine.
 * - Keep the active US view in sync with market state.
 * - Restore the shared market host when leaving US.
 *
 * This file does NOT:
 * - call a market data provider directly
 * - store API secrets
 * - modify Crypto / TW / Forex logic
 */

let activeView = "radar";

let isActive = false;

let requestController = null;

const SHARED_HOST_ID =
  "market-unavailable-card";


/* -------------------------------------------------------------------------- */
/* Shared market host                                                        */
/* -------------------------------------------------------------------------- */

/*
 * US Home / Strength / Radar temporarily use the existing
 * #market-unavailable-card as their rendering host.
 *
 * Some US views completely replace its innerHTML.
 *
 * When leaving US we MUST restore the original shell,
 * otherwise the legacy MarketController cannot find:
 *
 * #market-unavailable-title
 * #market-unavailable-copy
 *
 * This was the cause of market switching becoming stuck
 * after visiting US Radar.
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

  if (!root) {
    return;
  }

  /*
   * Remove view-specific decoration.
   */
  root.classList.remove(
    "us-radar-root"
  );

  /*
   * Restore the original shared placeholder structure.
   *
   * MarketController.syncPlaceholder()
   * will immediately replace the title/copy
   * with the correct target market text.
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
   * Hide first.
   *
   * The destination market's own
   * syncPlaceholder() call decides
   * whether it should become visible.
   */
  root.hidden =
    true;
}


/* -------------------------------------------------------------------------- */
/* View cleanup                                                              */
/* -------------------------------------------------------------------------- */

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

  if (!root) {
    return;
  }

  /*
   * Radar adds a root class with its own layout.
   * Do not let that class leak into Home / Strength.
   */
  if (
    view !== "radar"
  ) {
    root.classList.remove(
      "us-radar-root"
    );
  }
}


/* -------------------------------------------------------------------------- */
/* Renderers                                                                  */
/* -------------------------------------------------------------------------- */

const renderers =
  Object.freeze({
    home:
      renderUSHome,

    strength:
      renderUSStrength,

    radar:
      renderUSRadar
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
    createUSMarketState()
) {
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


/* -------------------------------------------------------------------------- */
/* Request lifecycle                                                         */
/* -------------------------------------------------------------------------- */

function cancelRequest() {
  if (
    !requestController
  ) {
    return;
  }

  try {
    requestController.abort();
  } catch {
    /*
     * Cancellation failure must never
     * block market switching.
     */
  }

  requestController =
    null;
}


async function loadMarketData({
  force = false
} = {}) {

  cancelRequest();

  const controller =
    new AbortController();

  requestController =
    controller;

  const pending =
    refreshUSMarketState({
      signal:
        controller.signal,

      force
    });

  /*
   * Show current / loading state immediately.
   */
  if (isActive) {
    render(
      createUSMarketState()
    );
  }

  const state =
    await pending;

  /*
   * Never let an old US request repaint
   * after the user has already switched
   * to another market.
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

if (typeof document !== "undefined") {
  document.addEventListener("ox:us-refresh", () => {
    if (isActive) loadMarketData({ force: true });
  });
}


/* -------------------------------------------------------------------------- */
/* US module                                                                  */
/* -------------------------------------------------------------------------- */

export const usModule =
  Object.freeze({

    id:
      US_MODULE_CONFIG.id,

    label:
      US_MODULE_CONFIG.label,

    status:
      US_MODULE_CONFIG.status,


    /*
     * Enter US Market
     */
    async activate({
      view =
        activeView
    } = {}) {

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
       * Render cached/current state first.
       */
      render();

      /*
       * Then request fresh data.
       */
      return loadMarketData();
    },


    /*
     * Leave US Market
     *
     * IMPORTANT:
     * This runs synchronously before
     * the next market finishes activating.
     *
     * Restore the shared DOM immediately
     * so Crypto / TW / Forex can safely
     * continue their own UI flow.
     */
    deactivate() {

      isActive =
        false;

      cancelRequest();
      cancelUSQuoteLookup();

      restoreSharedMarketHost();
    },


    /*
     * Home / Strength / Radar switch
     * while still inside US Market.
     */
    view(
      view
    ) {

      if (
        isValidView(
          view
        )
      ) {
        activeView =
          view;
      }

      if (activeView !== "radar") cancelUSQuoteLookup();

      if (!isActive) {
        return null;
      }

      prepareSharedHostForView(
        activeView
      );

      return render();
    },


    /*
     * Existing synchronous state contract.
     */
    refresh() {
      return createUSMarketState();
    },


    /*
     * Explicit fresh network request.
     */
    reload() {

      if (!isActive) {
        return Promise.resolve(
          createUSMarketState()
        );
      }

      return loadMarketData({
        force: true
      });
    }

  });
