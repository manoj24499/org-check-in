import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
  // SameSite=None (rather than the default Lax) on the CSRF cookie only —
  // the marketing site's own /signin form (a different origin) fetches
  // /api/auth/csrf and must be able to send that same cookie back on its
  // follow-up cross-origin POST to /api/auth/callback/admin-login; Lax
  // cookies are excluded from cross-site requests entirely, which would
  // otherwise make that double-submit CSRF check fail unconditionally.
  // None requires Secure, which is fine here — http://localhost is treated
  // as a secure context by browsers for exactly this reason. The session
  // cookie itself is untouched (stays at the default Lax): it's only ever
  // read back once the browser has actually navigated to this app's own
  // origin, which is a same-origin request regardless of where sign-in
  // started, so it never needs to survive a cross-site request itself.
  cookies: {
    csrfToken: {
      name: "authjs.csrf-token",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeCode = user.employeeCode;
        token.id = user.id;
        token.organizationId = user.organizationId;
        // Only set on a real credential sign-in (`user` is present only then),
        // never on later token refreshes — app/auth/continue uses it to tell a
        // brand-new sign-in apart from an old, merely still-valid cookie.
        token.signedInAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.employeeCode = token.employeeCode as string;
        session.user.organizationId = token.organizationId as string;
      }
      session.signedInAt = token.signedInAt as number | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
