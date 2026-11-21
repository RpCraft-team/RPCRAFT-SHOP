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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<any>(null);
  const [tab, setTab] = useState<"all" | "free" | "paid">("all");
  const [query, setQuery] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [panel, setPanel] = useState<"none" | "upload" | "settings" | "admin">("none");
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

  async function loadProducts() {
    if (!supabase) return;
    const { data, error } = await supabase.from("products").select("*").eq("status", "approved").order("created_at", { ascending: false });
    if (!error && data) setProducts(data as Product[]);
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
    const { error } = await supabase!.from("products").update({ status }).eq("id", id);
    setNotice(error ? error.message : "وضعیت محصول تغییر کرد."); await loadProducts();
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
      {panel==="upload" && <><div className="eyebrow">CREATOR STUDIO</div><h2>ثبت پلاگین جدید</h2><form className="form-grid" onSubmit={submitProduct}><label>نام پلاگین<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>دسته‌بندی<input required value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label className="span-two">توضیحات<textarea required rows={4} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>نسخه پلاگین<input required value={form.version} onChange={e=>setForm({...form,version:e.target.value})}/></label><label>نسخه‌های ماینکرفت<input required value={form.mc} onChange={e=>setForm({...form,mc:e.target.value})}/></label><label>پلتفرم‌ها<input value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}/></label><label className="check-label"><input type="checkbox" checked={form.free} onChange={e=>setForm({...form,free:e.target.checked})}/> پلاگین رایگان است</label>{!form.free&&<label>قیمت به تومان<input type="number" min="1000" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>}<label className="span-two">فایل پلاگین (JAR)<input type="file" accept=".jar,application/java-archive" required onChange={e=>setForm({...form,file:e.target.files?.[0]||null})}/><small>حداکثر ۱۰۰ مگابایت؛ فایل پس از بارگذاری برای بررسی ذخیره می‌شود.</small></label><button className="btn primary span-two" disabled={busy}>{busy?"در حال ارسال...":"ارسال برای بررسی"}</button></form></>}
      {panel==="settings" && <><div className="eyebrow">PRIVATE OWNER AREA</div><h2>تنظیمات مالک سایت</h2><div className="owner-warning"><ShieldCheck/> این بخش فقط برای نقش Owner است. دسترسی واقعی توسط سیاست‌های دیتابیس کنترل می‌شود.</div><div className="settings-list"><div><b>مدیریت محصولات</b><span>افزودن، ویرایش، حذف و انتشار محصولات خودت</span></div><div><b>مدیریت مدیران</b><span>تعیین مجوزهای محدود برای هر مدیر</span></div><div><b>کمیسیون و تسویه</b><span>تنظیم سهم پلتفرم و فروشندگان (پس از اتصال پرداخت)</span></div><div><b>تنظیمات سایت</b><span>نام، پشتیبانی، دسته‌بندی‌ها و سیاست‌ها</span></div><div><b>کاربران و فروشندگان</b><span>تغییر نقش، تعلیق و بررسی درخواست‌ها</span></div></div><p className="form-hint">این رابط پایه است؛ عملیات حساس در نسخه سرور و با RLS پیاده‌سازی می‌شوند.</p></>}
      {panel==="admin" && <><div className="eyebrow">MODERATION CENTER</div><h2>پنل بررسی مدیریت</h2><p>در این نسخه، بررسی درخواست‌ها از طریق جدول‌های مدیریتی Supabase انجام می‌شود. پنل عملیاتی کامل در مرحله بعد به همین رابط متصل خواهد شد.</p><button className="btn outline" onClick={()=>setPanel("none")}>بستن</button></>}
    </div></div>}
  </main>;
}
