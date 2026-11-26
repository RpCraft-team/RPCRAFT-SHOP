import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getShopEnv } from "@/lib/cloudflare/env";
import { getSessionUser } from "@/lib/cloudflare/session";
import "./globals.css";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata: Metadata = {
  title: "RPCRAFT SHOP | بازار پلاگین ماینکرفت",
  description: "بازار تخصصی پلاگین‌های رایگان و پولی ماینکرفت",
  verification: { google: "GMaQOTqS6qe-zTQVgaWU7P9oGuufLhMY0WQzELCnBFY" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
};

async function isMaintenanceForVisitor() {
  try {
    const env = await getShopEnv();
    const setting = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key = 'maintenance_mode' LIMIT 1"
    ).first<{ value: string }>();

    if (!setting) return false;

    let enabled = false;
    try {
      enabled = JSON.parse(setting.value) === true;
    } catch {
      enabled = false;
    }

    if (!enabled) return false;

    const cookieStore = await cookies();
    const token = cookieStore.get("rpcraft_session")?.value;
    const user = token ? await getSessionUser(token) : null;

    return user?.role !== "owner" && user?.role !== "admin";
  } catch {
    return false;
  }
}

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const maintenance = await isMaintenanceForVisitor();

  return (
    <html lang="fa" dir="rtl">
      <body>
        {maintenance ? (
          <main className="min-h-screen flex items-center justify-center px-6 text-center">
            <section className="max-w-xl">
              <h1 className="text-3xl font-bold mb-4">فروشگاه در حال به‌روزرسانی است</h1>
              <p>در حال انجام تغییرات و بهبودهای فنی هستیم. لطفاً کمی بعد دوباره مراجعه کنید.</p>
              <p className="mt-4 text-sm opacity-70">RPCRAFT SHOP</p>
            </section>
          </main>
        ) : children}
      </body>
    </html>
  );
}
