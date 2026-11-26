import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";


export async function GET(request: NextRequest) {
  try {
    const env = await getShopEnv();
    const params = request.nextUrl.searchParams;
    const search = (params.get("q") ?? "").trim().slice(0, 100);
    const category = (params.get("category") ?? "").trim().slice(0, 60);
    const type = params.get("type");
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const limit = Math.min(40, Math.max(1, Number(params.get("limit") ?? 20) || 20));
    const offset = (page - 1) * limit;

    const conditions = ["p.status = 'approved'"];
    const values: (string | number)[] = [];

    if (search) {
      conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
      values.push(`%${search}%`, `%${search}%`);
    }

    if (category && category !== "all") {
      conditions.push("p.category = ?");
      values.push(category);
    }

    if (type === "free") conditions.push("p.is_free = 1");
    if (type === "paid") conditions.push("p.is_free = 0");

    const where = conditions.join(" AND ");

    const [countResult, productsResult] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${where}`)
        .bind(...values).first<{ total: number }>(),
      env.DB.prepare(`
        SELECT p.id, p.name, p.description, p.price, p.is_free, p.version,
               p.minecraft_versions, p.platform, p.category, p.icon_key AS icon_url,
               p.download_count, p.created_at, p.updated_at,
               p.author_id, pr.username AS author_username
        FROM products p
        JOIN profiles pr ON pr.id = p.author_id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(...values, limit, offset).all()
    ]);

    const storageBase = (env.SUPABASE_URL || "").replace(/\/$/, "");
    const products = (productsResult.results ?? []).map((product: Record<string, unknown>) => {
      const iconKey = String(product.icon_url || "");
      const iconUrl = storageBase && iconKey
        ? `${storageBase}/storage/v1/object/public/plugin-icons/${iconKey.split("/").map(encodeURIComponent).join("/")}`
        : null;
      return {
        ...product,
        icon_url: iconUrl,
        is_free: Boolean(product.is_free),
        minecraft_versions: JSON.parse(String(product.minecraft_versions || "[]")),
        platform: JSON.parse(String(product.platform || "[]"))
      };
    });

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total: countResult?.total ?? 0,
        totalPages: Math.ceil((countResult?.total ?? 0) / limit)
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load products." },
      { status: 500 }
    );
  }
}
