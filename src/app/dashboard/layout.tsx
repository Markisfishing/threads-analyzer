import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Threads Analyzer
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden opacity-70 sm:inline" data-testid="user-email">
              {user.email}
            </span>
            <form action={signOut}>
              <button type="submit" className="rounded-full border border-foreground/20 px-3 py-1">
                登出
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
