"use client";

import { useActionState } from "react";
import { PasswordField } from "@/app/auth/PasswordField";
import { changePassword, updateDisplayName, type FormState } from "./actions";

function Feedback({ state, id }: { state: FormState; id: string }) {
  if (state.error)
    return (
      <p id={id} role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p id={id} role="status" className="text-sm text-accent">
        ✓ {state.message}
      </p>
    );
  return null;
}

export function DisplayNameForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateDisplayName, {});
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="display-name-form">
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="display-name">顯示名稱</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="display-name"
            name="display_name"
            required
            maxLength={50}
            defaultValue={current ?? ""}
            placeholder="例如：小明"
            aria-invalid={state.error ? true : undefined}
            aria-describedby="display-name-feedback"
            className="field sm:max-w-xs"
          />
          <button type="submit" disabled={pending} className="btn-secondary">
            {pending ? "儲存中…" : "儲存名稱"}
          </button>
        </div>
      </div>
      <Feedback state={state} id="display-name-feedback" />
    </form>
  );
}

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} className="flex flex-col gap-4 sm:max-w-sm" data-testid="change-password-form">
      {!hasPassword && <p className="text-sm text-muted">你目前用 Google 登入，設定密碼後也能用 Email 與密碼登入。</p>}
      <PasswordField
        label="新密碼"
        name="password"
        autoComplete="new-password"
        invalid={Boolean(state.error)}
        describedBy="password-feedback"
        showStrength
      />
      <PasswordField
        label="再輸入一次新密碼"
        name="confirm_password"
        autoComplete="new-password"
        invalid={Boolean(state.error)}
        describedBy="password-feedback"
      />
      <Feedback state={state} id="password-feedback" />
      <div>
        <button type="submit" disabled={pending} className="btn-primary px-6">
          {pending && <span className="spinner" aria-hidden />}
          {pending ? "更新中…" : hasPassword ? "更新密碼" : "設定密碼"}
        </button>
      </div>
    </form>
  );
}
