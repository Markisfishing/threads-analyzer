"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type DeleteAccountState } from "./actions";

/** 刪除帳號：輸入「刪除」後按鈕才會啟用（伺服器端仍會再檢查一次）。 */
export function DeleteAccount() {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {});
  const [text, setText] = useState("");
  const ready = text.trim() === "刪除";
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="delete-account">
      <p className="text-sm text-[var(--ink-2)]">
        帳號、所有分析、貼文資料與紀錄會立即永久刪除，無法復原。請輸入「刪除」確認。
      </p>
      <div className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
        <label htmlFor="delete-confirm">確認文字</label>
        <input
          id="delete-confirm"
          name="confirm"
          required
          autoComplete="off"
          placeholder="刪除"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={state.error ? true : undefined}
          className="field"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={!ready || pending}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--danger)] px-5 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending && <span className="spinner" aria-hidden />}
          {pending ? "刪除中…" : "刪除帳號"}
        </button>
      </div>
    </form>
  );
}
