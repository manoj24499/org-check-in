import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // Admin: email + password
    Credentials({
      id: "admin-login",
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.role !== "ADMIN" || !user.passwordHash || !user.active) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeCode: user.employeeCode,
        };
      },
    }),

    // Employee: employee code + PIN (used for "My Page" login, not the kiosk)
    Credentials({
      id: "employee-login",
      name: "Employee Login",
      credentials: {
        employeeCode: { label: "Employee ID", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        const employeeCode = credentials?.employeeCode as string | undefined;
        const pin = credentials?.pin as string | undefined;
        if (!employeeCode || !pin) return null;

        const user = await prisma.user.findUnique({ where: { employeeCode } });
        if (!user || user.role !== "EMPLOYEE" || !user.pinHash || !user.active) {
          return null;
        }

        const valid = await bcrypt.compare(pin, user.pinHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeCode: user.employeeCode,
        };
      },
    }),
  ],
});
