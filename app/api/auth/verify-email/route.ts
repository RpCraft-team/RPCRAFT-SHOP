import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { checkRateLimit } from "@/lib/cloudflare/rate-limit";
import { hashToken } from "@/lib/cloudflare/crypto";


export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid verification details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const rate = await checkRateLimit(request, env, "auth:verify-email", 10, 600, email);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const record = await env.DB.prepare(`
      SELECT id,user_id,code_hash,attempts FROM email_verification_codes
      WHERE email = ? COLLATE NOCASE AND purpose = 'signup' AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC LIMIT 1
    `).bind(email).first<{
      id: string;
      user_id: string;
      code_hash: string;
      attempts: number;
    }>();

    if (!record || record.attempts >= 5) {
      return NextResponse.json({ error: "Code is invalid or expired. Please request a new one." }, { status: 400 });
    }

    const attempt = await env.DB.prepare(`
      UPDATE email_verification_codes
      SET attempts = attempts + 1
      WHERE id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND attempts < 5
    `).bind(record.id).run();

    if (!attempt.meta.changes) {
      return NextResponse.json({ error: "Code is invalid or expired." }, { status: 400 });
    }

    if (await hashToken(code) !== record.code_hash) {
      return NextResponse.json({ error: "Incorrect verification code." }, { status: 400 });
    }

    const consumed = await env.DB.prepare(`
      UPDATE email_verification_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND attempts <= 5
    `).bind(record.id).run();

    if (!consumed.meta.changes) {
      return NextResponse.json({ error: "Code has already been used." }, { status: 400 });
    }

    const verified = await env.DB.prepare(
      "UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND email = ? COLLATE NOCASE AND email_verified = 0"
    ).bind(record.user_id, email).run();

    if (!verified.meta.changes) {
      return NextResponse.json({ error: "Account is already verified or no longer exists." }, { status: 409 });
    }

    return NextResponse.json({ success: true, message: "Email verified. You can now sign in." });
  } catch {
    return NextResponse.json({ error: "Email verification could not be completed." }, { status: 500 });
  }
}
