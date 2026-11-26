import { guardMutation } from "@/lib/cloudflare/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";

export const runtime = "edge";

async function authorize(request: NextRequest) {
  const token = request.cookies.get("rpcraft_session")?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) return { user: null, staff: false };

  if (user.role === "owner") return { user, staff: true };
  if (user.role !== "admin") return { user, staff: false };

  const env = await getShopEnv();
  const permission = await env.DB.prepare(
    "SELECT can_handle_tickets FROM admin_permissions WHERE admin_id = ?"
  ).bind(user.id).first<{ can_handle_tickets: number }>();

  return { user, staff: permission?.can_handle_tickets === 1 };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const env = await getShopEnv();
    const status = request.nextUrl.searchParams.get("status");
    const validStatus = status && ["open", "in_progress", "waiting_user", "closed"].includes(status) ? status : null;

    const result = auth.staff
      ? await env.DB.prepare(`
          SELECT t.*, p.username AS username,
            (SELECT message FROM support_ticket_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
          FROM support_tickets t JOIN profiles p ON p.id=t.user_id
          WHERE (? IS NULL OR t.status=?) ORDER BY t.updated_at DESC LIMIT 100
        `).bind(validStatus, validStatus).all()
      : await env.DB.prepare(`
          SELECT t.*,
            (SELECT message FROM support_ticket_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
          FROM support_tickets t WHERE t.user_id=?
          ORDER BY t.updated_at DESC LIMIT 100
        `).bind(auth.user.id).all();

    return NextResponse.json({ tickets: result.results ?? [], staff: auth.staff });
  } catch {
    return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  }
}

export async function POST(request: NextRequest){
  const guard = await guardMutation(request, "api:post:tickets", 10, 3600);
  if (guard) return guard;

  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const raw: unknown = await request.json();
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const subject = String(body.subject ?? "").trim();
    const category = String(body.category ?? "general").trim().slice(0, 40) || "general";
    const message = String(body.message ?? "").trim();

    if (subject.length < 3 || subject.length > 120 || message.length < 5 || message.length > 5000) {
      return NextResponse.json({ error: "Subject or message length is invalid." }, { status: 400 });
    }

    const env = await getShopEnv();
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM support_tickets WHERE user_id=? AND status!='closed'"
    ).bind(auth.user.id).first<{ total: number }>();

    if ((count?.total ?? 0) >= 10) {
      return NextResponse.json({ error: "You have reached the active ticket limit." }, { status: 429 });
    }

    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO support_tickets (id,user_id,subject,category) VALUES (?,?,?,?)"
      ).bind(id, auth.user.id, subject, category),
      env.DB.prepare(
        "INSERT INTO support_ticket_messages (id,ticket_id,sender_id,message,is_staff) VALUES (?,?,?,?,0)"
      ).bind(crypto.randomUUID(), id, auth.user.id, message)
    ]);

    return NextResponse.json({ success: true, ticketId: id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create ticket." }, { status: 500 });
  }
}
