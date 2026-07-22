import Link from "next/link";
import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";
import SignOutButton from "@/components/SignOutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <Providers>
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
            <nav className="flex items-center gap-6">
              <span className="font-semibold">Admin</span>
              <Link href="/admin/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
                Dashboard
              </Link>
              <Link href="/admin/employees" className="text-sm text-slate-600 hover:text-slate-900">
                Employees
              </Link>
            </nav>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500">{session?.user?.name}</span>
              <SignOutButton />
            </div>
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </div>
    </Providers>
  );
}
