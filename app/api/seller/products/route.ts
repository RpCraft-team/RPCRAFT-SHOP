import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;
    if (!user || !["owner", "seller"].includes(user.role))
      return NextResponse.json({ error: "Seller access required." }, { status: 403 });
    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      SELECT id,name,description,price,is_free,version,minecraft_versions,
        platform,category,status,rejection_reason,created_at
      FROM products WHERE author_id = ? ORDER BY created_at DESC LIMIT 100
    `).bind(user.id).all<Record<string, any>>();
    const products = (result.results || []).map(product => ({
      ...product,
      is_free: Boolean(product.is_free),
      minecraft_versions: JSON.parse(String(product.minecraft_versions || "[]")),
      platform: JSON.parse(String(product.platform || "[]"))
    }));
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: "Could not load your plugins." }, { status: 500 });
  }
}

export async function POST(request: NextRequest){
  const guard = await guardMutation(request, "api:post:seller:products", 30, 60);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    if (!user || !["owner", "seller"].includes(user.role)) {
      return NextResponse.json({ error: "Seller access required." }, { status: 403 });
    }

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();
    const version = String(body.version ?? "").trim();
    const category = String(body.category ?? "Other").trim();
    const fileKey = String(body.fileKey ?? "").trim();
    const iconUrl = body.iconUrl ? String(body.iconUrl).trim() : null;
    const isFree = body.isFree === true;
    const price = isFree ? 0 : Number(body.price);
    const minecraftVersions = body.minecraftVersions;
    const platform = body.platform;

    if (!name || name.length > 100 || !description || description.length > 10000 ||
        !version || version.length > 40 || !category || category.length > 60 ||
        !fileKey || fileKey.length > 500 ||
        !Array.isArray(minecraftVersions) || !Array.isArray(platform) ||
        minecraftVersions.length > 30 || platform.length > 20 ||
        !minecraftVersions.every((v: unknown) => typeof v === "string" && v.length <= 30) ||
        !platform.every((v: unknown) => typeof v === "string" && v.length <= 40) ||
        !Number.isSafeInteger(price) || price < 0 || (!isFree && price === 0)) {
      return NextResponse.json({ error: "Invalid plugin details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const id = crypto.randomUUID();
    const status = user.role === "owner" ? "approved" : "pending";

    await env.DB.prepare(`
      INSERT INTO products (
        id, author_id, name, description, price, is_free, version,
        minecraft_versions, platform, category, icon_key, file_key, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, user.id, name, description, price, Number(isFree), version,
      JSON.stringify(minecraftVersions), JSON.stringify(platform),
      category, iconUrl, fileKey, status
    ).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
      VALUES (?, ?, 'product_submitted', 'product', ?)
    `).bind(crypto.randomUUID(), user.id, id).run();

    return NextResponse.json({ success: true, productId: id, status }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit plugin." }, { status: 500 });
  }
}
