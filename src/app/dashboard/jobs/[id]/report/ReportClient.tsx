"use client";

import { useEffect, useState } from "react";

export const REPORT_SECTIONS = [
  { id: "overview", label: "總覽" },
  { id: "top-posts", label: "Top 貼文" },
  { id: "time", label: "時段" },
  { id: "types", label: "類型" },
  { id: "groups", label: "群組" },
  { id: "strategy", label: "策略" },
] as const;

/** 報告的黏性章節選單：捲動時自動標示目前所在章節（scroll-spy）。 */
export function ReportNav({ available }: { available: string[] }) {
  const sections = REPORT_SECTIONS.filter((s) => available.includes(s.id));
  const [current, setCurrent] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(`sec-${s.id}`)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id.replace("sec-", ""));
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.join(",")]);

  return (
    <nav
      aria-label="報告章節"
      className="sticky top-[53px] z-[5] -mx-4 overflow-x-auto border-b border-[var(--border-soft)] bg-background/90 px-4 backdrop-blur"
      data-testid="report-nav"
    >
      <ul className="flex gap-1 py-2 text-sm">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#sec-${s.id}`}
              aria-current={current === s.id ? "location" : undefined}
              className={`block whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                current === s.id ? "bg-accent text-accent-ink" : "text-muted hover:bg-[var(--border-soft)] hover:text-foreground"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 貼文內容：預設兩行，可展開全文。 */
export function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 60;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={`whitespace-pre-line ${open ? "" : "line-clamp-2"}`}>{text || "（無文字內容）"}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="link text-xs" aria-expanded={open}>
          {open ? "收合" : "展開全文"}
        </button>
      )}
    </div>
  );
}

/** 複製策略建議全文。 */
export function CopyButton({ text, label = "複製" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* 瀏覽器不允許時不處理 */
        }
      }}
      className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-muted hover:bg-[var(--border-soft)] hover:text-foreground"
      aria-live="polite"
    >
      {done ? "已複製" : label}
    </button>
  );
}
