"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, X, Crown } from "lucide-react";

export interface AdminSummary {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  active: boolean;
}

/** Lets an admin add another admin to their own organization — without
 * this, an organization is permanently single-admin with no in-app
 * recovery path if that one admin is ever locked out. Deliberately no
 * remove/deactivate action here yet: no such route exists for role: ADMIN
 * in this app at all, so there's nothing to gate with a last-owner guard
 * until one is built. */
export default function AdminsPanel({ admins: initialAdmins }: { admins: AdminSummary[] }) {
  const router = useRouter();
  const [admins, setAdmins] = useState(initialAdmins);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setAdding(true);
    setError(null);
  }

  function closeAdd() {
    setAdding(false);
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  }

  async function handleAdd() {
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Enter a name, email, and a password of at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setAdmins((prev) => [...prev, data.admin]);
    closeAdd();
    router.refresh();
  }

  return (
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Admins</p>
            <p className="text-xs text-secondary mt-1">Who can manage this organization.</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 text-xs font-semibold text-primary-dark hover:bg-primary/5 transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground truncate">{a.name}</span>
            {a.isOwner && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-dark bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
                <Crown className="w-2.5 h-2.5" />
                Owner
              </span>
            )}
            <span className="text-xs text-secondary truncate ml-auto">{a.email}</span>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 pt-3 border-t border-border-soft flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            autoFocus
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={loading}
              className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
            >
              {loading ? "Adding…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeAdd}
              disabled={loading}
              className="rounded-lg border border-border text-muted hover:bg-surface p-1.5 transition disabled:opacity-50"
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
