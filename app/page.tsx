import Link from "next/link";
import { Building2, QrCode, LogIn } from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center gap-10 p-6 text-center bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div
        aria-hidden
        className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-white shadow-lg shadow-orange-900/10">
          <Building2 className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Employee Check-In System
          </h1>
          <p className="text-slate-500 mt-2">Internal use only</p>
        </div>
      </div>

      <div className="relative flex flex-col sm:flex-row gap-5">
        <Link
          href="/kiosk"
          className="group flex flex-col items-center justify-center gap-3 w-60 rounded-2xl bg-primary text-white p-8 font-medium shadow-lg shadow-orange-900/20 transition-all hover:bg-primary-dark hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <QrCode className="w-9 h-9" />
          <span className="text-lg">Check In / Out</span>
        </Link>
        <Link
          href="/login"
          className="group flex flex-col items-center justify-center gap-3 w-60 rounded-2xl border border-slate-200 bg-white p-8 font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <LogIn className="w-9 h-9 text-slate-400 transition-colors group-hover:text-slate-600" />
          <span className="text-lg">Login</span>
        </Link>
      </div>

      <p className="relative text-xs text-slate-400">
        Qube Space &middot; Employee Portal
      </p>
    </main>
  );
}
