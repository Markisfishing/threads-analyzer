"use client";

import Link from "next/link";
import { useActionState } from "react";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth";
import type { AuthState } from "./actions";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  initialError?: string;
  /** 一般提示（例如帳號已刪除），非錯誤 */
  notice?: string;
  /** Supabase 已啟用的第三方登入 */
  providers?: OAuthProvider[];
};

export function AuthForm({ mode, action, next, initialError, notice, providers = [] }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const isLogin = mode === "login";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">{isLogin ? "登入" : "註冊"}</h1>

      {notice && !state.message && (
        <p role="status" className="rounded-lg border border-foreground/20 p-3 text-sm">
          {notice}
        </p>
      )}

      {providers.length > 0 && !state.message && (
        <div className="flex flex-col gap-3" data-testid="oauth-providers">
          {OAUTH_PROVIDERS.filter((p) => providers.includes(p.id)).map((p) => (
            <a
              key={p.id}
              href={`/auth/oauth?provider=${p.id}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
              className="flex h-10 items-center justify-center rounded-full border border-foreground/30 text-sm font-medium hover:bg-foreground/5"
            >
              {p.label}
            </a>
          ))}
          <div className="flex items-center gap-3 text-xs opacity-60" aria-hidden>
            <span className="h-px flex-1 bg-foreground/20" />
            或使用 Email
            <span className="h-px flex-1 bg-foreground/20" />
          </div>
        </div>
      )}

      {state.message ? (
        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={state.email}
              className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            密碼
            <input
              name="password"
              type="password"
              required
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
            />
          </label>
          {state.error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-full bg-foreground text-background disabled:opacity-60"
          >
            {pending ? (isLogin ? "登入中…" : "註冊中…") : isLogin ? "登入" : "註冊"}
          </button>
        </form>
      )}

      <p className="text-sm opacity-70">
        {isLogin ? (
          <>
            還沒有帳號？<Link href="/signup" className="underline">註冊</Link>
          </>
        ) : (
          <>
            已有帳號？<Link href="/login" className="underline">登入</Link>
          </>
        )}
      </p>
      <p className="text-xs opacity-60">
        {isLogin ? "登入" : "註冊"}即表示你同意本站的
        <Link href="/privacy" className="underline">
          隱私權政策
        </Link>
        。
      </p>
    </main>
  );
}
