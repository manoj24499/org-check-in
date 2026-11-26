"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type LeaveOption = { type: "CASUAL" | "SICK" | "EARNED"; label: string; remaining: number };

/** Today's date in IST as YYYY-MM-DD (the app's calendar), whatever the browser's own timezone is. */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const TITLE = { leave: "Request leave", permission: "Request permission", overtime: "Request overtime" } as const;

export default function RequestButtons({ leaveOptions }: { leaveOptions: LeaveOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "leave" | "permission" | "overtime">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveOption["type"]>(leaveOptions[0]?.type ?? "CASUAL");

  function close() {
    setOpen(null);
    setError(null);
    setBusy(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !open) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (open === "leave") {
        res = await fetch("/api/mobile/me/leave-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: leaveType,
            startDate: String(f.get("start")),
            endDate: String(f.get("end") || f.get("start")),
            reason: String(f.get("reason") ?? "").trim() || undefined,
          }),
        });
      } else if (open === "overtime") {
        res = await fetch("/api/mobile/me/overtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estimatedEndAt: new Date(`${istToday()}T${String(f.get("until"))}:00+05:30`).toISOString(),
            reason: String(f.get("reason") ?? "").trim(),
          }),
        });
      } else {
        const day = istToday();
        res = await fetch("/api/mobile/me/timed-permission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: new Date(`${day}T${String(f.get("from"))}:00+05:30`).toISOString(),
            endTime: new Date(`${day}T${String(f.get("to"))}:00+05:30`).toISOString(),
          }),
        });
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Something went wrong (error ${res.status}). Please try again.`);
        setBusy(false);
        return;
      }
      setSent(
        open === "leave"
          ? "Leave request sent. You'll see it under Requests once it's reviewed."
          : open === "overtime"
            ? "Overtime noted. Check out when you finish and add a short work summary."
            : "Permission request sent.",
      );
      close();
      router.refresh();
      setTimeout(() => setSent(null), 6000);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  const today = istToday();

  return (
    <>
      <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button type="button" className="btn btn-outline" onClick={() => setOpen("leave")}>
          Request Leave
        </button>
        <button type="button" className="btn" style={{ border: "none", background: "var(--mp-muted)", color: "var(--mp-text)" }} onClick={() => setOpen("permission")}>
          Request Permission
        </button>
        <button type="button" className="btn" style={{ border: "none", background: "var(--mp-muted)", color: "var(--mp-text)" }} onClick={() => setOpen("overtime")}>
          Request Overtime
        </button>
        {sent && (
          <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--mp-success)", flexBasis: "100%" }}>
            {sent}
          </p>
        )}
      </div>

      {open &&
        createPortal(
          <div className="mp mp-modal" style={{ minHeight: 0, background: "rgba(26,21,18,0.55)" }} onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
            <form className="mp-dialog" onSubmit={submit} aria-label={TITLE[open]}>
              <h2>{TITLE[open]}</h2>
              {open === "leave" ? (
                <>
                  <label>
                    Leave type
                    <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveOption["type"])}>
                      {leaveOptions.map((o) => (
                        <option key={o.type} value={o.type}>
                          {o.label} · {o.remaining} left
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label>
                      From
                      <input name="start" type="date" min={today} defaultValue={today} required />
                    </label>
                    <label>
                      To
                      <input name="end" type="date" min={today} defaultValue={today} required />
                    </label>
                  </div>
                  <label>
                    Reason (optional)
                    <textarea name="reason" maxLength={500} placeholder="A line for your manager" />
                  </label>
                </>
              ) : open === "overtime" ? (
                <>
                  <p style={{ margin: 0, color: "#6f6259", fontSize: 14 }}>
                    Working past your shift today? Tell us when you expect to finish. You need to be checked in, and you&apos;ll get a reminder before that time.
                  </p>
                  <label>
                    Expected finish (today)
                    <input name="until" type="time" required />
                  </label>
                  <label>
                    Reason
                    <textarea name="reason" maxLength={300} required placeholder="What are you working on?" />
                  </label>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: "#6f6259", fontSize: 14 }}>
                    A short break today (a bank visit, an errand). Time outside your area during it isn&apos;t counted against you. You need to be checked in.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label>
                      From
                      <input name="from" type="time" required />
                    </label>
                    <label>
                      To
                      <input name="to" type="time" required />
                    </label>
                  </div>
                </>
              )}
              {error && (
                <div role="alert" style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(179,69,63,0.1)", color: "#b3453f", fontSize: 14 }}>
                  {error}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" style={{ flex: 1, border: "1px solid rgba(26,21,18,0.15)", background: "#fff", color: "#1a1512" }} onClick={close} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {busy && <Loader2 size={16} className="animate-spin" />}
                    {busy ? "Sending…" : "Send request"}
                  </span>
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
