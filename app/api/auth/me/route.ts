import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";


export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("rpcraft_session")?.value;

    if (!token) {
      return NextResponse.json({ user: null, permissions: null }, { status: 401 });
    }

    const user = await getSessionUser(token);

    if (!user) {
      const response = NextResponse.json({ user: null, permissions: null }, { status: 401 });
      response.cookies.set("rpcraft_session", "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0
      });
      return response;
    }

    let permissions = null;

    if (user.role === "admin") {
      const env = await getShopEnv();
      permissions = await env.DB.prepare(`
        SELECT
          COALESCE(can_review_products, 0) AS can_review_products,
          COALESCE(can_review_sellers, 0) AS can_review_sellers,
          COALESCE(can_handle_reports, 0) AS can_handle_reports,
          COALESCE(can_manage_users, 0) AS can_manage_users,
          COALESCE(can_handle_tickets, 0) AS can_handle_tickets
        FROM admin_permissions
        WHERE admin_id = ?
      `).bind(user.id).first();
    }

    return NextResponse.json({ user, permissions });
  } catch {
    return NextResponse.json(
      { error: "Could not retrieve the current session." },
      { status: 500 }
    );
  }
}
