"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import EmployeePreloader from "./EmployeePreloader";
import AdminPreloader from "./AdminPreloader";
import { getSignInPreloader, hideSignInPreloader, subscribeSignInPreloader } from "@/lib/signInPreloader";

/** The screen stays up at least this long from the moment the password or PIN was accepted. */
const MIN_MS = 5000;
const FADE_MS = 450;
/** Safety net: never leave the screen up forever if the destination never opens. */
const MAX_MS = 30_000;

/**
 * Shows the sign-in preloader over everything, from the moment the login form accepts the credentials until the
 * destination (My Page or the admin console) has opened, then fades it out. It sits in the root layout, so it stays
 * mounted while the page underneath changes: the login form, then the loading dashboard, are never seen.
 */
export default function SignInPreloaderHost() {
  const state = useSyncExternalStore(subscribeSignInPreloader, getSignInPreloader, () => null);
  const pathname = usePathname();
  const [fading, setFading] = useState(false);
  const variant = state?.variant;
  const startedAt = state?.startedAt;
  const arrived = variant ? pathname.startsWith(variant === "admin" ? "/admin" : "/my-page") : false;

  useEffect(() => {
    if (!startedAt || !arrived) return;
    const wait = Math.max(600, MIN_MS - (Date.now() - startedAt));
    const t1 = setTimeout(() => setFading(true), wait);
    const t2 = setTimeout(() => {
      hideSignInPreloader();
      setFading(false);
    }, wait + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [startedAt, arrived]);

  useEffect(() => {
    if (!startedAt) return;
    const t = setTimeout(() => {
      hideSignInPreloader();
      setFading(false);
    }, MAX_MS);
    return () => clearTimeout(t);
  }, [startedAt]);

  if (!variant) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}>
      {variant === "admin" ? <AdminPreloader /> : <EmployeePreloader />}
    </div>
  );
}
