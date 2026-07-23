import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";
import SignOutButton from "@/components/SignOutButton";
import TabSecurity from "@/components/TabSecurity";
import AdminNav from "@/components/AdminNav";
import { Building2 } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <Providers>
      <TabSecurity />
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200/60 bg-white/70 backdrop-blur-md sticky top-0 z-10">
          <div className="w-[90%] mx-auto flex items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <span className="font-semibold text-slate-800">Admin</span>
              </div>
              <AdminNav />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500 hidden sm:inline">
                {session?.user?.name}
              </span>
              <SignOutButton />
            </div>
          </div>
        </header>
        <div className="w-[90%] mx-auto px-6 py-8">{children}</div>
      </div>
    </Providers>
  );
}
