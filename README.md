# Threads Analyzer

輸入 Threads 帳號，爬取近期貼文並產出互動表現分析報告（總覽指標、Top posts、圖表、三群組 NLP 分析、策略建議）。

> 開發中。需求與驗收標準見 [docs/PRD.md](docs/PRD.md)。

## 架構

```
Next.js (Vercel) ──建立任務──▶ Supabase (Auth + Postgres + RLS)
       │                              ▲
       └─workflow_dispatch─▶ GitHub Actions: Python Worker (Playwright 爬取 → 清理 → 分析 → Groq 建議)
```

| 目錄 | 內容 |
|---|---|
| `src/` | Next.js 前端（App Router） |
| `worker/` | Python Worker（爬取、清理、分析） |
| `supabase/migrations/` | 資料表與 RLS |
| `tests/` | 測試 |
| `data/`、`reports/` | 本機輸出（範例資料、報告） |
| `docs/` | PRD 與技術調查紀錄 |
| `spike/` | T1 可行性測試腳本 |

## 安裝

需求：Node.js 20+、Python 3.12。

```powershell
npm install
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m playwright install chromium
```

複製 `.env.example` 為 `.env`（Worker）與 `.env.local`（Next.js）並填入值。

## 執行

```powershell
npm run dev                                  # 前端 http://localhost:3000
.venv\Scripts\python -m worker --help        # Worker 指令
.venv\Scripts\python -m worker check-config  # 檢查環境變數
.venv\Scripts\python -m pytest               # 測試
```

### 產生 Threads 登入狀態（選填）
未登入模式通常只能取得 17–28 篇。需要 30 篇以上時，請用自己的帳號產生登入狀態：

```powershell
.venv\Scripts\python spike\save_login_state.py
```

在跳出的視窗登入後會存成 `spike/storage_state.json`（已列入 `.gitignore`，請勿分享）。

## 環境變數
見 [.env.example](.env.example)，各變數說明見 PRD §7。

## 資料來源與合法性
- 只讀取公開帳號的貼文；預設未登入，必要時使用開發者本人帳號的登入狀態。
- 不破解驗證、不繞過私人帳號限制、低頻存取（每動作 1.5–3 秒延遲、一次一個任務）。
- Meta 服務條款原則上限制自動化蒐集，本專案僅供學術／考題示範用途。使用登入狀態有帳號被限制的風險。
- 曝光數（views）僅帳號本人可見，無法取得，欄位保留為空值。

## 分析指標定義
（T9 完成後補上，草案見 PRD F5）

## 已知限制
- 未登入模式取得篇數有上限（約 17–28 篇）。
- 無曝光數，互動率以粉絲數為分母。
- Threads 改版可能導致爬取失效。
