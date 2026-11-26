"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Package, Download, ArrowRight, ShieldCheck, Heart, Bookmark, UserPlus, Settings, Save, UploadCloud, Plus, X } from "lucide-react";

type Product = {
  id: string; name: string; description: string; price: number;
  is_free: boolean; version: string; minecraft_versions: string[];
  platform: string[]; category: string; icon_url: string | null;
  author_id: string; author_username?: string; download_count: number;
};
type Version = { id: string; version: string; changelog: string; created_at: string };

const money = (n: number) => new Intl.NumberFormat("fa-IR").format(n) + " تومان";

export default function PluginDetails() {
  const params = useParams();
  const id = String(params.id);
  const [product, setProduct] = useState<Product | null>(null);
  const [author, setAuthor] = useState("سازنده");
  const [authorUsername, setAuthorUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editFree, setEditFree] = useState(true);
  const [newVersion, setNewVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [versionFile, setVersionFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
          credentials: "same-origin"
        });
        const result: any = await response.json();

        if (!response.ok || !result.product) {
          throw new Error(result.error || "Plugin not found.");
        }
        if (!active) return;

        const item = result.product as Product;
        setProduct(item);
        setEditName(item.name);
        setEditDescription(item.description || "");
        setEditCategory(item.category || "");
        setEditPrice(String(item.price || 0));
        setEditFree(item.is_free);
        setAuthor(item.author_username || "سازنده");
        setAuthorUsername(item.author_username || "");
        setUserId(result.userId || "");
        setIsOwner(Boolean(result.isOwner));
        setLiked(Boolean(result.liked));
        setSaved(Boolean(result.saved));
        setFollowing(Boolean(result.following));
        setLikeCount(Number(result.likeCount || 0));
        setVersions((result.versions || []) as Version[]);
      } catch {
        if (active) {
          setNotice("پلاگین موردنظر پیدا نشد یا دریافت اطلاعات آن ناموفق بود.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [id]);

  async function downloadPlugin() {
    if (!product?.id || !product.is_free) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/download`, {
        method: "POST",
        credentials: "same-origin"
      });
      const result: any = await response.json();
      if (!response.ok || !result.downloadUrl) {
        setNotice(result.error || "ساخت لینک دانلود ناموفق بود. لطفاً دوباره تلاش کن.");
        return;
      }
      setProduct(current => current ? {
        ...current,
        download_count: result.downloadCount ?? (current.download_count || 0) + 1
      } : current);
      window.location.assign(result.downloadUrl);
    } catch {
      setNotice("ارتباط با سرور برای آماده‌سازی دانلود ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSocial(table: "plugin_likes" | "saved_plugins", active: boolean, setter: (v: boolean) => void) {
    if (!product) return;
    if (!userId) {
      setNotice("برای استفاده از این قابلیت ابتدا وارد حساب کاربری شو.");
      return;
    }
    setBusy(true);
    try {
      const endpoint = `/api/products/${encodeURIComponent(product.id)}/${table === "plugin_likes" ? "like" : "save"}`;
      const response = await fetch(endpoint, {
        method: active ? "DELETE" : "POST",
        credentials: "same-origin"
      });
      const result: any = await response.json();
      if (!response.ok) {
        setNotice(result.error || "عملیات انجام نشد.");
      } else {
        setter(!active);
        if (table === "plugin_likes") setLikeCount(result.likes ?? likeCount + (active ? -1 : 1));
      }
    } catch {
      setNotice("ارتباط با سرور ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow() {
    if (!product) return;
    if (!userId) {
      setNotice("برای دنبال‌کردن سازنده ابتدا وارد حساب کاربری شو.");
      return;
    }
    if (isOwner || !authorUsername) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/creators/${encodeURIComponent(authorUsername)}/follow`, {
        method: following ? "DELETE" : "POST",
        credentials: "same-origin"
      });
      const result: any = await response.json();
      if (!response.ok) setNotice(result.error || "عملیات دنبال‌کردن انجام نشد.");
      else setFollowing(!following);
    } catch {
      setNotice("ارتباط با سرور ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProductChanges() {
    if (!product || !isOwner) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/seller/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
          category: editCategory.trim(),
          price: editFree ? 0 : Number(editPrice),
          isFree: editFree,
          version: product.version,
          minecraftVersions: product.minecraft_versions || [],
          platform: product.platform || []
        })
      });
      const result: any = await response.json();
      if (!response.ok) {
        setNotice(result.error || "ذخیره تغییرات ناموفق بود.");
        return;
      }
      setProduct({
        ...product,
        name: editName.trim(),
        description: editDescription.trim(),
        category: editCategory.trim(),
        price: editFree ? 0 : Number(editPrice),
        is_free: editFree
      });
      setEditOpen(false);
      setNotice(result.status === "pending"
        ? "تغییرات ثبت شد و برای بررسی مدیر ارسال شد."
        : "اطلاعات پلاگین با موفقیت به‌روزرسانی شد.");
    } catch {
      setNotice("ارتباط با سرور برای ذخیره تغییرات ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function publishVersion() {
    if (!product || !isOwner || !newVersion.trim() || !versionFile) {
      setNotice("نسخه جدید و فایل JAR را وارد کن.");
      return;
    }
    if (!versionFile.name.toLowerCase().endsWith(".jar") || versionFile.size > 100 * 1024 * 1024) {
      setNotice("فایل باید JAR و حداکثر ۱۰۰ مگابایت باشد.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("kind", "jar");
      form.append("productId", product.id);
      form.append("file", versionFile);

      const uploadResponse = await fetch("/api/storage/upload", {
        method: "POST",
        credentials: "same-origin",
        body: form
      });
      const uploadResult: any = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.fileKey) {
        setNotice(uploadResult.error || "آپلود فایل نسخه جدید ناموفق بود.");
        return;
      }

      const response = await fetch(`/api/seller/products/${encodeURIComponent(product.id)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          version: newVersion.trim(),
          changelog: changelog.trim(),
          fileKey: uploadResult.fileKey
        })
      });
      const result: any = await response.json();
      if (!response.ok) {
        setNotice(result.error || "ثبت نسخه انجام نشد.");
        return;
      }

      setProduct({ ...product, version: newVersion.trim() });
      setNotice("نسخه جدید با موفقیت منتشر شد.");
      setVersionOpen(false);
      setNewVersion("");
      setChangelog("");
      setVersionFile(null);

      const historyResponse = await fetch(
        `/api/seller/products/${encodeURIComponent(product.id)}/versions`,
        { credentials: "same-origin" }
      );
      if (historyResponse.ok) {
        const history: any = await historyResponse.json();
        setVersions((history.versions || []) as Version[]);
      }
    } catch {
      setNotice("ارتباط با سرور برای انتشار نسخه ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="plugin-details"><p>در حال دریافت اطلاعات پلاگین...</p></main>;
  if (!product) return <main className="plugin-details"><Link href="/" className="btn outline"><ArrowRight size={18}/> بازگشت به فروشگاه</Link><div className="empty-state"><Package/><h2>پلاگین پیدا نشد</h2><p>{notice}</p></div></main>;

  return (
    <main className="plugin-details">
      <Link href="/" className="btn outline"><ArrowRight size={18}/> بازگشت به فروشگاه</Link>
      <section className="plugin-detail-card">
        <div className="plugin-detail-heading">
          <div className="plugin-detail-icon">{product.icon_url ? <img src={product.icon_url} alt={product.name}/> : <Package size={48}/>}</div>
          <div>
            <span className="plugin-detail-category">{product.category}</span>
            <h1>{product.name}</h1>
            <p>ساخته‌شده توسط <Link href={authorUsername ? `/profile/${encodeURIComponent(authorUsername)}` : "/"}><strong>{author}</strong></Link></p>
          </div>
        </div>

        <div className="plugin-detail-info">
          <div><small>نسخه پلاگین</small><b>{product.version}</b></div>
          <div><small>قیمت</small><b>{product.is_free ? "رایگان" : money(product.price)}</b></div>
          <div><small>نوع انتشار</small><b>{product.is_free ? "FREE" : "PREMIUM"}</b></div>
          <div><small>تعداد دانلود</small><b>{(product.download_count || 0).toLocaleString("fa-IR")}</b></div>
        </div>

        <div className="plugin-social-actions">
          <button className={liked ? "social-action active" : "social-action"} onClick={() => toggleSocial("plugin_likes", liked, setLiked)} disabled={busy}><Heart size={17} fill={liked ? "currentColor" : "none"}/> پسندیدن <b>{likeCount.toLocaleString("fa-IR")}</b></button>
          <button className={saved ? "social-action active" : "social-action"} onClick={() => toggleSocial("saved_plugins", saved, setSaved)} disabled={busy}><Bookmark size={17} fill={saved ? "currentColor" : "none"}/>{saved ? "ذخیره‌شده" : "ذخیره پلاگین"}</button>
          {!isOwner && <button className={following ? "social-action active" : "social-action"} onClick={toggleFollow} disabled={busy}><UserPlus size={17}/>{following ? "دنبال می‌کنی" : "دنبال‌کردن سازنده"}</button>}
        </div>

        {isOwner && <div className="owner-tools">
          <div><Settings size={18}/><strong>مدیریت پلاگین شما</strong></div>
          <button className="btn outline small" onClick={() => setEditOpen(!editOpen)}><Settings size={15}/> ویرایش اطلاعات</button>
          <button className="btn primary small" onClick={() => setVersionOpen(!versionOpen)}><UploadCloud size={15}/> انتشار نسخه جدید</button>
        </div>}

        {editOpen && isOwner && <section className="plugin-owner-panel">
          <h2>ویرایش اطلاعات پلاگین</h2>
          <label>نام پلاگین<input value={editName} onChange={e => setEditName(e.target.value)} /></label>
          <label>دسته‌بندی<input value={editCategory} onChange={e => setEditCategory(e.target.value)} /></label>
          <label>توضیحات<textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={5}/></label>
          <label className="owner-check"><input type="checkbox" checked={editFree} onChange={e => setEditFree(e.target.checked)}/> این پلاگین رایگان است</label>
          {!editFree && <label>قیمت به تومان<input type="number" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)}/></label>}
          <button className="btn primary" onClick={saveProductChanges} disabled={busy}><Save size={16}/> ذخیره تغییرات</button>
        </section>}

        {versionOpen && isOwner && <section className="plugin-owner-panel">
          <h2>انتشار نسخه جدید</h2>
          <label>شماره نسخه<input value={newVersion} onChange={e => setNewVersion(e.target.value)} placeholder="مثلاً 2.1.0"/></label>
          <label>تغییرات این نسخه<textarea value={changelog} onChange={e => setChangelog(e.target.value)} rows={4} placeholder="ویژگی‌های جدید و رفع مشکلات..."/></label>
          <label>فایل JAR نسخه جدید<input type="file" accept=".jar" onChange={e => setVersionFile(e.target.files?.[0] || null)}/></label>
          <button className="btn primary" onClick={publishVersion} disabled={busy}><UploadCloud size={16}/> انتشار نسخه</button>
        </section>}

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

        <div className="plugin-detail-section">
          <h2>تاریخچه نسخه‌ها</h2>
          {versions.length ? <div className="plugin-version-list">{versions.map(v => <article key={v.id}><div><b>نسخه {v.version}</b><small>{new Date(v.created_at).toLocaleDateString("fa-IR")}</small></div><p>{v.changelog || "بدون توضیحات تغییرات"}</p></article>)}</div> : <p className="plugin-muted">هنوز تاریخچه نسخه‌ای ثبت نشده است.</p>}
        </div>

        <div className="plugin-detail-download">
          {product.is_free ? <button className="btn primary" onClick={downloadPlugin} disabled={busy}><Download size={18}/>{busy ? "در حال آماده‌سازی..." : "دانلود رایگان پلاگین"}</button> : <button className="btn primary" disabled>خرید این پلاگین به‌زودی فعال می‌شود</button>}
          <span><ShieldCheck size={16}/> فایل‌ها از فضای امن فروشگاه ارائه می‌شوند.</span>
        </div>
        {notice && <p className="plugin-detail-notice">{notice}</p>}
      </section>
    </main>
  );
}
