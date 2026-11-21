# Threads Analyzer

輸入 Threads 帳號，爬取近期貼文並產出互動表現分析報告：總覽指標、Top 5 貼文、4 張圖表、三群組 NLP 成敗分析、策略建議。另可多帳號比較、匯出 CSV／JSON。

線上網址：https://threads-analyzer-murex.vercel.app

需求、驗收標準與任務拆解見 [docs/PRD.md](docs/PRD.md)；與 AI 協作的紀錄見 [AI_LOG.md](AI_LOG.md)。

## 架構

```
瀏覽器 ──▶ Next.js（Vercel）──建立任務──▶ Supabase（Auth + Postgres + RLS）
                 │                                   ▲
                 └─ workflow_dispatch ─▶ Python Worker ┘
                                         （GitHub Actions 或本機輪詢）
                                         Playwright 爬取 → 清理 → 分析 → Groq 建議
```

- 前端只用使用者 session 存取資料，所有資料表都有 RLS，使用者只看得到自己的任務。
- Worker 用 service role key 寫入結果，金鑰只存在 Worker 端（本機 `.env` 或 GitHub Actions Secrets）。
- 部署：網站在 Vercel（函式區域 hnd1 東京，與 Supabase ap-northeast-1 同區），推送到 main 會自動部署。
- 任務狀態：`queued → scraping → cleaning → analyzing → completed / partial / failed / cancelled`，前端每 5 秒輪詢進度。

| 目錄 | 內容 |
|---|---|
| `src/app/` | Next.js 頁面（登入、任務清單、報告、比較）、server actions、匯出 API |
| `src/lib/` | 共用邏輯（Supabase client、任務、報告型別、匯出、比較） |
| `worker/` | Python Worker：`scraper` 爬取、`cleaning` 清理、`metrics` 指標、`nlp` 三群組、`insights` 規則建議、`llm` Groq |
| `supabase/migrations/` | 資料表、RLS policy、權限 |
| `tests/` | `worker/` 單元、`integration/` 真實 Supabase、`e2e/` 瀏覽器、`live/` 真實 Threads |
| `docs/` | PRD、T1 可行性調查、登入設定指南 |
| `spike/` | T1 爬取測試腳本、產生登入狀態的腳本 |

## 安裝

需求：Node.js 20+、Python 3.12、一個 Supabase 專案。

```powershell
npm install
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m playwright install chromium
```

### 環境變數
複製 [.env.example](.env.example)：

