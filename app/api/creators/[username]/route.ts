import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const env = await getShopEnv();

    const creator = await env.DB.prepare(`
      SELECT p.id, p.username, p.role, p.created_at,
        COUNT(pr.id) AS plugin_count,
        COALESCE(SUM(pr.download_count), 0) AS total_downloads
      FROM profiles p
      LEFT JOIN products pr
        ON pr.author_id = p.id AND pr.status = 'approved'
      WHERE p.username = ? COLLATE NOCASE
      GROUP BY p.id
      LIMIT 1
    `).bind(username).first<Record<string, unknown>>();

    if (!creator) {
      return NextResponse.json({ error: "Creator not found." }, { status: 404 });
    }

    const products = await env.DB.prepare(`
      SELECT id, name, description, price, is_free, version,
        minecraft_versions, platform, category, icon_key,
        download_count, created_at
      FROM products
      WHERE author_id = ? AND status = 'approved'
      ORDER BY created_at DESC
    `).bind(creator.id).all();

    const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
    return NextResponse.json({
      creator,
      products: (products.results ?? []).map((product: Record<string, unknown>) => {
        const { icon_key, ...publicProduct } = product;
        const iconUrl = icon_key && baseUrl
          ? `${baseUrl}/storage/v1/object/public/plugin-icons/${String(icon_key).split("/").map(encodeURIComponent).join("/")}`
          : null;
        return {
          ...publicProduct,
          icon_url: iconUrl,
          is_free: Boolean(product.is_free),
          minecraft_versions: JSON.parse(String(product.minecraft_versions || "[]")),
          platform: JSON.parse(String(product.platform || "[]"))
        };
      })
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load creator profile." },
      { status: 500 }
    );
  }
}
