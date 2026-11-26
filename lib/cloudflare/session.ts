import { getShopEnv } from "./env";
import { createSessionToken, hashToken } from "./crypto";

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  role: "owner" | "admin" | "seller" | "user" | "suspended";
  phone: string | null;
}

const SESSION_TTL = 60 * 60 * 24 * 30;

export async function createSession(userId: string): Promise<string> {
  const env = await getShopEnv();
  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString().replace("T", " ").replace("Z", "");

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, tokenHash, expiresAt).run();

  return token;
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 256) return null;

  const env = await getShopEnv();
  const tokenHash = await hashToken(token);
  const cacheKey = `session:${tokenHash}`;

  const cached = await env.SESSION_KV.get<SessionUser>(cacheKey, "json");
  if (cached) return cached;

  const user = await env.DB.prepare(`
    SELECT u.id, u.email, p.username, p.role, p.phone
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN profiles p ON p.id = u.id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(tokenHash).first<SessionUser>();

  if (!user || user.role === "suspended") return null;


  return user;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token || token.length > 256) return;

  const env = await getShopEnv();
  const tokenHash = await hashToken(token);

  await env.DB.prepare(
    "DELETE FROM sessions WHERE token_hash = ?"
  ).bind(tokenHash).run();

}
