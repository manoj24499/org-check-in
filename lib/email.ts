import { isProductionRuntime } from "@/lib/isProduction";
import { EMAIL_IMAGES } from "@/lib/emailAssets";

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
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Inline image keys (see lib/emailAssets.ts) referenced as `cid:<key>` in `html`. */
  images?: string[];
};

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
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      // Inline (cid) attachments: the HTML shows them in place rather than as downloads.
      attachments: (msg.images ?? [])
        .filter((key) => key in EMAIL_IMAGES)
        .map((key) => ({
          filename: EMAIL_IMAGES[key].filename,
          content: EMAIL_IMAGES[key].base64,
          content_type: EMAIL_IMAGES[key].contentType,
          content_id: key,
        })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

// Templates live in their own dependency-free module so they can be previewed standalone.
export { activationEmail, passwordResetEmail } from "./emailTemplates";
