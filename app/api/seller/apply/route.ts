import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


async function currentUser(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  return token ? getSessionUser(token) : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const env = await getShopEnv();
    const application = await env.DB.prepare(`
      SELECT id, status, message, reviewed_at, created_at
      FROM seller_applications
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(user.id).first();

    return NextResponse.json({ application: application ?? null });
  } catch {
    return NextResponse.json({ error: "Could not load seller application." }, { status: 500 });
  }
}

export async function POST(request: NextRequest){
  const guard = await guardMutation(request, "api:post:seller:apply", 30, 60);
  if (guard) return guard;

  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    if (user.role === "seller" || user.role === "owner") {
      return NextResponse.json({ error: "You already have seller access." }, { status: 409 });
    }

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const message = String(body.message ?? "").trim();
    if (message.length > 1500) {
      return NextResponse.json({ error: "Application message is too long." }, { status: 400 });
    }

    const env = await getShopEnv();
    const existing = await env.DB.prepare(`
      SELECT id FROM seller_applications
      WHERE user_id = ? AND status = 'pending' LIMIT 1
    `).bind(user.id).first();

    if (existing) {
      return NextResponse.json({ error: "You already have a pending application." }, { status: 409 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO seller_applications (id, user_id, message)
      VALUES (?, ?, ?)
    `).bind(id, user.id, message).run();

    return NextResponse.json({ success: true, applicationId: id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit seller application." }, { status: 500 });
  }
}
