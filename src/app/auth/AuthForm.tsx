"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Logo } from "@/app/Logo";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth";
import type { AuthState } from "./actions";
import { GoogleIcon } from "./GoogleIcon";
import { PasswordField } from "./PasswordField";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  initialError?: string;
  /** 一般提示（例如帳號已刪除、密碼已重設），非錯誤 */
  notice?: string;
  /** Supabase 已啟用的第三方登入 */
  providers?: OAuthProvider[];
};

/** 登入頁與註冊頁共用的品牌標頭。 */
export function AuthHeader({ title }: { title: string }) {
  return (
    <header className="flex flex-col items-start gap-3">
      <Link href="/" className="flex items-center gap-2 font-semibold" aria-label="回到首頁">
        <Logo className="size-9" />
        Threads Analyzer
      </Link>
      <p className="text-sm text-muted">輸入 Threads 帳號，幾分鐘內看懂哪些貼文最有互動、何時發文最好。</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
    </header>
  );
}

export function AuthForm({ mode, action, next, initialError, notice, providers = [] }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const isLogin = mode === "login";
  const invalid = Boolean(state.error);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 animate-fade-up flex-col justify-center gap-6 px-4 py-16">
      <AuthHeader title={isLogin ? "登入" : "建立帳號"} />

      {notice && !state.message && (
        <p role="status" className="rounded-lg border border-[var(--border)] p-3 text-sm">
          {notice}
        </p>
      )}

      {providers.length > 0 && !state.message && (
        <div className="flex flex-col gap-3" data-testid="oauth-providers">
          {OAUTH_PROVIDERS.filter((p) => providers.includes(p.id)).map((p) => (
            <a
              key={p.id}
              href={`/auth/oauth?provider=${p.id}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
              className="btn-secondary w-full gap-3"
            >
              {p.id === "google" && <GoogleIcon />}
              {p.label}
            </a>
          ))}
          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-[var(--border)]" />
            或使用 Email
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </div>
      )}

      {state.message ? (
        <p role="status" className="rounded-lg border border-accent/40 bg-[var(--accent-soft)] p-3 text-sm">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="flex flex-col gap-1.5 text-sm">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={state.email}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "auth-error" : undefined}
              className="field"
            />
          </div>
          <PasswordField
            label="密碼"
            name="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            invalid={invalid}
            describedBy={invalid ? "auth-error" : undefined}
            showStrength={!isLogin}
          />
          {isLogin && (
            <Link href="/forgot-password" className="link -mt-2 self-end text-sm">
              忘記密碼？
            </Link>
          )}
          {state.error && (
            <p id="auth-error" role="alert" className="-mt-1 text-sm text-danger">
              {state.error}
            </p>
          )}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending && <span className="spinner" aria-hidden />}
            {pending ? (isLogin ? "登入中…" : "註冊中…") : isLogin ? "登入" : "註冊"}
          </button>
        </form>
      )}

      <p className="text-sm text-muted">
        {isLogin ? (
          <>
            還沒有帳號？<Link href="/signup" className="link">註冊</Link>
          </>
        ) : (
          <>
            已有帳號？<Link href="/login" className="link">登入</Link>
          </>
        )}
      </p>
      <p className="text-xs text-muted">
        {isLogin ? "登入" : "註冊"}即表示你同意本站的
        <Link href="/privacy" className="link">
          隱私權政策
        </Link>
        。
      </p>
    </main>
  );
}
