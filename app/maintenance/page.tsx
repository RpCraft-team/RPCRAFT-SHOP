export default function MaintenancePage() {
  return (
    <main dir="rtl" style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      background: "radial-gradient(circle at 50% 30%, #292044 0%, #100e18 55%, #09080d 100%)",
      color: "#fff",
      fontFamily: "inherit",
      textAlign: "center"
    }}>
      <section style={{ maxWidth: 620 }}>
        <div style={{
          width: 88,
          height: 88,
          margin: "0 auto 28px",
          borderRadius: 26,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(135deg,#8b5cf6,#f59e0b)",
          fontSize: 38
        }}>⚒</div>
        <p style={{ color: "#c4a7ff", letterSpacing: 3, fontWeight: 800 }}>
          RPCRAFT SHOP
        </p>
        <h1 style={{ fontSize: "clamp(30px,7vw,54px)", margin: "18px 0", fontWeight: 900 }}>
          در حال به‌روزرسانی هستیم!
        </h1>
        <p style={{ color: "#c4bdcf", lineHeight: 2, fontSize: 17 }}>
          فروشگاه RPCRAFT SHOP موقتاً برای انجام به‌روزرسانی و بهبود خدمات در دسترس نیست.
          به‌زودی با امکانات بهتر برمی‌گردیم.
        </p>
        <div style={{
          marginTop: 32,
          padding: "14px 20px",
          border: "1px solid #51416e",
          borderRadius: 14,
          color: "#e9d5ff",
          background: "#ffffff08"
        }}>
          ممنون از صبر و همراهی شما ❤️
        </div>
        <p style={{ color: "#81778f", fontSize: 12, marginTop: 35 }}>
          © RPCRAFT SHOP — All rights reserved.
        </p>
      </section>
    </main>
  );
}
