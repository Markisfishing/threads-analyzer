/** 產品標誌：三根長條（與 docs/assets/app-icon-1024.png 同一造型），使用強調色。 */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <rect x="7" y="16" width="4.5" height="9" rx="1.5" fill="var(--accent-ink)" opacity="0.7" />
      <rect x="13.75" y="11" width="4.5" height="14" rx="1.5" fill="var(--accent-ink)" opacity="0.85" />
      <rect x="20.5" y="6" width="4.5" height="19" rx="1.5" fill="var(--accent-ink)" />
    </svg>
  );
}
