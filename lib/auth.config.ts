import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeCode = user.employeeCode;
        token.id = user.id;
        token.organizationId = user.organizationId;
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
      return session;
    },
  },
} satisfies NextAuthConfig;
