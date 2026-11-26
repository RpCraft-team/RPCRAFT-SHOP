import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


async function getOwner(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  return user?.role === "owner" ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      SELECT p.id, p.username, p.phone, p.role, p.created_at, u.email,
        (SELECT COUNT(*) FROM products WHERE author_id = p.id) AS product_count
      FROM profiles p
      JOIN users u ON u.id = p.id
      ORDER BY p.created_at DESC
      LIMIT 200
    `).all();

    return NextResponse.json({ users: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:owner:users", 60, 60);
  if (guard) return guard;

  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const userId = String(body.userId ?? "").trim();
    const role = String(body.role ?? "");

    if (!userId || !["user", "seller", "admin", "suspended"].includes(role)) {
      return NextResponse.json({ error: "Invalid user or role." }, { status: 400 });
    }

    if (userId === owner.id) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }

    const env = await getShopEnv();
    const target = await env.DB.prepare(
      "SELECT id, role FROM profiles WHERE id = ?"
    ).bind(userId).first<{ id: string; role: string }>();

    if (!target || target.role === "owner") {
      return NextResponse.json({ error: "User not found or cannot be modified." }, { status: 404 });
    }

    await env.DB.batch([
      env.DB.prepare("UPDATE profiles SET role = ? WHERE id = ?").bind(role, userId),
      env.DB.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
        VALUES (?, ?, 'user_role_changed', 'user', ?, ?)
      `).bind(crypto.randomUUID(), owner.id, userId, JSON.stringify({ from: target.role, to: role }))
    ]);

    return NextResponse.json({ success: true, userId, role });
  } catch {
    return NextResponse.json({ error: "Could not update user." }, { status: 500 });
  }
}
