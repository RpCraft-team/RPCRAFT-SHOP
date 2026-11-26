import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
){
  const guard = await guardMutation(request, "api:post:creators:[username]:follow", 30, 60);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { username } = await params;
    const env = await getShopEnv();
    const creator = await env.DB.prepare(
      "SELECT id FROM profiles WHERE username = ? COLLATE NOCASE"
    ).bind(username).first<{ id: string }>();

    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
    if (creator.id === user.id) return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });

    await env.DB.prepare(`
      INSERT OR IGNORE INTO creator_follows (id, creator_id, follower_id)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID(), creator.id, user.id).run();

    return NextResponse.json({ success: true, following: true });
  } catch {
    return NextResponse.json({ error: "Could not follow creator." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
){
  const guard = await guardMutation(request, "api:delete:creators:[username]:follow", 30, 60);
  if (guard) return guard;

  try {
    const token = request.cookies.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { username } = await params;
    const env = await getShopEnv();

    await env.DB.prepare(`
      DELETE FROM creator_follows
      WHERE follower_id = ?
        AND creator_id = (SELECT id FROM profiles WHERE username = ? COLLATE NOCASE)
    `).bind(user.id, username).run();

    return NextResponse.json({ success: true, following: false });
  } catch {
    return NextResponse.json({ error: "Could not unfollow creator." }, { status: 500 });
  }
}
