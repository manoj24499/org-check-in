"use client";

import { useState } from "react";
import { Building2, Copy, Check } from "lucide-react";
import { BTN_SECONDARY, CARD, IconChip } from "./admin/ui";

export default function OrgCodePanel({ name, slug }: { name: string; slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start gap-3">
        <IconChip icon={Building2} />
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Organization code</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Share this with employees for the kiosk, mobile app, and My Page login.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-slate-50 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 truncate">{name}</p>
          <p className="font-mono text-sm font-semibold text-slate-900 truncate">{slug}</p>
        </div>
        <button
          type="button"
          onClick={copyCode}
          className={`${BTN_SECONDARY} shrink-0 !px-3 !py-1.5`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
