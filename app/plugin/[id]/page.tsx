"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Package, Download, ArrowRight, ShieldCheck } from "lucide-react";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  is_free: boolean;
  version: string;
  minecraft_versions: string[];
  platform: string[];
  category: string;
  icon_url: string | null;
  author_id: string;
  file_path: string;
};

const money = (n: number) =>
  new Intl.NumberFormat("fa-IR").format(n) + " تومان";

export default function PluginDetails() {
  const params = useParams();
  const id = String(params.id);
  const [product, setProduct] = useState<Product | null>(null);
  const [author, setAuthor] = useState("سازنده");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setNotice("اتصال دیتابیس برقرار نیست.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("status", "approved")
        .single();

      if (error || !data) {
        setNotice("پلاگین موردنظر پیدا نشد یا هنوز تأیید نشده است.");
        setLoading(false);
        return;
      }

      setProduct(data as Product);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.author_id)
        .maybeSingle();

      if (profile?.username) setAuthor(profile.username);
      setLoading(false);
    }

    load();
  }, [id]);

  async function downloadPlugin() {
    if (!supabase || !product?.file_path || !product.is_free) return;

    setBusy(true);
    setNotice("");

    const { data, error } = await supabase.storage
      .from("plugin-jars")
      .createSignedUrl(product.file_path, 60);

    if (error || !data?.signedUrl) {
      setNotice("ساخت لینک دانلود ناموفق بود. لطفاً دوباره تلاش کن.");
      setBusy(false);
      return;
    }

    window.location.href = data.signedUrl;
    setBusy(false);
  }

  if (loading) return <main className="plugin-details"><p>در حال دریافت اطلاعات پلاگین...</p></main>;

  if (!product) return (
    <main className="plugin-details">
      <Link href="/" className="btn outline"><ArrowRight size={18}/> بازگشت به فروشگاه</Link>
      <div className="empty-state"><Package/><h2>پلاگین پیدا نشد</h2><p>{notice}</p></div>
    </main>
  );

  return (
    <main className="plugin-details">
      <Link href="/" className="btn outline"><ArrowRight size={18}/> بازگشت به فروشگاه</Link>

      <section className="plugin-detail-card">
        <div className="plugin-detail-heading">
          <div className="plugin-detail-icon">
            {product.icon_url ? <img src={product.icon_url} alt={product.name}/> : <Package size={48}/>}
          </div>
          <div>
            <span className="plugin-detail-category">{product.category}</span>
            <h1>{product.name}</h1>
            <p>ساخته‌شده توسط <strong>{author}</strong></p>
          </div>
        </div>

        <div className="plugin-detail-info">
          <div><small>نسخه پلاگین</small><b>{product.version}</b></div>
          <div><small>قیمت</small><b>{product.is_free ? "رایگان" : money(product.price)}</b></div>
          <div><small>نوع انتشار</small><b>{product.is_free ? "FREE" : "PREMIUM"}</b></div>
        </div>

        <div className="plugin-detail-section">
          <h2>توضیحات پلاگین</h2>
          <p className="plugin-full-description">{product.description}</p>
        </div>

        <div className="plugin-detail-section">
          <h2>نسخه‌های سازگار Minecraft</h2>
          <div className="plugin-tags">{(product.minecraft_versions || []).map(v => <span key={v}>{v}</span>)}</div>
        </div>

        <div className="plugin-detail-section">
          <h2>پلتفرم‌های پشتیبانی‌شده</h2>
          <div className="plugin-tags">{(product.platform || []).map(v => <span key={v}>{v}</span>)}</div>
        </div>

        <div className="plugin-detail-download">
          {product.is_free ? (
            <button className="btn primary" onClick={downloadPlugin} disabled={busy || !product.file_path}>
              <Download size={18}/>{busy ? "در حال آماده‌سازی..." : "دانلود رایگان پلاگین"}
            </button>
          ) : (
            <button className="btn primary" disabled>خرید این پلاگین به‌زودی فعال می‌شود</button>
          )}
          <span><ShieldCheck size={16}/> فایل‌ها از فضای امن فروشگاه ارائه می‌شوند.</span>
        </div>
        {notice && <p className="plugin-detail-notice">{notice}</p>}
      </section>
    </main>
  );
}
