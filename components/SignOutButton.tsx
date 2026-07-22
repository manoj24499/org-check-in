"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-slate-500 hover:text-slate-900 transition"
    >
      Sign out
    </button>
  );
}
