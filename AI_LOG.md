# AI_LOG

記錄本專案與 AI coding assistant（Claude Code）協作的過程。

## 1. 如何向 AI 描述需求
- 先提供考題文件，要求 AI 依考題的 PRD 要求產出 `docs/PRD.md`，再由我回覆關鍵決策：資料來源（只用 Playwright、不用 mock data）、分組規則（互動分數三分位數）、LLM（接 Groq，規則模板備援）、Worker 執行位置（有更好的做法可以 → GitHub Actions）。
- 每次只交付一個 PRD 拆解任務（T1、T2…），以 PRD 的驗收條件（Given/When/Then）作為完成定義；沒有驗收條件的任務先補上再開發。
- 涉及帳號、金鑰、正式資料庫的動作（產生 Threads 登入狀態、推送 migration、建立 GitHub／Vercel 設定）由 AI 停下來說明，我確認或親自操作。

## 2. AI 產生了哪些程式碼
| 任務 | 產出 |
|---|---|
| PRD | `docs/PRD.md` v0.1–v0.4 |
| T1 | `spike/*.py`、`docs/spikes/T1-scrape-feasibility.md` |
| T2 | Next.js 骨架、`worker/` CLI 骨架、`.env.example`、README |
| T3 | `supabase/migrations/*`（資料表、RLS、權限）、`tests/integration/test_rls.py` |
| T4 | 登入／註冊 server actions、`src/proxy.ts`、`tests/e2e/test_auth.py` |
| T5–T6 | 建立任務、任務清單、進度輪詢、`worker/db.py`、`worker/pipeline.py`、Worker 觸發 |
| T7–T8 | `worker/scraper.py`（攔截 JSON、登入 fallback、錯誤分類）、`worker/cleaning.py` |
| T9–T10 | `worker/metrics.py`、`worker/nlp.py`、`worker/insights.py`、`worker/llm.py` |
| T11 | 報告頁與 4 張圖表（`src/app/dashboard/jobs/[id]/report/`） |
| T12 | 重跑／取消／刪除 |
| T13 | CSV／JSON 匯出 API |
| T14 | 多帳號比較頁 |
| T17 | 24 小時快取選項 |

## 3. 如何驗證 AI 產出
- **單元測試**：Worker 的清理、指標、分組、規則建議、LLM 驗證以固定樣本資料測試（pytest）；前端純函式（正規化、匯出、比較）用 vitest。
- **整合測試**：用兩個真實 Supabase 使用者驗證 RLS（看不到、改不了、刪不了別人的任務），以及 Worker 的領取、狀態轉換、取消。
- **E2E 測試**：Playwright 對本機 dev server 跑登入、建立任務、報告、重跑／取消／刪除、匯出、比較、快取，每個驗收條件至少一個測試。
- **真實資料**：實際爬取公開帳號，比對畫面數字與 JSON 數字；完整跑過 mosseri、threads 兩個帳號的端到端流程。
- **畫面檢查**：截圖確認桌面與手機寬度（375px）無水平捲動、深色模式、無 console error。
- 每個任務通過 `tsc`、`eslint`、全部測試後才 commit。

## 4. 修正 AI 的錯誤或幻覺
| 問題 | 如何發現 | 修正 |
|---|---|---|
| RLS insert policy 在子查詢中查同一張表，造成 `42P17 infinite recursion` | 整合測試 | 改用 `private.owns_job()` security definer 函式 |
| 新版 Supabase 不會自動授權新表給 service_role，Worker 無法寫入 | 整合測試 | 補 grant migration |
| 使用者取消後，Worker 的下一次狀態更新把 `cancelled` 覆寫回去 | 單元測試模擬競態 | 狀態更新加上 `status <> 'cancelled'` 條件 |
| 規則建議寫出「0.5 倍」這類資料中不存在的比例，數字可追溯檢查失敗 | 建議驗證測試 | 比例改由實際成對的證據數值計算並驗證 |
| Windows 沒有 Asia/Taipei 時區資料 | 單元測試在 Windows 失敗 | 加入 `tzdata` |
| 報告頁在手機寬度水平溢出（610px） | 375px 截圖 | grid 預設單欄、圖表容器 `min-w-0` |
| 關鍵字出現 we're、it's 等雜訊 | 真實帳號報告 | 補英文縮寫停用詞 |
| 任務清單時間在伺服器與瀏覽器格式不同，造成 hydration mismatch | dev overlay 與伺服器 log | 改由伺服器端格式化後傳入 |
| 測試抓到 Next.js 路由播報器（也是 `role=alert`）造成 strict mode 衝突 | E2E 失敗 | 選擇器限定在表單或段落內 |
| LLM 建議的數字驗證只檢查「數字有沒有出現在資料中」：小於 10 的整數一律放行，回覆數被寫成按讚數也會通過 | 交叉審查（請另一個 AI 審閱 `llm.py`，再對照程式確認） | evidence 改為 `{path, value}`，依路徑核對數值與指標名稱 |
| 驗證改嚴後，實測 Groq 7 條建議只有 2 條通過：「18:00」「0–50 字」等時段標籤被當成統計數字擋下 | 實際呼叫 Groq 並逐條列出被擋原因 | 標籤從同一筆資料的 hour／min／max 欄位核對，倍數容許 1% 概數；重測 13 條全數通過 |
| 加入 route 層 `loading.tsx` 後，打開他人的任務回 HTTP 200 而非 404 | 完整 E2E | 改在頁面內用 Suspense，先完成權限查詢再串流 |
| 同分關鍵字順序取決於 set 迭代順序，每次產出的報告不同 | 在 Docker 與本機各產生一次報告比對 | 同分依字典序排序，以不同 hash seed 驗證輸出相同 |

## 5. AI 幫助最大的部分
- **把模糊需求變成可驗收的規格**：PRD 的例外情境（E1–E14）與 Given/When/Then 驗收條件讓每個任務都有明確的完成定義，也直接對應到測試。
- **可行性調查**：T1 先實測未登入／登入能取得的篇數與 JSON 欄位，提早發現曝光數取不到、畫面轉發數 = 轉發 + 引用，避免後續返工。
- **測試抓到的問題**：RLS 遞迴、權限、取消競態都是只看程式碼很難發現、但整合測試一跑就出現的問題。
- **教訓**：AI 第一版程式常在「邊界與權限」出錯，必須用真實資料庫、真實帳號、真實瀏覽器驗證，而不是只看程式碼是否合理。
