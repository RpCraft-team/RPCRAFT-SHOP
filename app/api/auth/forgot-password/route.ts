import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { checkRateLimit } from "@/lib/cloudflare/rate-limit";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? rawBody as Record<string, any>
      : {};
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const env = await getShopEnv();
    const rate = await checkRateLimit(request, env, "auth:forgot-password", 5, 3600, email);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1"
    ).bind(email).first<{ id: string }>();

    if (user) {
      const requestId = crypto.randomUUID();
      const recipients = await env.DB.prepare(`
        SELECT id FROM profiles WHERE role = 'owner'
        UNION
        SELECT p.id FROM profiles p
        JOIN admin_permissions a ON a.admin_id = p.id
        WHERE p.role = 'admin' AND a.can_manage_users = 1
      `).all<{ id: string }>();

      const statements = [
        env.DB.prepare(`
          INSERT INTO password_reset_requests (id, user_id, email)
          VALUES (?, ?, ?)
        `).bind(requestId, user.id, email)
      ];

      for (const recipient of recipients.results ?? []) {
        statements.push(
          env.DB.prepare(`
            INSERT INTO notifications
              (id, recipient_id, type, title, message, target_type, target_id)
            VALUES (?, ?, 'password_reset_request', 'درخواست بازیابی رمز عبور',
              'یک کاربر درخواست بازیابی رمز عبور ثبت کرده است.', 'password_reset', ?)
          `).bind(crypto.randomUUID(), recipient.id, requestId)
        );
      }

      await env.DB.batch(statements);
    }

    return NextResponse.json({
      success: true,
      message: "اگر حسابی با این ایمیل وجود داشته باشد، درخواست بازیابی برای مدیریت ارسال شده است. پس از بررسی، کد به ایمیل شما فرستاده می‌شود."
    });
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }
}
