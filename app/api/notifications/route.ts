import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";
import { guardMutation } from "@/lib/cloudflare/api-guard";


async function authorized(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  return user && (user.role === "owner" || user.role === "admin") ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await authorized(request);
    if (!user) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      SELECT id, type, title, message, target_type, target_id, is_read, created_at
      FROM notifications
      WHERE recipient_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(user.id).all();

    return NextResponse.json({ notifications: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await guardMutation(request, "api:notifications:read", 60, 3600);
  if (guard) return guard;

  try {
    const user = await authorized(request);
    if (!user) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const body = await request.json() as { id?: string; all?: boolean };
    const env = await getShopEnv();

    if (body.all) {
      await env.DB.prepare(
        "UPDATE notifications SET is_read = 1 WHERE recipient_id = ?"
      ).bind(user.id).run();
    } else if (body.id && body.id.length <= 100) {
      await env.DB.prepare(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?"
      ).bind(body.id, user.id).run();
    } else {
      return NextResponse.json({ error: "Invalid notification." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not update notification." }, { status: 500 });
  }
}
