import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { checkRateLimit } from "@/lib/cloudflare/rate-limit";
import { hashToken, createSecurityCode } from "@/lib/cloudflare/crypto";
import { sendSecurityCode } from "@/lib/cloudflare/email";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const env = await getShopEnv();
    const rate = await checkRateLimit(request, env, "auth:forgot-password", 5, 3600, email);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE email = ? COLLATE NOCASE AND email_verified = 1 LIMIT 1"
    ).bind(email).first<{ id: string }>();

    if (user && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
      const code = createSecurityCode();
      const codeHash = await hashToken(code);

      await env.DB.prepare(`
        UPDATE email_verification_codes
        SET used_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL
      `).bind(user.id).run();

      await env.DB.prepare(`
        INSERT INTO email_verification_codes
        (id,user_id,email,code_hash,purpose,expires_at)
        VALUES (?,?,?,?, 'password_reset', datetime('now','+10 minutes'))
      `).bind(crypto.randomUUID(), user.id, email, codeHash).run();

      try {
        await sendSecurityCode(env, email, code, "password_reset");
      } catch {
        await env.DB.prepare(`
          UPDATE email_verification_codes
          SET used_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND purpose = 'password_reset'
            AND code_hash = ? AND used_at IS NULL
        `).bind(user.id, codeHash).run();
      }
    }

    return NextResponse.json({
      success: true,
      message: "If the account exists, a verification code has been sent."
    });
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }
}
