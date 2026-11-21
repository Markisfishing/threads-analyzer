import Link from "next/link";

export const metadata = { title: "隱私權政策與資料刪除｜Threads Analyzer" };

const UPDATED = "2026-11-21";

const TOC = [
  { id: "data-deletion", label: "如何刪除資料" },
  { id: "collected", label: "我們收集的資料" },
  { id: "usage", label: "資料用途" },
  { id: "third-party", label: "資料存放與第三方服務" },
];

/** 公開頁面：Google 登入審核需要的隱私權政策與資料刪除說明。 */
export default function PrivacyPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto flex w-full max-w-2xl animate-fade-up flex-col gap-8 px-4 py-12 text-sm leading-7">
      <div>
        <Link href="/" className="link">
          ← Threads Analyzer
        </Link>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">隱私權政策與資料刪除</h1>
        <p className="text-muted">最後更新：{UPDATED}</p>
      </div>

      <nav aria-label="目錄" className="rounded-xl border border-[var(--border-soft)] p-4">
        <p className="mb-1 font-medium">目錄</p>
        <ol className="list-decimal pl-5">
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="link">
                {t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section
        id="data-deletion"
        className="flex scroll-mt-6 flex-col gap-3 rounded-xl border-l-4 border-accent bg-[var(--accent-soft)] p-5"
      >
        <h2 className="text-lg font-semibold">如何刪除資料</h2>
        <ol className="list-decimal pl-5">
          <li>刪除單一分析：在分析報告頁右上角「⋯」選單選「刪除分析」，該分析的貼文、結果與紀錄會一併永久刪除。</li>
          <li>
            刪除整個帳號：登入後到「
            <Link href="/dashboard/account" className="link">
              帳號
            </Link>
            」頁按「刪除帳號」，你的帳號、所有分析與貼文資料會立即永久刪除，無法復原。
          </li>
          <li>若你是透過 Google 登入，也可以在 Google 帳戶「安全性 → 第三方應用程式和服務」移除本站的存取權。</li>
        </ol>
        {contact && (
          <p>
            無法登入時，請來信{" "}
            <a href={`mailto:${contact}`} className="link">
              {contact}
            </a>{" "}
            要求刪除資料。
          </p>
        )}
      </section>

      <section id="collected" className="flex scroll-mt-6 flex-col gap-2">
        <h2 className="text-base font-semibold">我們收集的資料</h2>
        <ul className="list-disc pl-5">
          <li>帳號資料：Email；使用 Google 登入時，另取得你的名稱。我們不會取得你的 Google 密碼、聯絡人或其他資料。</li>
          <li>分析資料：你輸入的 Threads 帳號、分析任務紀錄，以及從 Threads 公開頁面取得的貼文內容與互動數字。</li>
        </ul>
      </section>

      <section id="usage" className="flex scroll-mt-6 flex-col gap-2">
        <h2 className="text-base font-semibold">資料用途</h2>
        <p>只用於登入本站、執行你建立的分析並顯示報告。不做廣告、不出售、不與其他使用者共享；每位使用者只看得到自己的分析。</p>
      </section>

      <section id="third-party" className="flex scroll-mt-6 flex-col gap-2">
        <h2 className="text-base font-semibold">資料存放與第三方服務</h2>
        <ul className="list-disc pl-5">
          <li>Supabase：存放帳號與分析資料。</li>
          <li>GitHub Actions：執行爬取與分析程式，執行完即結束，不保留資料。</li>
          <li>Groq：產生策略建議時，會傳送彙總後的統計數字與部分公開貼文內容，不含你的帳號資料。</li>
          <li>Vercel：網站主機。</li>
        </ul>
      </section>
    </main>
  );
}
