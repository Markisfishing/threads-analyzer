"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { THEME_KEY, THEME_LABELS, THEME_PREFS, type ThemePref, parsePref, resolveTheme } from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_EVENT = "themechange";

/** 目前偏好以 <html data-theme-pref> 為準（inline script 在載入時已設定），伺服器端一律視為跟隨系統。 */
function subscribe(onChange: () => void) {
  const mq = matchMedia(DARK_QUERY);
  const onSystem = () => readPref() === "system" && apply("system", false);
  const onStorage = (e: StorageEvent) => e.key === THEME_KEY && apply(parsePref(e.newValue), false);
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    mq.removeEventListener("change", onSystem);
  };
}
const getPref = () => parsePref(document.documentElement.dataset.themePref);
const getServerPref = (): ThemePref => "system";

function readPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

/** 套用主題。切換瞬間暫停所有 transition，避免各元件各自漸變；有 View Transitions 且未要求減少動態時淡入換色。 */
function apply(pref: ThemePref, animate: boolean) {
  const root = document.documentElement;
  const theme = resolveTheme(pref, matchMedia(DARK_QUERY).matches);
  const change = () => {
    root.dataset.theme = theme;
    root.dataset.themePref = pref;
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  if (root.dataset.theme === theme) {
    change();
    return;
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduce && "startViewTransition" in document) {
    document.startViewTransition(change);
    return;
  }
  root.classList.add("theme-switching");
  change();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

function Icon({ pref }: { pref: ThemePref }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (pref === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (pref === "dark")
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** 主題切換按鈕：圖示顯示目前偏好，點開選「跟隨系統／亮色／暗色」。偏好存在這台裝置，其他分頁同步更新。 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const pref = useSyncExternalStore(subscribe, getPref, getServerPref);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {
      /* 無法儲存時仍套用到目前頁面 */
    }
    setOpen(false);
    apply(p, true);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`切換主題（目前：${THEME_LABELS[pref]}）`}
        data-testid="theme-toggle"
        className="flex size-9 items-center justify-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <Icon pref={pref} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="主題"
          className="absolute right-0 top-11 z-20 w-40 animate-fade-up rounded-xl border border-[var(--border-soft)] bg-background p-1 shadow-lg"
        >
          {THEME_PREFS.map((p) => (
            <button
              key={p}
              type="button"
              role="menuitemradio"
              aria-checked={pref === p}
              onClick={() => choose(p)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5"
            >
              <Icon pref={p} />
              <span className="flex-1">{THEME_LABELS[p]}</span>
              {pref === p && <span aria-hidden className="text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 沒有導覽列的頁面（首頁、登入、註冊、隱私權…）把按鈕固定在右上角；/dashboard 由導覽列放置。 */
export function FloatingThemeToggle() {
  const pathname = usePathname();
  if (pathname.startsWith("/dashboard")) return null;
  return <ThemeToggle className="!fixed right-4 top-3 z-30" />;
}