- `.env.local`（Next.js）：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`，選填 `GITHUB_DISPATCH_TOKEN`／`GITHUB_REPO`／`GITHUB_WORKFLOW_FILE`（建立任務後觸發 GitHub Actions；不填則需本機執行 Worker）。
- `.env`（Worker）：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，選填 `GROQ_API_KEY`（不填則使用規則模板產生建議）、`THREADS_STORAGE_STATE`。

`SUPABASE_SERVICE_ROLE_KEY` 不可放進 `.env.local` 或任何 `NEXT_PUBLIC_` 變數。

第三方登入（Google、Facebook）與驗證信寄送（Gmail SMTP）在 Supabase 等服務後台設定，步驟見 [docs/auth-setup.md](docs/auth-setup.md)。

### 建立資料表
```powershell
npx supabase login
npx supabase link --project-ref <你的 project ref>
npx supabase db push
```

## 執行

```powershell
npm run dev                                      # 前端 http://localhost:3000
.venv\Scripts\python -m worker check-config      # 檢查 Worker 環境變數
.venv\Scripts\python -m worker poll              # 本機輪詢模式：持續領取排隊中的任務
.venv\Scripts\python -m worker run --job-id <id> # 只執行指定任務（GitHub Actions 用）
```

### 產生 Threads 登入狀態（選填）
未登入模式通常只能取得 17–28 篇。需要 30 篇以上時，用自己的帳號產生登入狀態：

```powershell
.venv\Scripts\python spike\save_login_state.py
```

在跳出的視窗登入後會存成 `spike/storage_state.json`（已列入 `.gitignore`，請勿分享），並在 `.env` 設定 `THREADS_STORAGE_STATE=spike/storage_state.json`。Worker 先用未登入模式，不足目標篇數才改用登入狀態。

## 測試

```powershell
npm test                                                   # 前端單元測試（vitest）
npx tsc --noEmit; npm run lint                             # 型別與 lint
.venv\Scripts\python -m pytest tests/worker                # Worker 單元測試
.venv\Scripts\python -m pytest tests/integration           # RLS 與 Worker 寫入（需 .env / .env.local）
.venv\Scripts\python -m pytest tests/e2e                   # 瀏覽器 E2E（需先 npm run dev）
.venv\Scripts\python -m pytest -m live tests/live          # 真實爬取 Threads（預設不執行）
```

E2E 與整合測試會在 Supabase 建立臨時使用者，結束後刪除。

## 功能

| 功能 | 說明 |
|---|---|
| 帳號 | Email 註冊（驗證信）／登入，或 Google 登入（Facebook 已實作，因 Meta 商家驗證限制未啟用）；帳號頁可刪除帳號與所有資料；未登入存取 `/dashboard` 會導向登入頁。後台設定見 [docs/auth-setup.md](docs/auth-setup.md) |
| 建立分析 | 輸入 username 或個人頁網址，目標 30–100 篇；同帳號進行中不重複建立；24 小時內已完成可選擇用快取或強制重新爬取 |
| 進度 | 爬取、清理、分析各階段與已取得篇數；排隊過久可重新觸發 |
| 報告 | 8 個總覽指標、Top 5 貼文、發文時段熱度、類型、長度與互動、關鍵字、三群組比較、至少 3 點觀察與建議、資料限制 |
| 管理 | 進行中可取消；已結束可重跑（保留舊結果）或刪除（需確認） |
| 比較 | 勾選 2–4 個已完成分析並排比較 |
| 匯出 | 貼文 CSV（UTF-8 BOM，Excel 可直接開）、完整 JSON |

所有圖表都有「表格檢視」，支援深色模式與手機寬度。

## 分析指標定義

| 指標 | 定義 |
|---|---|
| 互動 `engagement` | 讚 + 留言 + 轉發 + 引用（畫面上的「轉發」數 = 轉發 + 引用） |
| 互動率 `engagement_rate` | 互動 ÷ 粉絲數（曝光數取不到，以粉絲數代替分母；粉絲數取不到則不計算） |
| 互動分數 `score` | 讚 + 2 × 留言，用於三群組分組 |
| 平均／中位數 | 讚、留言、轉發、引用、互動、互動率皆同時提供 |
| 異常值 | 互動 > Q3 + 3 × IQR 標記為異常值，另提供排除異常值後的平均互動 |
| 每週發文 | 樣本篇數 ÷ 第一篇到最後一篇的天數 × 7 |
| Top 5 | 依互動率排序；粉絲數缺失時改依互動排序並提示 |
| 發文時段 | 以 Asia/Taipei 時區統計星期 × 小時的篇數與平均互動 |
| 文字長度 | 分 0–50、51–150、151–300、300 字以上四組平均互動，並計算字數與互動的 Spearman 相關係數 |
| 貼文類型 | 純文字、含連結、含 hashtag、含 mention（一篇可屬於多類） |
| 關鍵字 | jieba 斷詞＋中英文停用詞，取出現篇數最多的詞與 hashtag |
| 三群組 | 依 score 的 P33／P67 分為高／中／低互動組；少於 9 篇或分數無法區分時不分組並說明原因 |
| 群組特徵 | 每組用同一套方法：TF-IDF 特徵詞（以全帳號貼文為語料）、平均字數、問句／emoji／hashtag／mention／連結比例、情緒詞比例 |
| 建議 | 有 `GROQ_API_KEY` 時由 Groq LLM 依統計結果產生，並檢查引用的數字確實存在於資料中；失敗或不足 3 點時改用規則模板。每點包含觀察、推測、建議、驗證方法，報告標示來源 |

## 資料來源與合法性

- 只讀取公開帳號、公開頁面上的貼文；預設未登入，必要時使用開發者本人帳號的登入狀態。
- 不破解驗證、不繞過私人帳號限制、不使用他人帳號；低頻存取（動作間隔 1.5–3 秒、一次一個任務、失敗以指數退避重試）。
- Meta 服務條款原則上限制自動化蒐集，本專案僅供學術／考題示範用途，不做商業使用。使用登入狀態有帳號被限制的風險，由使用者自行承擔。
- 爬到的資料只存在使用者自己的 Supabase 專案，RLS 確保只有建立任務的使用者看得到，可隨時刪除。

## 已知限制

- **曝光數（views）**：只有帳號本人看得到，無法取得，欄位保留為空值；互動率改以粉絲數為分母。
- **篇數**：未登入約 17–28 篇；取不到 30 篇時結果標為「部分完成」並提示可信度較低。
- **樣本**：只分析最近的貼文，不代表帳號完整歷史；置頂或爆紅貼文可能影響平均（另提供中位數與排除異常值的平均）。
- **相關不等於因果**：報告中的觀察是統計關聯，建議附有驗證方法，需實際 A/B 測試確認。
- **情緒分析**：使用內建小型中英文情緒詞典，只能粗略判斷正負向。
- **Facebook 登入**：Meta 要求商家驗證（需公司登記文件）才能正式上線，個人開發者無法完成，因此不顯示 Facebook 按鈕。
- **改版風險**：Threads 頁面或資料格式改版可能導致爬取失效，需更新解析邏輯。
- **執行時間**：本機登入模式 30 篇約 50 秒；GitHub Actions 另有約 30–60 秒冷啟動。
