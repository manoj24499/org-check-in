import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited, isPinGuessLimited } from "@/lib/rateLimit";
import { authConfig } from "./auth.config";

// Every other PIN/password-checking endpoint in the app (kiosk scan, mobile
// login, PIN change) is throttled — this is the one actual web login form,
// reachable from anywhere on the internet, so it needs the same guard.
// Keyed on IP *and* on the submitted identifier (email/employeeCode), so a
// brute force targeting one account is still capped even if the caller
// varies its claimed IP across requests. For the employee-login provider
// specifically, isPinGuessLimited (below) is checked as well — this
// function alone would only cap guesses made through *this* form, and the
// same employeeCode/pinHash pair can also be attacked via the kiosk and the
// mobile app.
async function checkLoginRateLimit(prefix: string, request: Request, identifier: string) {
  const ip = getClientIp(request);
  // Not run via Promise.all — the id-based check only needs to happen (and
  // only matters) if the IP-based one didn't already trip, and skipping it
  // in that case is one fewer write for an already-rate-limited caller.
  if (await isRateLimited(`${prefix}:ip:${ip}`, 60_000, 10)) return true;
  return isRateLimited(`${prefix}:id:${identifier}`, 5 * 60_000, 10);
}

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
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        if (await checkLoginRateLimit("admin-login", request, email)) return null;

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
      async authorize(credentials, request) {
        const employeeCode = credentials?.employeeCode as string | undefined;
        const pin = credentials?.pin as string | undefined;
        if (!employeeCode || !pin) return null;
        if (await checkLoginRateLimit("employee-login", request, employeeCode)) return null;
        if (await isPinGuessLimited(employeeCode)) return null;

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
