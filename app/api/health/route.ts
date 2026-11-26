import { NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";


export async function GET() {
  try {
    const env = await getShopEnv();
    await env.DB.prepare("SELECT 1").first();
    await env.SESSION_KV.get("__health_check__");

    return NextResponse.json({
      status: "ok",
      services: {
        worker: "ok",
        d1: "ok",
        kv: "ok",
      },
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "Cloudflare services are not available.",
      },
      { status: 503 },
    );
  }
}
