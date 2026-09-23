# GitHub 上傳步驟

目前交付版本是 `v4.0-modular-classified-rc2`，請先放在測試 branch，不要直接覆蓋 `main`。

1. 在 GitHub repository `a0979989987-coder/ox-crypto-screener` 建立 branch：`feature/refactor-modular-foundation`。
2. 將交付 ZIP 解壓縮。
3. 把 `index.html`、`src/`、`scripts/`、`tests/`、`package.json`、`README.md`、`ARCHITECTURE.md` 與 `MIGRATION_REPORT.md` 上傳到該 branch。
4. 原 repository 的 `ox-logo.png` 不需修改或刪除。
5. 在 branch 預覽中依序測試 Crypto、US、TW、Forex，以及手機／電腦、黑／白主題。
6. 驗證完成後再建立 Pull Request，不要直接合併。

## 回滾

如果 branch 預覽有問題，直接刪除 `feature/refactor-modular-foundation` 即可，現有 `main` v3.8.4 不受影響。
