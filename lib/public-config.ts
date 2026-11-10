import { env } from "cloudflare:workers";
import type { PublicConfig } from "./types";
export function publicConfig(): PublicConfig {
  const runtime = env as unknown as Record<string, string | undefined>;
  return {
    url: runtime.SUPABASE_URL ?? "",
    key: runtime.SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}
