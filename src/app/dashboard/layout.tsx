import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/app/Logo";
import { NavTabs } from "./NavTabs";
import { UserMenu } from "./UserMenu";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { user, supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-2">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold" aria-label="Threads Analyzer 首頁">
            <Logo className="size-7" />
            <span className="hidden sm:inline">Threads Analyzer</span>
          </Link>
          <div className="flex-1">
            <NavTabs />
          </div>
          <UserMenu email={user.email ?? ""} name={profile?.display_name ?? null} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
