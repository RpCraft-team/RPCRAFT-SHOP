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
    "SELECT can_handle_tickets FROM admin_permissions WHERE admin_id=?"
  ).bind(user.id).first<{ can_handle_tickets: number }>();

  return { user, staff: permission?.can_handle_tickets === 1 };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { id } = await context.params;
    const env = await getShopEnv();
    const ticket = await env.DB.prepare(`
      SELECT t.*, p.username AS username FROM support_tickets t
      JOIN profiles p ON p.id=t.user_id WHERE t.id=?
    `).bind(id).first<any>();

    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    if (!auth.staff && ticket.user_id !== auth.user.id) {
      return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }

    const messages = await env.DB.prepare(`
      SELECT m.id,m.sender_id,m.message,m.is_staff,m.created_at,p.username
      FROM support_ticket_messages m JOIN profiles p ON p.id=m.sender_id
      WHERE m.ticket_id=? ORDER BY m.created_at ASC LIMIT 500
    `).bind(id).all();

    return NextResponse.json({ ticket, messages: messages.results ?? [], staff: auth.staff });
  } catch {
    return NextResponse.json({ error: "Could not load ticket." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }){
  const guard = await guardMutation(request, "api:post:tickets:[id]", 10, 3600);
  if (guard) return guard;

  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { id } = await context.params;
    const raw: unknown = await request.json();
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const message = String(body.message ?? "").trim();

    if (message.length < 1 || message.length > 5000) {
      return NextResponse.json({ error: "Message length is invalid." }, { status: 400 });
    }

    const env = await getShopEnv();
    const ticket = await env.DB.prepare(
      "SELECT id,user_id,status FROM support_tickets WHERE id=?"
    ).bind(id).first<{ id: string; user_id: string; status: string }>();

    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    if (!auth.staff && ticket.user_id !== auth.user.id) {
      return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }
    if (ticket.status === "closed") {
      return NextResponse.json({ error: "This ticket is closed." }, { status: 409 });
    }

    const notification = auth.staff
      ? env.DB.prepare(`
          INSERT INTO notifications (id, recipient_id, type, title, message, target_type, target_id)
          VALUES (lower(hex(randomblob(16))), ?, 'ticket_reply',
            'پاسخ جدید پشتیبانی', ?, 'ticket', ?)
        `).bind(ticket.user_id, `برای تیکت شما پاسخ جدیدی ثبت شده است.`, id)
      : env.DB.prepare(`
          INSERT INTO notifications (id, recipient_id, type, title, message, target_type, target_id)
          SELECT lower(hex(randomblob(16))), p.id, 'ticket_reply',
            'پاسخ جدید به تیکت', ?, 'ticket', ?
          FROM profiles p
          LEFT JOIN admin_permissions ap ON ap.admin_id = p.id
          WHERE p.role = 'owner'
             OR (p.role = 'admin' AND COALESCE(ap.can_handle_tickets, 0) = 1)
        `).bind(`کاربر در تیکت با شناسه ${id} پاسخ جدیدی ارسال کرده است.`, id);

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO support_ticket_messages (id,ticket_id,sender_id,message,is_staff) VALUES (?,?,?,?,?)"
      ).bind(crypto.randomUUID(), id, auth.user.id, message, auth.staff ? 1 : 0),
      env.DB.prepare(`
        UPDATE support_tickets SET
          status=CASE WHEN ?=1 AND status='waiting_user' THEN 'in_progress'
                      WHEN ?=0 AND status='open' THEN 'waiting_user'
                      ELSE status END,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(auth.staff ? 1 : 0, auth.staff ? 1 : 0, id),
      notification
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }){
  const guard = await guardMutation(request, "api:patch:tickets:[id]", 10, 3600);
  if (guard) return guard;

  try {
    const auth = await authorize(request);
    if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!auth.staff) return NextResponse.json({ error: "Permission denied." }, { status: 403 });

    const { id } = await context.params;
    const raw: unknown = await request.json();
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const status = String(body.status ?? "");

    if (!["open", "in_progress", "waiting_user", "closed"].includes(status)) {
      return NextResponse.json({ error: "Invalid ticket status." }, { status: 400 });
    }

    const env = await getShopEnv();
    const result = await env.DB.prepare(
      "UPDATE support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(status, id).run();

    if (!result.meta.changes) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    await env.DB.prepare(`
      INSERT INTO audit_logs (id,actor_id,action,target_type,target_id)
      VALUES (?,?,'ticket_status_changed','support_ticket',?)
    `).bind(crypto.randomUUID(), auth.user.id, id).run();

    return NextResponse.json({ success: true, status });
  } catch {
    return NextResponse.json({ error: "Could not update ticket." }, { status: 500 });
  }
}
