import { Space_Grotesk } from "next/font/google";
import "./admin-preloader.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"] });

/** Full-screen "Opening admin console" screen, shown by the admin sign-in form from the moment the password is accepted. */
export default function AdminPreloader() {
  const barColors = ["#2DD4BF", "#2DD4BF", "#F59E0B", "#2DD4BF", "#2DD4BF"];
  return (
    <main className="ap-root" role="status" aria-live="polite" aria-label="Opening admin console">
      <div className={`ap-brand ${grotesk.className}`}>
        <div className="ap-dot" />
        Inzivo
        <span className="ap-tag">ADMIN</span>
      </div>

      <div className="ap-radar">
        <div className="ap-ping" />
        <svg width="220" height="220" viewBox="0 0 220 220" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="ap-sw" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2DD4BF" stopOpacity="0" />
              <stop offset="1" stopColor="#2DD4BF" stopOpacity=".5" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r="100" stroke="#24323C" strokeWidth="2" />
          <circle cx="110" cy="110" r="70" stroke="#1C2830" strokeWidth="2" />
          <path d="M10 110H210M110 10V210" stroke="#1C2830" strokeWidth="1" />
          <g className="ap-sweep">
            <path d="M110 110 L110 10 A100 100 0 0 1 195 60 Z" fill="url(#ap-sw)" />
            <path d="M110 110 L110 10" stroke="#2DD4BF" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
        <div className="ap-bars">
          {barColors.map((c, i) => (
            <div key={i} className="ap-bar" style={{ background: c, animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>

      <div className="ap-text">
        <h1 className={`ap-title ${grotesk.className}`}>Opening admin console</h1>
        <div className="ap-msgs">
          <div className="ap-m" style={{ animationDelay: "0s" }}>Authenticating administrator</div>
          <div className="ap-m" style={{ animationDelay: "2s" }}>Loading live attendance &amp; locations</div>
          <div className="ap-m" style={{ animationDelay: "4s" }}>Preparing dashboards and reports</div>
        </div>
      </div>
      <div className="ap-track">
        <div className="ap-pfill" />
      </div>
      <div className="ap-foot">
        <span className="ap-live" />
        Secure session · Admin access
      </div>
    </main>
  );
}
