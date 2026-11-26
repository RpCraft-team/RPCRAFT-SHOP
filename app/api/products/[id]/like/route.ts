import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
){
  const guard = await guardMutation(request, "api:post:products:[id]:like", 30, 60);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await params;
    const env = await getShopEnv();

    const product = await env.DB.prepare(
      "SELECT id FROM products WHERE id = ? AND status = 'approved'"
    ).bind(id).first();

    if (!product) {
      return NextResponse.json({ error: "Plugin not found." }, { status: 404 });
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO plugin_likes (id, product_id, user_id)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID(), id, user.id).run();

    const result = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM plugin_likes WHERE product_id = ?"
    ).bind(id).first<{ total: number }>();

    return NextResponse.json({ success: true, liked: true, likes: result?.total ?? 0 });
  } catch {
    return NextResponse.json({ error: "Could not update like." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
){
  const guard = await guardMutation(request, "api:delete:products:[id]:like", 30, 60);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await params;
    const env = await getShopEnv();

    await env.DB.prepare(
      "DELETE FROM plugin_likes WHERE product_id = ? AND user_id = ?"
    ).bind(id, user.id).run();

    const result = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM plugin_likes WHERE product_id = ?"
    ).bind(id).first<{ total: number }>();

    return NextResponse.json({ success: true, liked: false, likes: result?.total ?? 0 });
  } catch {
    return NextResponse.json({ error: "Could not update like." }, { status: 500 });
  }
}
