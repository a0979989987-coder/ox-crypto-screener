# Feature access readiness — local candidate, 2026-10-05

Integrated baseline: origin/main 5fec3137c5a81670fe49f58e38e3a479f893f8fe (fixed for this verification round; includes PR100 and newer calendar changes). No production database writes, deployment, push or merge authorization is implied.

## Behavior

18 fixed product features have independent public/login settings. All initial values are public. Account, login, admin, UID bindings and private audit records are excluded from this catalog and retain their existing authorization checks. A login requirement accepts a validated registered account; it does not require Bitget membership, core status or a verified UID. Login returns to the requested market/tool; logout and unavailable policy block the selected protected product. Public alternatives remain selectable.

Admin changes require database-verified administrator status, explicit confirmation and a reason. Version checks reject concurrent stale writes; actor-scoped idempotency prevents duplicate audit entries. Audit is private and append-only. Policy refresh uses no-store requests, focus/visibility refresh and a 60-second interval.

Server gates cover TW home, radar, research/rotation, ETF and outlook/calendar API routes. These routes enforce no-store even when providers previously enabled public caching. Existing static snapshots, client computations, third-party public data and shared quotes/search/candles remain public resources. Hiding a product does not make those underlying public sources confidential. Catalog boundary labels expose this distinction.

The existing Bitget affiliate helper is unchanged. The new admin UI bridge is read-only, verifies administrator status, and defaults off via OX_BITGET_ADMIN_LOOKUP_ENABLED=false. Relationship/KYC results never establish UID ownership or grant access. Only synthetic responses were exercised in this round; no real Bitget queries were made.

## Release prerequisites — not executed

1. Existing Admin schema is already applied; do not rerun its migration. Production administrator bootstrap remains a separate owner action using the previously prepared private bootstrap artifact and verified owner identity.
2. Review and apply feature-access-schema-draft.sql against the existing project zczdxepbrczuyoobafep before deploying this code. This is a SQL draft, not an already-applied migration. Without it, policy reads return unavailable and product views fail closed.
3. Verify the anonymous catalog contains exactly 18 public defaults, audit tables remain private, member writes fail, and only the bootstrapped administrator can change a setting.
4. Obtain explicit release approval, then deploy the candidate and perform real Google, Email, return-to-feature, logout, and administrator acceptance checks. Historical real Google/member storage success does not establish real Email success or acceptance of this new candidate.
5. Enable the nonsecret Bitget rollout flag only when actual admin read-only testing is approved. Existing configured credentials remain untouched.

Google provider manual configuration, if still absent, belongs to the user: https://supabase.com/dashboard/project/zczdxepbrczuyoobafep/auth/providers → Google → client ID/client secret → save. OAuth callback remains https://zczdxepbrczuyoobafep.supabase.co/auth/v1/callback and production origin https://ox-crypto-screener.vercel.app. This round did not inspect or submit secret values or verify provider configuration changes.

## Local evidence

- Original local attachment matches SHA256 501a61ade6d39ca70bf12b04fa216f3d8588c1b33e6c851002c6ddd86f224e49, 1,172,044 bytes.
- npm test: 473 passed. npm run check: 99 assets, 173 IDs.
- Native PostgreSQL: 22 passed, including independent-client conflict handling, restricted executor ownership and fresh non-superuser migration application.
- Production-transport synthetic UI, local admin UI, dark/light desktop/mobile product access and actual calendar workspace/CSS, Account and Email synthetic UI passed. Calendar checks cover Taipei today initialization, closure markers, upcoming eight-day events, event detail dialogs, current-week saved-state migration and custom dates. Transport tests use actual router/handler/SDK/SQL with a synthetic provider; they are not real Google/Email acceptance.
- Latest calendar source is preserved; news/workspace.js differs from main only by the two feature-access hooks. No conflict remains against the fixed baseline. Bitget helper and radar/navigation implementation have no changes from the integrated base. Only the new admin adapter/UI and product entry guards were added.
