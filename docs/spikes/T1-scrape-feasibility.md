# T1 Spike：Playwright 爬取 Threads 可行性

- 日期：2026-11-20
- 環境：Windows 11、Python 3.12、Playwright 1.65.2（Chromium headless）
- 腳本：`spike/probe.py`、`spike/t1_scrape.py`、`spike/save_login_state.py`
- 結論：✅ **登入模式可穩定取得 ≥ 30 篇；未登入模式不足 30 篇。** PRD D1／F3 的「未登入 → 登入 fallback」設計成立。

## 結果

| 帳號 | 未登入（本人貼文） | 登入（本人貼文，目標 50） | 登入耗時 | 粉絲數 |
|---|---|---|---|---|
| zuck | 28 | 61 | 20s | 5,780,057 |
| mosseri | 17（另 6 篇非本人） | 57（另 8 篇非本人） | 20s | 1,062,479 |
| threads | 25 | 70 | 13s | 6,994,283 |

欄位覆蓋率（兩種模式皆同）：`taken_at`、`text`、`like_count`、`reply_count`、`repost_count`、`quote_count` 皆 100%；`view_count` 0%。

## 發現

1. **未登入有硬上限**：頁面載入即跳出登入彈窗，捲動不再載入新貼文；可取得的就是首屏（約 17–28 篇）。
2. **資料取得方式：攔截 JSON，不解析 DOM**。
   - 首屏約 5 篇在頁面內嵌 `<script type="application/json">`，其餘透過 `/graphql` 回應載入。
   - 貼文物件辨識：同時具有 `code`、`taken_at`、`like_count` 的 dict。
   - DOM 是虛擬列表（捲動後 `<time>` 數量反而變少），不適合計數或解析。JSON 方式較不受版面改動影響。
3. **欄位對應**：
   | PRD 欄位 | JSON 路徑 |
   |---|---|
   | post_id | `code` |
   | post_url | `https://www.threads.com/@{user.username}/post/{code}` |
   | published_at | `taken_at`（Unix 秒，UTC） |
   | text | `caption.text` |
   | likes | `like_count` |
   | replies | `text_post_app_info.direct_reply_count` |
   | reposts | `text_post_app_info.repost_count` |
   | quotes | `text_post_app_info.quote_count` |
   | views | `view_count`（公開與登入皆為 null） |
   | followers | 內嵌 JSON 中的 `follower_count` |
4. **畫面上的「轉發」數 = repost + quote**（例：zuck 某篇畫面顯示 58 = 49 + 9）。`reshare_count` 是分享次數，不屬於 PRD 欄位。
5. **需過濾非本人貼文**：個人頁會混入轉發他人的貼文，須以 `user.username` 等於目標帳號過濾。
6. **捲動會超過目標篇數**：每批 GraphQL 約 10–20 篇，最後一批會超過 `max_posts`；寫入前依 `taken_at` 排序後截斷。
7. **沙盒注意**：在 Claude 的沙盒內無法啟動有視窗的 Chromium；登入狀態需由使用者在自己的 PowerShell 執行 `save_login_state.py` 產生。

## 對 PRD 的影響（已同步 v0.3）
- F3 改為「攔截 JSON」作為主要資料取得方式，DOM 僅用於偵測登入牆／帳號不存在。
- F3 加入「過濾非本人貼文」與「依 taken_at 截斷至 max_posts」。
- 技術選型 Python 3.11 → 3.12。
- 預估：登入模式 30 篇約 20 秒，效能目標（P90 ≤ 5 分鐘）餘裕充足，瓶頸會在 GitHub Actions 冷啟動。

## 尚未驗證
- 帳號不存在、私人帳號的頁面判斷（留待 T7 實作時用測試帳號驗證）。
- 在 GitHub Actions（Linux、資料中心 IP）上執行的結果（T6a）。
- 登入狀態的有效期限。
