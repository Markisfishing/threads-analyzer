import type { NextConfig } from "next";

// 不開啟 cacheComponents：本專案頁面幾乎都依登入使用者而定（讀 cookie），
// 開啟後每個讀 session 的元件都必須包 Suspense，複雜度高、效益低。
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
