"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function TabSecurity() {
  useEffect(() => {
    // Check if this specific tab has the login flag
    const hasLoginFlag = sessionStorage.getItem("tab_auth");
    if (!hasLoginFlag) {
      // If it doesn't, force signout to clear cookie and redirect to login
      signOut({ callbackUrl: "/login" });
    }
  }, []);

  return null;
}
