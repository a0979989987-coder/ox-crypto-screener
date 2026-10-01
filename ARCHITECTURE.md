# OX v4.0 Architecture

## Entry points

- `index.html`: document shell, semantic content and ordered asset loading
- `src/app/app.js`: ES-module market registration and routing entry
- `src/app/runtime-boot.js`: preserved browser runtime boot sequence

## Runtime classification

| Area | Location | Responsibility |
| --- | --- | --- |
| Core | `src/core/` | Runtime config, event bus, state and utilities |
| App | `src/app/` | Boot, view/home/theme coordination and market routing |
| Services | `src/services/` | Storage, notifications and market data adapters |
| Components | `src/components/` | Account, alerts, chart, control panel, layout, motion, navigation, search and strength UI |


## Style classification

| Area | Location | Responsibility |
| --- | --- | --- |
| Core | `src/styles/core/` | Tokens, reset and baseline primitives |
| Components | `src/styles/components/` | Feature-specific surfaces |
| Layout | `src/styles/layout/` | Page shells, header and responsive layouts |
| Navigation | `src/styles/navigation/` | Bottom dock variants |
| Themes | `src/styles/themes/` | Glass and light-theme layers |
| Mobile | `src/styles/mobile/` | Mobile-specific interaction/layout layers |
| Releases | `src/styles/releases/` | Compatibility refinements retained in cascade order |

All 30 stylesheets remain linked in the same cascade order as the verified source. No inline style or script blocks remain in `index.html`.

## Market isolation

- Crypto owns its Bitget adapter plus config/home/strength/radar lifecycle boundaries under `src/markets/crypto/`; its completed v3.8.4 engine, scanner, chart, alerts and presentation behavior remain byte-preserved.

## Change rule

Make one small change inside the owning directory, run all verification commands, and commit before moving to another area. Do not reorder classic runtime scripts or stylesheet links without an explicit cascade/dependency migration.
