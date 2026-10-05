import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared building blocks for the admin console, so every page speaks the same
 * visual language: soft rounded cards with a layered shadow, tinted icon chips,
 * initials avatars, status pills with a dot, and one consistent button set.
 * Deliberately stateless (no hooks) so server pages and client components can
 * both use them.
 */

export type Tone = "orange" | "green" | "amber" | "indigo" | "red" | "slate";

const TONES: Record<Tone, { chip: string; text: string; dot: string; soft: string; ring: string; glow: string; bar: string }> = {
  orange: { chip: "bg-orange-500/10 text-orange-600", text: "text-orange-700", dot: "bg-orange-500", soft: "bg-orange-50 text-orange-700 ring-orange-200", ring: "ring-orange-200", glow: "from-orange-400/25", bar: "bg-orange-500" },
  green: { chip: "bg-emerald-500/10 text-emerald-600", text: "text-emerald-700", dot: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200", ring: "ring-emerald-200", glow: "from-emerald-400/25", bar: "bg-emerald-500" },
  amber: { chip: "bg-amber-500/10 text-amber-600", text: "text-amber-700", dot: "bg-amber-500", soft: "bg-amber-50 text-amber-700 ring-amber-200", ring: "ring-amber-200", glow: "from-amber-400/25", bar: "bg-amber-500" },
  indigo: { chip: "bg-indigo-500/10 text-indigo-600", text: "text-indigo-700", dot: "bg-indigo-500", soft: "bg-indigo-50 text-indigo-700 ring-indigo-200", ring: "ring-indigo-200", glow: "from-indigo-400/25", bar: "bg-indigo-500" },
  red: { chip: "bg-red-500/10 text-red-600", text: "text-red-700", dot: "bg-red-500", soft: "bg-red-50 text-red-700 ring-red-200", ring: "ring-red-200", glow: "from-red-400/25", bar: "bg-red-500" },
  slate: { chip: "bg-slate-500/10 text-slate-600", text: "text-slate-700", dot: "bg-slate-400", soft: "bg-slate-100 text-slate-600 ring-slate-200", ring: "ring-slate-200", glow: "from-slate-400/20", bar: "bg-slate-400" },
};

/** The one card surface. */
export const CARD =
  "rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)]";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`${CARD} ${className}`}>{children}</div>;
}

/** Consistent buttons (class strings so they work on <button>, <a> and <Link>). */
export const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_PRIMARY = `${BTN_BASE} bg-orange-600 text-white shadow-[0_6px_16px_-8px_rgba(234,88,12,0.7)] hover:bg-orange-700`;
export const BTN_SECONDARY = `${BTN_BASE} border border-black/10 bg-white text-slate-700 shadow-sm hover:bg-slate-50`;
export const BTN_GHOST = `${BTN_BASE} text-slate-600 hover:bg-black/[0.05]`;

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">{eyebrow}</p>
        )}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-slate-900 sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Page content wrapper: consistent gutters and rhythm. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-5 py-7 sm:px-8 sm:py-8">{children}</div>;
}

export function IconChip({ icon: Icon, tone = "orange", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-2xl" : "h-10 w-10 rounded-xl";
  const ic = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${TONES[tone].chip}`}>
      <Icon className={ic} strokeWidth={2} />
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "orange",
  progress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  /** 0-100; draws a thin progress bar along the bottom. */
  progress?: number;
}) {
  const t = TONES[tone];
  return (
    <div className={`${CARD} relative overflow-hidden p-5`}>
      <div className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-slate-900">{value}</p>
        </div>
        <IconChip icon={icon} tone={tone} />
      </div>
      {hint && <p className="relative mt-3 text-[12px] text-slate-500">{hint}</p>}
      {progress !== undefined && (
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

export function Pill({
  tone = "slate",
  dot = false,
  pulse = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ${t.soft}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot} ${pulse ? "animate-pulse" : ""}`} />}
      {children}
    </span>
  );
}

const AVATAR_TONES = [
  "from-orange-400 to-orange-600",
  "from-indigo-400 to-indigo-600",
  "from-emerald-400 to-emerald-600",
  "from-sky-400 to-sky-600",
  "from-rose-400 to-rose-600",
  "from-amber-400 to-amber-600",
  "from-violet-400 to-violet-600",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[hashName(name) % AVATAR_TONES.length];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${tone} font-semibold text-white shadow-sm`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-slate-800">{title}</p>
        {text && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      </div>
      {action}
    </div>
  );
}

/** Table styling hooks, shared so every list looks alike. */
export const TABLE = {
  wrap: "overflow-x-auto",
  table: "w-full text-sm",
  thead: "bg-slate-50/80 text-left",
  th: "px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500",
  tbody: "divide-y divide-slate-100",
  tr: "transition-colors hover:bg-orange-50/40",
  td: "px-5 py-3.5 align-middle",
};

export function SectionTitle({ title, hint, right }: { title: string; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/** Segmented control (controlled; usable from client components). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-200/60 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all ${
            value === o.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
          {o.count !== undefined && (
            <span
              className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                value === o.key ? "bg-orange-100 text-orange-700" : "bg-slate-300/60 text-slate-600"
              }`}
            >
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
