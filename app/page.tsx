import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 text-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employee Check-In System</h1>
        <p className="text-slate-500 mt-2">Internal use only</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/kiosk"
          className="rounded-xl bg-slate-900 text-white px-8 py-4 font-medium hover:bg-slate-700 transition"
        >
          Open Kiosk (Check In / Out)
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-slate-300 px-8 py-4 font-medium hover:bg-slate-100 transition"
        >
          Login (Admin / My Page)
        </Link>
      </div>
    </main>
  );
}
