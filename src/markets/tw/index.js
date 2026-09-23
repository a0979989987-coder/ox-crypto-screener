import { TW_MODULE_CONFIG } from "./config.js";

import {
  createTWMarketState
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

/*
 * OX v4.0 Modular
 * TW Market Lifecycle
 *
 * 台股模組入口。
 *
 * 目前責任：
 * - 接收 Market Router 的市場切換
 * - 管理 Home / Indicators / Radar
 * - 保護共用市場容器
 * - 離開台股時完整還原 DOM
 *
 * 這裡不負責：
 * - 直接抓 TWSE API
 * - 直接抓券商 API
 * - 計算台股指標
 * - 修改 Crypto / US / Forex
 */

let activeView =
  "radar";

let isActive =
  false;


/* ========================================================================== */
/* Shared host                                                                */
/* ========================================================================== */

const SHARED_HOST_ID =
  "market-unavailable-card";


/*
 * 台股 UI 目前會暫時使用：
 *
 * #market-unavailable-card
 *
 * 作為獨立市場的畫面容器。
 *
 * 未來 TW Home / Indicators / Radar
 * 都可以渲染進這裡。
 *
 * 但是：
 *
 * MarketController 原本仍需要：
 *
 * #market-unavailable-title
 * #market-unavailable-copy
 *
 * 所以離開台股時一定要把它們還原。
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
   * 移除未來台股各 View
   * 可能加入的根 class。
   */
  root.classList.remove(
    "tw-home-root",
    "tw-indicator-root",
    "tw-radar-root"
  );


  /*
   * 還原原本 OX 共用市場 Placeholder。
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
   * 先隱藏。
   *
   * 下一個市場的 MarketController
   * 會自行決定是否顯示。
   */
  root.hidden =
    true;
}


/* ========================================================================== */
/* View cleanup                                                               */
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

  if (!root) {
    return;
  }


  /*
   * 確保不同台股 View 的樣式
   * 不會互相殘留。
   */
  if (
    view !== "home"
  ) {
    root.classList.remove(
      "tw-home-root"
    );
  }


  if (
    view !== "strength"
  ) {
    root.classList.remove(
      "tw-indicator-root"
    );
  }


  if (
    view !== "radar"
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
     * 內部仍然叫 strength。
     *
     * 使用者看到的名稱已改成：
     *
     * 指標
     *
     * 暫時不改 router key，
     * 避免破壞既有架構。
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
/* TW Module                                                                  */
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
     * 進入台股市場
     */
    activate(
      context = {}
    ) {

      isActive =
        true;


      if (
        isValidView(
          context.view
        )
      ) {
        activeView =
          context.view;
      }


      prepareSharedHostForView(
        activeView
      );


      return render(
        createTWMarketState()
      );
    },


    /*
     * 離開台股市場
     *
     * 非常重要：
     *
     * 必須先把共用 DOM 還原，
     * 才能安全交給 Crypto /
     * US / Forex。
     */
    deactivate() {

      isActive =
        false;

      restoreSharedMarketHost();
    },


    /*
     * 台股市場內：
     *
     * 首頁
     * 指標
     * 雷達
     *
     * 三個 View 的切換。
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
     * 保留既有同步狀態介面。
     */
    refresh() {

      return createTWMarketState();
    }

  });
