import { createBrowserClient } from "@supabase/ssr";

/** 瀏覽器端 Supabase client（Client Component 用，例如輪詢任務狀態）。 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
