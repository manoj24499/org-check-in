import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";

/** Shared frame for every /plans state: soft gradient background, logo, optional back link, centered column. */
export default function PlansShell({
  children,
  back,
  narrow,
}: {
  children: React.ReactNode;
  back?: { href: string; label: string };
  narrow?: boolean;
}) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="plans-blob absolute rounded-full"
          style={{ left: "-8%", top: "4%", width: 520, height: 520, background: "rgba(240,100,0,0.18)", filter: "blur(90px)" }}
        />
        <div
          className="plans-blob absolute rounded-full"
          style={{ right: "-6%", top: "26%", width: 480, height: 480, background: "rgba(99,102,241,0.16)", filter: "blur(90px)", animationDelay: "-7s" }}
        />
        <div
          className="plans-blob absolute rounded-full"
          style={{ left: "32%", bottom: "-12%", width: 460, height: 460, background: "rgba(247,178,122,0.28)", filter: "blur(90px)", animationDelay: "-13s" }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.55,
            backgroundImage: "radial-gradient(rgba(41,43,49,0.22) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            WebkitMaskImage: "radial-gradient(70% 70% at 50% 40%, #000 10%, transparent 100%)",
            maskImage: "radial-gradient(70% 70% at 50% 40%, #000 10%, transparent 100%)",
          }}
        />
      </div>
      <div className={`mx-auto w-full px-5 pb-16 pt-6 sm:px-8 ${narrow ? "max-w-[880px]" : "max-w-[1120px]"}`}>
        <div className="flex items-center justify-between">
          <Logo variant="static" size={20} className="text-foreground" />
          {back && (
            <Link
              href={back.href}
              className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-[15px] w-[15px]" />
              {back.label}
            </Link>
          )}
        </div>
        <div className="plans-in">{children}</div>
      </div>
      <style>{`
        @keyframes plans-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes plans-blob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.08); } }
        .plans-blob { animation: plans-blob 18s ease-in-out infinite; }
        .plans-in { animation: plans-in .45s cubic-bezier(.2,.8,.2,1) backwards; }
      `}</style>
    </main>
  );
}
