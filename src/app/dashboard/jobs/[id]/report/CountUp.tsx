"use client";

import { useLayoutEffect, useRef } from "react";

const DURATION_MS = 500;

/**
 * 數字從 0 跑到實際值（例如「1,234」「2.77%」「5.9 篇」）。
 * 伺服器先輸出最終文字（無 JS 或讀螢幕軟體都看得到正確值），
 * 載入後才在畫面上播放動畫；系統開啟「減少動態效果」時不播放。
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const m = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const [, prefix, num, suffix] = m;
    const target = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = num.split(".")[1]?.length ?? 0;
    const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${prefix}${fmt.format(target * eased)}${suffix}`;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    el.textContent = `${prefix}${fmt.format(0)}${suffix}`;
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = value;
    };
  }, [value]);

  return <span ref={ref}>{value}</span>;
}
