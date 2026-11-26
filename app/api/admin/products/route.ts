import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

async function authorize(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) return { user: null, allowed: false };

  if (user.role === "owner") return { user, allowed: true };
  if (user.role !== "admin") return { user, allowed: false };

  const env = await getShopEnv();
  const permission = await env.DB.prepare(
    "SELECT can_review_products FROM admin_permissions WHERE admin_id = ?"
  ).bind(user.id).first<{ can_review_products: number }>();

  return { user, allowed: permission?.can_review_products === 1 };
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
      SELECT p.*, pr.username AS author_username
      FROM products p
      JOIN profiles pr ON pr.id = p.author_id
      WHERE p.status = ?
      ORDER BY p.created_at DESC
      LIMIT 100
    `).bind(status).all();

    return NextResponse.json({ products: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load moderation queue." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:admin:products", 60, 60);
  if (guard) return guard;

  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!auth.allowed) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const productId = String(body.productId ?? "").trim();
    const status = String(body.status ?? "");
    const reason = String(body.reason ?? "").trim().slice(0, 1000);

    if (!productId || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid moderation request." }, { status: 400 });
    }
    if (status === "rejected" && !reason) {
      return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
    }

    const env = await getShopEnv();
    const product = await env.DB.prepare(
      "SELECT id FROM products WHERE id = ? AND status = 'pending'"
    ).bind(productId).first();

    if (!product) return NextResponse.json({ error: "Pending product not found." }, { status: 404 });

    await env.DB.prepare(`
      UPDATE products
      SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, status === "rejected" ? reason : null, productId).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
      VALUES (?, ?, ?, 'product', ?, ?)
    `).bind(
      crypto.randomUUID(),
      auth.user.id,
      `product_${status}`,
      productId,
      JSON.stringify({ reason })
    ).run();

    return NextResponse.json({ success: true, productId, status });
  } catch {
    return NextResponse.json({ error: "Could not moderate product." }, { status: 500 });
  }
}
