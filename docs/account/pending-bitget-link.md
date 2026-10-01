# Bitget UID 待驗證連結（未發布）

分支 `codex/member-bitget-pending`，起點 main `9b879ad`。這版是會員自己保存一個待驗證 UID；不是已證明持有 Bitget 帳號，也不是會員資格認證。既有 Affiliate POC 與所有行情功能未改動。

## 已實作

- 會員中心讀取、保存、更換與移除 UID；登出清除顯示；資料服務未就緒時禁用保存，沒有假資料成功畫面。
- `/api/v1/account/bitget-link` GET／POST 使用經 Supabase 驗證的 OX identity 與使用者 JWT。沿用已存在 account dispatcher，仍是 12 個 Vercel functions。
- POST 要求同源 JSON，拒絕任意 account ID、ownership／KYC／qualification 欄位。新 UID 是字串正整數（至多20位），不轉成可能失真的 Number。
- 新增資料表與 security-invoker RPC migration，完全不讀 service-role key。RLS／column grants 只允許本人待驗證紀錄；ownership_status 的 DB constraint 固定 pending，不能改成 verified。
- 一位會員只有一筆待驗證連結。保存相同 UID 為冪等；改 UID 更新 revision；過時分頁修改／移除得到409並重新讀取。

## UID 唯一性與持有權

未驗證的 UID 不全域獨占：否則任意人先填入另一人的 UID 就能搶占，阻擋真正持有人。多位會員可以聲明同一待驗證 UID，但不能看到其他聲明者，也不取得任何資格。**真正持有權驗證及「已驗證 UID 全域唯一」尚未實作**；需先選定可信持有權證明與爭議處理流程，再另行設計 migration，不能把現在的 pending 改名當成 verified。

目前沒有可用的 Bitget 持有權驗證機制。Affiliate 代理／KYC 查詢只能說明該 UID 的觀測資料，不能證明目前 OX 會員持有它。因此既有有權維運查詢入口保留；新會員 endpoint 不接受任意 UID 去讀別人的推薦／KYC 明細，也不新增金鑰或第三方授權。

代理未查到不等於不合格；90天單次窗口沒有紀錄不等於未通過；子代理／歷史關係不推論為已確認。新待驗證連結永遠回 `affiliateStatus=not_checked`、`kycStatus=not_checked`、`subAffiliateStatus=unknown`、`eligibility=unverified`、`accessPolicyChanged=false`。現有 Affiliate fixture 對未查到、窗口／未知與矛盾回應的保守測試保持通過；沒有重做 POC 或修改既有查詢行為。

## 安全驗證與限制

`npm test`: 287/287 通過。`node scripts/check-build.mjs`: 93 assets、171 IDs。`node scripts/account-ui-check.mjs`、桌面／390x844手機 e2e、合成 Cookie 檢查通過。

`tests/bitget-link-db.test.mjs` 使用 dev-only PGlite（真正 PostgreSQL/WASM、本機記憶體）實際執行 migration，驗證 RLS、匿名拒絕、跨會員存取／寫入限制、不可升級持有權、重綁／移除版本衝突與格式檢查。不是正式 Supabase 測試。引擎只有單一連線，所以多客戶端同時 transaction 的 lock 行為仍需 staging PostgreSQL 驗收；已測 sequential stale-revision 衝突。API／UI 測試使用合成身份，不能當作真人 UID 保存成功。

## 審查後才執行的下一步

1. 審查 `server/account/migrations/001_pending_bitget_links.sql`，確認採用上述不搶占的 pending 策略。
2. 獲准後才在既有 Supabase 專案執行一次 migration，驗證真實 RLS／revision 行為。不要重新執行原 `schema.sql`。
3. 另確認發布，保留當時最新 main；真人測試本人 UID 保存、重讀、重綁與移除。不要啟用權限分級。

本輪未執行正式 migration、未寫正式會員／UID、未推送或部署。原 Google 真人登入與會員資料儲存已由母任務的日誌與畫面證實；使用者也已確認重新整理仍正常登入。不需要重配 OAuth。
