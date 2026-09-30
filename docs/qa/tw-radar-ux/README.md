# OX TW Radar UI / UX rework

Baseline and rollback point: `310be375cab6e3dcb53628fd50b1a43dde587fdd`.
Preview branch: `feat/tw-radar-ux-rework`. No main/production deployment.

## Component mapping

| TW | Crypto source | Integration |
| --- | --- | --- |
| Quote strip | `.compact-summary`, `.market-line-card` | Clone actual DOM, namespace IDs; three real TW quote fields, no OX score |
| Workspace | `.workspace`, `.chart-box`, `#radar-scanner-panel` | Same DOM tracks and actual CSS cascade/media queries; collapse keeps chart mounted |
| Timeframes | `.chart-timeframe-strip`, `.btn-tf`, glass marker/preferences | Same presentation/selection interaction, seven supported TW frames only |
| Indicators | `.chart-tool-actions`, `.chart-tools-overlay`, indicator options | TW volume/high-low settings, chart reset and native fullscreen; no strategy rewrite |
| Results | `.coin-card`, `.coin-top`, `.coin-mid`, `.coin-mobile-bottom` | Price replaces Crypto score slot, genuine turnover; no score/progress decorations |
| Tier/volume/watch/direction | `.scanner-tabs`, combined radar mark | Actual cloned icons and tabs, actual TW counts, red-long/green-short |
| Drawing/gestures | `OXChartDrawings`, `OXChartGestures` | Existing factories, TW-only state/storage/lifecycle |
| Search | No independent Crypto radar search component exists | Necessary TW search retained as a compact input using common tokens; not claimed as reuse of an absent component |
| TW categories | Existing TW mode rail | Five entries preserved; update existing shell instead of rebuilding page |

`market-workspace.js` copies only radar-specific CSS declarations into a TW namespaced surface. It retains the baseline's exact sizes, cascade, media queries and motion. Quote columns are limited to the three real TW fields using the source proportions, so the removed Crypto analysis cells do not leave empty tracks. Crypto DOM, styles and handlers are never mutated. TW extensions replace the previous conflicting chart-radar stylesheet instead of appending overrides. Existing inherited `!important` declarations remain source-owned; no new TW `!important` patches were added.

## Data and function invariants

No changes to APIs/providers, ranking model, timeframe aggregation or candidate counts. Stock pool, genuine date, official non-realtime state, T1/T2/T3 vs WATCH semantics, risk/disposition/release fields and watchlist are preserved. Chart and quote colors are scoped red-up/green-down. No fictitious data, minute frames, score, countdown or strategy-validation claims added.

## State fixes (separate from presentation)

- Keyed result reconciliation preserves list scroll and does not select a stock on star click.
- Chart instance survives search, favorites and list updates.
- Tier hold opens at 2 seconds before release; movement and scrolling cancel the hold.
- Abort/serial guard prevents stale stock/frame results.
- Visible range is saved per stock/timeframe; drawings keep their existing TW scope.
- Category switch refreshes existing shell, preserving the navigation and OX LIVE host.
- ResizeObserver limits scanner to actual chart height; list scrolls independently.
- Radar shell reserves bottom dock/safe-area space.
- Destruction releases gesture/drawing subscriptions, chart, requests, timers and ResizeObserver.

## Verification

Run `npm test`, `npm run check`, `node scripts/verify-tw-radar-ux.cjs`.
The browser harness uses actual Lightweight Charts and actual production API responses, not fabricated or transport-fixture market data. Local static assets run on port 4186; API transport is forwarded read-only to production. `OX_QA_URL` selects a deployed preview. `OX_QA_BEFORE=1` captures the unchanged production TW layout.

155 unit tests passed. Build reference/ID check passed. Before/after and Crypto screenshots are provided for 390px, 430px and 1440px CSS viewports. Chart width, scanner width and toolbar height are matched through explicit geometry assertions. Seven frames, stock selection, favorite isolation/scroll preservation, 50-name turnover pool, timeframe/indicator menus, collapse/expand, genuine drawing storage and mobile pinch are exercised.

| CSS viewport | Chart / scanner track | Chart height | Toolbar height |
| --- | --- | --- | --- |
| 390 | 235 / 124 px | 524 px | 38 px |
| 430 | 275 / 124 px | 524 px | 38 px |
| 1440 | 958 / 390 px | 600 px | 38 px |

TW's additional categories/search are required functionality; they remain above the same workspace rather than being removed to fake an identical total top offset. TW prices replace the unavailable/removed score slot and no extra fake analysis rows are inserted.

## Limits / remaining verification

Chromium touchscreen emulation is not native iPhone/iPad Safari. Device-specific viewport rotation, native browser fullscreen behavior, physical price-axis gestures and low-memory performance require real-device verification. Error/empty messages are distinct in code; this run does not claim every upstream outage/holiday path was reproduced. Forecast/strategy accuracy and risk-pool completeness are outside this UI task. Official daily snapshots are not realtime quotes. The preview is for user confirmation before any merge/release.
