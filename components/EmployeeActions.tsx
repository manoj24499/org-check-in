"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Power, Copy, Check, ScanFace, Camera, ShieldOff } from "lucide-react";

/** Reads a File as a `data:image/...;base64,...` URL — same format lib/photoUpload.ts's decodePhoto expects. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export default function EmployeeActions({
  employeeId,
  active,
  faceVerificationEnabled,
  faceVerificationExempt,
}: {
  employeeId: string;
  active: boolean;
  faceVerificationEnabled: boolean;
  faceVerificationExempt: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [faceEnrollment, setFaceEnrollment] = useState<{
    status: "enrolled" | "failed" | "unavailable";
    message?: string;
  } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function call(action: string, extra?: Record<string, unknown>) {
    setLoading(action);
    const res = await fetch(`/api/admin/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(null);

    if (action === "regenerate-pin" && data.pin) {
      setNewPin(data.pin);
      setCopied(false);
    }
    if (action === "set-face-verification") {
      // Present only when a photo was submitted (see the route) — a plain
      // on/off toggle has nothing to report here.
      setFaceEnrollment(data.faceEnrollment ?? null);
    }
    router.refresh();
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    const photo = await readFileAsDataUrl(file);
    await call("set-face-verification", { enabled: true, photo });
  }

  async function copyPin() {
    if (!newPin) return;
    await navigator.clipboard.writeText(newPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => call("regenerate-pin")}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface transition disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" />
          {loading === "regenerate-pin" ? "Generating…" : "Regenerate PIN"}
        </button>
        <button
          onClick={() => call("set-active", { active: !active })}
          disabled={loading !== null}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
            active
              ? "border border-red-300 text-red-600 hover:bg-red-50"
              : "border border-emerald-300 text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <Power className="w-4 h-4" />
          {active ? "Deactivate" : "Reactivate"}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <ScanFace className="w-4 h-4 mt-0.5 shrink-0 text-secondary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Face verification</p>
            <p className="text-xs text-secondary mt-0.5">
              Enroll a photo to turn this on, or upload a new one to re-enroll (e.g. if the first
              photo was rejected). While on, a check-in photo that doesn&apos;t match blocks the
              check-in.
            </p>
          </div>
          <button
            onClick={() => call("set-face-verification", { enabled: !faceVerificationEnabled })}
            disabled={loading !== null}
            className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
              faceVerificationEnabled
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-surface text-muted border border-border"
            }`}
          >
            {loading === "set-face-verification" ? "…" : faceVerificationEnabled ? "On" : "Off"}
          </button>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handlePhotoSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={loading !== null}
          className="self-start inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface transition disabled:opacity-50"
        >
          <Camera className="w-3.5 h-3.5" />
          {loading === "set-face-verification"
            ? "Enrolling…"
            : faceVerificationEnabled
              ? "Re-enroll photo"
              : "Enroll photo"}
        </button>

        {faceEnrollment?.status === "enrolled" && (
          <p className="text-xs text-green-700">Face verification enrolled successfully.</p>
        )}
        {faceEnrollment?.status === "failed" && (
          <p className="text-xs text-red-600">
            Enrollment failed{faceEnrollment.message ? `: ${faceEnrollment.message}` : "."} Try a clearer,
            front-facing photo.
          </p>
        )}
        {faceEnrollment?.status === "unavailable" && (
          <p className="text-xs text-amber-600">
            Couldn&apos;t reach the face-verification service{faceEnrollment.message ? ` (${faceEnrollment.message})` : ""} —
            try again shortly.
          </p>
        )}
      </div>

      {!faceVerificationEnabled && (
        <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
          <ShieldOff className="w-4 h-4 mt-0.5 shrink-0 text-secondary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Mobile app enrollment exemption</p>
            <p className="text-xs text-secondary mt-0.5">
              The mobile app blocks an unenrolled employee with a mandatory selfie screen on first
              login. If they&apos;re stuck there (camera trouble, or a policy exception) and
              enrolling really isn&apos;t an option, exempt them to let them into the app without
              turning on check-in face verification — that only enrolling actually does.
            </p>
          </div>
          <button
            onClick={() => call("set-face-verification-exempt", { exempt: !faceVerificationExempt })}
            disabled={loading !== null}
            className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
              faceVerificationExempt
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-surface text-muted border border-border"
            }`}
          >
            {loading === "set-face-verification-exempt" ? "…" : faceVerificationExempt ? "Exempt" : "Not exempt"}
          </button>
        </div>
      )}

      {newPin && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
          <p className="text-xs text-secondary font-medium">
            New PIN (shown once)
          </p>
          <p className="text-3xl font-medium tracking-widest mt-1 text-foreground">
            {newPin}
          </p>
          <button
            onClick={copyPin}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary/10 transition"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied" : "Copy PIN"}
          </button>
        </div>
      )}
    </div>
  );
}
