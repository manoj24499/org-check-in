"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function TabSecurity() {
  useEffect(() => {
    // Check if this specific tab has the login flag
    const hasLoginFlag = sessionStorage.getItem("tab_auth");
    if (!hasLoginFlag) {
      // If it doesn't, force signout to clear cookie and redirect to login
      // Back to the sign-in page for the area this tab was in.
      signOut({ callbackUrl: window.location.pathname.startsWith("/admin") ? "/login/admin" : "/login/employee" });
    }
  }, []);

  return null;
}
