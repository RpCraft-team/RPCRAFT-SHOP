import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
){
  const guard = await guardMutation(request, "api:patch:seller:products:[id]", 30, 60);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    if (!user || !["owner", "seller"].includes(user.role)) {
      return NextResponse.json({ error: "Seller access required." }, { status: 403 });
    }

    const { id } = await params;
    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();
    const version = String(body.version ?? "").trim();
    const category = String(body.category ?? "").trim();
    const isFree = body.isFree === true;
    const price = isFree ? 0 : Number(body.price);
    const minecraftVersions = body.minecraftVersions;
    const platform = body.platform;

    if (!id || !name || name.length > 100 || !description ||
        description.length > 10000 || !version || version.length > 40 ||
        !category || category.length > 60 ||
        !Array.isArray(minecraftVersions) || !Array.isArray(platform) ||
        minecraftVersions.length > 30 || platform.length > 20 ||
        !minecraftVersions.every((v: unknown) => typeof v === "string" && v.length <= 30) ||
        !platform.every((v: unknown) => typeof v === "string" && v.length <= 40) ||
        !Number.isSafeInteger(price) || price < 0 || (!isFree && price === 0)) {
      return NextResponse.json({ error: "Invalid plugin details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const product = await env.DB.prepare(
      "SELECT id, author_id, status FROM products WHERE id = ? LIMIT 1"
    ).bind(id).first<{ id: string; author_id: string; status: string }>();

    if (!product) return NextResponse.json({ error: "Plugin not found." }, { status: 404 });
    if (user.role !== "owner" && product.author_id !== user.id) {
      return NextResponse.json({ error: "You can only edit your own plugins." }, { status: 403 });
    }

    const status = product.status === "approved" ? "approved" : (user.role === "owner" ? product.status : "pending");
    await env.DB.prepare(`
      UPDATE products SET name = ?, description = ?, price = ?, is_free = ?,
        version = ?, minecraft_versions = ?, platform = ?, category = ?,
        status = COALESCE(?, status), rejection_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name, description, price, Number(isFree), version,
      JSON.stringify(minecraftVersions), JSON.stringify(platform),
      category, status ?? null, id
    ).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
      VALUES (?, ?, 'product_updated', 'product', ?)
    `).bind(crypto.randomUUID(), user.id, id).run();

    return NextResponse.json({ success: true, productId: id, status: status ?? "unchanged" });
  } catch {
    return NextResponse.json({ error: "Could not update plugin." }, { status: 500 });
  }
}
