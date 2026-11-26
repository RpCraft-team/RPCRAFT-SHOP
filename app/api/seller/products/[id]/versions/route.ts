import { guardMutation } from "@/lib/cloudflare/api-guard";
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

    const product = await env.DB.prepare(
      "SELECT id, author_id, status FROM products WHERE id = ?"
    ).bind(id).first<{ id: string; author_id: string; status: string }>();

    if (!product) return NextResponse.json({ error: "Plugin not found." }, { status: 404 });

    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    if (!user || (user.role !== "owner" && product.author_id !== user.id)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const result = await env.DB.prepare(`
      SELECT id, version, changelog, created_at
      FROM plugin_versions WHERE product_id = ?
      ORDER BY created_at DESC
    `).bind(id).all();

    return NextResponse.json({ versions: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load versions." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
){
  const guard = await guardMutation(request, "api:post:seller:products:[id]:versions", 30, 60);
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
    const version = String(body.version ?? "").trim();
    const changelog = String(body.changelog ?? "").trim();
    const fileKey = String(body.fileKey ?? "").trim();

    if (!version || version.length > 40 || changelog.length > 5000 ||
        !fileKey || fileKey.length > 500) {
      return NextResponse.json({ error: "Invalid version details." }, { status: 400 });
    }

    if (!fileKey.startsWith(`${user.id}/`) || fileKey.includes("\\") ||
        fileKey.split("/").some((part: string) => !part || part === "." || part === "..")) {
      return NextResponse.json({ error: "Invalid or unauthorized file key." }, { status: 400 });
    }

    const env = await getShopEnv();
    const product = await env.DB.prepare(
      "SELECT id, author_id FROM products WHERE id = ?"
    ).bind(id).first<{ id: string; author_id: string; status: string }>();

    if (!product) return NextResponse.json({ error: "Plugin not found." }, { status: 404 });
    if (user.role !== "owner" && product.author_id !== user.id) {
      return NextResponse.json({ error: "You can only update your own plugins." }, { status: 403 });
    }
    if (user.role !== "owner" && product.status !== "approved") {
      return NextResponse.json({ error: "The plugin must be approved before publishing new versions." }, { status: 409 });
    }

    const versionId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO plugin_versions (id, product_id, version, changelog, file_key)
        VALUES (?, ?, ?, ?, ?)
      `).bind(versionId, id, version, changelog, fileKey),
      env.DB.prepare(`
        UPDATE products SET version = ?, file_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(version, fileKey, id),
      env.DB.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
        VALUES (?, ?, 'product_version_published', 'product', ?)
      `).bind(crypto.randomUUID(), user.id, id)
    ]);

    return NextResponse.json({ success: true, versionId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not publish version. Check whether this version already exists." }, { status: 500 });
  }
}
