import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm, DisplayNameForm } from "./AccountForms";
import { DeleteAccount } from "./DeleteAccount";

export const metadata = { title: "帳號｜Threads Analyzer" };

const PROVIDER_LABEL: Record<string, string> = { email: "Email 與密碼", google: "Google", facebook: "Facebook" };

const CARD = "flex scroll-mt-20 flex-col gap-4 rounded-xl border border-[var(--border-soft)] bg-surface p-5";

export default async function AccountPage({ searchParams }: PageProps<"/dashboard/account">) {
  const { supabase, user } = await requireUser("/dashboard/account");
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const methods = [...new Set((user.identities ?? []).map((i) => i.provider))];
  const fromReset = (await searchParams).reset === "1";

  return (
    <div className="flex animate-fade-up flex-col gap-6">
      <h1 className="text-2xl font-semibold">帳號</h1>

      <section className={CARD} aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="font-semibold">
          基本資料
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]" data-testid="account-info">
          <dt className="text-muted">Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted">登入方式</dt>
          <dd>{methods.map((m) => PROVIDER_LABEL[m] ?? m).join("、") || "—"}</dd>
        </dl>
        <DisplayNameForm current={profile?.display_name ?? null} />
      </section>

      <section id="password" className={CARD} aria-labelledby="password-heading">
        <h2 id="password-heading" className="font-semibold">
          {methods.includes("email") ? "修改密碼" : "設定密碼"}
        </h2>
        {fromReset && (
          <p role="status" className="rounded-lg border-l-4 border-accent bg-[var(--accent-soft)] p-3 text-sm">
            已透過重設連結登入，請在下方設定新密碼。
          </p>
        )}
        <ChangePasswordForm hasPassword={methods.includes("email")} />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-[var(--danger)]/40 p-5" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="font-semibold text-danger">
          刪除帳號
        </h2>
        <DeleteAccount />
        <p className="text-xs text-muted">
          詳見
          <Link href="/privacy#data-deletion" className="link">
            隱私權政策
          </Link>
          。
        </p>
      </section>
    </div>
  );
}
