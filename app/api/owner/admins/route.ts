import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

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
      SELECT p.id, p.username, p.created_at,
        COALESCE(a.can_review_products, 1) AS can_review_products,
        COALESCE(a.can_review_sellers, 0) AS can_review_sellers,
        COALESCE(a.can_handle_reports, 1) AS can_handle_reports,
        COALESCE(a.can_manage_users, 0) AS can_manage_users,
        COALESCE(a.can_handle_tickets, 0) AS can_handle_tickets
      FROM profiles p
      LEFT JOIN admin_permissions a ON a.admin_id = p.id
      WHERE p.role = 'admin'
      ORDER BY p.username
    `).all();

    return NextResponse.json({ admins: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load administrators." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:owner:admins", 60, 60);
  if (guard) return guard;

  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const adminId = String(body.adminId ?? "").trim();
    const fields = [
      "can_review_products",
      "can_review_sellers",
      "can_handle_reports",
      "can_manage_users",
      "can_handle_tickets"
    ] as const;

    if (!adminId || adminId === owner.id) {
      return NextResponse.json({ error: "Invalid administrator." }, { status: 400 });
    }

    if (fields.some((field) => typeof body[field] !== "boolean")) {
      return NextResponse.json({ error: "All permission values must be boolean." }, { status: 400 });
    }

    const env = await getShopEnv();
    const admin = await env.DB.prepare(
      "SELECT id FROM profiles WHERE id = ? AND role = 'admin'"
    ).bind(adminId).first();

    if (!admin) return NextResponse.json({ error: "Administrator not found." }, { status: 404 });

    await env.DB.prepare(`
      INSERT INTO admin_permissions (
        admin_id, can_review_products, can_review_sellers,
        can_handle_reports, can_manage_users, can_handle_tickets, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(admin_id) DO UPDATE SET
        can_review_products = excluded.can_review_products,
        can_review_sellers = excluded.can_review_sellers,
        can_handle_reports = excluded.can_handle_reports,
        can_manage_users = excluded.can_manage_users,
        can_handle_tickets = excluded.can_handle_tickets,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      adminId,
      Number(body.can_review_products),
      Number(body.can_review_sellers),
      Number(body.can_handle_reports),
      Number(body.can_manage_users),
      Number(body.can_handle_tickets)
    ).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
      VALUES (?, ?, 'admin_permissions_updated', 'admin', ?, ?)
    `).bind(
      crypto.randomUUID(),
      owner.id,
      adminId,
      JSON.stringify(Object.fromEntries(fields.map((field) => [field, body[field]])))
    ).run();

    return NextResponse.json({ success: true, adminId });
  } catch {
    return NextResponse.json({ error: "Could not update administrator permissions." }, { status: 500 });
  }
}
