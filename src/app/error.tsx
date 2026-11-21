"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 頁面執行錯誤時的備援畫面：可重試或回到任務清單，不顯示技術細節。 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center animate-fade-up">
      <h1 className="text-xl font-semibold">頁面暫時無法顯示</h1>
      <p className="text-sm text-[var(--chart-ink-2)]">
        可能是網路不穩或服務暫時忙碌，請稍後再試。
        {error.digest && <span className="mt-1 block text-xs opacity-60">錯誤代碼：{error.digest}</span>}
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          重試
        </button>
        <Link href="/dashboard" className="rounded-full border border-foreground/20 px-4 py-2 text-sm">
          回到我的分析
        </Link>
      </div>
    </main>
  );
}
