import { NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";

export const runtime = "edge";

export async function GET() {
  try {
    const env = await getShopEnv();
    const result = await env.DB.prepare(`
      SELECT id, name, sort_order
      FROM categories
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `).all();

    return NextResponse.json({ categories: result.results ?? [] });
  } catch {
    return NextResponse.json(
      { error: "Could not load categories." },
      { status: 500 }
    );
  }
}
