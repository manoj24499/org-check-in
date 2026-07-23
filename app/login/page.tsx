import Link from "next/link";
import { User, ShieldCheck, ArrowLeft } from "lucide-react";

export default function LoginSelectionPage() {
  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center gap-8 p-6 text-center bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div aria-hidden className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute top-6 left-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium px-4 py-2 rounded-lg hover:bg-slate-100"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Start</span>
        </Link>
      </div>
      <div className="relative">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Select Login Type</h1>
        <p className="text-slate-500 mt-2">Choose your account type to continue</p>
      </div>

      <div className="relative flex flex-col sm:flex-row gap-5">
        <Link
          href="/login/employee"
          className="group flex flex-col items-center justify-center gap-3 w-48 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl p-8 shadow-sm hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <User className="w-12 h-12 text-slate-400 transition-colors group-hover:text-primary" />
          <span className="font-medium text-lg text-slate-800">Employee</span>
        </Link>
        <Link
          href="/login/admin"
          className="group flex flex-col items-center justify-center gap-3 w-48 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl p-8 shadow-sm hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <ShieldCheck className="w-12 h-12 text-slate-400 transition-colors group-hover:text-primary" />
          <span className="font-medium text-lg text-slate-800">Admin</span>
        </Link>
      </div>
    </main>
  );
}
