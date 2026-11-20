# 登入設定指南（Gmail SMTP、Google、Facebook）

對應 PRD F1、AC1.6–1.9、T22–T23。程式已完成；以下是需要在各服務後台手動設定的步驟。
所有密碼與金鑰只填在各服務後台，不放進程式碼或 `.env`。

Supabase 專案 callback 網址（Google／Facebook 都會用到）：

```
https://qrircpuoqzhsplsodkrl.supabase.co/auth/v1/callback
```

---

## 0. 允許的跳轉網址（必做）

Supabase 後台 → **Authentication → URL Configuration**

| 欄位 | 值 |
|---|---|
| Site URL | 正式網址（部署前先填 `http://localhost:3000`，部署後改為 Vercel 網址） |
| Redirect URLs | `http://localhost:3000/**`、`https://<你的 Vercel 網址>/**` |

沒有加入的網址，登入或驗證信點擊後會被導回 Site URL，而不是原本的頁面。

---

## 1. Gmail SMTP（寄驗證信）

Supabase 內建寄信服務每小時只能寄少量信件，且可能只寄給專案成員。改用 Gmail 寄信：

1. **開啟 Google 帳號兩步驟驗證**：Google 帳戶 → 安全性 → 兩步驟驗證。
2. **建立應用程式密碼**：Google 帳戶 → 安全性 → 應用程式密碼（或搜尋「應用程式密碼」），名稱填 `Threads Analyzer`，複製產生的 16 碼密碼。
3. Supabase 後台 → **Authentication → Emails → SMTP Settings**，開啟 **Enable Custom SMTP**：

   | 欄位 | 值 |
   |---|---|
   | Sender email | 你的 Gmail 地址 |
   | Sender name | `Threads Analyzer` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | 你的 Gmail 地址 |
   | Password | 步驟 2 的應用程式密碼（不是 Gmail 登入密碼） |

4. （建議）**Authentication → Rate Limits**：「Rate limit for sending emails」視需要調高（例如每小時 30 封）。Gmail 一天上限約 500 封。
5. （選做）**Authentication → Emails → Templates → Confirm signup** 改成中文：

   ```html
   <h2>確認你的 Threads Analyzer 帳號</h2>
   <p>點擊下方連結完成註冊：</p>
   <p><a href="{{ .ConfirmationURL }}">確認 Email</a></p>
   <p>如果不是你本人註冊，請忽略這封信。</p>
   ```

**驗證**：用另一個信箱在 `/signup` 註冊 → 幾秒內收到信 → 點連結後自動登入並進入「我的分析」。

---

## 2. Google 登入

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立（或選擇）專案。
2. **Google Auth Platform → Branding**：
   - 應用程式名稱：`Threads Analyzer`
   - 使用者支援電子郵件：你的信箱
   - 應用程式首頁、隱私權政策：部署後填 `https://<Vercel 網址>/`、`https://<Vercel 網址>/privacy`
   - 已授權網域：`supabase.co`，部署後再加 Vercel 網域
3. **Audience**：使用者類型選「外部」，按「發布應用程式」改為正式版。
   只要求 email、名稱（預設範圍）不需 Google 審核。維持「測試中」時，只有列在測試使用者名單的帳號能登入。
4. **Clients → 建立用戶端**：
   - 應用程式類型：網頁應用程式
   - 已授權的 JavaScript 來源：`http://localhost:3000`、`https://<Vercel 網址>`
   - 已授權的重新導向 URI：上方的 Supabase callback 網址
   - 建立後複製 **Client ID** 與 **Client Secret**
5. Supabase 後台 → **Authentication → Sign In / Providers → Google**：開啟，貼上 Client ID 與 Client Secret，儲存。

**驗證**：重新整理 `/login`（最多 5 分鐘快取），出現「使用 Google 繼續」→ 點擊 → 選 Google 帳號 → 回到「我的分析」，帳號頁的名稱為 Google 名稱、登入方式為 Google。

---

## 3. Facebook 登入（選做）

Meta 要求公開的隱私權政策與資料刪除網址，因此**需先完成 Vercel 部署**。

1. 到 [Meta for Developers](https://developers.facebook.com/) → 我的應用程式 → 建立應用程式，使用案例選「使用 Facebook 登入功能驗證使用者身分並要求資料」。
2. **使用案例 → 自訂 → 權限**：確認 `email`、`public_profile` 已加入。
3. **Facebook 登入 → 設定**：「有效的 OAuth 重新導向 URI」填上方的 Supabase callback 網址。
4. **應用程式設定 → 基本資料**：
   - 隱私政策網址：`https://<Vercel 網址>/privacy`
   - 用戶資料刪除：選「資料刪除說明網址」，填 `https://<Vercel 網址>/privacy#data-deletion`
   - 應用程式網域：Vercel 網域
   - 複製 **應用程式編號（App ID）** 與 **應用程式密鑰（App Secret）**
5. 將應用程式模式切為 **正式（Live）**。未切換前只有應用程式管理員／測試者能登入。Meta 可能要求商業驗證，依後台提示處理。
6. Supabase 後台 → **Authentication → Sign In / Providers → Facebook**：開啟，貼上 App ID 與 App Secret，儲存。

**驗證**：`/login` 出現「使用 Facebook 繼續」→ 授權 → 回到「我的分析」。在授權頁按取消，應回到登入頁顯示「已取消第三方登入」。

---

## 帳號合併與刪除

- 同一個 Email 先用密碼註冊、之後用 Google／Facebook 登入，Supabase 會視為同一使用者，原有分析都在。
- 使用者可在「帳號」頁輸入「刪除」刪除自己的帳號與所有資料（`delete_my_account()` 只能刪自己）。
- `/privacy` 頁若要顯示聯絡信箱，在 Vercel 設定 `NEXT_PUBLIC_CONTACT_EMAIL`（選填）。
