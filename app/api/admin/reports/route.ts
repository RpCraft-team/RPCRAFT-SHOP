import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


async function authorize(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) return { user: null, allowed: false };
  if (user.role === "owner") return { user, allowed: true };
  if (user.role !== "admin") return { user, allowed: false };

  const env = await getShopEnv();
  const permission = await env.DB.prepare(
    "SELECT can_handle_reports FROM admin_permissions WHERE admin_id = ?"
  ).bind(user.id).first<{ can_handle_reports: number }>();

  return { user, allowed: permission?.can_handle_reports === 1 };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!auth.allowed) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const status = request.nextUrl.searchParams.get("status") || "open";
    if (!["open", "resolved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      SELECT r.*, p.name AS product_name, u.username AS reporter_username
      FROM reports r
      LEFT JOIN products p ON p.id = r.product_id
      JOIN profiles u ON u.id = r.reporter_id
      WHERE r.status = ?
      ORDER BY r.created_at DESC LIMIT 100
    `).bind(status).all();

    return NextResponse.json({ reports: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:admin:reports", 10, 3600);
  if (guard) return guard;

  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!auth.allowed) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const id = String(body.reportId ?? "").trim();
    const status = String(body.status ?? "");

    if (!id || !["resolved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid report action." }, { status: 400 });
    }

    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      UPDATE reports SET status = ?
      WHERE id = ? AND status = 'open'
    `).bind(status, id).run();

    if (!result.meta.changes) {
      return NextResponse.json({ error: "Open report not found." }, { status: 404 });
    }

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
      VALUES (?, ?, ?, 'report', ?)
    `).bind(crypto.randomUUID(), auth.user.id, `report_${status}`, id).run();

    return NextResponse.json({ success: true, reportId: id, status });
  } catch {
    return NextResponse.json({ error: "Could not update report." }, { status: 500 });
  }
}
