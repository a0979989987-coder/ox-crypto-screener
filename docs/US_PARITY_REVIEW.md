# US / Crypto parity review — 2026-09-30

## Acceptance: not complete

The user's reference is the actual Crypto interface, not a similarly styled
TradingView embed. This change repairs the specific chart-left / list-right
regression. It is **not** acceptance of the complete US 2.0 project, and is
preview-only. Production remains at `d2431a97ef60280595d4924380904ed3807291fb`.

## Verified presentation baseline

Crypto markup and styles at `d2431a9`, checked against the supplied phone
reference. No Crypto CSS declarations, controls, engine or state are changed.
The US host already uses `.workspace`, `.chart-box`, `.scanner-tabs` and
`.coin-card`; the widget-specific `display:flex; flex-direction:column`
override was incorrectly bypassing that shared grid.

Removed the stacked widget/error overrides. The widget stage now uses the
same `.chart-container` sizing as Crypto, and the right panel stretches to
the chart height with its own scrolling body. List folding continues to use
the existing `.ox-scanner-collapsed` grid transition. Fullscreen remains a
separate control, exposed in folded mode just as in Crypto.

## Geometry results

Isolated browser UI tests at a viewport height of 932px (not live-market
verification). `scripts/test-us-radar-layout.cjs` also checks collapse,
reopen, short press, the 2-second long press, and the direction control.

| Width | Crypto tracks | US tracks | Chart stage | Toolbar | Page overflow |
| --- | --- | --- | --- | --- | --- |
| 360 | 215 / 114 | 215 / 114 | 612 | 38 | 0 |
| 390 | 235 / 124 | 235 / 124 | 612 | 38 | 0 |
| 430 | 275 / 124 | 275 / 124 | 612 | 38 | 0 |
| 768 | 728 | 728 | 480 | 38 | 0 |
| 1366 | 884 / 390 | 884 / 390 | 600 | 38 | 0 |

The 768px single-column tablet breakpoint is the current Crypto baseline;
it is not a new US breakpoint. On phones, the right column stays 114/124px.
At 390px, folding expands the chart from 235px to 366px without replacing
the provider frame, then reopening restores the original column position.

## Blocking functional differences

The configured source is the official free TradingView display widget, not
a raw stock-market data API. `FREE_US_DISPLAY.rawDataAvailable` is false;
the service deliberately returns `RAW_DATA_UNAVAILABLE` for raw chart/quote
requests and no synthetic scan results.

Consequently the widget cannot supply the OX-native external price/volume
strip, Crypto-native chart and persistent drawings, actual OX radar scans,
pattern-board searches, bubble/heatmap/relative-strength analyses or full
home-page market content. The existing raw-data adapter and US engine are
preserved, but no enabled source with verified public-display permissions
currently supplies them. The widget's green/red candles and internal controls
also do not provide exact Crypto presentation parity.

Do not scrape the iframe, assert unverified redistribution rights, invent
quotes/candles/candidates, buy a plan, or merge this preview to production as
if the complete acceptance criteria passed. Resume full parity only when a
raw OHLCV source and its public-display rights are actually available.

Official limitation: https://www.tradingview.com/widget-docs/faq/data/

Physical iPhone testing and full five-page/live-data parity are not passed.
