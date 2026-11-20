"use client";

import { useActionState } from "react";
import { deleteAccount, type DeleteAccountState } from "./actions";

export function DeleteAccount() {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="delete-account">
      <p className="text-sm opacity-80">
        帳號、所有分析、貼文資料與紀錄會立即永久刪除，無法復原。請輸入「刪除」確認。
      </p>
      <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
        確認文字
        <input
          name="confirm"
          required
          autoComplete="off"
          className="rounded-md border border-foreground/20 bg-transparent px-3 py-2"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-red-600 bg-red-600 px-4 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "刪除中…" : "刪除帳號"}
        </button>
      </div>
    </form>
  );
}
