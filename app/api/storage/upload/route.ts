import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


const MAX_JAR_SIZE = 100 * 1024 * 1024;
const MAX_ICON_SIZE = 5 * 1024 * 1024;

function validImage(type: string, bytes: Uint8Array): boolean {
  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/gif") {
    return String.fromCharCode(...bytes.slice(0, 3)) === "GIF";
  }
  if (type === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function POST(request: NextRequest){
  const guard = await guardMutation(request, "api:post:storage:upload", 10, 3600);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    if (!user || !["owner", "seller"].includes(user.role)) {
      return NextResponse.json(
        { error: "Seller access required." },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const kind = String(form.get("kind") || "");
    const productId = String(form.get("productId") || "").trim();
    const file = form.get("file");

    if (!["jar", "icon"].includes(kind) || !(file instanceof File)) {
      return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
    }

    if (kind === "jar" && productId) {
      const env = await getShopEnv();
      const product = await env.DB.prepare(
        "SELECT author_id, status FROM products WHERE id = ?"
      ).bind(productId).first<{ author_id: string; status: string }>();

      if (!product) {
        return NextResponse.json({ error: "Plugin not found." }, { status: 404 });
      }
      if (user.role !== "owner" && product.author_id !== user.id) {
        return NextResponse.json({ error: "You can only update your own plugins." }, { status: 403 });
      }
      if (user.role !== "owner" && product.status !== "approved") {
        return NextResponse.json({ error: "The plugin must be approved first." }, { status: 409 });
      }
    }

    const isJar = kind === "jar";
    const maxSize = isJar ? MAX_JAR_SIZE : MAX_ICON_SIZE;

    if (file.size < 1 || file.size > maxSize) {
      return NextResponse.json(
        { error: isJar ? "JAR files must be between 1 byte and 100 MB." : "Images must be between 1 byte and 5 MB." },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    let bucket: string;
    let contentType: string;

    if (isJar) {
      const signature = Array.from(bytes.slice(0, 4));
      const validZip = signature[0] === 0x50 && signature[1] === 0x4b &&
        [[0x03, 0x04], [0x05, 0x06], [0x07, 0x08]].some(
          ([a, b]) => signature[2] === a && signature[3] === b
        );

      if (!file.name.toLowerCase().endsWith(".jar") || !validZip) {
        return NextResponse.json({ error: "The uploaded file is not a valid JAR archive." }, { status: 400 });
      }
      bucket = "plugin-jars";
      contentType = "application/java-archive";
    } else {
      if (!validImage(file.type, bytes)) {
        return NextResponse.json({ error: "Only valid PNG, JPEG, GIF, or WebP images are allowed." }, { status: 400 });
      }
      bucket = "plugin-icons";
      contentType = file.type;
    }

    const env = await getShopEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Storage service is not configured." }, { status: 503 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "upload";
    const fileKey = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
    const objectPath = fileKey.split("/").map(encodeURIComponent).join("/");
    const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${objectPath}`;

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "false",
        "cache-control": "3600"
      },
      body: file
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Storage upload failed." }, { status: 502 });
    }

    const result: Record<string, unknown> = {
      success: true,
      fileKey,
      bucket
    };

    if (kind === "icon") {
      result.publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
    }

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not upload file." }, { status: 500 });
  }
}
