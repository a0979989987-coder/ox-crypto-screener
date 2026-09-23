(() => {
  "use strict";

  /*
   * OX Market Quick Switch
   *
   * 單擊 Radar：
   * → 正常進入 Radar
   *
   * 長按 Radar：
   * → 開啟橫向市場快捷列
   * → 保持按住往上滑
   * → 左右滑動選市場
   * → 放開切換
   *
   * 快速三擊 Radar：
   * → 回到上一個市場
   *
   * 這個模組不自己處理市場內容。
   * 真正的切換仍交給既有的：
   * window.OXMarketController.setMarket()
   */

  const CFG = {
    hold: 420,
    moveCancel: 20,
    tripleWindow: 650,
    gap: 16,
    hitSlop: 16,
    closeMs: 170
  };

  const MARKETS = [
    {
      id: "crypto",
      label: "Crypto"
    },
    {
      id: "us",
      label: "美股"
    },
    {
      id: "tw",
      label: "台股"
    },
    {
      id: "forex",
      label: "外匯"
    }
  ];

  const IDS =
    MARKETS.map(
      market => market.id
    );

  const MENU_ID =
    "ox-market-quick-switch";

  const STYLE_ID =
    "ox-market-quick-switch-style";

  const PREV_KEY =
    "ox-previous-market";

  let radar = null;
  let menu = null;

  let holdTimer = null;
  let closeTimer = null;

  let pointerId = null;

  let startX = 0;
  let startY = 0;

  let moved = false;
  let holding = false;

  let selected = null;

  let taps = [];

  const valid = id =>
    IDS.includes(id);

  /* --------------------------------------------------------- */
  /* Market state                                              */
  /* --------------------------------------------------------- */

  const currentMarket = () => {
    const bodyMarket =
      document.body
        ?.dataset
        ?.market;

    if (
      valid(bodyMarket)
    ) {
      return bodyMarket;
    }

    const stored =
      localStorage.getItem(
        "ox-active-market"
      );

    if (
      valid(stored)
    ) {
      return stored;
    }

    return "crypto";
  };

  let current =
    currentMarket();

  let previous =
    (() => {
      const stored =
        sessionStorage.getItem(
          PREV_KEY
        );

      if (
        valid(stored) &&
        stored !== current
      ) {
        return stored;
      }

      return null;
    })();

  /* --------------------------------------------------------- */
  /* Small haptic feedback                                     */
  /* --------------------------------------------------------- */

  function haptic(
    ms = 8
  ) {
    try {
      navigator.vibrate?.(
        ms
      );
    } catch {
      // 不支援震動就忽略
    }
  }

  /* --------------------------------------------------------- */
  /* Styles                                                    */
  /* --------------------------------------------------------- */

  function addStyles() {
    if (
      document.getElementById(
        STYLE_ID
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      STYLE_ID;

    style.textContent = `

#${MENU_ID} {

  position: fixed;

  z-index: 2147483000;

  left: 50%;

  bottom: 112px;

  width:
    min(
      352px,
      calc(100vw - 24px)
    );

  padding: 6px;

  box-sizing: border-box;

  border:
    1px solid
    rgba(177, 204, 230, .18);

  border-radius: 20px;

  background:
    linear-gradient(
      180deg,
      rgba(25, 39, 57, .90),
      rgba(8, 18, 30, .94)
    );

  box-shadow:
    0 18px 50px
    rgba(0, 0, 0, .42),

    inset 0 1px 0
    rgba(255, 255, 255, .08);

  backdrop-filter:
    blur(24px)
    saturate(145%);

  -webkit-backdrop-filter:
    blur(24px)
    saturate(145%);

  opacity: 0;

  visibility: hidden;

  pointer-events: none;

  user-select: none;

  -webkit-user-select: none;

  transform:
    translateX(-50%)
    translateY(14px)
    scale(.90);

  transform-origin:
    50% 100%;

  transition:
    opacity
    190ms
    cubic-bezier(.2,.8,.2,1),

    transform
    220ms
    cubic-bezier(.2,.85,.2,1),

    visibility
    0s
    linear
    220ms;
}


/*
 * 底部小箭頭
 */

#${MENU_ID}::after {

  content: "";

  position: absolute;

  left: 50%;

  bottom: -7px;

  width: 13px;

  height: 13px;

  background:
    rgba(9, 19, 31, .94);

  border-right:
    1px solid
    rgba(177, 204, 230, .16);

  border-bottom:
    1px solid
    rgba(177, 204, 230, .16);

  border-radius:
    0 0 3px 0;

  transform:
    translateX(-50%)
    rotate(45deg);
}


/*
 * 顯示
 */

#${MENU_ID}.is-open {

  opacity: 1;

  visibility: visible;

  pointer-events: auto;

  transform:
    translateX(-50%)
    translateY(0)
    scale(1);

  transition:
    opacity
    190ms
    cubic-bezier(.2,.8,.2,1),

    transform
    220ms
    cubic-bezier(.2,.85,.2,1),

    visibility
    0s;
}


/*
 * 收起動畫
 */

#${MENU_ID}.is-closing {

  opacity: 0;

  pointer-events: none;

  transform:
    translateX(-50%)
    translateY(8px)
    scale(.94);
}


/*
 * 四個市場橫向排列
 */

#${MENU_ID}
.ox-mqs-grid {

  position: relative;

  z-index: 1;

  display: grid;

  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );

  gap: 4px;
}


/*
 * 單一市場
 */

#${MENU_ID}
.ox-mqs-item {

  appearance: none;

  -webkit-appearance: none;

  height: 48px;

  min-width: 0;

  padding:
    0 7px;

  border:
    1px solid transparent;

  border-radius:
    15px;

  background:
    transparent;

  color:
    rgba(
      221,
      232,
      244,
      .74
    );

  font: inherit;

  font-size:
    12px;

  font-weight:
    760;

  cursor:
    pointer;

  transition:
    transform
    150ms ease,

    color
    150ms ease,

    background
    150ms ease,

    border-color
    150ms ease,

    box-shadow
    150ms ease;
}


#${MENU_ID}
.ox-mqs-inner {

  display: flex;

  align-items: center;

  justify-content: center;

  gap: 6px;

  height: 100%;

  white-space: nowrap;
}


/*
 * 市場狀態點
 */

#${MENU_ID}
.ox-mqs-dot {

  width: 6px;

  height: 6px;

  flex:
    0 0 6px;

  border-radius:
    50%;

  background:
    rgba(
      152,
      170,
      190,
      .38
    );

  transition:
    transform
    150ms ease,

    background
    150ms ease,

    box-shadow
    150ms ease;
}


/*
 * 目前所在市場
 */

#${MENU_ID}
.ox-mqs-item.is-current {

  color:
    rgba(
      246,
      224,
      176,
      .95
    );
}


#${MENU_ID}
.ox-mqs-item.is-current
.ox-mqs-dot {

  background:
    #f0bc54;

  box-shadow:
    0 0 10px
    rgba(
      240,
      188,
      84,
      .52
    );
}


/*
 * 手指目前滑到的市場
 */

#${MENU_ID}
.ox-mqs-item.is-selected {

  color:
    #f8d98e;

  background:
    linear-gradient(
      180deg,
      rgba(244, 192, 86, .17),
      rgba(244, 192, 86, .075)
    );

  border-color:
    rgba(
      244,
      192,
      86,
      .30
    );

  box-shadow:
    inset
    0 1px 0
    rgba(255,255,255,.08),

    0 7px 20px
    rgba(0,0,0,.13);

  transform:
    translateY(-1px)
    scale(1.035);
}


#${MENU_ID}
.ox-mqs-item.is-selected
.ox-mqs-dot {

  background:
    #f5bf55;

  transform:
    scale(1.15);

  box-shadow:
    0 0 12px
    rgba(
      245,
      191,
      85,
      .66
    );
}


/*
 * Radar 手勢區
 */

.dock-radar {

  touch-action:
    none !important;

  -webkit-touch-callout:
    none;

  user-select:
    none;

  -webkit-user-select:
    none;
}


/*
 * Radar 本身的動畫
 */

.dock-radar
.dock-radar-orb {

  transition:

    transform
    170ms
    cubic-bezier(.2,.8,.2,1),

    box-shadow
    170ms
    ease !important;
}


/*
 * 正在長按
 */

.dock-radar.ox-mqs-pressing
.dock-radar-orb {

  transform:
    translateX(-50%)
    scale(.94)
    !important;
}


/*
 * 選單打開
 */

body.ox-mqs-open
.dock-radar
.dock-radar-orb {

  transform:
    translateX(-50%)
    scale(1.02)
    !important;

  box-shadow:

    0 0 0 1px
    rgba(
      247,
      189,
      82,
      .38
    ),

    0 0 26px
    rgba(
      247,
      189,
      82,
      .52
    ),

    inset
    0 1px 8px
    rgba(
      255,
      255,
      255,
      .05
    )
    !important;
}


/*
 * Light Theme
 */

body.theme-light
#${MENU_ID} {

  border-color:
    rgba(
      87,
      111,
      139,
      .16
    );

  background:
    linear-gradient(
      180deg,
      rgba(
        255,
        255,
        255,
        .91
      ),
      rgba(
        239,
        245,
        251,
        .94
      )
    );

  box-shadow:

    0 18px 45px
    rgba(
      36,
      57,
      81,
      .18
    ),

    inset
    0 1px 0
    rgba(
      255,
      255,
      255,
      .90
    );
}


body.theme-light
#${MENU_ID}::after {

  background:
    rgba(
      240,
      246,
      251,
      .96
    );

  border-color:
    rgba(
      87,
      111,
      139,
      .13
    );
}


body.theme-light
#${MENU_ID}
.ox-mqs-item {

  color:
    rgba(
      45,
      66,
      91,
      .68
    );
}


body.theme-light
#${MENU_ID}
.ox-mqs-item.is-current,

body.theme-light
#${MENU_ID}
.ox-mqs-item.is-selected {

  color:
    #8c621c;
}


body.theme-light
#${MENU_ID}
.ox-mqs-item.is-selected {

  background:
    linear-gradient(
      180deg,
      rgba(
        217,
        165,
        62,
        .16
      ),
      rgba(
        217,
        165,
        62,
        .07
      )
    );

  border-color:
    rgba(
      185,
      132,
      43,
      .25
    );
}


/*
 * Mobile
 */

@media
(max-width:430px) {

  #${MENU_ID} {

    width:
      calc(
        100vw - 20px
      );

    padding:
      5px;

    border-radius:
      19px;
  }


  #${MENU_ID}
  .ox-mqs-grid {

    gap:
      3px;
  }


  #${MENU_ID}
  .ox-mqs-item {

    height:
      46px;

    padding:
      0 5px;

    border-radius:
      14px;

    font-size:
      11px;
  }

}


@media
(max-width:365px) {

  #${MENU_ID}
  .ox-mqs-item {

    font-size:
      10px;
  }

}


/*
 * Reduced Motion
 */

@media
(prefers-reduced-motion:reduce) {

  #${MENU_ID},

  #${MENU_ID}
  .ox-mqs-item,

  #${MENU_ID}
  .ox-mqs-dot,

  .dock-radar
  .dock-radar-orb {

    transition-duration:
      1ms !important;
  }

}

`;

    document.head.appendChild(
      style
    );
  }

  /* --------------------------------------------------------- */
  /* Build menu                                                */
  /* --------------------------------------------------------- */

  function buildMenu() {
    if (menu) {
      return;
    }

    menu =
      document.createElement(
        "div"
      );

    menu.id =
      MENU_ID;

    menu.setAttribute(
      "aria-hidden",
      "true"
    );

    menu.innerHTML = `
      <div class="ox-mqs-grid">

        ${MARKETS
          .map(
            market => `

              <button
                class="ox-mqs-item"
                type="button"
                data-market="${market.id}"
                aria-label="切換至${market.label}"
              >

                <span
                  class="ox-mqs-inner"
                >

                  <span
                    class="ox-mqs-dot"
                  ></span>

                  <span>
                    ${market.label}
                  </span>

                </span>

              </button>

            `
          )
          .join("")}

      </div>
    `;

    document.body.appendChild(
      menu
    );

    menu
      .querySelectorAll(
        ".ox-mqs-item"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            event => {

              event.preventDefault();

              event.stopPropagation();

              switchMarket(
                button.dataset.market
              );

              closeMenu();
            }
          );

        }
      );

    syncMenu();
  }

  /* --------------------------------------------------------- */
  /* Position                                                  */
  /* --------------------------------------------------------- */

  function positionMenu() {
    if (
      !radar ||
      !menu
    ) {
      return;
    }

    const rect =
      radar.getBoundingClientRect();

    menu.style.left =
      `${
        rect.left +
        rect.width / 2
      }px`;

    menu.style.bottom =
      `${
        Math.max(
          10,

          innerHeight -
          rect.top +
          CFG.gap
        )
      }px`;
  }

  /* --------------------------------------------------------- */
  /* Current market UI                                         */
  /* --------------------------------------------------------- */

  function syncMenu() {
    current =
      currentMarket();

    menu
      ?.querySelectorAll(
        ".ox-mqs-item"
      )
      .forEach(
        button => {

          button
            .classList
            .toggle(
              "is-current",

              button
                .dataset
                .market ===
                current
            );

        }
      );
  }

  /* --------------------------------------------------------- */
  /* Hover / slide selection                                   */
  /* --------------------------------------------------------- */

  function setSelected(
    id
  ) {
    const next =
      valid(id)
        ? id
        : null;

    if (
      selected ===
      next
    ) {
      return;
    }

    selected =
      next;

    menu
      ?.querySelectorAll(
        ".ox-mqs-item"
      )
      .forEach(
        button => {

          button
            .classList
            .toggle(
              "is-selected",

              button
                .dataset
                .market ===
                selected
            );

        }
      );

    if (selected) {
      haptic();
    }
  }

  /* --------------------------------------------------------- */
  /* Figure out which market finger is over                    */
  /* --------------------------------------------------------- */

  function marketAt(
    x,
    y
  ) {
    if (
      !menu
        ?.classList
        .contains(
          "is-open"
        )
    ) {
      return null;
    }

    const rect =
      menu.getBoundingClientRect();

    if (
      y <
        rect.top -
        CFG.hitSlop ||

      y >
        rect.bottom +
        CFG.hitSlop ||

      x <
        rect.left ||

      x >
        rect.right
    ) {
      return null;
    }

    const relative =
      Math.max(
        0,

        Math.min(
          rect.width - .001,

          x -
          rect.left
        )
      );

    const index =
      Math.floor(
        relative /
        rect.width *
        MARKETS.length
      );

    return (
      MARKETS[
        Math.min(
          MARKETS.length - 1,

          Math.max(
            0,
            index
          )
        )
      ].id
    );
  }

  /* --------------------------------------------------------- */
  /* Open                                                      */
  /* --------------------------------------------------------- */

  function openMenu() {
    clearTimeout(
      closeTimer
    );

    buildMenu();

    syncMenu();

    setSelected(
      null
    );

    positionMenu();

    holding =
      true;

    taps =
      [];

    radar
      .classList
      .remove(
        "ox-mqs-pressing"
      );

    document.body
      .classList
      .add(
        "ox-mqs-open"
      );

    menu
      .classList
      .remove(
        "is-closing"
      );

    menu.setAttribute(
      "aria-hidden",
      "false"
    );

    requestAnimationFrame(
      () => {

        menu
          .classList
          .add(
            "is-open"
          );

      }
    );

    haptic(
      12
    );
  }

  /* --------------------------------------------------------- */
  /* Close                                                     */
  /* --------------------------------------------------------- */

  function closeMenu(
    immediate = false
  ) {
    clearTimeout(
      holdTimer
    );

    clearTimeout(
      closeTimer
    );

    holdTimer =
      null;

    holding =
      false;

    setSelected(
      null
    );

    radar
      ?.classList
      .remove(
        "ox-mqs-pressing"
      );

    document.body
      .classList
      .remove(
        "ox-mqs-open"
      );

    if (!menu) {
      return;
    }

    if (immediate) {

      menu
        .classList
        .remove(
          "is-open",
          "is-closing"
        );

      menu.setAttribute(
        "aria-hidden",
        "true"
      );

      return;
    }

    menu
      .classList
      .add(
        "is-closing"
      );

    menu
      .classList
      .remove(
        "is-open"
      );

    menu.setAttribute(
      "aria-hidden",
      "true"
    );

    closeTimer =
      setTimeout(
        () => {

          menu
            ?.classList
            .remove(
              "is-closing"
            );

        },

        CFG.closeMs
      );
  }

  /* --------------------------------------------------------- */
  /* Existing MarketController                                 */
  /* --------------------------------------------------------- */

  function switchMarket(
    id
  ) {
    if (
      !valid(id)
    ) {
      return false;
    }

    if (
      id ===
      currentMarket()
    ) {
      return true;
    }

    const controller =
      window
        .OXMarketController;

    if (
      !controller
        ?.setMarket
    ) {

      console.warn(
        "[OX Quick Switch] OXMarketController.setMarket unavailable"
      );

      return false;
    }

    controller
      .setMarket(
        id
      );

    return true;
  }

  /* --------------------------------------------------------- */
  /* Normal Radar click                                        */
  /* --------------------------------------------------------- */

  function openRadar() {
    if (
      typeof
      window
        .switchAppView ===
      "function"
    ) {

      window
        .switchAppView(
          "radar"
        );

    }
  }

  /* --------------------------------------------------------- */
  /* Triple tap                                                */
  /* --------------------------------------------------------- */

  function goPrevious() {
    const now =
      currentMarket();

    if (
      !valid(previous) ||
      previous === now
    ) {

      window
        .showMarketToast
        ?.(
          "目前沒有上一個市場"
        );

      return;
    }

    switchMarket(
      previous
    );
  }

  function shortTap() {
    const now =
      performance.now();

    taps =
      taps.filter(
        timestamp =>
          now -
          timestamp <=
          CFG.tripleWindow
      );

    taps.push(
      now
    );

    /*
     * 單擊正常進 Radar
     */
    openRadar();

    /*
     * 三擊返回上一市場
     */
    if (
      taps.length >= 3 &&

      now -
      taps[
        taps.length - 3
      ] <=
      CFG.tripleWindow
    ) {

      taps =
        [];

      haptic(
        16
      );

      goPrevious();
    }
  }

  /* --------------------------------------------------------- */
  /* Pointer capture                                           */
  /* --------------------------------------------------------- */

  function releaseCapture() {
    if (
      pointerId !== null &&

      radar
        ?.hasPointerCapture
        ?.(pointerId)
    ) {

      try {

        radar
          .releasePointerCapture(
            pointerId
          );

      } catch {
        // ignore
      }
    }

    pointerId =
      null;
  }

  /* --------------------------------------------------------- */
  /* Pointer Down                                              */
  /* --------------------------------------------------------- */

  function onDown(
    event
  ) {
    if (
      pointerId !==
      null
    ) {
      return;
    }

    if (
      event.pointerType ===
        "mouse" &&

      event.button !==
        0
    ) {
      return;
    }

    event
      .preventDefault();

    pointerId =
      event.pointerId;

    startX =
      event.clientX;

    startY =
      event.clientY;

    moved =
      false;

    holding =
      false;

    selected =
      null;

    try {

      radar
        .setPointerCapture(
          event.pointerId
        );

    } catch {
      // ignore
    }

    radar
      .classList
      .add(
        "ox-mqs-pressing"
      );

    clearTimeout(
      holdTimer
    );

    holdTimer =
      setTimeout(
        openMenu,

        CFG.hold
      );
  }

  /* --------------------------------------------------------- */
  /* Pointer Move                                              */
  /* --------------------------------------------------------- */

  function onMove(
    event
  ) {
    if (
      event.pointerId !==
      pointerId
    ) {
      return;
    }

    const distance =
      Math.hypot(

        event.clientX -
        startX,

        event.clientY -
        startY
      );

    /*
     * 長按還沒成立以前
     * 如果移動太多
     * 就取消長按
     */

    if (
      !holding
    ) {

      if (
        distance >
        CFG.moveCancel
      ) {

        moved =
          true;

        clearTimeout(
          holdTimer
        );

        holdTimer =
          null;

        radar
          .classList
          .remove(
            "ox-mqs-pressing"
          );
      }

      return;
    }

    /*
     * 長按選單已經打開
     */

    event
      .preventDefault();

    setSelected(
      marketAt(
        event.clientX,
        event.clientY
      )
    );
  }

  /* --------------------------------------------------------- */
  /* Pointer Up                                                */
  /* --------------------------------------------------------- */

  function onUp(
    event
  ) {
    if (
      event.pointerId !==
      pointerId
    ) {
      return;
    }

    event
      .preventDefault();

    const wasHolding =
      holding;

    const choice =
      selected;

    const wasMoved =
      moved;

    clearTimeout(
      holdTimer
    );

    holdTimer =
      null;

    releaseCapture();

    radar
      .classList
      .remove(
        "ox-mqs-pressing"
      );

    /*
     * 長按模式
     */

    if (
      wasHolding
    ) {

      if (
        choice
      ) {

        switchMarket(
          choice
        );

      }

      closeMenu();

      return;
    }

    /*
     * 普通點擊
     */

    closeMenu(
      true
    );

    if (
      !wasMoved
    ) {

      shortTap();

    }
  }

  /* --------------------------------------------------------- */
  /* Cancel                                                    */
  /* --------------------------------------------------------- */

  function cancel() {
    clearTimeout(
      holdTimer
    );

    holdTimer =
      null;

    releaseCapture();

    closeMenu();
  }

  /* --------------------------------------------------------- */
  /* Bind                                                      */
  /* --------------------------------------------------------- */

  function bind() {
    radar =
      document.querySelector(
        ".app-dock .dock-radar[data-view-target='radar']"
      );

    if (
      !radar
    ) {
      return false;
    }

    if (
      radar
        .dataset
        .oxQuickSwitch ===
      "1"
    ) {
      return true;
    }

    radar
      .dataset
      .oxQuickSwitch =
      "1";

    addStyles();

    buildMenu();

    /*
     * Touch / mouse
     */

    radar
      .addEventListener(
        "pointerdown",
        onDown,
        {
          passive: false
        }
      );

    radar
      .addEventListener(
        "pointermove",
        onMove,
        {
          passive: false
        }
      );

    radar
      .addEventListener(
        "pointerup",
        onUp,
        {
          passive: false
        }
      );

    radar
      .addEventListener(
        "pointercancel",
        cancel,
        {
          passive: false
        }
      );

    /*
     * 防止手機長按跳出系統選單
     */

    radar
      .addEventListener(
        "contextmenu",
        event =>
          event
            .preventDefault()
      );

    /*
     * Radar 現在由 PointerUp
     * 統一處理點擊
     *
     * 避免既有 click handler
     * 又執行第二次
     */

    radar
      .addEventListener(
        "click",

        event => {

          event
            .preventDefault();

          event
            .stopImmediatePropagation();

        },

        true
      );

    /*
     * Keyboard fallback
     */

    radar
      .addEventListener(
        "keydown",

        event => {

          if (
            event.key ===
              "Enter" ||

            event.key ===
              " "
          ) {

            event
              .preventDefault();

            openRadar();

          }

          else if (
            event.key ===
            "ArrowUp"
          ) {

            event
              .preventDefault();

            openMenu();

          }

          else if (
            event.key ===
            "Escape"
          ) {

            closeMenu();

          }

        }
      );

    /*
     * 監聽整個網站的市場切換
     *
     * 不管是快捷選單
     * 還是其他市場切換按鈕
     * 都會記住上一個市場
     */

    document
      .addEventListener(
        "ox:marketchange",

        event => {

          const next =
            event
              .detail
              ?.market;

          if (
            !valid(next)
          ) {
            return;
          }

          if (
            next !==
            current
          ) {

            previous =
              current;

            sessionStorage
              .setItem(
                PREV_KEY,
                previous
              );

            current =
              next;
          }

          syncMenu();

        }
      );

    /*
     * 裝置尺寸改變
     */

    addEventListener(
      "resize",

      () => {

        if (
          menu
            ?.classList
            .contains(
              "is-open"
            )
        ) {

          positionMenu();

        }

      },

      {
        passive: true
      }
    );

    /*
     * 切去其他 App / 分頁
     */

    document
      .addEventListener(
        "visibilitychange",

        () => {

          if (
            document.hidden
          ) {

            cancel();

          }

        }
      );

    return true;
  }

  /* --------------------------------------------------------- */
  /* Init                                                      */
  /* --------------------------------------------------------- */

  function init() {
    if (
      bind()
    ) {
      return;
    }

    /*
     * 如果 Dock 比這支 JS 晚出現
     * 最多重新找 20 次
     */

    let tries =
      0;

    const timer =
      setInterval(
        () => {

          tries +=
            1;

          if (
            bind() ||
            tries >= 20
          ) {

            clearInterval(
              timer
            );

          }

        },

        150
      );
  }

  /* --------------------------------------------------------- */
  /* Debug API                                                 */
  /* --------------------------------------------------------- */

  window
    .OXMarketQuickSwitch =
    Object.freeze({

      open:
        openMenu,

      close:
        closeMenu,

      switchMarket,

      current:
        currentMarket,

      previous:
        () => previous

    });

  /* --------------------------------------------------------- */
  /* Boot                                                      */
  /* --------------------------------------------------------- */

  if (
    document.readyState ===
    "loading"
  ) {

    document
      .addEventListener(
        "DOMContentLoaded",
        init,
        {
          once: true
        }
      );

  } else {

    init();

  }

})();
