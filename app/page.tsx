"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag, ShieldCheck, UploadCloud, Search, LogIn, UserPlus, Settings, LogOut, Package, X, CheckCircle2, Menu } from "lucide-react";

type Product = {
  id: string; name: string; description: string; price: number; is_free: boolean;
  version: string; minecraft_versions: string[]; platform: string[]; category: string;
  icon_url: string | null; status: string; created_at: string; author_id: string; rejection_reason?: string | null;
};
type Profile = { id: string; username: string; role: "owner" | "admin" | "seller" | "user" };

const money = (n: number) => new Intl.NumberFormat("fa-IR").format(n) + " تومان";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [sellerApplications, setSellerApplications] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [resetRequests, setResetRequests] = useState<any[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<any>(null);
  const [tab, setTab] = useState<"all" | "free" | "paid">("all");
  const [query, setQuery] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [panel, setPanel] = useState<"none" | "upload" | "settings" | "admin" | "products">("none");
  const [uploadStep, setUploadStep] = useState(0);
  const [adminUsers, setAdminUsers] = useState<Profile[]>([]);
  const [ordinaryUsers, setOrdinaryUsers] = useState<Profile[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [myPermissions, setMyPermissions] = useState({
    can_review_products: false,
    can_review_sellers: false,
    can_handle_reports: false,
    can_manage_users: false,
    can_handle_tickets: false
  });
  const [adminPermissions, setAdminPermissions] = useState({
    can_review_products: true,
    can_review_sellers: false,
    can_handle_reports: true,
    can_manage_users: false,
    can_handle_tickets: false
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [siteSettings, setSiteSettings] = useState({site_name:"RPCRAFT SHOP",site_description:"بازارچه تخصصی پلاگین‌های ماینکرفت",support_telegram:"https://t.me/rpcraft_team",maintenance_mode:false});
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [auth, setAuth] = useState({ username: "", email: "", phone: "", password: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [emailVerification, setEmailVerification] = useState(false);
  const [forgotMode, setForgotMode] = useState<"request" | "reset" | false>(false);
  const [resetCode, setResetCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "0", version: "1.0.0", mc: "1.21.1", platform: "Paper,Spigot,Purpur", category: "ابزار", free: true, file: null as File | null, iconFile: null as File | null });


  const configured = true;

  useEffect(() => {
    let active = true;
    api("/api/auth/turnstile-config").then(data => {
      if (active) setTurnstileSiteKey(data.siteKey || "");
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authOpen || authMode !== "signup" || emailVerification || !turnstileSiteKey || !turnstileRef.current) return;
    let widgetId: string | number | undefined;
    const render = () => {
      const ts = (window as any).turnstile;
      if (!ts || !turnstileRef.current) return;
      turnstileRef.current.innerHTML = "";
      widgetId = ts.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken("")
      });
    };
    const existing = document.querySelector('script[data-turnstile="rpcraft"]');
    if ((window as any).turnstile) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "rpcraft";
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      if (widgetId !== undefined) {
        try { (window as any).turnstile?.remove(widgetId); } catch {}
      }
    };
  }, [authOpen, authMode, emailVerification, turnstileSiteKey]);

  const api = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body instanceof FormData ? {} : {"Content-Type": "application/json"}),
        ...options.headers
      }
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed.");
    return data;
  };

  const visibleProducts = useMemo(() => products.filter(p =>
    (tab === "all" || (tab === "free" ? p.is_free : !p.is_free)) &&
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query.toLowerCase())
  ), [products, tab, query]);

  async function loadProducts() {
    try {
      const data = await api("/api/products?limit=40");
      setProducts(data.products || []);
    } catch {
      setNotice("دریافت پلاگین‌ها ناموفق بود.");
    }
  }

  async function loadMyProducts() {
    try {
      const data = await api("/api/seller/products");
      setMyProducts(data.products || []);
    } catch (e: any) {
      setNotice(e.message || "دریافت محصولات ناموفق بود.");
    }
  }

  async function resubmitProduct(product: Product) {
    setBusy(true);
    try {
      const result = await api(`/api/seller/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: product.name, description: product.description, price: product.price,
          isFree: product.is_free, version: product.version,
          minecraftVersions: product.minecraft_versions, platform: product.platform,
          category: product.category
        })
      });
      setNotice(result.status === "pending" ? "محصول برای بررسی مجدد ارسال شد." : "درخواست ارسال مجدد ثبت شد.");
      await loadMyProducts();
    } catch (e: any) {
      setNotice(e.message || "ارسال مجدد ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function loadSiteSettings() {
    setSettingsLoading(true);
    try {
      const data = await api("/api/owner/settings");
      setSiteSettings(current => ({...current,...(data.settings || {})}));
    } catch (e: any) { setNotice(e.message); }
    finally { setSettingsLoading(false); }
  }

  async function saveSiteSettings() {
    setBusy(true);
    try {
      await api("/api/owner/settings", {method:"PATCH",body:JSON.stringify(siteSettings)});
      setNotice("تنظیمات سایت با موفقیت ذخیره شد.");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function loadAdmins() {
    if (profile?.role !== "owner") return;
    try {
      const data = await api("/api/owner/admins");
      setAdminUsers(data.admins || []);
    } catch (e: any) { setNotice(e.message); }
  }

  async function loadOrdinaryUsers() {
    if (profile?.role !== "owner") return;
    try {
      const data = await api("/api/owner/users");
      setOrdinaryUsers((data.users || []).filter((u: Profile) => u.role === "user"));
    } catch (e: any) { setNotice(e.message); }
  }

  async function loadPendingProducts() {
    if (!profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_review_products))) return;
    try {
      const data = await api("/api/admin/products?status=pending");
      setPendingProducts(data.products || []);
    } catch (e: any) { setNotice(e.message); }
  }

  async function loadSellerApplications() {
    if (!profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_review_sellers))) return;
    try {
      const data = await api("/api/admin/sellers?status=pending");
      setSellerApplications(data.applications || []);
    } catch (e: any) { setNotice(e.message); }
  }

  async function loadNotifications() {
    if (!profile || (profile.role !== "owner" && profile.role !== "admin")) return;
    try {
      const data = await api("/api/notifications");
      setNotifications(data.notifications || []);
    } catch (e: any) { setNotice(e.message); }
  }

  async function markNotificationRead(id: string) {
    try {
      await api("/api/notifications", {method:"PATCH", body:JSON.stringify({id})});
      setNotifications(items => items.map(item => item.id === id ? {...item, is_read:1} : item));
    } catch (e: any) { setNotice(e.message); }
  }

  async function loadResetRequests() {
    if (!profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_manage_users))) return;
    try {
      const data = await api("/api/admin/password-resets");
      setResetRequests(data.requests || []);
    } catch (e: any) { setNotice(e.message); }
  }

  async function issueResetCode(requestId: string) {
    if (!window.confirm("برای این درخواست کد بازیابی جدید ساخته شود؟")) return;
    setBusy(true);
    try {
      const data = await api("/api/admin/password-resets", {
        method:"POST",
        body:JSON.stringify({requestId})
      });
      window.alert("ایمیل کاربر: " + data.email + "\\nکد یک‌بارمصرف: " + data.code + "\\nاعتبار: " + data.expiresInMinutes + " دقیقه\\nاین کد را دستی برای کاربر ایمیل کن.");
      setNotice("کد بازیابی ساخته شد. آن را از طریق ایمیل برای کاربر بفرست.");
      await loadResetRequests();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function loadReports() {
    if (!profile || (profile.role !== "owner" && !(profile.role === "admin" && myPermissions.can_handle_reports))) return;
    try {
      const data = await api("/api/admin/reports?status=open");
      setReports(data.reports || []);
    } catch (e: any) { setNotice(e.message); }
  }

  async function updateReportStatus(id: string, status: "resolved" | "rejected") {
    setBusy(true);
    try {
      await api("/api/admin/reports", {method:"PATCH", body:JSON.stringify({reportId:id,status})});
      setNotice("وضعیت گزارش به‌روزرسانی شد.");
      await loadReports();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function reviewSellerApplication(id: string, _userId: string, approved: boolean) {
    setBusy(true);
    try {
      await api("/api/admin/sellers", {
        method:"PATCH",
        body:JSON.stringify({applicationId:id,status:approved?"approved":"rejected"})
      });
      setNotice(approved ? "درخواست فروشندگی تأیید شد." : "درخواست فروشندگی رد شد.");
      await loadSellerApplications();
      await loadOrdinaryUsers();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    loadProducts();
    api("/api/auth/me").then(data => {
      const user = data.user || null;
      setSession(user ? {user} : null);
      setProfile(user);
      const permissions = data.permissions || {};
      setMyPermissions({
        can_review_products: !!permissions.can_review_products,
        can_review_sellers: !!permissions.can_review_sellers,
        can_handle_reports: !!permissions.can_handle_reports,
        can_manage_users: !!permissions.can_manage_users,
        can_handle_tickets: !!permissions.can_handle_tickets
      });
    }).catch(() => {
      setSession(null);
      setProfile(null);
    });
  }, []);

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
    if (panel === "settings" && profile?.role === "owner") loadSiteSettings();
  }, [panel, profile?.id, profile?.role]);

  useEffect(() => {
    if (panel === "admin") {
      loadPendingProducts();
      loadSellerApplications();
      loadReports();
      loadNotifications();
      loadResetRequests();
    }
  }, [panel, profile?.id, profile?.role, myPermissions.can_review_products, myPermissions.can_review_sellers, myPermissions.can_handle_reports, myPermissions.can_manage_users]);

  async function promoteAdmin(userId: string) {
    setBusy(true);
    try {
      await api("/api/owner/users", {method:"PATCH",body:JSON.stringify({userId,role:"admin"})});
      await loadAdmins();
      await loadOrdinaryUsers();
      setNotice("دسترسی مدیریتی فعال شد.");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function demoteAdmin(userId: string) {
    setBusy(true);
    try {
      await api("/api/owner/users", {method:"PATCH",body:JSON.stringify({userId,role:"user"})});
      await loadAdmins();
      await loadOrdinaryUsers();
      setSelectedAdmin("");
      setNotice("دسترسی مدیریتی لغو شد.");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function loadAdminPermissions(adminId: string) {
    setSelectedAdmin(adminId);
    try {
      const data = await api("/api/owner/admins");
      const admin = (data.admins || []).find((item: any) => item.id === adminId);
      setAdminPermissions({
        can_review_products: !!admin?.can_review_products,
        can_review_sellers: !!admin?.can_review_sellers,
        can_handle_reports: !!admin?.can_handle_reports,
        can_manage_users: !!admin?.can_manage_users,
        can_handle_tickets: !!admin?.can_handle_tickets
      });
    } catch (e: any) { setNotice(e.message); }
  }

  async function saveAdminPermissions() {
    if (!selectedAdmin) return;
    setBusy(true);
    try {
      await api("/api/owner/admins", {
        method:"PATCH",
        body:JSON.stringify({adminId:selectedAdmin,...adminPermissions})
      });
      setNotice("مجوزهای مدیر ذخیره شدند.");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (forgotMode === "request") {
      const data = await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: auth.email.trim().toLowerCase() })
      });
      setForgotMode("reset");
      setNotice(data.message || "If the account exists, a verification code has been sent.");
    } else if (forgotMode === "reset") {
      const data = await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: auth.email.trim().toLowerCase(),
          code: resetCode.trim(),
          password: auth.password
        })
      });
      setForgotMode(false);
      setResetCode("");
      setAuthMode("login");
      setAuth({...auth, password: ""});
      setNotice(data.message || "Password changed. Please sign in again.");
    } else if (emailVerification) {
        await api("/api/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ email: auth.email.trim().toLowerCase(), code: verificationCode.trim() })
        });
        setEmailVerification(false);
        setVerificationCode("");
        setAuthMode("login");
        setTurnstileToken("");
        setNotice("ایمیل با موفقیت تأیید شد. اکنون وارد حساب شو.");
      } else if (authMode === "signup") {
        if (!turnstileToken) throw new Error("لطفاً تأیید امنیتی را کامل کن.");
        const phone = auth.phone.trim().replace(/[\s()-]/g, "");
        const normalizedPhone = /^09\d{9}$/.test(phone) ? `+98${phone.slice(1)}` : phone;
        const data = await api("/api/auth/register", {
          method:"POST",
          body:JSON.stringify({
            username:auth.username.trim(),
            email:auth.email.trim().toLowerCase(),
            phone:normalizedPhone,
            password:auth.password,
            turnstileToken
          })
        });
        setEmailVerification(true);
        setNotice(data.message || "کد تأیید به ایمیلت ارسال شد.");
      } else {
        const data = await api("/api/auth/login", {
          method:"POST",
          body:JSON.stringify({username:auth.username.trim(),password:auth.password})
        });
        const me = await api("/api/auth/me");
        setSession({user:me.user || data.user});
        setProfile(me.user || data.user);
        setAuthOpen(false);
        setNotice("با موفقیت وارد شدی.");
      }
    } catch (e: any) { setNotice(e.message || "خطا در احراز هویت."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await api("/api/auth/logout",{method:"POST"}); }
    finally {
      setSession(null);
      setProfile(null);
      setPanel("none");
      setNotice("از حساب خارج شدی.");
    }
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user || !profile) return;
    if (!["owner","seller"].includes(profile.role)) {
      setNotice("برای ثبت محصول باید درخواست فروشندگی‌ات تأیید شده باشد.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (!form.file || !form.file.name.toLowerCase().endsWith(".jar")) throw new Error("فایل پلاگین با پسوند JAR انتخاب کن.");

      const jarForm = new FormData();
      jarForm.append("kind","jar");
      jarForm.append("file",form.file);
      const jar = await api("/api/storage/upload",{method:"POST",body:jarForm});

      let iconKey: string | null = null;
      if (form.iconFile) {
        const iconForm = new FormData();
        iconForm.append("kind","icon");
        iconForm.append("file",form.iconFile);
        const icon = await api("/api/storage/upload",{method:"POST",body:iconForm});
        iconKey = icon.fileKey;
      }

      await api("/api/seller/products", {
        method:"POST",
        body:JSON.stringify({
          name:form.name.trim(),
          description:form.description.trim(),
          version:form.version.trim(),
          category:form.category.trim(),
          fileKey:jar.fileKey,
          iconUrl:iconKey,
          isFree:form.free,
          price:form.free?0:Number(form.price),
          minecraftVersions:form.mc.split(",").map(x=>x.trim()).filter(Boolean),
          platform:form.platform.split(",").map(x=>x.trim()).filter(Boolean)
        })
      });

      setNotice(profile.role==="owner"?"پلاگین ثبت و منتشر شد.":"پلاگین برای بررسی مدیر ارسال شد.");
      setPanel("none");
      setUploadStep(0);
      setForm({name:"",description:"",price:"0",version:"1.0.0",mc:"1.21.1",platform:"Paper,Spigot,Purpur",category:"ابزار",free:true,file:null,iconFile:null});
      await loadProducts();
    } catch (e: any) { setNotice(e.message || "ثبت پلاگین ناموفق بود."); }
    finally { setBusy(false); }
  }

  async function applySeller() {
    if (!session?.user) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    try {
      await api("/api/seller/apply",{method:"POST",body:JSON.stringify({message:""})});
      setNotice("درخواست فروشندگی ثبت شد.");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  }

  async function moderate(id: string, status: "approved" | "rejected") {
    const reason = status==="rejected" ? window.prompt("دلیل رد محصول را وارد کن:") : "";
    if (status==="rejected" && !reason?.trim()) return;
    setBusy(true);
    try {
      await api("/api/admin/products", {
        method:"PATCH",
        body:JSON.stringify({productId:id,status,reason:reason?.trim() || ""})
      });
      setNotice(status==="approved"?"پلاگین تأیید شد.":"پلاگین با ثبت دلیل رد شد.");
      await loadProducts();
      await loadPendingProducts();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
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
        {session ? <div className="account-menu-wrap">
          <button className="account-trigger" onClick={() => setAccountMenu(!accountMenu)} aria-expanded={accountMenu}>
            <span className="account-avatar">{(profile?.username || session.user.email || "U").slice(0,1).toUpperCase()}</span>
            <span className="account-trigger-name">{profile?.username || session.user.email}</span><span>⌄</span>
          </button>
          {accountMenu && <div className="account-dropdown">
<a href="/support" onClick={() => setAccountMenu(false)}>مرکز پشتیبانی</a>
            <a href={profile?.username ? `/profile/${encodeURIComponent(profile.username)}` : "#"} onClick={() => setAccountMenu(false)}>مشاهده پروفایل</a>
            {(profile?.role === "owner" || profile?.role === "seller") && <><button onClick={() => {setAccountMenu(false);loadMyProducts();setPanel("products");}}>محصولات من</button><button onClick={() => {setAccountMenu(false);setPanel("upload");}}>ثبت پلاگین جدید</button></>}
            {profile?.role === "owner" && <button onClick={() => {setAccountMenu(false);setPanel("settings");}}>تنظیمات مالک</button>}
            {(profile?.role === "owner" || profile?.role === "admin") && <button onClick={() => {setAccountMenu(false);setPanel("admin");}}>پنل مدیریت {notifications.filter(item => !item.is_read).length ? `(${notifications.filter(item => !item.is_read).length} اعلان جدید)` : ""}</button>}
            <button className="account-logout" onClick={() => {setAccountMenu(false);signOut();}}>خروج از حساب</button>
          </div>}
        </div> : <><button className="btn ghost small" onClick={() => {setAuthMode("login");setAuthOpen(true);}}><LogIn size={16}/> ورود</button><button className="btn primary small" onClick={() => {setAuthMode("signup");setAuthOpen(true);}}><UserPlus size={16}/> ثبت‌نام</button></>}
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
      {!configured ? <div className="empty-state"><ShieldCheck/><h3>محصولی برای نمایش وجود ندارد</h3><p>هنوز پلاگین تأییدشده‌ای در فروشگاه ثبت نشده است.</p></div> :
      visibleProducts.length ? <div className="product-grid">{visibleProducts.map(p=><article className="product-card" key={p.id} role="link" tabIndex={0} onClick={() => window.location.href = `/plugin/${p.id}`} onKeyDown={e => { if (e.key === "Enter") window.location.href = `/plugin/${p.id}`; }}>
        <div className="product-icon">{p.icon_url ? <img src={p.icon_url} alt=""/> : <Package size={30}/>}<span>{p.is_free?"FREE":"PREMIUM"}</span></div>
        <div className="product-meta"><span>{p.category}</span><span>{p.platform.join(" / ")}</span></div>
        <h3>{p.name}</h3><p>{p.description}</p>
        <div className="product-bottom"><div><small>نسخه {p.version}</small><b>{p.is_free?"رایگان":money(p.price)}</b></div><span className="mc-version">MC {p.minecraft_versions.join(", ")}</span></div>
      </article>)}</div> : <div className="empty-state"><Package/><h3>هنوز محصول تأییدشده‌ای وجود ندارد</h3><p>اولین پلاگین واقعی را صاحب سایت اضافه می‌کند. محصولات نمونه‌ای در این نسخه قرار نداده‌ایم.</p></div>}
    </section>

    <section className="sell-section" id="sell"><div><div className="eyebrow">FOR DEVELOPERS</div><h2>پلاگینت رو به جامعه معرفی کن.</h2><p>برای انتشار محصول، درخواست فروشندگی ثبت کن. پس از تأیید، می‌توانی پلاگین رایگان یا پولی ارسال کنی. تمام ارسال‌ها پیش از انتشار بررسی می‌شوند.</p><button className="btn primary" onClick={applySeller}>ثبت درخواست فروشندگی</button></div><div className="sell-steps"><div><b>01</b><span>ثبت درخواست</span></div><div><b>02</b><span>بررسی مدیریت</span></div><div><b>03</b><span>ارسال پلاگین</span></div><div><b>04</b><span>انتشار پس از تأیید</span></div></div></section>

    <footer><a className="brand" href="#"><span className="brand-mark">RP</span><span>RPCRAFT <b>SHOP</b><small>ساخته‌شده برای جامعه ماینکرفت</small></span></a><span>© {new Date().getFullYear()} RPCRAFT SHOP</span><a href="https://t.me/rpcraft_team" target="_blank" rel="noreferrer">پشتیبانی تلگرام</a></footer>

    {notice && <div className="toast" role="status"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")}><X size={16}/></button></div>}

    {authOpen && <div className="modal-backdrop" onClick={()=>setAuthOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setAuthOpen(false)}><X/></button><div className="eyebrow">YOUR RPCRAFT ACCOUNT</div><h2>{forgotMode==="request"?"بازیابی رمز عبور":forgotMode==="reset"?"تنظیم رمز جدید":emailVerification?"تأیید ایمیل":authMode==="signup"?"ساخت حساب کاربری":"ورود به حساب"}</h2>{!emailVerification && !forgotMode && <div className="auth-switch"><button className={authMode==="signup"?"selected":""} onClick={()=>setAuthMode("signup")}>ثبت‌نام</button><button className={authMode==="login"?"selected":""} onClick={()=>setAuthMode("login")}>ورود</button></div>}<form onSubmit={submitAuth}>
      {forgotMode ? <>
        {forgotMode === "request" ? <>
          <label>ایمیل حساب<input required type="email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/></label>
        </> : <>
          <label>کد شش‌رقمی بازیابی<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={resetCode} onChange={e=>setResetCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456"/></label>
          <label>رمز عبور جدید<input required type="password" minLength={10} maxLength={128} value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/></label>
        </>}
      </> : emailVerification ? <>
        <label>کد شش‌رقمی ایمیل<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={verificationCode} onChange={e=>setVerificationCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456"/></label>
      </> : <>
        {authMode==="signup" && <>
          <label>نام کاربری<input required value={auth.username} onChange={e=>setAuth({...auth,username:e.target.value})} minLength={3}/></label>
          <label>شماره موبایل<input required type="tel" value={auth.phone} onChange={e=>setAuth({...auth,phone:e.target.value})} placeholder="09xxxxxxxxx"/></label>
        </>}
        {authMode==="signup" ? <label>ایمیل<input required type="email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/></label> : <label>نام کاربری<input required value={auth.username} onChange={e=>setAuth({...auth,username:e.target.value})}/></label>}
        <label>رمز عبور<input required type="password" minLength={authMode==="signup"?10:1} maxLength={128} value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/></label>
        {authMode==="signup" && <>
          <div ref={turnstileRef} className="captcha-widget"/>
          <div className="captcha-note">با ساخت حساب، قوانین و شرایط استفاده از سایت را می‌پذیری.</div>
        </>}
      </>}
      <button className="btn primary full" disabled={busy || !configured || (authMode==="signup" && !emailVerification && !forgotMode && !turnstileToken) || (emailVerification && verificationCode.length!==6) || (forgotMode==="reset" && resetCode.length!==6)}>
        {busy?"لطفاً صبر کن...":forgotMode==="request"?"ارسال کد بازیابی":forgotMode==="reset"?"تغییر رمز عبور":emailVerification?"تأیید ایمیل":authMode==="signup"?"ایجاد حساب":"ورود"}
      </button>
      {!emailVerification && !forgotMode && authMode==="login" && <button type="button" className="text-link" onClick={()=>{setForgotMode("request");setAuth({...auth,email:"",password:""});}}>رمز عبور را فراموش کردی؟</button>}
      {forgotMode && <button type="button" className="text-link" onClick={()=>{setForgotMode(false);setResetCode("");setNotice("");}}>بازگشت به ورود</button>}
    </form></div></div>}

    {panel!=="none" && <div className="modal-backdrop" onClick={()=>setPanel("none")}><div className="modal wide" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setPanel("none")}><X/></button>
      {panel==="products" && <>
        <div className="eyebrow">CREATOR STUDIO</div><h2>محصولات من</h2>
        {myProducts.length ? <div className="settings-list">{myProducts.map(product => <div key={product.id}>
          <b>{product.name} — نسخه {product.version}</b>
          <span>وضعیت: {product.status === "approved" ? "تأیید و منتشرشده" : product.status === "pending" ? "در انتظار بررسی" : product.status === "rejected" ? "ردشده" : product.status}</span>
          {product.status === "rejected" && <>
            <p>دلیل رد: {product.rejection_reason || "دلیل مشخصی ثبت نشده است."}</p>
            <button className="btn primary small" disabled={busy} onClick={() => resubmitProduct(product)}>ارسال مجدد برای بررسی</button>
          </>}
        </div>)}</div> : <p className="form-hint">هنوز پلاگینی ثبت نکرده‌ای.</p>}
        <button className="btn outline" onClick={() => setPanel("none")}>بستن</button>
      </>}
      {panel==="upload" && <><div className="eyebrow">CREATOR STUDIO</div><h2>ثبت پلاگین جدید</h2>
      <div className="upload-progress"><div className="upload-progress-track"><div style={{width:`${(uploadStep+1)*33.333}%`}}/></div><div className="upload-steps"><span className={uploadStep>=0?"active":""}>۱. مشخصات</span><span className={uploadStep>=1?"active":""}>۲. نسخه و قیمت</span><span className={uploadStep>=2?"active":""}>۳. فایل پلاگین</span></div></div>
      <form className="form-grid" onSubmit={submitProduct}>
      {uploadStep===0 && <><label>نام پلاگین<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="نام پلاگین"/></label><label>دسته‌بندی<input required value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="مثلاً ابزار، اقتصاد، مدیریت"/></label><label className="span-two">توضیحات کامل پلاگین<textarea required rows={5} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="امکانات و ویژگی‌های پلاگین را توضیح بده..."/></label><button type="button" className="btn primary span-two" onClick={()=>{if(!form.name.trim()||!form.category.trim()||!form.description.trim()){setNotice("لطفاً تمام مشخصات این مرحله را تکمیل کن.");return;}setNotice("");setUploadStep(1);}}>مرحله بعدی</button></>}
      {uploadStep===1 && <><label>نسخه پلاگین<input required value={form.version} onChange={e=>setForm({...form,version:e.target.value})} placeholder="1.0.0"/></label><label>نسخه‌های ماینکرفت<input required value={form.mc} onChange={e=>setForm({...form,mc:e.target.value})} placeholder="1.21.1, 1.21.4"/></label><label className="span-two">پلتفرم‌های پشتیبانی‌شده<input value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})} placeholder="Paper, Spigot, Purpur"/></label><label className="check-label"><input type="checkbox" checked={form.free} onChange={e=>setForm({...form,free:e.target.checked})}/> پلاگین رایگان است</label>{!form.free&&<label>قیمت به تومان<input type="number" min="1000" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>}<div className="span-two upload-actions"><button type="button" className="btn outline" onClick={()=>setUploadStep(0)}>مرحله قبل</button><button type="button" className="btn primary" onClick={()=>{if(!form.version.trim()||!form.mc.trim()||(!form.free&&Number(form.price)<1000)){setNotice("اطلاعات نسخه و قیمت را بررسی کن.");return;}setNotice("");setUploadStep(2);}}>مرحله بعدی</button></div></>}
      {uploadStep===2 && <><div className="span-two upload-file-panel"><UploadCloud size={34}/><b>آیکون اختصاصی پلاگین (اختیاری)</b><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setForm({...form,iconFile:e.target.files?.[0]||null})}/>{form.iconFile&&<small>آیکون: {form.iconFile.name}</small>}<b>فایل اصلی پلاگین را انتخاب کن</b><p>فقط فایل JAR با حداکثر حجم ۱۰۰ مگابایت</p><input type="file" accept=".jar,application/java-archive" required onChange={e=>setForm({...form,file:e.target.files?.[0]||null})}/>{form.file&&<small>فایل انتخاب‌شده: {form.file.name}</small>}</div><div className="span-two upload-actions"><button type="button" className="btn outline" onClick={()=>setUploadStep(1)}>مرحله قبل</button><button type="submit" className="btn primary" disabled={busy||!form.file}>{busy?"در حال ارسال...":"ارسال برای بررسی"}</button></div></>}
      </form></>}
      {panel==="settings" && <><div className="eyebrow">PRIVATE OWNER AREA</div><h2>تنظیمات مالک سایت</h2><div className="owner-warning"><ShieldCheck/> این بخش فقط برای حساب Owner قابل ویرایش است.</div>{settingsLoading ? <p className="form-hint">در حال دریافت تنظیمات...</p> : <form className="form-grid" onSubmit={e=>{e.preventDefault();saveSiteSettings();}}><label className="span-two">نام فروشگاه<input required maxLength={100} value={siteSettings.site_name} onChange={e=>setSiteSettings({...siteSettings,site_name:e.target.value})}/></label><label className="span-two">توضیحات فروشگاه<textarea rows={3} maxLength={500} value={siteSettings.site_description} onChange={e=>setSiteSettings({...siteSettings,site_description:e.target.value})}/></label><label className="span-two">لینک تلگرام پشتیبانی<input type="url" value={siteSettings.support_telegram} onChange={e=>setSiteSettings({...siteSettings,support_telegram:e.target.value})} placeholder="https://t.me/rpcraft_team"/></label><label className="check-label span-two"><input type="checkbox" checked={siteSettings.maintenance_mode} onChange={e=>setSiteSettings({...siteSettings,maintenance_mode:e.target.checked})}/> فعال‌سازی حالت تعمیرات سایت</label><p className="form-hint span-two">حالت تعمیرات پس از ذخیره فعال می‌شود؛ اعمال محدودیت دسترسی بازدیدکنندگان نیازمند اتصال این تنظیم به لایه دسترسی سایت است.</p><button className="btn primary span-two" type="submit" disabled={busy}>{busy?"در حال ذخیره...":"ذخیره تنظیمات"}</button></form>}</>}
      {panel==="admin" && <><div className="eyebrow">RPCRAFT CONTROL CENTER</div><h2>{profile?.role==="owner"?"پنل اختصاصی Owner":"پنل مدیریت"}</h2>
        <h3>اعلان‌ها ({notifications.filter(item => !item.is_read).length} خوانده‌نشده)</h3>
        {notifications.length ? <div className="settings-list">{notifications.map(item=><div key={item.id}>
          <b>{item.title}</b><span>{item.message}</span><small>{item.created_at}</small>
          {!item.is_read && <button className="btn outline small" onClick={()=>markNotificationRead(item.id)}>علامت‌گذاری به‌عنوان خوانده‌شده</button>}
          {item.target_type === "password_reset" && <span>شناسه درخواست بازیابی: {item.target_id}</span>}
        </div>)}</div> : <p className="form-hint">اعلانی وجود ندارد.</p>}
        {(profile?.role==="owner" || (profile?.role==="admin" && myPermissions.can_manage_users)) && <>
          <h3>درخواست‌های بازیابی رمز عبور ({resetRequests.length})</h3>
          {resetRequests.length ? <div className="settings-list">{resetRequests.map(item=><div key={item.id}>
            <b>{item.username} — {item.email}</b><span>تاریخ درخواست: {item.created_at}</span>
            <button className="btn primary small" disabled={busy} onClick={()=>issueResetCode(item.id)}>ساخت کد و نمایش برای ارسال ایمیل</button>
          </div>)}</div> : <p className="form-hint">درخواست بازیابی در انتظاری وجود ندارد.</p>}
        </>}
        {profile?.role==="owner" ? <><div className="owner-warning"><ShieldCheck/> مدیریت حساب‌ها و سطح دسترسی مدیران فقط در اختیار Owner است.</div><h3>مدیران فعال ({adminUsers.length})</h3>
          {adminUsers.length ? <div className="settings-list">{adminUsers.map(admin=><div key={admin.id}><b>{admin.username}</b><span>شناسه: {admin.id}</span><button className="btn outline small" onClick={()=>loadAdminPermissions(admin.id)}>تنظیم مجوزها</button><button className="btn outline small" disabled={busy} onClick={()=>demoteAdmin(admin.id)}>لغو دسترسی Admin</button></div>)}</div> : <p className="form-hint">هنوز مدیری اضافه نشده است.</p>}
          {selectedAdmin && <div className="settings-list"><h3>مجوزهای مدیر انتخاب‌شده</h3>
            <label><input type="checkbox" checked={adminPermissions.can_review_products} onChange={e=>setAdminPermissions({...adminPermissions,can_review_products:e.target.checked})}/> بررسی و تأیید پلاگین‌ها</label>
            <label><input type="checkbox" checked={adminPermissions.can_review_sellers} onChange={e=>setAdminPermissions({...adminPermissions,can_review_sellers:e.target.checked})}/> بررسی درخواست فروشندگی</label>
            <label><input type="checkbox" checked={adminPermissions.can_handle_reports} onChange={e=>setAdminPermissions({...adminPermissions,can_handle_reports:e.target.checked})}/> رسیدگی به گزارش‌ها</label>
            <label><input type="checkbox" checked={adminPermissions.can_manage_users} onChange={e=>setAdminPermissions({...adminPermissions,can_manage_users:e.target.checked})}/> مدیریت کاربران</label>
            <label><input type="checkbox" checked={adminPermissions.can_handle_tickets} onChange={e=>setAdminPermissions({...adminPermissions,can_handle_tickets:e.target.checked})}/> رسیدگی به تیکت‌های پشتیبانی</label>
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
