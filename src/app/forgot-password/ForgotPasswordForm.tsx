"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeader } from "@/app/auth/AuthForm";
import { requestPasswordReset, type AuthState } from "@/app/auth/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  const invalid = Boolean(state.error);
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 animate-fade-up flex-col justify-center gap-6 px-4 py-16">
      <AuthHeader title="忘記密碼" />
      {state.message ? (
        <p role="status" className="rounded-lg border border-accent/40 bg-[var(--accent-soft)] p-3 text-sm">
          {state.message}
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <p className="text-sm text-muted">輸入註冊時的 Email，我們會寄一封重設密碼的連結給你。</p>
          <div className="flex flex-col gap-1.5 text-sm">
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={state.email}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "reset-error" : undefined}
              className="field"
            />
          </div>
          {state.error && (
            <p id="reset-error" role="alert" className="-mt-1 text-sm text-danger">
              {state.error}
            </p>
          )}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending && <span className="spinner" aria-hidden />}
            {pending ? "寄送中…" : "寄送重設連結"}
          </button>
        </form>
      )}
      <p className="text-sm text-muted">
        想起來了？<Link href="/login" className="link">回到登入</Link>
      </p>
    </main>
  );
}
