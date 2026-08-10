"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/shifts", label: "Shifts" },
  { href: "/admin/office-location", label: "Office location" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4 flex-wrap">
      {LINKS.map(({ href, label }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
              active ? "font-medium text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <span className={`w-3.5 h-[2px] block ${active ? "bg-primary" : "bg-transparent"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
