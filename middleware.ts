import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

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
