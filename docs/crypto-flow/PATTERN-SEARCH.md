# Crypto 型態搜尋

First Crypto indicator tab. Drawing board and exactly two result columns at all supported widths. Two primary controls live inside the board: timeframe multi-select (4H + 1H default), and a searchable pattern library ordered by common use. Clear-last-stroke is a small board control. Cards show actual candles, matched path, symbol, timeframe, similarity, original OX score, 24h USDT turnover (萬 / 億), and 24h return. Tapping a result opens its 200-candle dataset with pan/pinch/wheel zoom.

## Source and scope

Bitget v3 instruments must explicitly identify crypto, perpetual, online, USDT. The selected pool is the top 80 (optional 160 or all) eligible instruments with at least 3 million USDT 24h turnover. This is a disclosed observation pool, not all crypto. V2 tickers provide `usdtVolume`, `change24h` and timestamps. V2 market candles provide OHLC, base volume and quote turnover. Granularities: 15m, 30m, 1H, 4H, 1D. Each request asks for 200 bars; only complete, valid, continuous, current closed bars survive. No resampling or historical snapshot substitution in production.

The rate scheduler spaces new requests by 280ms with three in-flight symbol jobs, bounded retries, a 12-second request timeout and cancellation. Existing classic requests remain independently managed. Closed candles are cached until the next actual close boundary. Foreground scans repeat every five minutes; all requests and computation terminate on navigation/background. Failures are counted independently. No backend, key or paid data is required for this bounded public-API scan; a shared backend cache should replace per-user polling if concurrent usage grows.

Official endpoint definitions: https://www.bitget.com/docs/catalog/classic-contract-market/classic-contract-market and https://www.bitget.com/docs/catalog/market/market-data.

## Matching semantics

Price paths are normalized for price level/range and elapsed time. Forty samples are compared with DTW limited to four sample positions, aligned absolute error and endpoint error. Similarity = 100 × clamp(1 − 2.2 × (0.55 × normalized DTW cost + 0.30 × aligned error + 0.15 × endpoint error)). This is a versioned geometric score, not a statistical confidence or success rate. No accuracy claim has been established by forward testing.

Named geometric patterns additionally require alternating pivots. Local extrema use symmetric radii 2/3/5 bars, with a minimum swing of 0.65 average true range; outside bars with ambiguous high/low ordering are skipped. Candidate length is 16–141 bars and the ending pivot must be within the latest eight bars. For nonharmonic shapes, a final closed price can complete the visible path; it is not a promise of breakout. Shape similarity (60%) and actual close path similarity (40%) are combined. Geometric structures require >=78; harmonic candidates >=72 plus all ratio gates. Custom paths scan recent 21–141 bar windows ending within three bars, with a >=78 score gate. No top-N padding if no matches.

W/M require similar troughs/peaks (<=18% of range), a substantial neckline, and terminal return near the neckline. Head-and-shoulders require distinct heads and matching shoulders/necklines. Triangle/channel/wedge filters regress the high/low envelopes and test slope, convergence, expansion or parallelism. Flags/pennants additionally require an impulse leg. Generic cup/rounding/retest variants are explicitly path comparisons, not full textbook-pattern certification with volume or preceding trend requirements.

Harmonic targets additionally validate AB/XA, BC/AB, CD/BC, AD/XA and CD/AB where applicable. Fixed-ratio tolerance is relative ±5%; interval constraints are hard boundaries. Four-point AB=CD variants use their corresponding three ratios. Both directional variants are provided. This is independent code and original schematic drawing; no source diagrams or proprietary signal outputs are copied. Reference definitions: https://harmonictrader.com/harmonic-patterns/ (Gartley, Bat, Butterfly, Crab, Deep Crab, Alternate Bat, AB=CD).

Freehand strokes are mapped from canvas coordinates to elapsed-time/price direction. Two boundary strokes can form an alternating envelope query. A common pattern name is inferred only above a 90 geometric alignment score (two boundaries: 83); otherwise the query remains a custom path. Hand drawings are never labelled as harmonic by visual resemblance alone. The selected preset is always visible and replaceable.

OX scoring calls the preserved classic `OXEngine` with the original `CONFIG.weights`, 1H closed bars and the complete validated crypto ticker ranking universe. OX is separate from similarity; missing engine/hourly data displays —, not an invented replacement. Ties in similarity are broken by OX score, then turnover. Current closed-bar scores can differ from a classic radar observation made on an unfinished candle or at an earlier time.

## Isolation and performance

Only `analytics/entry.js` and its URL in `index.html` change existing integration. The new module has a ShadowRoot and separate source cache. It does not write OX classic state, change ranking constants or add content to other markets. Math runs in a module Worker with a bounded main-thread fallback. Card canvases initialize on intersection; only 24 cards initially mount and more are requested in batches. Animations occur only on dialog opening; reduced-motion is honored. Chart/canvas listeners, observers, Workers, RAFs, timers and dialogs dispose on unmount.

## Verification

`node --test tests/crypto-patterns.test.mjs`: explicit synthetic positive/negative fixtures, ratio gates, W vs M and stale pattern rejection, missing/unclosed candle rejection, universe isolation and ranking.

`node scripts/test-crypto-patterns.cjs`: mobile/desktop UI using original recorded Bitget responses and the original capture time (never a fake current timestamp); preset filtering, default 4H/1H, two columns, OX adapter, freehand matching to a known real interval, pinch, navigation teardown and market isolation. Records are intercepted only in the test process.

`node scripts/validate-pattern-feed.mjs`: read-only live endpoint/CORS and closed-candle validation on six current liquid contracts × two default frames. GitHub Actions stores responses for audit, not as runtime fallback or a substitute for realtime access. Runtime remains direct browser REST.
