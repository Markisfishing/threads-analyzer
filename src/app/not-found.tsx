import Link from "next/link";

export const metadata = { title: "找不到頁面｜Threads Analyzer" };

/** 全站 404：網址打錯、任務不存在或不屬於目前使用者（RLS 查不到一律 404）。 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center animate-fade-up">
      <p className="text-5xl font-semibold tabular-nums text-[var(--chart-muted)]">404</p>
      <h1 className="text-xl font-semibold">找不到這個頁面</h1>
      <p className="text-sm text-[var(--chart-ink-2)]">網址可能打錯了，或這份分析已被刪除、不屬於你的帳號。</p>
      <Link href="/dashboard" className="btn-primary">
        回到我的分析
      </Link>
    </main>
  );
}
