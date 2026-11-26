import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { checkRateLimit } from "@/lib/cloudflare/rate-limit";
import { hashPassword } from "@/lib/cloudflare/crypto";
import { verifyTurnstile } from "@/lib/cloudflare/turnstile";


export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const username = String(body.username ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const password = String(body.password ?? "");
    const turnstileToken = String(body.turnstileToken ?? "");

    if (username.length < 3 || username.length > 24 ||
        !/^[a-zA-Z0-9_]+$/.test(username) ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
        !/^\+[1-9]\d{7,14}$/.test(phone) ||
        password.length < 10 || password.length > 128) {
      return NextResponse.json({ error: "Invalid registration details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const rate = await checkRateLimit(request, env, "auth:register", 5, 3600, email);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const validHuman = await verifyTurnstile(
      env,
      turnstileToken,
      request.headers.get("CF-Connecting-IP") ?? undefined
    );
    if (!validHuman) {
      return NextResponse.json({ error: "Human verification failed. Please try again." }, { status: 400 });
    }

    const existing = await env.DB.prepare(`
      SELECT u.id FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.email = ? COLLATE NOCASE OR p.username = ? COLLATE NOCASE OR p.phone = ? LIMIT 1
    `).bind(email, username, phone).first();

    if (existing) {
      return NextResponse.json({ error: "Email, username, or phone is already registered." }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await env.DB.prepare(
      "INSERT INTO users (id,email,password_hash,email_verified) VALUES (?,?,?,1)"
    ).bind(userId, email, passwordHash).run();

    try {
      await env.DB.prepare(
        "INSERT INTO profiles (id,username,phone) VALUES (?,?,?)"
      ).bind(userId, username, phone).run();
    } catch (error) {
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      throw error;
    }

    return NextResponse.json({
      success: true,
      verificationRequired: false,
      message: "Your account has been created. You can sign in now."
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Registration could not be completed. Please try again." }, { status: 500 });
  }
}
