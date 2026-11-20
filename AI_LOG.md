# AI_LOG

記錄本專案與 AI coding assistant（Claude Code）協作的過程。

## 1. 如何向 AI 描述需求
- 先提供考題文件，要求 AI 依考題的 PRD 要求產出 `docs/PRD.md`，再由我回覆關鍵決策（資料來源、分組規則、LLM、Worker 執行位置）。
- 每次只交付一個 PRD 拆解任務（T1、T2…），以 PRD 的完成定義作為驗收。

## 2. AI 產生了哪些程式碼
| 任務 | 產出 |
|---|---|
| PRD | `docs/PRD.md` v0.1–v0.3 |
| T1 | `spike/*.py`、`docs/spikes/T1-scrape-feasibility.md` |
| T2 | Next.js 骨架、`worker/` CLI 骨架、`.env.example`、README |

## 3. 如何驗證 AI 產出
- T1：實際對 3 個公開帳號執行爬取，比對畫面數字與 JSON 數字（發現畫面「轉發」= repost + quote）。
- T2：`npm run build`、`python -m worker --help`、`pytest`。

## 4. 修正 AI 的錯誤或幻覺
- （待補）

## 5. AI 幫助最大的部分
- （待補）
