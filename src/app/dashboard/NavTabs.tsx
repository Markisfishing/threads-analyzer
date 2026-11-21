"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "我的分析", match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/jobs") },
  { href: "/dashboard/compare", label: "比較", match: (p: string) => p.startsWith("/dashboard/compare") },
  { href: "/dashboard/account", label: "帳號", match: (p: string) => p.startsWith("/dashboard/account") },
];

/** 頂部分頁：目前所在頁以強調色底線標示。 */
export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="主要導覽" className="flex items-center gap-1 text-sm">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-md px-3 py-2 transition-colors ${
              active ? "font-medium text-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {t.label}
            {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
