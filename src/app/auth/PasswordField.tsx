"use client";

import { useId, useState } from "react";

/** 密碼規則：與 Supabase 最低長度 8 一致，其餘為建議。 */
export const PASSWORD_RULES = [
  { label: "至少 8 個字元", test: (p: string) => p.length >= 8, required: true },
  { label: "同時包含英文字母與數字", test: (p: string) => /[a-z]/i.test(p) && /\d/.test(p) },
  { label: "包含大寫或符號", test: (p: string) => /[A-Z]/.test(p) || /[^a-z0-9]/i.test(p) },
  { label: "12 個字元以上更安全", test: (p: string) => p.length >= 12 },
] as const;

const STRENGTH = ["太短", "弱", "普通", "強", "很強"];

export function passwordScore(p: string) {
  if (p.length < 8) return 0;
  return PASSWORD_RULES.filter((r) => r.test(p)).length;
}

type Props = {
  label: string;
  name: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
  /** 顯示規則清單與強度條（註冊、改密碼用） */
  showStrength?: boolean;
};

/** 密碼欄：可切換顯示／隱藏；需要時顯示強度條與規則清單。 */
export function PasswordField({ label, name, autoComplete, invalid, describedBy, showStrength }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const score = passwordScore(value);
  const tone = ["var(--danger)", "var(--danger)", "#c98a00", "var(--accent)", "var(--accent)"][score];

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={showStrength ? 8 : undefined}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, showStrength ? `${id}-rules` : undefined].filter(Boolean).join(" ") || undefined}
          className="field w-full pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          title={visible ? "隱藏" : "顯示"}
          aria-label={visible ? "隱藏輸入內容" : "顯示輸入內容"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-foreground"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {showStrength && (
        <div id={`${id}-rules`} className="flex flex-col gap-1.5" data-testid="password-strength">
          <div className="flex items-center gap-2" aria-live="polite">
            <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full transition-colors duration-200"
                  style={{ background: value && score >= i ? tone : "var(--border-soft)" }}
                />
              ))}
            </div>
            <span className="w-10 text-right text-xs text-muted">{value ? STRENGTH[score] : ""}</span>
          </div>
          <ul className="flex flex-col gap-0.5 text-xs">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.label} className={ok ? "text-accent" : "text-muted"}>
                  <span aria-hidden>{ok ? "✓" : "○"}</span> {r.label}
                  {"required" in r && r.required ? "（必要）" : ""}
                  <span className="sr-only">{ok ? "，已符合" : "，未符合"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
