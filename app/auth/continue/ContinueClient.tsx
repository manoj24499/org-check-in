"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

/** Sets this tab's `tab_auth` marker (see TabSecurity) and moves on. */
export default function ContinueClient({ next }: { next: string }) {
  const router = useRouter();

  useEffect(() => {
    try {
      sessionStorage.setItem("tab_auth", "true");
    } catch {
      // Storage blocked: TabSecurity will send them to /login, same as any blocked-storage case.
    }
    router.replace(next);
  }, [next, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-2">
      <Logo variant="animated" size={40} className="text-foreground" />
      <p className="text-sm text-muted-2">Signing you in…</p>
    </main>
  );
}
