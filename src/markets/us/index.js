import { US_MODULE_CONFIG } from "./config.js";

import {
  createUSMarketState,
  refreshUSMarketState
} from "./engine.js";

import { renderUSHome } from "./home.js";
import { renderUSStrength } from "./strength.js";
import { renderUSRadar } from "./radar.js";

/*
 * OX v4.0 Modular
 * US Market Lifecycle
 *
 * Responsibility:
 * - Receive activation from the market router.
 * - Start / stop the US market engine.
 * - Keep the active US view in sync with market state.
 *
 * This file does NOT:
 * - call Twelve Data directly
 * - store API secrets
 * - change Crypto / TW / Forex
 * - own the visual design
 */

let activeView = "radar";
let isActive = false;
let requestController = null;

/* -------------------------------------------------------------------------- */
/* Renderers                                                                  */
/* -------------------------------------------------------------------------- */

const renderers = Object.freeze({
  home: renderUSHome,
  strength: renderUSStrength,
  radar: renderUSRadar
});

function isValidView(view) {
  return Object.prototype.hasOwnProperty.call(
    renderers,
    view
  );
}

function render(
  state = createUSMarketState()
) {
  const renderer =
    renderers[activeView];

  if (
    typeof renderer !== "function"
  ) {
    return null;
  }

  /*
   * The state is passed into the renderer.
   *
   * At the moment the existing US renderers
   * still show placeholders.
   *
   * In later steps they will read this state
   * and display real SPY / QQQ / IWM data.
   */
  return renderer(state);
}

/* -------------------------------------------------------------------------- */
/* Request lifecycle                                                          */
/* -------------------------------------------------------------------------- */

function cancelRequest() {
  if (!requestController) {
    return;
  }

  try {
    requestController.abort();
  } catch {
    // Nothing else should fail because cancellation failed.
  }

  requestController = null;
}

async function loadMarketData({
  force = false
} = {}) {
  /*
   * Cancel an older request before starting
   * a fresh activation request.
   */
  cancelRequest();

  const controller =
    new AbortController();

  requestController =
    controller;

  /*
   * refreshUSMarketState() immediately
   * moves the engine state to "loading"
   * before the network request finishes.
   */
  const pending =
    refreshUSMarketState({
      signal:
        controller.signal,

      force
    });

  /*
   * Render the loading state immediately.
   */
  if (isActive) {
    render(
      createUSMarketState()
    );
  }

  const state =
    await pending;

  /*
   * Only the currently active US module
   * is allowed to update its UI.
   *
   * If the user switched to another market
   * while the request was running,
   * we do not render stale US content.
   */
  if (
    isActive &&
    requestController === controller
  ) {
    render(state);
  }

  if (
    requestController === controller
  ) {
    requestController = null;
  }

  return state;
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

    /*
     * Keep the existing module contract.
     * Config status will be changed only
     * when the US real-data migration is
     * fully ready.
     */
    status:
      US_MODULE_CONFIG.status,

    /*
     * Called by marketRouter when the user
     * switches into US Market.
     */
    async activate({
      view = activeView
    } = {}) {
      isActive = true;

      if (
        isValidView(view)
      ) {
        activeView = view;
      }

      /*
       * Render the current state first.
       * Usually this is idle or the most
       * recently cached state.
       */
      render();

      /*
       * Then fetch fresh US market data.
       */
      return loadMarketData();
    },

    /*
     * Called when switching away from US.
     */
    deactivate() {
      isActive = false;

      cancelRequest();
    },

    /*
     * Called when Home / Strength / Radar
     * changes while US Market is active.
     */
    view(view) {
      if (
        isValidView(view)
      ) {
        activeView = view;
      }

      if (isActive) {
        return render();
      }

      return null;
    },

    /*
     * Preserve the old synchronous refresh
     * contract for compatibility.
     *
     * This returns the latest engine state.
     */
    refresh() {
      return createUSMarketState();
    },

    /*
     * Explicit network refresh for future
     * refresh buttons / timers.
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
