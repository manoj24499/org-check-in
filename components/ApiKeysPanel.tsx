"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, X, Copy, Check, Ban } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, IconChip, Pill } from "./admin/ui";

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Lets an admin issue/revoke bearer keys for the partner read API
 * (/api/v1/*, see lib/partnerApi/) — e.g. for the Payroll integration. The
 * raw key is shown exactly once, right after creation, then never again:
 * only its sha256 hash is ever stored (see the schema comment on
 * OrganizationApiKey). Closing the reveal panel or navigating away loses it
 * for good, same as a password-reset flow — a new key must be issued if the
 * value is lost. */
export default function ApiKeysPanel({ keys: initialKeys }: { keys: ApiKeySummary[] }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function openAdd() {
    setAdding(true);
    setError(null);
  }

  function closeAdd() {
    setAdding(false);
    setName("");
    setError(null);
  }

  async function handleAdd() {
    if (!name.trim()) {
      setError("Enter a name for this key, e.g. “Payroll integration”.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setKeys((prev) => [
      { id: data.key.id, name: data.key.name, keyPrefix: data.key.keyPrefix, createdAt: data.key.createdAt, lastUsedAt: null, revokedAt: null },
      ...prev,
    ]);
    setRevealedKey(data.key.raw);
    closeAdd();
    router.refresh();
  }

  async function copyRevealed() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
    router.refresh();
  }

  return (
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconChip icon={KeyRound} />
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">API keys</h2>
            <p className="mt-0.5 text-xs text-slate-500">For partner integrations, like a payroll system.</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className={`${BTN_PRIMARY} shrink-0 !px-3 !py-1.5`}
          >
            <Plus className="w-3.5 h-3.5" />
            New key
          </button>
        )}
      </div>

      {revealedKey && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex flex-col gap-2.5">
          <p className="text-xs font-semibold text-slate-800">
            Copy this now &mdash; you won&apos;t be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg border border-black/10 bg-white px-2.5 py-2 font-mono text-xs text-slate-800">{revealedKey}</code>
            <button
              type="button"
              onClick={copyRevealed}
              className={`${BTN_PRIMARY} shrink-0 !px-3 !py-1.5`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedKey(null)}
            className="self-start text-xs text-slate-500 hover:text-slate-900 transition-all duration-200"
          >
            Done, I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="-mx-2 flex flex-col divide-y divide-slate-100">
        {keys.length === 0 && !adding && (
          <p className="px-2 py-3 text-xs text-slate-500">No keys yet.</p>
        )}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-slate-50">
            <IconChip icon={KeyRound} tone={k.revokedAt ? "slate" : "orange"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{k.name}</p>
              <p className="truncate font-mono text-xs text-slate-500">{k.keyPrefix}&hellip;</p>
            </div>
            {k.revokedAt ? (
              <Pill tone="red">Revoked</Pill>
            ) : (
              <button
                type="button"
                onClick={() => handleRevoke(k.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition-all duration-200 hover:bg-red-50 hover:text-red-700"
              >
                <Ban className="w-3 h-3" />
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="pt-4 border-t border-slate-100 flex flex-col gap-2.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Payroll integration"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={loading}
              className={`${BTN_PRIMARY} shrink-0`}
            >
              {loading ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={closeAdd}
              disabled={loading}
              className={`${BTN_SECONDARY} !px-2.5`}
              aria-label="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
