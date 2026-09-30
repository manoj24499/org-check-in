"use client";

import { useState } from "react";
import { Building2, Copy, Check } from "lucide-react";

export default function OrgCodePanel({ name, slug }: { name: string; slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Building2 className="w-3.5 h-3.5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Organization code</p>
          <p className="text-xs text-secondary mt-1">
            Share this with employees for the kiosk, mobile app, and My Page login.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-secondary truncate">{name}</p>
          <p className="font-mono text-sm font-semibold text-foreground truncate">{slug}</p>
        </div>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary/5 transition shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
