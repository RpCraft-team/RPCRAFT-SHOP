import { NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";


export async function GET() {
  try {
    const env = await getShopEnv();
    if (!env.TURNSTILE_SITE_KEY) {
      return NextResponse.json({ error: "Human verification is not configured." }, { status: 503 });
    }
    return NextResponse.json({ siteKey: env.TURNSTILE_SITE_KEY });
  } catch {
    return NextResponse.json({ error: "Configuration unavailable." }, { status: 503 });
  }
}
