"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Cake, Loader2 } from "lucide-react";

/**
 * Asks for the date of birth when the employee hasn't given one. It can't be dismissed: it stays over My Page until a
 * valid date is saved, then goes away for good.
 */
export default function DobPrompt() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The popup is drawn on the page body, which only exists in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const value = String(new FormData(e.currentTarget).get("dob") ?? "");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mobile/me/date-of-birth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Something went wrong (error ${res.status}). Please try again.`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  if (!mounted) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  return createPortal(
    <div className="mp mp-modal" style={{ minHeight: 0, background: "rgba(26,21,18,0.55)" }}>
      <form className="mp-dialog" onSubmit={submit} aria-label="Add your date of birth">
        <span style={{ width: 48, height: 48, borderRadius: 999, background: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Cake size={24} />
        </span>
        <h2>When&apos;s your birthday?</h2>
        <p style={{ margin: 0, color: "#6f6259", fontSize: 14 }}>
          Please add your date of birth to continue. Teammates will see only the day and month in the upcoming birthdays list, never the year.
        </p>
        <label>
          Date of birth
          <input name="dob" type="date" min="1940-01-01" max={today} required />
        </label>
        {error && (
          <div role="alert" style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(179,69,63,0.1)", color: "#b3453f", fontSize: 14 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? "Saving…" : "Save"}
            </span>
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
