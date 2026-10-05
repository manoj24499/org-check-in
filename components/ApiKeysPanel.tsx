"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, X, Copy, Check, Ban } from "lucide-react";
import { BTN_PRIMARY } from "./admin/ui";

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
    <div className="rounded-xl bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <KeyRound className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">API keys</p>
            <p className="text-xs text-secondary mt-1">For partner integrations, like a payroll system.</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1 rounded-xl border border-transparent bg-orange-600 shadow-sm px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-700 transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New key
          </button>
        )}
      </div>

      {revealedKey && (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">
            Copy this now &mdash; you won&apos;t be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-xs bg-surface border border-border rounded px-2 py-1.5">{revealedKey}</code>
            <button
              type="button"
              onClick={copyRevealed}
              className="inline-flex items-center gap-1 rounded-xl border border-transparent bg-orange-600 shadow-sm px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedKey(null)}
            className="self-start text-xs text-secondary hover:text-foreground transition"
          >
            Done, I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {keys.length === 0 && !adding && (
          <p className="text-xs text-secondary">No keys yet.</p>
        )}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground truncate">{k.name}</span>
            <span className="font-mono text-xs text-secondary truncate">{k.keyPrefix}&hellip;</span>
            {k.revokedAt ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-red-700 bg-red-50 rounded px-1.5 py-0.5 shrink-0 ml-auto">
                Revoked
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleRevoke(k.id)}
                className="inline-flex items-center gap-1 text-xs text-secondary hover:text-red-700 transition shrink-0 ml-auto"
              >
                <Ban className="w-3 h-3" />
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 pt-3 border-t border-border-soft flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Payroll integration"
            className="rounded-xl border border-black/10 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={loading}
              className={`${BTN_PRIMARY} shrink-0 !px-3 !py-1.5 !text-xs`}
            >
              {loading ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={closeAdd}
              disabled={loading}
              className="rounded-xl border border-border text-muted hover:bg-surface p-1.5 transition disabled:opacity-50"
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
