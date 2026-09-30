/**
 * Validates a caller-supplied `?callbackUrl=` before ever handing it to
 * `router.push` — only a same-app relative path is honored, never an
 * absolute URL, so this can't become an open redirect via a crafted
 * `?callbackUrl=https://evil.example` link. "//evil.example" (a
 * protocol-relative URL, which a plain `startsWith("/")` check alone
 * wouldn't catch) is rejected too. Shared by every sign-in page that
 * supports bouncing back to where the visitor came from (app/login/admin,
 * app/signin).
 */
export function safeCallbackUrl(raw: string | undefined | null, fallback = "/admin/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
