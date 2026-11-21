import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DeleteAccount } from "./DeleteAccount";

export const metadata = { title: "帳號｜Threads Analyzer" };

const PROVIDER_LABEL: Record<string, string> = { email: "Email 與密碼", google: "Google", facebook: "Facebook" };

export default async function AccountPage() {
  const { supabase, user } = await requireUser("/dashboard/account");
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const methods = [...new Set((user.identities ?? []).map((i) => i.provider))];

  return (
    <div className="flex flex-col gap-8">
      <Link href="/dashboard" className="text-sm text-muted hover:underline">
        ← 我的分析
      </Link>
      <h1 className="text-xl font-semibold">帳號</h1>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]" data-testid="account-info">
        <dt className="text-muted">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-muted">名稱</dt>
        <dd>{profile?.display_name || "—"}</dd>
        <dt className="text-muted">登入方式</dt>
        <dd>{methods.map((m) => PROVIDER_LABEL[m] ?? m).join("、") || "—"}</dd>
      </dl>

      <section className="flex flex-col gap-3 rounded-xl border border-red-500/30 p-4">
        <h2 className="font-semibold text-red-600 dark:text-red-400">刪除帳號</h2>
        <DeleteAccount />
        <p className="text-xs text-muted">
          詳見
          <Link href="/privacy#data-deletion" className="underline">
            隱私權政策
          </Link>
          。
        </p>
      </section>
    </div>
  );
}
