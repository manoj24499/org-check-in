import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Runs in the Node.js runtime, not the (default) Edge runtime — next-auth
// v5's internals pull in a Node-only module (node:util/types) that Vercel's
// Edge Function bundler rejects outright ("referencing unsupported
// modules"), even though nothing in this file or auth.config.ts touches
// Node APIs directly. This was previously getting through undetected; a
// routine rebuild started failing on it. Node.js middleware runtime is
// supported by Next.js on Vercel, and this middleware only redirects based
// on role — nothing here needs edge-specific behavior.
export const runtime = "nodejs";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const role = session?.user?.role;

  // Skip API routes — they handle auth themselves and return JSON errors
  if (nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  const isEmployeeRoute = nextUrl.pathname.startsWith("/my-page");

  if (isAdminRoute && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (isEmployeeRoute && role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/my-page/:path*"],
};
