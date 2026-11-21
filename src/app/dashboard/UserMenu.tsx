"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";

/** 頭像＋下拉選單：顯示名稱與 Email、帳號設定、登出。點外面或按 Esc 會關閉。 */
export function UserMenu({ email, name }: { email: string; name: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name || email).trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`帳號選單：${email}`}
        data-testid="user-menu"
        className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink transition-transform active:scale-95"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-20 w-64 animate-fade-up rounded-xl border border-[var(--border-soft)] bg-background p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            {name && <p className="truncate font-medium">{name}</p>}
            <p className="truncate text-sm text-muted" data-testid="user-email">
              {email}
            </p>
          </div>
          <div className="my-1 h-px bg-[var(--border-soft)]" />
          <Link
            href="/dashboard/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-foreground/5"
          >
            帳號設定
          </Link>
          <form action={signOut}>
            <button type="submit" role="menuitem" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/5">
              登出
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
