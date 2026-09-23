# OX Market Command Center

OX v4.0 modular-classified RC2, migrated incrementally from the verified OX v3.8.4 baseline.

## Markets

- Crypto: existing v3.8.4 behavior preserved and classified into ordered runtime modules
- US: existing market switch and isolated placeholder adapter preserved
- TW: existing market switch and isolated placeholder adapter preserved
- Forex: independent standard module using Frankfurter / ECB reference rates

The complete file map and load-order rules are documented in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Run locally

Serve the repository with any static HTTP server. ES modules do not run correctly from a `file://` URL.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Verification

```bash
npm test
npm run check
npm run verify:extraction
```

`npm run test:e2e` additionally requires a locally installed Playwright Chromium browser.

## Rollback

The migration branch is `feature/refactor-modular-foundation`. The preserved v3.8.4 baseline is local commit `7be7fb4`; RC1 is tag `v4.0-modular-foundation-rc1`.
