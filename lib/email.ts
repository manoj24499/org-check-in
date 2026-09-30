import { isProductionRuntime } from "@/lib/isProduction";

/**
 * Transactional email via Resend's REST API (no SDK dependency).
 *
 * Env: RESEND_API_KEY, EMAIL_FROM (e.g. "Inzivo <no-reply@yourdomain.com>" —
 * the domain must be verified in Resend; for quick tests Resend allows
 * "onboarding@resend.dev", but only to the account owner's own address).
 *
 * With no RESEND_API_KEY set, non-production falls back to logging the
 * message (incl. links) to the console. Production never logs the body —
 * activation links are bearer credentials — and throws instead so callers
 * can alert ops.
 */
export type EmailMessage = { to: string; subject: string; html: string; text: string };

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (isProductionRuntime()) {
      throw new Error("Email provider not configured (RESEND_API_KEY / EMAIL_FROM)");
    }
    console.info(`[email:dev-fallback] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function activationEmail(opts: { orgName?: string; link: string; hours: number }): Omit<EmailMessage, "to"> {
  const org = opts.orgName ? escapeHtml(opts.orgName) : null;
  const subject = org ? `Activate your ${opts.orgName} workspace` : "Activate your account";
  const text = `${org ? `Your ${opts.orgName} workspace is ready.` : "Your account is ready."} Set your password to get started:\n\n${opts.link}\n\nThis link expires in ${opts.hours} hours. If you didn't sign up, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">${org ? `Your ${org} workspace is ready` : "Your account is ready"}</h2>
<p>Set your password to get started.</p>
<p><a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Activate account</a></p>
<p style="color:#666;font-size:13px">This link expires in ${opts.hours} hours. If you didn't sign up, you can ignore this email.</p>
</div>`;
  return { subject, html, text };
}
