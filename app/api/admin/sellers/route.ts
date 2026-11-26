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
    "SELECT can_review_sellers FROM admin_permissions WHERE admin_id = ?"
  ).bind(user.id).first<{ can_review_sellers: number }>();

  return { user, allowed: permission?.can_review_sellers === 1 };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!auth.allowed) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const env = await getShopEnv();
    const status = request.nextUrl.searchParams.get("status") || "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const result = await env.DB.prepare(`
      SELECT a.id, a.user_id, a.status, a.message, a.created_at,
             p.username, p.phone
      FROM seller_applications a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.status = ?
      ORDER BY a.created_at DESC LIMIT 100
    `).bind(status).all();

    return NextResponse.json({ applications: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load seller applications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:admin:sellers", 60, 60);
  if (guard) return guard;

  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!auth.allowed) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const id = String(body.applicationId ?? "").trim();
    const status = String(body.status ?? "");

    if (!id || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid review request." }, { status: 400 });
    }

    const env = await getShopEnv();
    const application = await env.DB.prepare(`
      SELECT id, user_id FROM seller_applications
      WHERE id = ? AND status = 'pending'
    `).bind(id).first<{ id: string; user_id: string }>();

    if (!application) {
      return NextResponse.json({ error: "Pending application not found." }, { status: 404 });
    }

    const statements = [
      env.DB.prepare(`
        UPDATE seller_applications
        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).bind(status, auth.user.id, id)
    ];

    if (status === "approved") {
      statements.push(
        env.DB.prepare(
          "UPDATE profiles SET role = 'seller' WHERE id = ? AND role = 'user'"
        ).bind(application.user_id)
      );
    }

    statements.push(
      env.DB.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'seller_application', ?, ?)
      `).bind(crypto.randomUUID(), auth.user.id, `seller_${status}`, id, JSON.stringify({ userId: application.user_id }))
    );

    await env.DB.batch(statements);
    return NextResponse.json({ success: true, applicationId: id, status });
  } catch {
    return NextResponse.json({ error: "Could not review seller application." }, { status: 500 });
  }
}
