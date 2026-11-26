import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/cloudflare/session";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("rpcraft_session")?.value;

    if (token) {
      await deleteSession(token);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("rpcraft_session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Logout could not be completed." },
      { status: 500 }
    );
  }
}
