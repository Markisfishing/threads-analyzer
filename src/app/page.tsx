import Link from "next/link";

// 首頁：產品簡介與登入入口
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Threads Analyzer</h1>
      <p className="text-lg leading-8 opacity-80">
        輸入 Threads 帳號，取得近期貼文的互動表現分析：總覽指標、Top posts、
        發文時段、貼文類型，以及高／中／低互動群組的內容差異與策略建議。
      </p>
      <div>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-background"
        >
          登入開始分析
        </Link>
      </div>
      <p className="text-sm text-muted">
        <Link href="/privacy" className="underline">
          隱私權政策與資料刪除
        </Link>
      </p>
    </main>
  );
}
