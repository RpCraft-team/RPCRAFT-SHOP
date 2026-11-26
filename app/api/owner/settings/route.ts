import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

async function getOwner(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  return user?.role === "owner" ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const env = await getShopEnv();
    const result = await env.DB.prepare(
      "SELECT key, value FROM site_settings ORDER BY key"
    ).all();

    const settings = Object.fromEntries(
      (result.results ?? []).map((row: Record<string, unknown>) => {
        try {
          return [String(row.key), JSON.parse(String(row.value))];
        } catch {
          return [String(row.key), null];
        }
      })
    );

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Could not load site settings." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:owner:settings", 60, 60);
  if (guard) return guard;

  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const allowed = ["site_name", "site_description", "support_telegram", "maintenance_mode"];
    const entries = Object.entries(body).filter(([key]) => allowed.includes(key));

    if (!entries.length || entries.length !== Object.keys(body).length) {
      return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
    }

    for (const [key, value] of entries) {
      if (key === "maintenance_mode" && typeof value !== "boolean") {
        return NextResponse.json({ error: "Maintenance mode must be boolean." }, { status: 400 });
      }
      if (key !== "maintenance_mode" && (typeof value !== "string" || value.length > 500)) {
        return NextResponse.json({ error: "Invalid setting value." }, { status: 400 });
      }
      if (key === "support_telegram" && value && !/^https:\/\/t\.me\/[A-Za-z0-9_]+$/.test(String(value))) {
        return NextResponse.json({ error: "Invalid Telegram support link." }, { status: 400 });
      }
    }

    const env = await getShopEnv();
    await env.DB.batch(entries.map(([key, value]) =>
      env.DB.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).bind(key, JSON.stringify(value))
    ));

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, details)
      VALUES (?, ?, 'site_settings_updated', 'settings', ?)
    `).bind(crypto.randomUUID(), owner.id, JSON.stringify(Object.fromEntries(entries))).run();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not update site settings." }, { status: 500 });
  }
}
