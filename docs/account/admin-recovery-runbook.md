# OX admin release recovery

2026-10-02: production v3 migration succeeded per parent; bootstrap remains blocked by connector `Invalid or expired requestState`. Parent read-only check at 09:08 UTC: active admins 0, ordinary_configured false. Do not infer bootstrap success or retry writes through another tool.

## Preserved release

PR #80 stays draft, remote tested head e47aa09. Local branch codex/admin-review-release additionally integrates main a3e47ff (ETF, savings, news and market changes preserved). Local follow-up is not pushed while quota is blocked, because pushes can trigger Vercel preview deployments.

Public bootstrap contains only REPLACE_WITH_VERIFIED_GOOGLE_EMAIL. Real-account bootstrap stays in private Library OX-Admin-production-SQL-v3.zip, library ID libfile_2b498d195140819183f4fc1e2b15240d, version 2. It verifies one confirmed auth.users email, the same verified Google identity email, an existing OX account, and no other active admin. No UID approvals are created. Never paste real account details into public PRs or logs.

## Deployment evidence

GitHub Vercel statuses all report `Deployment rate limited — retry in 24 hours.`:
- 12022a62: 2026-10-02 08:09:08 UTC.
- PR81 merge a1e2782: 2026-10-02 08:55:51 UTC.
- main a3e47ff: 2026-10-02 09:05:16 UTC.

Official limit: Hobby 100 deployments per 86400 seconds, owner scoped; Git-triggered previews also consume quota. These failure timestamps do not establish the precise reset timestamp. No rate-limit reset header is available here. A conservative read-only recheck after 2026-10-03 09:05:16 UTC is a checkpoint, not a guaranteed reset. Use the account's actual reset/remaining evidence when available. Do not redeploy, push retries, buy upgrades, or change accounts to bypass the limit.

Evidence URLs:
- https://api.github.com/repos/a0979989987-coder/ox-crypto-screener/commits/a3e47ff77e4e8cb974e8e653462c6cc1ec0bd59f/statuses
- https://vercel.com/docs/limits

## Resume only after the blockers are resolved

1. Parent reads current private admin/policy status before any write. If bootstrap is still absent, restore the original connector request state/authorization, then execute the private transactional bootstrap once through that supported route. This agent does not attempt a different tool or duplicate writes.
2. Verify exactly one intended active admin, ordinary_configured true with empty ordinary capabilities, exclusive_uid true, core catalog all_member_features; no new real approvals/audit rows. Verify anonymous RPC false, authenticated RPC true, restricted executor attributes and immutable audit privileges. Do not rerun the successful migration.
3. Read the quota reset/remaining state without starting a deployment. When deployment is available and DB-ready is confirmed, fetch latest main, integrate/retest locally, push one consolidated candidate update, review PR, then merge/release once. Retain latest ETF/news/market features.
4. Confirm the production deployment SHA and READY state, then validate real Google admin session and the account-center admin entry. Open /previews/account-admin/ and read status/records only; guest/member must be rejected and synthetic session buttons must be hidden. Do not approve example UIDs or the owner's saved UID automatically. Email real delivery remains untested until an explicitly initiated email flow is completed.

## Routes and rights

Static admin page switches outside localhost to /api/v1/account/admin-review. Actual api/v1/account/[endpoint].js dispatches to Account handler; provider getUser validates HttpOnly-cookie token, the SDK passes that same member JWT to ox_admin_review_rpc, and the DB rechecks private admin membership. Production transport UI test exercises this actual router/handler/SDK/SQL with synthetic provider data, not a production OAuth success claim.

Account center shows admin entry only after admin status succeeds; epoch guards discard stale role responses. Ordinary approval is recorded with zero added capabilities. Core records all_member_features without admin rights or financial transaction permissions. Current public markets remain public; no gates were added.

## Emergency disable

Use docs/account/admin-release/04-disable.sql only if separately needed: deactivate admins as trusted table owner, SET LOCAL ROLE executor and revoke authenticated RPC, retain claims/approvals/audit. Keep current public market access unchanged. Re-enable only with reviewed owner ACL and intended admin verification.

## Completed local QA

After integrating main a3e47ff: 488/488 full tests, 17/17 native PostgreSQL tests, build 96 assets/171 unique IDs, Account UI (including admin visibility and stale-admin logout response), synthetic local admin UI, and production transport router/handler/SDK/SQL UI all passed. Independent security review passed. These follow-up commits are local only; remote PR #80 remains draft at e47aa09. Google real success is retained from prior validation; Email real login and post-bootstrap production admin acceptance remain untested.
