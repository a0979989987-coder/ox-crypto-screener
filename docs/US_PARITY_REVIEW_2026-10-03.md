# US native OX parity review — 2026-10-03

## Release status

**Not a complete public US-market release.** Native UI integration is ready for review, but an authorized automatic public OHLCV source has not been connected. This branch must not be presented as an automatically updating US product. It does not restore intraday data, add Twelve Data, purchase a service, or publish the private validation dataset.

Initial base: `f0faf91009120942dcd258c0914193c2788785c6`. Latest main `941b3ed2984a9ce1c8cf405504a11d2fc485c94e` was also incorporated, preserving its centered mobile Crypto tabs and news-source removal. The adjacent script-version conflict retains both the new US entry and latest Crypto entry. Existing Crypto, Taiwan, news, and account work is preserved.

## Changes

- US pattern search now mounts the same component as Crypto, with the pattern catalog, counts, whole-board freehand input, T1/T2/T3, detailed charts, cached searches, and timeframe-preserving radar navigation. US data is limited to completed daily, weekly, and monthly bars. Short histories remain viewable but do not become eligible scan results.
- US bubbles now mount the same component as Crypto, with real closing change, volume, relative volume, average estimated traded value, quantity selection, watch scope, direction filters, details, gestures, and radar navigation. Unsupported intraday flow and market-cap values are not invented.
- The home page uses the Crypto chart, paired candidate columns, gauges, and analysis-card arrangement. Market breadth explicitly describes the available stock pool; it is not a claim to cover the entire US market. The gauges show advancing-stock and above-20-day-average ratios computed from actual data.
- The radar displays actual company names, prices, and daily changes; scanner collapse, selected-frame watch rows, source replacement, header updates, and refresh failures are handled consistently.
- Snapshot freshness follows completed New York sessions, including weekends, holidays, and early closes. Stale valid data is retained and labelled as awaiting an update.
- Pattern caches are separated by data scope and snapshot generation. Replacing even an identically dated private file invalidates its prior results; dynamic sessions retain only the two most recent datasets.

## Validation

- `npm test`: 76 test files passed.
- `npm run check`: passed, 96 local assets and 171 unique IDs.
- `git diff --check`: passed.
- After incorporating latest main, the 76 test files and build check passed again. Its mobile-tool-rail browser regression also passed at 320/375/390/430/600/1363px.
- Genuine private EOD acceptance uses 335 symbols dated 2026-09-30. It is deliberately marked stale on 2026-10-03. This is neither current automatic data nor proof of whole-market coverage.
- Browser acceptance: 390px, 430px, and 1366px passed. The desktop freehand assertion checks that a completed path searches the index; recognizing a named preset is not required for a valid sketch.
- Acceptance verifies exact SPY closing values, 400 daily / 91 weekly / 21 monthly bars, native cyan/red OX candles, scanner controls, persisted drawings, home candidates, shared bubbles, shared pattern counts/details/freehand search, selected-frame navigation, reload recovery, invalid-file preservation, no horizontal overflow, no runtime errors, no file uploads, and no raw-US-backend calls after import.
- The raw file and screenshots containing it remain outside the public repository.

The existing `test-crypto-patterns.cjs`, `test-crypto-bubbles.cjs`, and `test-tw-bubbles.cjs` scripts stop at the same assertions on this branch and the exact base commit: an empty score expectation, a paused-physics movement expectation, and an obsolete three-tab expectation (current Taiwan has five). Checks before those stop points found no new failure; later assertions remain unexercised. They are not reported as full regression passes.

One unrelated test fixture was made stable: the Taiwan 05:30 briefing test now chooses the day after its checked-in seed instead of a fixed date that becomes older than daily refreshed data. Taiwan production code is unchanged.

## Remaining public-data work

No checked source currently satisfies this project's no-purchase constraint while demonstrably permitting automatic public native charts, historical retention, browser delivery, and derived scans. Publicly reachable data and higher request quotas do not themselves establish those permissions.

Alpha Vantage's verified-project program is a possible no-cost lead, not an approved source. The concrete, unsent inquiry is in [US_PUBLIC_DATA_REQUEST.md](US_PUBLIC_DATA_REQUEST.md). Owner authorization is required before contacting the provider; the inquiry makes no paid commitment, contract acceptance, or open-source-license change.

After a suitable source is confirmed: validate actual feed coverage and history, implement and verify its server-side collection/retention limits, generate a current complete-session snapshot, exercise automatic refresh and failure recovery, run public-mode end-to-end acceptance, then deploy. The private-file route is retained as an optional personal feature and is not the completion criterion for the requested public product.
