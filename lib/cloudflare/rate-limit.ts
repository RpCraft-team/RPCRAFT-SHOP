import type { ShopEnv } from "@/lib/cloudflare/env";
import { hashToken } from "@/lib/cloudflare/crypto";

async function incrementCounter(
  env: ShopEnv,
  keyHash: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Math.floor(Date.now() / 1000);
  const resetBefore = now - windowSeconds;

  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (key_hash, window_started_at, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(key_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN rate_limits.window_started_at <= ? THEN ?
        ELSE rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN rate_limits.window_started_at <= ? THEN 1
        ELSE rate_limits.request_count + 1
      END
    RETURNING request_count
  `).bind(keyHash, now, resetBefore, now, resetBefore)
    .first<{ request_count: number }>();

  if (!result) return { allowed: false, remaining: 0 };

  return {
    allowed: result.request_count <= maxRequests,
    remaining: Math.max(0, maxRequests - result.request_count),
  };
}

export async function checkRateLimit(
  request: Request,
  env: ShopEnv,
  scope: string,
  maxRequests: number,
  windowSeconds: number,
  identifier?: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return { allowed: false, remaining: 0 };

  const ipHash = await hashToken(`${scope}:ip:${ip}`);
  const ipLimit = await incrementCounter(env, ipHash, maxRequests, windowSeconds);
  if (!ipLimit.allowed) return ipLimit;

  if (!identifier?.trim()) return ipLimit;

  const normalized = identifier.trim().toLowerCase();
  const identityHash = await hashToken(`${scope}:identity:${normalized}`);
  const identityLimit = await incrementCounter(env, identityHash, maxRequests, windowSeconds);

  return {
    allowed: identityLimit.allowed,
    remaining: Math.min(ipLimit.remaining, identityLimit.remaining),
  };
}
