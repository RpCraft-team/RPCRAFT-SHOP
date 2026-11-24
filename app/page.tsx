"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShoppingBag, ShieldCheck, UploadCloud, Search, LogIn, UserPlus, Settings, LogOut, Package, X, CheckCircle2, Menu } from "lucide-react";

type Product = {
  id: string; name: string; description: string; price: number; is_free: boolean;
  version: string; minecraft_versions: string[]; platform: string[]; category: string;
  icon_url: string | null; status: string; created_at: string; author_id: string;
};
type Profile = { id: string; username: string; role: "owner" | "admin" | "seller" | "user" };

const money = (n: number) => new Intl.NumberFormat("fa-IR").format(n) + " تومان";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
  const [sellerApplications, setSellerApplications] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<any>(null);
  const [tab, setTab] = useState<"all" | "free" | "paid">("all");
  const [query, setQuery] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [panel, setPanel] = useState<"none" | "upload" | "settings" | "admin">("none");
  const [uploadStep, setUploadStep] = useState(0);
  const [adminUsers, setAdminUsers] = useState<Profile[]>([]);
  const [ordinaryUsers, setOrdinaryUsers] = useState<Profile[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [myPermissions, setMyPermissions] = useState({
    can_review_products: false,
    can_review_sellers: false,
    can_handle_reports: false,
    can_manage_users: false
  });
  const [adminPermissions, setAdminPermissions] = useState({
    can_review_products: true,
    can_review_sellers: false,
    can_handle_reports: true,
    can_manage_users: false
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [auth, setAuth] = useState({ username: "", email: "", phone: "", password: "" });
  const [form, setForm] = useState({ name: "", description: "", price: "0", version: "1.0.0", mc: "1.21.1", platform: "Paper,Spigot,Purpur", category: "ابزار", free: true, file: null as File | null });

  const configured = !!supabase;
  const visibleProducts = useMemo(() => products.filter(p =>
    (tab === "all" || (tab === "free" ? p.is_free : !p.is_free)) &&
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query.toLowerCase())
  ), [products, tab, query]);

  async function loadMyPermissions(userId: string) {
    if (!supabase) return;
    const { data } = await supabase.from("admin_permissions")
      .select("can_review_products,can_review_sellers,can_handle_reports,can_manage_users")
      .eq("admin_id", userId).maybeSingle();
    setMyPermissions({
      can_review_products: data?.can_review_products ?? false,
      can_review_sellers: data?.can_review_sellers ?? false,
      can_handle_reports: data?.can_handle_reports ?? false,
      can_manage_users: data?.can_manage_users ?? false
    });
  }

  async function loadAdmins() {
    if (!supabase || profile?.role !== "owner") return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,role")
      .eq("role", "admin")
      .order("username");
    if (error) {
      setNotice("دریافت فهرست مدیران ناموفق بود: " + error.message);
      return;
    }
    setAdminUsers((data || []) as Profile[]);
  }

  async function loadOrdinaryUsers() {
    if (!supabase || profile?.role !== "owner") return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,role")
      .eq("role", "user")
      .order("username");
    if (error) {
      setNotice("دریافت کاربران ناموفق بود: " + error.message);
      return;
    }
    setOrdinaryUsers((data || []) as Profile[]);
  }

  async function loadProducts() {
    if (!supabase) return;
    const { data, error } = await supabase.from("products").select("*").eq("status", "approved").order("created_at", { ascending: false });
    if (!error && data) setProducts(data as Product[]);
  }

  async function loadReports() {
    if (!supabase || !profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_handle_reports))) return;
    const { data, error } = await supabase.from("reports")
      .select("*").eq("status", "open").order("created_at", { ascending: true });
    if (error) {
      setNotice("دریافت گزارش‌ها ناموفق بود: " + error.message);
      return;
    }
    setReports(data || []);
  }

  async function updateReportStatus(id: string, status: "resolved" | "rejected") {
    if (!supabase || (profile?.role !== "owner" && !(profile?.role === "admin" && myPermissions.can_handle_reports))) return;
    setBusy(true);
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    setNotice(error ? "خطا: " + error.message : "وضعیت گزارش به‌روزرسانی شد.");
    await loadReports();
    setBusy(false);
  }

  async function loadSellerApplications() {
    if (!supabase || !profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_review_sellers))) return;
    const { data, error } = await supabase.from("seller_applications")
      .select("id,user_id,status,message,created_at")
      .eq("status", "pending").order("created_at", { ascending: true });
    if (error) {
      setNotice("دریافت درخواست‌های فروشندگی ناموفق بود: " + error.message);
      return;
    }
    setSellerApplications(data || []);
  }

  async function reviewSellerApplication(id: string, userId: string, approved: boolean) {
    if (!supabase || (profile?.role !== "owner" && !(profile?.role === "admin" && myPermissions.can_review_sellers))) return;
    setBusy(true);
    const { error: reviewError } = await supabase.from("seller_applications")
      .update({ status: approved ? "approved" : "rejected", reviewed_by: session.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (!reviewError && approved) {
      const { error } = await supabase.from("profiles").update({ role: "seller" }).eq("id", userId).eq("role", "user");
      if (error) setNotice("درخواست ثبت شد اما تغییر نقش ناموفق بود: " + error.message);
    }
    if (reviewError) setNotice(reviewError.message);
    else if (approved) setNotice("درخواست تأیید و نقش فروشنده فعال شد.");
    else setNotice("درخواست فروشندگی رد شد.");
    await loadSellerApplications();
    setBusy(false);
  }

  async function loadPendingProducts() {
    if (!supabase || !profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_review_products))) return;
    const { data, error } = await supabase.from("products").select("*").eq("status", "pending").order("created_at", { ascending: true });
    if (error) {
      setNotice("دریافت محصولات در انتظار بررسی ناموفق بود: " + error.message);
      return;
    }
    setPendingProducts((data || []) as Product[]);
  }
  async function loadProfile(userId: string) {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("id,username,role").eq("id", userId).maybeSingle();
    setProfile(data as Profile | null);
  }
  useEffect(() => {
    loadProducts();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadProfile(s.user.id), 0);
      else setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (profile?.role === "admin") loadMyPermissions(profile.id);
    else setMyPermissions({ can_review_products: false, can_review_sellers: false, can_handle_reports: false, can_manage_users: false });
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (profile?.role === "owner") {
      loadAdmins();
      loadOrdinaryUsers();
    } else {
      setAdminUsers([]);
      setOrdinaryUsers([]);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (panel === "admin" && (profile?.role === "owner" || profile?.role === "admin")) {
      loadPendingProducts();
      loadSellerApplications();
      loadReports();
    }
  }, [panel, profile?.id, profile?.role, myPermissions.can_review_products, myPermissions.can_review_sellers, myPermissions.can_handle_reports]);

  async function promoteAdmin(userId: string) {
    if (!supabase || profile?.role !== "owner") return;
    setBusy(true);
    setNotice("");
    try {
      const { error: permissionError } = await supabase
        .from("admin_permissions")
        .upsert({ admin_id: userId }, { onConflict: "admin_id" });
      if (permissionError) throw permissionError;

      const { error } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", userId)
        .eq("role", "user");
      if (error) throw error;

      await loadAdmins();
      setNotice("دسترسی مدیریتی با موفقیت فعال شد.");
    } catch (err: any) {
      setNotice(err.message || "ارتقای کاربر ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function demoteAdmin(userId: string) {
    if (!supabase || profile?.role !== "owner") return;
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: "user" })
        .eq("id", userId)
        .eq("role", "admin");
      if (error) throw error;

      const { error: permissionError } = await supabase
        .from("admin_permissions")
        .delete()
        .eq("admin_id", userId);
      if (permissionError) throw permissionError;

      await loadAdmins();
      setNotice("دسترسی مدیریتی لغو شد؛ حساب کاربری حذف نشده است.");
    } catch (err: any) {
      setNotice(err.message || "لغو دسترسی ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function loadAdminPermissions(adminId: string) {
    if (!supabase || profile?.role !== "owner") return;
    setSelectedAdmin(adminId);
    const { data, error } = await supabase
      .from("admin_permissions")
      .select("can_review_products,can_review_sellers,can_handle_reports,can_manage_users")
      .eq("admin_id", adminId)
      .maybeSingle();
    if (error) {
      setNotice("دریافت مجوزها ناموفق بود: " + error.message);
      return;
    }
    setAdminPermissions({
      can_review_products: data?.can_review_products ?? true,
      can_review_sellers: data?.can_review_sellers ?? false,
      can_handle_reports: data?.can_handle_reports ?? true,
      can_manage_users: data?.can_manage_users ?? false
    });
  }

  async function saveAdminPermissions() {
    if (!supabase || profile?.role !== "owner" || !selectedAdmin) return;
    setBusy(true);
    const { error } = await supabase
      .from("admin_permissions")
      .upsert({ admin_id: selectedAdmin, ...adminPermissions }, { onConflict: "admin_id" });
    setBusy(false);
    setNotice(error ? "ذخیره مجوزها ناموفق بود: " + error.message : "مجوزهای مدیر ذخیره شدند.");
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: auth.email, password: auth.password,
          options: { data: { username: auth.username, phone: auth.phone } }
        });
        if (error) throw error;
        if (data.user) setNotice("حساب ساخته شد. اگر تأیید ایمیل فعال باشد، لینک تأیید برایت ارسال می‌شود.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: auth.email, password: auth.password });
        if (error) throw error;
        setAuthOpen(false); setNotice("با موفقیت وارد شدی.");
      }
    } catch (err: any) { setNotice(err.message || "خطا در احراز هویت"); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await supabase?.auth.signOut(); setPanel("none"); setNotice("از حساب خارج شدی.");
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !session?.user || !profile) return;
    if (!["owner", "seller"].includes(profile.role)) { setNotice("برای ثبت محصول باید درخواست فروشندگی‌ات تأیید شده باشد."); return; }
    setBusy(true); setNotice("");
    try {
      let filePath: string | null = null;
      if (!form.file || !form.file.name.toLowerCase().endsWith(".jar")) throw new Error("فایل پلاگین با پسوند JAR انتخاب کن.");
      if (form.file.size > 100 * 1024 * 1024) throw new Error("حداکثر حجم فایل در این نسخه ۱۰۰ مگابایت است.");
      filePath = `${session.user.id}/${crypto.randomUUID()}-${form.file.name}`;
      const { error: uploadError } = await supabase.storage.from("plugin-jars").upload(filePath, form.file, { contentType: "application/java-archive", upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("products").insert({
        name: form.name, description: form.description, price: form.free ? 0 : Number(form.price),
        is_free: form.free, version: form.version, minecraft_versions: form.mc.split(",").map(x => x.trim()).filter(Boolean),
        platform: form.platform.split(",").map(x => x.trim()).filter(Boolean), category: form.category,
        file_path: filePath, author_id: session.user.id, status: profile.role === "owner" ? "approved" : "pending"
      });
      if (error) throw error;
      setNotice(profile.role === "owner" ? "پلاگین ثبت و منتشر شد." : "پلاگین برای بررسی مدیر ارسال شد.");
      setPanel("none"); await loadProducts();
    } catch (err: any) { setNotice(err.message || "ثبت پلاگین ناموفق بود."); }
    finally { setBusy(false); }
  }

  async function applySeller() {
    if (!supabase || !session?.user) { setAuthOpen(true); return; }
    const { error } = await supabase.from("seller_applications").insert({ user_id: session.user.id, status: "pending" });
    setNotice(error ? error.message : "درخواست فروشندگی ثبت شد و پس از بررسی نتیجه اعلام می‌شود.");
  }

  async function moderate(id: string, status: "approved" | "rejected") {
    if (!supabase || !profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_review_products))) return;
    const reason = status === "rejected" ? window.prompt("Enter rejection reason:") : null;
    if (status === "rejected" && !reason?.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("products")
      .update({ status, rejection_reason: status === "rejected" ? reason!.trim() : null })
      .eq("id", id);
    if (error) setNotice("خطا: " + error.message);
    else setNotice(status === "approved" ? "پلاگین تأیید شد." : "پلاگین با ثبت دلیل رد شد.");
    await loadProducts();
    await loadPendingProducts();
    setBusy(false);
  }

  return <main>
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">RP</span><span>RPCRAFT <b>SHOP</b><small>بازار پلاگین ماینکرفت</small></span></a>
      <button className="mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)}><Menu/></button>
      <nav className={mobileMenu ? "nav open" : "nav"}>
        <a href="#shop" onClick={() => setMobileMenu(false)}>فروشگاه</a>
        <a href="#free" onClick={() => {setTab("free"); setMobileMenu(false);}}>پلاگین‌های رایگان</a>
        <a href="#sell" onClick={() => setMobileMenu(false)}>فروشندگی</a>
      </nav>
      <div className="top-actions">
        {session ? <>
          <span className="user-chip">{profile?.username || session.user.email}</span>
          {(profile?.role === "owner" || profile?.role === "seller") && <button className="btn primary small" onClick={() => setPanel("upload")}><UploadCloud size={16}/> ثبت پلاگین</button>}
          {profile?.role === "owner" && <button className="icon-btn" title="تنظیمات مالک" onClick={() => setPanel("settings")}><Settings/></button>}
          {(profile?.role === "owner" || profile?.role === "admin") && <button className="icon-btn" title="پنل مدیریت" onClick={() => setPanel("admin")}><ShieldCheck/></button>}
          <button className="icon-btn" title="خروج" onClick={signOut}><LogOut/></button>
        </> : <><button className="btn ghost small" onClick={() => {setAuthMode("login");setAuthOpen(true);}}><LogIn size={16}/> ورود</button><button className="btn primary small" onClick={() => {setAuthMode("signup");setAuthOpen(true);}}><UserPlus size={16}/> ثبت‌نام</button></>}
      </div>
    </header>

    <section className="hero">
      <div className="hero-glow"></div>
      <div className="hero-content">
        <div className="eyebrow"><span></span> دنیای پلاگین‌های ماینکرفت</div>
        <h1>سرورت رو با <em>پلاگین‌های بهتر</em><br/>متفاوت کن.</h1>
        <p>پلاگین‌های کاربردی ماینکرفت را پیدا کن، رایگان دریافت کن یا محصولات سازندگان را بخر.</p>
        <div className="hero-actions"><a className="btn primary" href="#shop"><ShoppingBag size={18}/> مشاهده فروشگاه</a><button className="btn outline" onClick={applySeller}>درخواست فروشندگی</button></div>
        <div className="hero-stats"><div><b>رایگان و پولی</b><small>یک بازار، هزار ایده</small></div><div><b>بررسی پیش از انتشار</b><small>کنترل کیفیت محصولات</small></div><div><b>ویژه Minecraft</b><small>Spigot · Paper · Purpur</small></div></div>
      </div>
      <div className="hero-art"><div className="cube cube-one">RP</div><div className="cube cube-two"><Package size={52}/></div><div className="orbit"></div><div className="hero-tag">PLUGIN MARKETPLACE <b>01</b></div></div>
    </section>

    <section className="trust-strip"><div><ShieldCheck/><span><b>بررسی محصولات</b><small>قبل از انتشار عمومی</small></span></div><div><UploadCloud/><span><b>انتشار سازندگان</b><small>با درخواست و تأیید</small></span></div><div><ShoppingBag/><span><b>کتابخانه پلاگین</b><small>رایگان و پولی</small></span></div></section>

    <section className="shop-section" id="shop">
      <div className="section-heading"><div><div className="eyebrow">EXPLORE MARKETPLACE</div><h2>ویترین پلاگین‌ها</h2><p>محصولات تأییدشده جامعه سازندگان</p></div><div className="searchbox"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجوی پلاگین..."/></div></div>
      <div className="filters"><button className={tab==="all"?"active":""} onClick={()=>setTab("all")}>همه</button><button className={tab==="free"?"active":""} onClick={()=>setTab("free")}>رایگان</button><button className={tab==="paid"?"active":""} onClick={()=>setTab("paid")}>پولی</button></div>
      {!configured ? <div className="empty-state"><ShieldCheck/><h3>اتصال دیتابیس هنوز انجام نشده</h3><p>برای نمایش محصولات واقعی، پروژه Supabase را طبق راهنمای README متصل کن. هیچ محصول نمونه و ساختگی در فروشگاه قرار نگرفته است.</p></div> :
      visibleProducts.length ? <div className="product-grid">{visibleProducts.map(p=><article className="product-card" key={p.id}>
        <div className="product-icon">{p.icon_url ? <img src={p.icon_url} alt=""/> : <Package size={30}/>}<span>{p.is_free?"FREE":"PREMIUM"}</span></div>
        <div className="product-meta"><span>{p.category}</span><span>{p.platform.join(" / ")}</span></div>
        <h3>{p.name}</h3><p>{p.description}</p>
        <div className="product-bottom"><div><small>نسخه {p.version}</small><b>{p.is_free?"رایگان":money(p.price)}</b></div><span className="mc-version">MC {p.minecraft_versions.join(", ")}</span></div>
      </article>)}</div> : <div className="empty-state"><Package/><h3>هنوز محصول تأییدشده‌ای وجود ندارد</h3><p>اولین پلاگین واقعی را صاحب سایت اضافه می‌کند. محصولات نمونه‌ای در این نسخه قرار نداده‌ایم.</p></div>}
    </section>

    <section className="sell-section" id="sell"><div><div className="eyebrow">FOR DEVELOPERS</div><h2>پلاگینت رو به جامعه معرفی کن.</h2><p>برای انتشار محصول، درخواست فروشندگی ثبت کن. پس از تأیید، می‌توانی پلاگین رایگان یا پولی ارسال کنی. تمام ارسال‌ها پیش از انتشار بررسی می‌شوند.</p><button className="btn primary" onClick={applySeller}>ثبت درخواست فروشندگی</button></div><div className="sell-steps"><div><b>01</b><span>ثبت درخواست</span></div><div><b>02</b><span>بررسی مدیریت</span></div><div><b>03</b><span>ارسال پلاگین</span></div><div><b>04</b><span>انتشار پس از تأیید</span></div></div></section>

    <footer><a className="brand" href="#"><span className="brand-mark">RP</span><span>RPCRAFT <b>SHOP</b><small>ساخته‌شده برای جامعه ماینکرفت</small></span></a><span>© {new Date().getFullYear()} RPCRAFT SHOP</span><a href="https://t.me/rpcraft_team" target="_blank" rel="noreferrer">پشتیبانی تلگرام</a></footer>

    {notice && <div className="toast" role="status"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")}><X size={16}/></button></div>}

    {authOpen && <div className="modal-backdrop" onClick={()=>setAuthOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setAuthOpen(false)}><X/></button><div className="eyebrow">YOUR RPCRAFT ACCOUNT</div><h2>{authMode==="signup"?"ساخت حساب کاربری":"ورود به حساب"}</h2><div className="auth-switch"><button className={authMode==="signup"?"selected":""} onClick={()=>setAuthMode("signup")}>ثبت‌نام</button><button className={authMode==="login"?"selected":""} onClick={()=>setAuthMode("login")}>ورود</button></div><form onSubmit={submitAuth}>
      {authMode==="signup" && <><label>نام کاربری<input required value={auth.username} onChange={e=>setAuth({...auth,username:e.target.value})} minLength={3}/></label><label>شماره موبایل<input required type="tel" value={auth.phone} onChange={e=>setAuth({...auth,phone:e.target.value})} placeholder="09xxxxxxxxx"/></label></>}
      <label>ایمیل<input required type="email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/></label>
      <label>رمز عبور<input required type="password" minLength={8} value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/></label>
      {authMode==="signup" && <div className="captcha-note">با ساخت حساب، قوانین و شرایط استفاده از سایت را می‌پذیری.</div>}
      <button className="btn primary full" disabled={busy || !configured}>{busy?"لطفاً صبر کن...":authMode==="signup"?"ایجاد حساب":"ورود"}</button>
      {!configured && <small className="form-hint">ابتدا اطلاعات Supabase را در فایل env وارد کن.</small>}
    </form></div></div>}

    {panel!=="none" && <div className="modal-backdrop" onClick={()=>setPanel("none")}><div className="modal wide" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setPanel("none")}><X/></button>
      {panel==="upload" && <><div className="eyebrow">CREATOR STUDIO</div><h2>ثبت پلاگین جدید</h2>
      <div className="upload-progress"><div className="upload-progress-track"><div style={{width:`${(uploadStep+1)*33.333}%`}}/></div><div className="upload-steps"><span className={uploadStep>=0?"active":""}>۱. مشخصات</span><span className={uploadStep>=1?"active":""}>۲. نسخه و قیمت</span><span className={uploadStep>=2?"active":""}>۳. فایل پلاگین</span></div></div>
      <form className="form-grid" onSubmit={submitProduct}>
      {uploadStep===0 && <><label>نام پلاگین<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="نام پلاگین"/></label><label>دسته‌بندی<input required value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="مثلاً ابزار، اقتصاد، مدیریت"/></label><label className="span-two">توضیحات کامل پلاگین<textarea required rows={5} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="امکانات و ویژگی‌های پلاگین را توضیح بده..."/></label><button type="button" className="btn primary span-two" onClick={()=>{if(!form.name.trim()||!form.category.trim()||!form.description.trim()){setNotice("لطفاً تمام مشخصات این مرحله را تکمیل کن.");return;}setNotice("");setUploadStep(1);}}>مرحله بعدی</button></>}
      {uploadStep===1 && <><label>نسخه پلاگین<input required value={form.version} onChange={e=>setForm({...form,version:e.target.value})} placeholder="1.0.0"/></label><label>نسخه‌های ماینکرفت<input required value={form.mc} onChange={e=>setForm({...form,mc:e.target.value})} placeholder="1.21.1, 1.21.4"/></label><label className="span-two">پلتفرم‌های پشتیبانی‌شده<input value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})} placeholder="Paper, Spigot, Purpur"/></label><label className="check-label"><input type="checkbox" checked={form.free} onChange={e=>setForm({...form,free:e.target.checked})}/> پلاگین رایگان است</label>{!form.free&&<label>قیمت به تومان<input type="number" min="1000" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>}<div className="span-two upload-actions"><button type="button" className="btn outline" onClick={()=>setUploadStep(0)}>مرحله قبل</button><button type="button" className="btn primary" onClick={()=>{if(!form.version.trim()||!form.mc.trim()||(!form.free&&Number(form.price)<1000)){setNotice("اطلاعات نسخه و قیمت را بررسی کن.");return;}setNotice("");setUploadStep(2);}}>مرحله بعدی</button></div></>}
      {uploadStep===2 && <><div className="span-two upload-file-panel"><UploadCloud size={34}/><b>فایل اصلی پلاگین را انتخاب کن</b><p>فقط فایل JAR با حداکثر حجم ۱۰۰ مگابایت</p><input type="file" accept=".jar,application/java-archive" required onChange={e=>setForm({...form,file:e.target.files?.[0]||null})}/>{form.file&&<small>فایل انتخاب‌شده: {form.file.name}</small>}</div><div className="span-two upload-actions"><button type="button" className="btn outline" onClick={()=>setUploadStep(1)}>مرحله قبل</button><button type="submit" className="btn primary" disabled={busy||!form.file}>{busy?"در حال ارسال...":"ارسال برای بررسی"}</button></div></>}
      </form></>}
      {panel==="settings" && <><div className="eyebrow">PRIVATE OWNER AREA</div><h2>تنظیمات مالک سایت</h2><div className="owner-warning"><ShieldCheck/> این بخش فقط برای نقش Owner است. دسترسی واقعی توسط سیاست‌های دیتابیس کنترل می‌شود.</div><div className="settings-list"><div><b>مدیریت محصولات</b><span>افزودن، ویرایش، حذف و انتشار محصولات خودت</span></div><div><b>مدیریت مدیران</b><span>تعیین مجوزهای محدود برای هر مدیر</span></div><div><b>کمیسیون و تسویه</b><span>تنظیم سهم پلتفرم و فروشندگان (پس از اتصال پرداخت)</span></div><div><b>تنظیمات سایت</b><span>نام، پشتیبانی، دسته‌بندی‌ها و سیاست‌ها</span></div><div><b>کاربران و فروشندگان</b><span>تغییر نقش، تعلیق و بررسی درخواست‌ها</span></div></div><p className="form-hint">این رابط پایه است؛ عملیات حساس در نسخه سرور و با RLS پیاده‌سازی می‌شوند.</p></>}
      {panel==="admin" && <><div className="eyebrow">RPCRAFT CONTROL CENTER</div><h2>{profile?.role==="owner"?"پنل اختصاصی Owner":"پنل مدیریت"}</h2>
        {profile?.role==="owner" ? <><div className="owner-warning"><ShieldCheck/> مدیریت حساب‌ها و سطح دسترسی مدیران فقط در اختیار Owner است.</div><h3>مدیران فعال ({adminUsers.length})</h3>
          {adminUsers.length ? <div className="settings-list">{adminUsers.map(admin=><div key={admin.id}><b>{admin.username}</b><span>شناسه: {admin.id}</span><button className="btn outline small" onClick={()=>loadAdminPermissions(admin.id)}>تنظیم مجوزها</button><button className="btn outline small" disabled={busy} onClick={()=>demoteAdmin(admin.id)}>لغو دسترسی Admin</button></div>)}</div> : <p className="form-hint">هنوز مدیری اضافه نشده است.</p>}
          {selectedAdmin && <div className="settings-list"><h3>مجوزهای مدیر انتخاب‌شده</h3>
            <label><input type="checkbox" checked={adminPermissions.can_review_products} onChange={e=>setAdminPermissions({...adminPermissions,can_review_products:e.target.checked})}/> بررسی و تأیید پلاگین‌ها</label>
            <label><input type="checkbox" checked={adminPermissions.can_review_sellers} onChange={e=>setAdminPermissions({...adminPermissions,can_review_sellers:e.target.checked})}/> بررسی درخواست فروشندگی</label>
            <label><input type="checkbox" checked={adminPermissions.can_handle_reports} onChange={e=>setAdminPermissions({...adminPermissions,can_handle_reports:e.target.checked})}/> رسیدگی به گزارش‌ها</label>
            <label><input type="checkbox" checked={adminPermissions.can_manage_users} onChange={e=>setAdminPermissions({...adminPermissions,can_manage_users:e.target.checked})}/> مدیریت کاربران</label>
            <button className="btn primary small" disabled={busy} onClick={saveAdminPermissions}>ذخیره مجوزها</button>
          </div>}
          <h3>کاربران عادی ({ordinaryUsers.length})</h3>
          {ordinaryUsers.length ? <div className="settings-list">{ordinaryUsers.map(user=><div key={user.id}><b>{user.username}</b><span>شناسه: {user.id}</span><button className="btn primary small" disabled={busy} onClick={()=>promoteAdmin(user.id)}>ارتقا به Admin</button></div>)}</div> : <p className="form-hint">کاربر عادی برای نمایش وجود ندارد.</p>}
        </> : null}
        {(profile?.role==="owner" || profile?.role==="admin") && <>
          <h3>محصولات در انتظار بررسی ({pendingProducts.length})</h3>
          {pendingProducts.length ? <div className="settings-list">{pendingProducts.map(product=><div key={product.id}>
            <b>{product.name} — نسخه {product.version}</b>
            <span>{product.description}</span>
            <span>پلتفرم: {product.platform.join(" / ")} | سازنده: {product.author_id}</span>
            <div className="top-actions">
              <button className="btn primary small" disabled={busy} onClick={()=>moderate(product.id,"approved")}>تأیید و انتشار</button>
              <button className="btn outline small" disabled={busy} onClick={()=>moderate(product.id,"rejected")}>رد محصول</button>
            </div>
          </div>)}</div> : <p className="form-hint">محصولی در انتظار بررسی نیست یا دسترسی بررسی محصولات را نداری.</p>}
        </>}
        {(profile?.role==="owner" || myPermissions.can_review_sellers) && <>
          <h3>درخواست‌های فروشندگی ({sellerApplications.length})</h3>
          {sellerApplications.length ? <div className="settings-list">{sellerApplications.map(app=><div key={app.id}>
            <b>درخواست فروشندگی</b><span>شناسه کاربر: {app.user_id}</span>
            <div className="top-actions">
              <button className="btn primary small" disabled={busy} onClick={()=>reviewSellerApplication(app.id,app.user_id,true)}>تأیید</button>
              <button className="btn outline small" disabled={busy} onClick={()=>reviewSellerApplication(app.id,app.user_id,false)}>رد درخواست</button>
            </div>
          </div>)}</div> : <p className="form-hint">درخواست فروشندگی در انتظاری وجود ندارد.</p>}
        </>}
        {(profile?.role==="owner" || myPermissions.can_handle_reports) && <>
          <h3>گزارش‌های باز ({reports.length})</h3>
          {reports.length ? <div className="settings-list">{reports.map(report=><div key={report.id}>
            <b>گزارش #{report.id}</b>
            <span>محصول: {report.product_id || "نامشخص"}</span>
            <p>{report.reason}</p>
            <div className="top-actions">
              <button className="btn primary small" disabled={busy} onClick={()=>updateReportStatus(report.id,"resolved")}>حل‌شده</button>
              <button className="btn outline small" disabled={busy} onClick={()=>updateReportStatus(report.id,"rejected")}>رد گزارش</button>
            </div>
          </div>)}</div> : <p className="form-hint">گزارش بازی وجود ندارد.</p>}
        </>}
        <button className="btn outline" onClick={()=>setPanel("none")}>بستن</button></>}
    </div></div>}
  </main>;
}
