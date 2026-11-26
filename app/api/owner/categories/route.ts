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
    if (!(await getOwner(request))) {
      return NextResponse.json({ error: "Owner access required." }, { status: 403 });
    }

    const env = await getShopEnv();
    const result = await env.DB.prepare(
      "SELECT id, name, sort_order, active FROM categories ORDER BY sort_order, name"
    ).all();

    return NextResponse.json({ categories: result.results ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load categories." }, { status: 500 });
  }
}

export async function POST(request: NextRequest){
  const guard = await guardMutation(request, "api:post:owner:categories", 60, 60);
  if (guard) return guard;

  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const name = String(body.name ?? "").trim();
    const sortOrder = Number(body.sortOrder ?? 0);

    if (!name || name.length > 60 || !Number.isInteger(sortOrder)) {
      return NextResponse.json({ error: "Invalid category details." }, { status: 400 });
    }

    const env = await getShopEnv();
    const id = crypto.randomUUID();

    await env.DB.prepare(
      "INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)"
    ).bind(id, name, sortOrder).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
      VALUES (?, ?, 'category_created', 'category', ?)
    `).bind(crypto.randomUUID(), owner.id, id).run();

    return NextResponse.json({ success: true, categoryId: id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create category. It may already exist." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest){
  const guard = await guardMutation(request, "api:patch:owner:categories", 60, 60);
  if (guard) return guard;

  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const rawBody: unknown = await request.json();
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {};
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Category ID is required." }, { status: 400 });

    const env = await getShopEnv();
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 60) return NextResponse.json({ error: "Invalid category name." }, { status: 400 });
      updates.push("name = ?");
      values.push(name);
    }

    if (body.sortOrder !== undefined) {
      if (!Number.isInteger(body.sortOrder)) return NextResponse.json({ error: "Invalid sort order." }, { status: 400 });
      updates.push("sort_order = ?");
      values.push(body.sortOrder);
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") return NextResponse.json({ error: "Active must be boolean." }, { status: 400 });
      updates.push("active = ?");
      values.push(Number(body.active));
    }

    if (!updates.length) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });

    const result = await env.DB.prepare(
      `UPDATE categories SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...values, id).run();

    if (!result.meta.changes) return NextResponse.json({ error: "Category not found." }, { status: 404 });

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
      VALUES (?, ?, 'category_updated', 'category', ?)
    `).bind(crypto.randomUUID(), owner.id, id).run();

    return NextResponse.json({ success: true, categoryId: id });
  } catch {
    return NextResponse.json({ error: "Could not update category." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest){
  const guard = await guardMutation(request, "api:delete:owner:categories", 60, 60);
  if (guard) return guard;

  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Category ID is required." }, { status: 400 });

    const env = await getShopEnv();
    const result = await env.DB.prepare(
      "UPDATE categories SET active = 0 WHERE id = ?"
    ).bind(id).run();

    if (!result.meta.changes) return NextResponse.json({ error: "Category not found." }, { status: 404 });

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id)
      VALUES (?, ?, 'category_deactivated', 'category', ?)
    `).bind(crypto.randomUUID(), owner.id, id).run();

    return NextResponse.json({ success: true, categoryId: id, active: false });
  } catch {
    return NextResponse.json({ error: "Could not deactivate category." }, { status: 500 });
  }
}
