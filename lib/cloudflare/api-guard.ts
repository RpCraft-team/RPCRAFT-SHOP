import { NextRequest, NextResponse } from "next/server";
import { getShopEnv } from "@/lib/cloudflare/env";
import { checkRateLimit } from "@/lib/cloudflare/rate-limit";

export async function guardMutation(
  request: NextRequest,
  scope: string,
  maxRequests = 30,
  windowSeconds = 60
): Promise<NextResponse | null> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    (origin && new URL(origin).origin !== request.nextUrl.origin) ||
    fetchSite === "cross-site"
  ) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const env = await getShopEnv();
  const rate = await checkRateLimit(request, env, scope, maxRequests, windowSeconds);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(windowSeconds) } }
    );
  }

  return null;
}
