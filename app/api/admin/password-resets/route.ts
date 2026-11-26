import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";
import { createSecurityCode, hashToken } from "@/lib/cloudflare/crypto";

export const runtime = "edge";

async function canManageUsers(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user || !["owner", "admin"].includes(user.role)) return null;
  if (user.role === "owner") return user;

  const env = await getShopEnv();
  const permission = await env.DB.prepare(
    "SELECT can_manage_users FROM admin_permissions WHERE admin_id = ?"
  ).bind(user.id).first<{ can_manage_users: number }>();

  return permission?.can_manage_users ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await canManageUsers(request);
    if (!actor) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      SELECT r.id, r.email, r.status, r.created_at, r.updated_at,
             p.username, h.username AS handled_by_username
      FROM password_reset_requests r
      JOIN profiles p ON p.id = r.user_id
      LEFT JOIN profiles h ON h.id = r.handled_by
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC
      LIMIT 100
    `).all();

    return NextResponse.json({ requests: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load reset requests." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardMutation(request, "api:admin:password-resets", 20, 3600);
  if (guard) return guard;

  try {
    const actor = await canManageUsers(request);
    if (!actor) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? rawBody as Record<string, any>
      : {};
    const requestId = String(body.requestId ?? "").trim();
    if (!requestId || requestId.length > 100) {
      return NextResponse.json({ error: "Invalid reset request." }, { status: 400 });
    }

    const env = await getShopEnv();
    const resetRequest = await env.DB.prepare(`
      SELECT id, user_id, email FROM password_reset_requests
      WHERE id = ? AND status = 'pending'
      LIMIT 1
    `).bind(requestId).first<{ id: string; user_id: string; email: string }>();

    if (!resetRequest) {
      return NextResponse.json({ error: "Request not found or already handled." }, { status: 404 });
    }

    const code = createSecurityCode();
    const codeHash = await hashToken(code);

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE email_verification_codes
        SET used_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL
      `).bind(resetRequest.user_id),
      env.DB.prepare(`
        INSERT INTO email_verification_codes
          (id, user_id, email, code_hash, purpose, expires_at)
        VALUES (?, ?, ?, ?, 'password_reset', datetime('now', '+10 minutes'))
      `).bind(crypto.randomUUID(), resetRequest.user_id, resetRequest.email, codeHash),
      env.DB.prepare(`
        UPDATE password_reset_requests
        SET status = 'issued', handled_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).bind(actor.id, requestId)
    ]);

    return NextResponse.json({
      success: true,
      email: resetRequest.email,
      code,
      expiresInMinutes: 10,
      message: "Code generated. Send it manually to the account owner."
    });
  } catch {
    return NextResponse.json({ error: "Could not generate reset code." }, { status: 500 });
  }
}
