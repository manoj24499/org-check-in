/**
 * Branded HTML + plain-text bodies for transactional email.
 *
 * Deliberately dependency-free (no imports) so a template can be rendered to a
 * file for previewing without booting the app. Email clients are not browsers:
 * layout is nested tables, every style is inline, there are no web fonts, and
 * buttons are padded table cells so they still render in Outlook. Gradients
 * always sit on top of a solid `bgcolor` so clients that drop them fall back
 * cleanly.
 *
 * The hero artwork is a real image sent as an inline attachment and referenced
 * as `cid:<name>` (see lib/emailAssets.ts and lib/email.ts). It is purely
 * decorative: if a client blocks images the dark hero panel and the HTML
 * headline below it still read correctly, and `alt` carries the brand name.
 */

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
  /** Inline image keys (cid names) referenced by `html`; resolved in lib/email.ts. */
  images: string[];
};

const BRAND = "#f06400";
const BRAND_DEEP = "#c05000";
const INK = "#1d1f26";
const MUTED = "#5f6374";
const PAGE_BG = "#e9ebf3";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Layout = {
  subject: string;
  /** The grey preview line shown next to the subject in the inbox. */
  preheader: string;
  /** cid of the hero artwork (600x300, shown full-bleed at the top). */
  hero: string;
  eyebrow: string;
  /** Hero headline. `accent` is rendered in brand orange after `lead`. */
  headline: { lead: string; accent: string };
  /** Light sub-line under the headline, inside the dark hero. */
  lede: string;
  greeting?: string;
  paragraphs: string[];
  cta: { label: string; url: string };
  /** Workspace card: avatar + name + subtitle, with big-figure stats. */
  workspace?: { name: string; subtitle: string; stats: { label: string; value: string }[] };
  steps?: { title: string; body: string }[];
  /** Highlighted note (expiry, single-use, ...). */
  callout: string;
  /** Extra reassurance block, e.g. "didn't request this?". */
  notice?: { title: string; body: string };
  /** Why the recipient is getting this. */
  reason: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function renderHtml(l: Layout): string {
  const paragraphs = l.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:25px;color:${MUTED};">${esc(p)}</p>`)
    .join("");

  const workspace = l.workspace
    ? `<tr><td class="px" style="padding:4px 40px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#faf8f5" style="border:1px solid #ece6dd;border-radius:16px;">
          <tr><td style="padding:18px 20px 16px;font-family:${FONT};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="46" height="46" align="center" bgcolor="${BRAND}" style="border-radius:23px;font-family:${FONT};font-size:16px;font-weight:800;line-height:46px;color:${INK};">${esc(initials(l.workspace.name))}</td>
              <td style="padding-left:14px;font-family:${FONT};">
                <div style="font-size:17px;line-height:22px;font-weight:800;letter-spacing:-0.3px;color:${INK};">${esc(l.workspace.name)}</div>
                <div style="font-size:12px;line-height:18px;color:${MUTED};">${esc(l.workspace.subtitle)}</div>
              </td>
            </tr></table>
          </td></tr>
          ${
            l.workspace.stats.length
              ? `<tr><td style="padding:0 20px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            ${l.workspace.stats
              .map(
                (s, i) => `<td width="${Math.floor(100 / l.workspace!.stats.length)}%" valign="top" style="padding:0 ${i === l.workspace!.stats.length - 1 ? 0 : 8}px 0 ${i === 0 ? 0 : 8}px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border:1px solid #ece6dd;border-radius:12px;"><tr><td style="padding:12px 14px;font-family:${FONT};">
                <div style="font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};">${esc(s.label)}</div>
                <div style="margin-top:3px;font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.5px;color:${INK};">${esc(s.value)}</div>
              </td></tr></table>
            </td>`,
              )
              .join("")}
          </tr></table></td></tr>`
              : ""
          }
        </table>
      </td></tr>`
    : "";

  const steps = l.steps
    ? `<tr><td class="px" style="padding:26px 40px 4px;font-family:${FONT};">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${MUTED};">What happens next</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          ${l.steps
            .map(
              (s, i) => `<td class="stack" width="33%" valign="top" style="padding:${i === 0 ? "0 8px 12px 0" : i === l.steps!.length - 1 ? "0 0 12px 8px" : "0 8px 12px 8px"};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border:1px solid #e6e8f0;border-radius:12px;"><tr><td style="padding:14px 14px 15px;font-family:${FONT};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="${INK}" style="border-radius:13px;font-size:13px;font-weight:800;line-height:26px;color:${BRAND};">${i + 1}</td></tr></table>
              <p style="margin:10px 0 3px;font-size:14px;line-height:20px;font-weight:700;color:${INK};">${esc(s.title)}</p>
              <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">${esc(s.body)}</p>
            </td></tr></table>
          </td>`,
            )
            .join("")}
        </tr></table>
      </td></tr>`
    : "";

  const notice = l.notice
    ? `<tr><td class="px" style="padding:6px 40px 4px;font-family:${FONT};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff5ec" style="border:1px solid #fbd9bb;border-radius:12px;"><tr><td style="padding:14px 16px;font-size:13px;line-height:20px;color:${INK};"><strong>${esc(l.notice.title)}</strong><br><span style="color:${MUTED};">${esc(l.notice.body)}</span></td></tr></table>
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(l.subject)}</title>
<style>
  @media only screen and (max-width:520px) {
    .px { padding-left:24px !important; padding-right:24px !important; }
    .stack { display:block !important; width:100% !important; padding:0 0 10px 0 !important; }
    .h1 { font-size:30px !important; line-height:36px !important; }
    .btn { width:100% !important; }
    .btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(l.preheader)}${"&#8199;&#847;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}">
<tr><td align="center" style="padding:28px 12px 36px;font-family:${FONT};">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td style="border-radius:24px;overflow:hidden;background:#ffffff;border:1px solid #dcdfea;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

        <!-- Hero artwork -->
        <tr><td bgcolor="${INK}" style="background-color:${INK};font-size:0;line-height:0;">
          <img src="cid:${esc(l.hero)}" width="600" height="300" alt="Inzivo - Attendance that proves itself" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;font-family:${FONT};font-size:18px;font-weight:700;color:#ffffff;">
        </td></tr>

        <!-- Hero copy -->
        <tr><td class="px" bgcolor="${INK}" style="background-color:${INK};padding:6px 40px 40px;font-family:${FONT};">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BRAND};">${esc(l.eyebrow)}</p>
          <h1 class="h1" style="margin:0;font-size:38px;line-height:44px;font-weight:800;letter-spacing:-1.1px;color:#ffffff;">${esc(l.headline.lead)} <span style="color:${BRAND};">${esc(l.headline.accent)}</span></h1>
          <p style="margin:14px 0 0;font-size:16px;line-height:26px;color:#b9bccb;">${esc(l.lede)}</p>
        </td></tr>

        <!-- Body -->
        <tr><td class="px" style="padding:36px 40px 6px;font-family:${FONT};">
          ${l.greeting ? `<p style="margin:0 0 14px;font-size:17px;line-height:24px;font-weight:800;letter-spacing:-0.2px;color:${INK};">${esc(l.greeting)}</p>` : ""}
          ${paragraphs}
        </td></tr>

        <tr><td class="px" style="padding:10px 40px 30px;">
          <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" bgcolor="${BRAND}" style="border-radius:14px;border-bottom:4px solid ${BRAND_DEEP};">
              <a href="${esc(l.cta.url)}" target="_blank" style="display:inline-block;padding:16px 38px 14px;font-family:${FONT};font-size:16px;font-weight:800;color:${INK};text-decoration:none;border-radius:14px;">${esc(l.cta.label)}&nbsp;&nbsp;&rarr;</a>
            </td>
          </tr></table>
        </td></tr>

        ${workspace}
        ${steps}
        ${notice}

        <tr><td class="px" style="padding:22px 40px 6px;font-family:${FONT};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="4" bgcolor="${BRAND}" style="border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding:2px 0 2px 14px;font-size:13px;line-height:20px;color:${INK};font-weight:600;">${esc(l.callout)}</td>
          </tr></table>
        </td></tr>

        <tr><td class="px" style="padding:22px 40px 36px;font-family:${FONT};">
          <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${MUTED};">Button not working? Paste this link into your browser:</p>
          <p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${esc(l.cta.url)}" target="_blank" style="color:${BRAND_DEEP};text-decoration:underline;">${esc(l.cta.url)}</a></p>
        </td></tr>

        <!-- Footer band -->
        <tr><td class="px" bgcolor="${INK}" style="background-color:${INK};padding:26px 40px;font-family:${FONT};font-size:12px;line-height:19px;color:#9a9eb0;">
          <p style="margin:0 0 12px;">${esc(l.reason)}</p>
          <p style="margin:0;"><strong style="color:#ffffff;">Inzivo</strong> &middot; Attendance that proves itself.<br><span style="color:#6f7385;">Built by Qube Space &middot; Made in India</span></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function renderText(l: Layout): string {
  const lines = [
    `${l.headline.lead} ${l.headline.accent}`,
    l.lede,
    "",
    ...(l.greeting ? [l.greeting, ""] : []),
    ...l.paragraphs.flatMap((p) => [p, ""]),
    `${l.cta.label}:`,
    l.cta.url,
    "",
    ...(l.workspace
      ? [`Workspace: ${l.workspace.name} (${l.workspace.subtitle})`, ...l.workspace.stats.map((s) => `${s.label}: ${s.value}`), ""]
      : []),
    ...(l.steps ? ["What happens next:", ...l.steps.map((s, i) => `${i + 1}. ${s.title} - ${s.body}`), ""] : []),
    l.callout,
    ...(l.notice ? ["", `${l.notice.title} ${l.notice.body}`] : []),
    "",
    "--",
    l.reason,
    "Inzivo - Attendance that proves itself. Built by Qube Space, made in India.",
  ];
  return lines.join("\n");
}

function build(l: Layout): EmailContent {
  return { subject: l.subject, html: renderHtml(l), text: renderText(l), images: [l.hero] };
}

function firstName(name?: string): string | undefined {
  const n = name?.trim().split(/\s+/)[0];
  return n || undefined;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function activationEmail(opts: {
  orgName?: string;
  adminName?: string;
  link: string;
  hours: number;
  /** Shown in the workspace card when provided. */
  plan?: string;
  seats?: number;
  billingCycle?: string;
}): EmailContent {
  const org = opts.orgName?.trim();
  const name = firstName(opts.adminName);
  const stats: { label: string; value: string }[] = [];
  if (opts.seats) stats.push({ label: "Employees", value: String(opts.seats) });
  if (opts.billingCycle) stats.push({ label: "Billing", value: titleCase(opts.billingCycle) });
  const subtitle = [opts.plan ? `${titleCase(opts.plan)} plan` : null, "Admin account pending"].filter(Boolean).join(" · ");

  return build({
    subject: org ? `Activate your ${org} workspace` : "Activate your Inzivo account",
    preheader: "One last step: choose a password to open your admin dashboard.",
    hero: "hero-activation",
    eyebrow: "Payment confirmed",
    headline: { lead: org ? `${org} is` : "Your workspace is", accent: "ready." },
    lede: "Set your password and your team can start checking in today.",
    greeting: name ? `Hi ${name},` : undefined,
    paragraphs: [
      "Thanks for choosing Inzivo. Your workspace has been created and your admin account is waiting for you.",
      "Choose a password to activate it and open your dashboard.",
    ],
    cta: { label: "Activate my account", url: opts.link },
    workspace: org ? { name: org, subtitle, stats } : undefined,
    steps: [
      { title: "Set a password", body: "Under a minute." },
      { title: "Open dashboard", body: "Signed in for you." },
      { title: "Add your team", body: "Staff and shifts." },
    ],
    callout: `This link expires in ${opts.hours} hours and can only be used once.`,
    reason:
      "You're receiving this because this email address was used to create an Inzivo workspace. If that wasn't you, you can safely ignore this email.",
  });
}

export function passwordResetEmail(opts: { link: string; minutes: number; name?: string }): EmailContent {
  const name = firstName(opts.name);
  return build({
    subject: "Reset your Inzivo password",
    preheader: "Use this link to choose a new password. It expires soon.",
    hero: "hero-reset",
    eyebrow: "Account recovery",
    headline: { lead: "Reset your", accent: "password." },
    lede: "Choose a new one and you're straight back in.",
    greeting: name ? `Hi ${name},` : undefined,
    paragraphs: [
      "We received a request to reset the password for your Inzivo admin account.",
      "Use the button below to choose a new password.",
    ],
    cta: { label: "Choose a new password", url: opts.link },
    notice: {
      title: "Didn't ask for this?",
      body: "You can ignore this email - your current password keeps working and nothing has changed.",
    },
    callout: `This link expires in ${opts.minutes} minutes and can only be used once.`,
    reason: "You're receiving this because a password reset was requested for this email address.",
  });
}
