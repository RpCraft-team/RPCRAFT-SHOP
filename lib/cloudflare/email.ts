interface EmailEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export async function sendSecurityCode(
  env: EmailEnv,
  email: string,
  code: string,
  purpose: "signup" | "password_reset"
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error("Email service is not configured.");
  }

  if (!/^\d{6}$/.test(code)) {
    throw new Error("Invalid security code.");
  }

  const isSignup = purpose === "signup";
  const subject = isSignup
    ? "Verify your RPCRAFT SHOP email"
    : "Reset your RPCRAFT SHOP password";

  const heading = isSignup
    ? "Verify your email address"
    : "Password reset request";

  const description = isSignup
    ? "Use the verification code below to complete your account registration."
    : "Use the verification code below to reset your account password.";

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <body style="margin:0;padding:32px 12px;background:#100d19;font-family:Arial,Helvetica,sans-serif;color:#f5f0ff">
        <div style="max-width:520px;margin:0 auto;background:#1b1528;border:1px solid #39284f;border-radius:18px;overflow:hidden">
          <div style="padding:26px 28px;background:#241832;border-bottom:1px solid #49305e">
            <div style="font-size:23px;font-weight:800;letter-spacing:1px">
              <span style="color:#f4a340">RP</span><span style="color:#ffffff">CRAFT</span>
              <span style="color:#d5b45b"> SHOP</span>
            </div>
            <div style="margin-top:7px;color:#b9a9cc;font-size:12px">MINECRAFT PLUGIN MARKETPLACE</div>
          </div>
          <div style="padding:30px 28px">
            <h2 style="margin:0 0 14px;color:#ffffff;font-size:22px">${heading}</h2>
            <p style="color:#c9bdd8;font-size:15px;line-height:1.8">${description}</p>
            <div style="margin:26px 0;padding:22px 12px;text-align:center;background:#100d19;border:1px solid #49305e;border-radius:14px">
              <div style="font-size:12px;color:#b9a9cc;margin-bottom:12px">YOUR SECURITY CODE</div>
              <div style="font-size:34px;font-weight:800;letter-spacing:9px;color:#f4a340">${code}</div>
            </div>
            <p style="color:#c9bdd8;font-size:13px;line-height:1.8">
              This code expires in <strong style="color:#ffffff">10 minutes</strong>.
              Never share it with anyone.
            </p>
            <p style="color:#a99ab9;font-size:12px;line-height:1.7">
              If you did not request this code, you can safely ignore this email.
            </p>
          </div>
          <div style="padding:18px 28px;border-top:1px solid #39284f;color:#9d8eae;font-size:11px;text-align:center">
            RPCRAFT SHOP · Automated security message
          </div>
        </div>
      </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject,
      html,
      text: `${heading}\n\n${description}\n\nYour security code: ${code}\n\nThis code expires in 10 minutes. Never share it with anyone.\n\nRPCRAFT SHOP`
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("Email delivery failed.");
  }
}
