import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const env = await getShopEnv();
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    const product = await env.DB.prepare(`
      SELECT p.*, pr.username AS author_username
      FROM products p
      JOIN profiles pr ON pr.id = p.author_id
      WHERE p.id = ? AND p.status = 'approved'
      LIMIT 1
    `).bind(id).first<Record<string, any>>();

    if (!product) {
      return NextResponse.json({ error: "Plugin not found." }, { status: 404 });
    }

    const userId = user?.id ?? null;

    const [likes, liked, saved, following, history] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS total FROM plugin_likes WHERE product_id = ?"
      ).bind(id).first<{ total: number }>(),
      userId ? env.DB.prepare(
        "SELECT id FROM plugin_likes WHERE product_id = ? AND user_id = ?"
      ).bind(id, userId).first() : null,
      userId ? env.DB.prepare(
        "SELECT id FROM saved_plugins WHERE product_id = ? AND user_id = ?"
      ).bind(id, userId).first() : null,
      userId ? env.DB.prepare(
        "SELECT id FROM creator_follows WHERE creator_id = ? AND follower_id = ?"
      ).bind(product.author_id, userId).first() : null,
      env.DB.prepare(`
        SELECT id, version, changelog, created_at
        FROM plugin_versions
        WHERE product_id = ?
        ORDER BY created_at DESC
      `).bind(id).all()
    ]);

    const { file_key, icon_key, ...publicProduct } = product;
    const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
    const iconUrl = icon_key && baseUrl
      ? `${baseUrl}/storage/v1/object/public/plugin-icons/${String(icon_key).split("/").map(encodeURIComponent).join("/")}`
      : null;

    return NextResponse.json({
      product: {
        ...publicProduct,
        icon_url: iconUrl,
        is_free: Boolean(product.is_free),
        minecraft_versions: JSON.parse(String(product.minecraft_versions || "[]")),
        platform: JSON.parse(String(product.platform || "[]"))
      },
      userId,
      isOwner: !!userId && userId === product.author_id,
      liked: !!liked,
      saved: !!saved,
      following: !!following,
      likeCount: likes?.total ?? 0,
      versions: history.results ?? []
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load plugin details." },
      { status: 500 }
    );
  }
}
