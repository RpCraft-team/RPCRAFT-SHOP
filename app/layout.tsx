import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RPCRAFT SHOP | بازار پلاگین ماینکرفت",
  description: "بازار تخصصی پلاگین‌های رایگان و پولی ماینکرفت",
  verification: { google: "GMaQOTqS6qe-zTQVgaWU7P9oGuufLhMY0WQzELCnBFY" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
