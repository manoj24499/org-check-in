"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, X, Crown } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, IconChip, Pill } from "./admin/ui";

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
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconChip icon={ShieldCheck} />
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Admins</h2>
            <p className="mt-0.5 text-xs text-slate-500">Who can manage this organization.</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className={`${BTN_PRIMARY} shrink-0 !px-3 !py-1.5`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        )}
      </div>

      <div className="-mx-2 flex flex-col divide-y divide-slate-100">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors duration-150 hover:bg-slate-50">
            <Avatar name={a.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{a.name}</p>
              <p className="truncate text-xs text-slate-500">{a.email}</p>
            </div>
            {a.isOwner && (
              <Pill tone="orange">
                <Crown className="w-3 h-3" />
                Owner
              </Pill>
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
            placeholder="Name"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            autoFocus
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={loading}
              className={`${BTN_PRIMARY} shrink-0`}
            >
              {loading ? "Adding…" : "Save"}
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
