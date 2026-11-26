import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
){
  const guard = await guardMutation(request, "api:post:products:[id]:download", 20, 3600);
  if (guard) return guard;

  try {
    const { id } = await params;
    const env = await getShopEnv();

    const product = await env.DB.prepare(`
      SELECT id, file_key, is_free
      FROM products
      WHERE id = ? AND status = 'approved'
      LIMIT 1
    `).bind(id).first<{
      id: string;
      file_key: string | null;
      is_free: number;
    }>();

    if (!product || !product.is_free || !product.file_key) {
      return NextResponse.json(
        { error: "This plugin is not available for download." },
        { status: 404 }
      );
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Download service is not configured." },
        { status: 503 }
      );
    }

    const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
    const objectPath = product.file_key
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const storageResponse = await fetch(
      `${baseUrl}/storage/v1/object/sign/plugin-jars/${objectPath}`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresIn: 60 })
      }
    );

    if (!storageResponse.ok) {
      return NextResponse.json(
        { error: "Could not create a secure download link." },
        { status: 502 }
      );
    }

    const signedData = await storageResponse.json() as {
      signedURL?: string;
    };

    if (!signedData.signedURL) {
      return NextResponse.json(
        { error: "Storage returned an invalid download link." },
        { status: 502 }
      );
    }

    const signedUrl = new URL(signedData.signedURL, `${baseUrl}/storage/v1/`);
    if (signedUrl.origin !== new URL(baseUrl).origin) {
      return NextResponse.json(
        { error: "Invalid storage download URL." },
        { status: 502 }
      );
    }

    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE products
        SET download_count = download_count + 1
        WHERE id = ? AND status = 'approved' AND is_free = 1
      `).bind(id),
      env.DB.prepare(`
        INSERT INTO download_events (id, product_id, user_id)
        VALUES (?, ?, ?)
      `).bind(crypto.randomUUID(), id, user?.id ?? null)
    ]);

    const updated = await env.DB.prepare(
      "SELECT download_count FROM products WHERE id = ?"
    ).bind(id).first<{ download_count: number }>();

    return NextResponse.json({
      success: true,
      downloadUrl: signedUrl.toString(),
      downloadCount: updated?.download_count ?? 0
    });
  } catch {
    return NextResponse.json(
      { error: "Could not prepare plugin download." },
      { status: 500 }
    );
  }
}
