import Link from "next/link";
import { User, ShieldCheck, ArrowLeft } from "lucide-react";

export default function LoginSelectionPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 text-center relative">
      <div className="absolute top-6 left-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium px-4 py-2 rounded-lg hover:bg-slate-100"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Start</span>
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Select Login Type</h1>
        <p className="text-slate-500 mt-2">Choose your account type to continue</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/login/employee"
          className="flex flex-col items-center justify-center gap-3 w-48 rounded-xl border border-slate-300 bg-white p-8 hover:bg-slate-50 hover:border-slate-400 transition shadow-sm"
        >
          <User className="w-12 h-12 text-slate-600" />
          <span className="font-medium text-lg text-slate-800">Employee</span>
        </Link>
        <Link
          href="/login/admin"
          className="flex flex-col items-center justify-center gap-3 w-48 rounded-xl border border-slate-300 bg-white p-8 hover:bg-slate-50 hover:border-slate-400 transition shadow-sm"
        >
          <ShieldCheck className="w-12 h-12 text-slate-600" />
          <span className="font-medium text-lg text-slate-800">Admin</span>
        </Link>
      </div>
    </main>
  );
}
