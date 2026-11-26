import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";
import TabSecurity from "@/components/TabSecurity";
import MyPageSidebar from "@/components/mypage/MyPageSidebar";
import "./mypage.css";

export default async function MyPageLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const name = session?.user?.name ?? "";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?";

  return (
    <Providers>
      <TabSecurity />
      <div className="mp" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div className="page-bg" aria-hidden="true">
          <div className="blob blob-a" />
          <div className="blob blob-b" />
          <div className="blob blob-c" />
          {[
            [22, 38, 0, 16],
            [36, 70, 3, 20],
            [52, 28, 6, 16],
            [64, 90, 1.5, 24],
            [78, 46, 9, 16],
            [90, 60, 4.5, 18],
          ].map(([left, size, delay, dur]) => (
            <span key={left} className="bubble" style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
          ))}
        </div>
        <MyPageSidebar name={name} initials={initials} employeeCode={session?.user?.employeeCode ?? ""} />
        <main
          className="mp-main"
          style={{
            flex: "1 1 640px",
            minWidth: 0,
            padding: "32px clamp(16px, 4vw, 48px) 56px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 32,
            position: "relative",
            zIndex: 1,
          }}
        >
          {children}
        </main>
      </div>
    </Providers>
  );
}
