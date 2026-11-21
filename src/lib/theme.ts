/** 主題偏好：跟隨系統／亮色／暗色。偏好存在 localStorage（只限這台裝置），實際套用的主題寫在 <html data-theme>。 */
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "theme";
export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];
export const THEME_LABELS: Record<ThemePref, string> = { system: "跟隨系統", light: "亮色", dark: "暗色" };

export function parsePref(v: unknown): ThemePref {
  return v === "light" || v === "dark" ? v : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/**
 * 放在 <head> 的 inline script：畫面繪製前就設定 data-theme，避免暗色使用者先看到一下亮色（閃白）。
 * localStorage 被封鎖（無痕模式、停用網站資料）時改為跟隨系統。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")}catch(e){}if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePref=p})()`;
