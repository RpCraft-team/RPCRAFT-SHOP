import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

export async function POST(request: NextRequest){
  const guard = await guardMutation(request, "api:post:reports", 10, 3600);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const productId = String(body.productId ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!productId || reason.length < 5 || reason.length > 1000) {
      return NextResponse.json({ error: "Invalid report details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const product = await env.DB.prepare(
      "SELECT id FROM products WHERE id = ? AND status = 'approved'"
    ).bind(productId).first();

    if (!product) return NextResponse.json({ error: "Plugin not found." }, { status: 404 });

    const existing = await env.DB.prepare(`
      SELECT id FROM reports
      WHERE reporter_id = ? AND product_id = ? AND status = 'open'
      LIMIT 1
    `).bind(user.id, productId).first();

    if (existing) {
      return NextResponse.json({ error: "You already reported this plugin." }, { status: 409 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO reports (id, reporter_id, product_id, reason)
      VALUES (?, ?, ?, ?)
    `).bind(id, user.id, productId, reason).run();

    return NextResponse.json({ success: true, reportId: id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit report." }, { status: 500 });
  }
}
