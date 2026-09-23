# OX v3.8.4 → v4.0 Modular-Classified RC2

## Completed migration steps

1. Verified the source against GitHub `main` commit `5cf05b01acca38509d0d885674e351ae144235ea`.
2. Preserved the exact 12,059-line, 599,218-byte v3.8.4 baseline.
3. Created `feature/refactor-modular-foundation` with granular rollback commits.
4. Added tested boundaries for config, events, state, utilities, storage and notifications.
5. Extracted all 15 inline CSS blocks and all 12 inline scripts without changing their content or order.
6. Added isolated market adapters for Crypto, US, TW and Forex.
7. Added the independent Forex module with real ECB reference-rate data, seven major pairs, currency strength, chart and radar views.
8. Classified the former Crypto runtime bundle into 14 ordered core/app/service/market/component files.
9. Classified the former stylesheet bundle into 30 ordered core/component/layout/navigation/theme/mobile/market/release files.
10. Removed runtime references to `src/legacy/`, `legacy.css` and the monolithic `ox-engine.js`.

## Preserved behavior

- Existing Crypto formulas, ranking rules, chart logic, alerts, providers and DOM ids were not rewritten.
- US and TW remain isolated placeholders and never receive Crypto or Forex data.
- Existing dark/light themes, mobile navigation, search, account preferences and notification UI remain in place.
- Runtime execution order and CSS cascade order remain byte-reconstructable from RC1.

## Verification status

- Unit tests: passed (6/6)
- JavaScript syntax checks: passed
- Local asset and HTML id checks: passed (57 assets, 195 unique ids)
- Original v3.8.4 extraction comparison: passed (15 CSS blocks, 12 scripts)
- RC1 classification reconstruction: passed (14 runtime modules, 30 stylesheets)
- Secret scan: passed; no embedded credentials found
- Automated browser run: passed with Playwright Chromium (Desktop 1440×1000 and Mobile 390×844)
- Browser console/runtime audit: passed with no page errors, console errors, local 404s, duplicate listeners or duplicate intervals
- CSS runtime audit: passed; all 30 classified CSS modules loaded in RC2 order (31 total stylesheets including the isolated Forex stylesheet)

## Step 4.5 regression gate

- Restored the physical `ox-logo.png` asset and verified it returns successfully.
- Increased light-theme BTC emblem and statistics contrast without changing the Home structure.
- Removed blur/filter effects from the mobile chart focus state.
- Bound the Radar summary glass to ranking direction: long/up is green and short/down is red.
- Confirmed Home, Strength, Radar, Crypto, US/TW placeholders, chart/timeframe/symbol switching, themes, Control Panel, search, notification UI and persisted preferences.
- Result: **REGRESSION GATE = PASS**

## Step 5 Forex Standard Module v1

- Added a self-contained Forex market model for seven primary pairs and four reserved cross-pair Radar candidates.
- Added UTC session classification, independent currency strength and Forex-only Radar Score.
- Replaced the legacy direct request with a no-secret Frankfurter/ECB provider adapter that normalizes the official v2 response.
- Forex reference data exposes derived daily candles only; volume and spread remain explicitly unavailable rather than fabricated.

## Step 6A US Standard Module v1

- Migrated the existing US placeholder boundary into its own config/data/logic/home/strength/radar/lifecycle files.
- Preserved the existing shared unavailable-market UI and backend-required status; no US market data, calculation or UI was invented.

## Step 6B TW Standard Module v1

- Migrated the existing TW placeholder boundary into isolated config/data/logic/home/strength/radar/lifecycle files.
- Preserved the shared unavailable-market UI and backend-required status; no TW data, calculation or UI was invented.

## Step 6C Crypto Standard Module v1

- Moved the Bitget public-data adapter into the Crypto market boundary without changing its content or classic-script order.
- Added config/home/strength/radar lifecycle boundaries while retaining the verified OX engine, scanner, chart, alerts and presentation modules unchanged.

## Step 7 Final System Regression + Security Audit

- Full Desktop/Mobile browser regression, build, extraction reconstruction and all twelve module tests passed.
- Runtime audit reported zero page errors, console errors, local asset 404s, duplicate listeners and duplicate intervals.
- Verified the 61-module local import graph has no missing imports or circular dependencies; the router remains lifecycle-only.
- Removed an unused legacy Forex config and corrected the historical Crypto extraction map to the current module path.
- Escaped provider error text before it is rendered in the Forex and liquidation status panels.
- No frontend API key, secret, token or private key was found. Test doubles remain confined to the test runner.
- Release note: the existing device-local account stores preferences and a password hash in LocalStorage; it does not store a service token, but should not be treated as server-backed authentication.

## Safe rollback points

- `7be7fb4`: exact OX v3.8.4 baseline
- `c986191`: modular skeleton
- `076ddbf`: tested core services
- `c9fe354`: CSS extraction
- `ed8df7a`: JavaScript extraction
- `b77e6d0`: Forex standard module
- `c11fdcb` / `v4.0-modular-foundation-rc1`: RC1 foundation
- `c31bf16`: Crypto runtime classification
- `226bd4e`: stylesheet layer classification
- `22e26a9`: base style domain classification
- `936c5d8` / `v4.0-modular-classified-rc2`: pre-gate RC2 rollback point
