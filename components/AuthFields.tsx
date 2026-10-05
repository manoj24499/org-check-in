"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

export const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

export function TextField({
  id,
  label,
  className = "",
  ...rest
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-2">
        {label}
      </label>
      <input id={id} className={`${INPUT_CLASS} ${className}`} {...rest} />
    </div>
  );
}

export function PasswordField({
  id,
  label = "Password",
  below,
  ...rest
}: { id: string; label?: string; below?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-2">
        {label}
      </label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} className={`${INPUT_CLASS} pr-11`} {...rest} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {below}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{children}</p>;
}

export function SubmitButton({ loading, idle, busy }: { loading: boolean; idle: string; busy: string }) {
  return (
    <button
      disabled={loading}
      className="mt-1 flex w-full items-center justify-between rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? busy : idle}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}
