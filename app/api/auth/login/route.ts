import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { checkRateLimit } from "@/lib/cloudflare/rate-limit";
import { verifyPassword } from "@/lib/cloudflare/crypto";
import { createSession } from "@/lib/cloudflare/session";


export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password || username.length > 24 || password.length > 128) {
      return NextResponse.json({ error: "Invalid login details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const rate = await checkRateLimit(request, env, "auth:login", 10, 900, username);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const user = await env.DB.prepare(`
      SELECT u.id, u.password_hash,
             p.username, p.role
      FROM users u
      JOIN profiles p ON p.id = u.id
      WHERE p.username = ? COLLATE NOCASE
      LIMIT 1
    `).bind(username).first<{
      id: string;
      password_hash: string;
      username: string;
      role: string;
    }>();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }


    if (user.role === "suspended") {
      return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
    }

    const token = await createSession(user.id);
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role }
    });

    response.cookies.set("rpcraft_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Login could not be completed." }, { status: 500 });
  }
}
