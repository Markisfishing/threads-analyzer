import Link from "next/link";
import { Logo } from "./Logo";

const FEATURES = [
  { title: "總覽指標", desc: "粉絲數、平均互動、粉絲基準互動率與發文頻率，一眼看懂帳號體質。", icon: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
  { title: "Top posts", desc: "列出互動最高的 5 篇貼文，附原文連結與各項互動數字。", icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3Z" },
  { title: "發文時段", desc: "星期 × 小時熱力圖與各時段平均互動，找出最佳發文時間。", icon: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { title: "貼文類型", desc: "比較問句、清單、含連結、含圖片等類型的互動差異。", icon: "M4 6h16M4 12h10M4 18h6" },
  { title: "互動分群", desc: "把貼文分成高／中／低互動三群，對照內容特徵並產生策略建議。", icon: "M5 12a3 3 0 1 0 0-.01M19 6a3 3 0 1 0 0-.01M19 18a3 3 0 1 0 0-.01M8 11l8-4M8 13l8 4" },
];

/** 報告示意圖：用與報告相同的配色畫出 KPI 與長條，數字為示意。 */
function ReportPreview() {
  const bars = [38, 52, 44, 71, 58, 96, 63];
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const max = Math.max(...bars);
  return (
    <figure
      className="flex flex-col gap-4 rounded-2xl border border-[var(--border-soft)] bg-surface p-5 shadow-sm"
      aria-label="分析報告示意圖"
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          ["粉絲基準互動率", "2.4%"],
          ["平均總互動", "1,286"],
          ["粉絲數", "53.1K"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-background p-2.5">
            <p className="text-[11px] text-muted">{k}</p>
            <p className="text-lg font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs text-muted">各星期平均互動（最高：週六）</p>
        <div className="flex h-28 items-end gap-2" aria-hidden>
          {bars.map((b, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span
                className="w-full rounded-t-[4px]"
                style={{ height: `${(b / max) * 96}px`, background: b === max ? "var(--chart-best)" : "var(--chart-bar)" }}
              />
              <span className="text-[11px] text-muted">{days[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-[11px] text-muted">示意畫面，數字非真實資料</figcaption>
    </figure>
  );
}

// 首頁：產品簡介、報告示意與功能介紹
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 animate-fade-up flex-col gap-16 px-4 py-12 sm:py-20">
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 font-semibold">
            <Logo className="size-8" />
            Threads Analyzer
          </div>
          <h1 className="text-[40px] font-semibold leading-tight tracking-tight sm:text-5xl">
            看懂你的 Threads
            <br />
            哪篇最有互動
          </h1>
          <p className="max-w-[38ch] text-lg leading-8 text-[var(--ink-2)]">
            輸入 Threads 帳號，取得近期貼文的互動分析：最佳發文時段、表現最好的內容類型，以及可直接執行的策略建議。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-primary px-6">
              免費開始分析
            </Link>
            <Link href="/login" className="btn-secondary px-6">
              登入
            </Link>
          </div>
        </div>
        <ReportPreview />
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-6">
        <h2 id="features" className="text-2xl font-semibold">
          報告包含什麼
        </h2>
        <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <li key={f.title} className="lift flex flex-col gap-2 rounded-xl border border-[var(--border-soft)] bg-surface p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-accent">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={f.icon} />
                </svg>
              </span>
              <h3 className="font-medium">{f.title}</h3>
              <p className="text-sm leading-6 text-muted">{f.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-muted">
        <Link href="/privacy" className="link">
          隱私權政策與資料刪除
        </Link>
      </footer>
    </main>
  );
}
