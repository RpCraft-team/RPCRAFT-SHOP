/// <reference types="@cloudflare/workers-types" />
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface ShopEnv {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export async function getShopEnv(): Promise<ShopEnv> {
  const context = await getCloudflareContext({ async: true });
  const env = context.env as unknown as ShopEnv;

  if (!env.DB || !env.SESSION_KV) {
    throw new Error("Cloudflare D1 or KV binding is missing.");
  }

  return env;
}
