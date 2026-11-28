import { Space_Grotesk } from "next/font/google";
import "./admin-preloader.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600"] });

/** Full-screen "Opening admin console" screen, shown from the moment the admin's password is accepted. */
export default function AdminPreloader() {
  return (
    <main className="ap-root" role="status" aria-live="polite" aria-label="Opening admin console">
      <span className="ap-tag">ADMIN CONSOLE</span>

      <div className="ap-mark">
        <div className="ap-rp" style={{ animationDelay: "0s" }} />
        <div className="ap-rp" style={{ animationDelay: "1.2s" }} />
        <div className="ap-rp" style={{ animationDelay: "2.4s" }} />
        <svg className="ap-lg" width="200" height="200" viewBox="16 16 72 72" fill="none" role="img" aria-label="Inzivo logo">
          <defs>
            <clipPath id="ap-zc">
              <rect x="16" y="16" width="72" height="72" />
            </clipPath>
            <linearGradient id="ap-shg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g opacity=".1" fill="#1A1512">
            <rect x="16" y="16" width="72" height="14" />
            <path d="M88 16 L38 88 H16 L66 16 Z" />
            <rect x="16" y="74" width="72" height="14" />
          </g>
          <g clipPath="url(#ap-zc)">
            <rect className="ap-lt" x="16" y="16" width="72" height="14" fill="#1A1512" />
            <path className="ap-ld" d="M88 16 L38 88 H16 L66 16 Z" fill="#EF6C00" />
            <rect className="ap-lb" x="16" y="74" width="72" height="14" fill="#1A1512" />
            <rect className="ap-sh" x="16" y="10" width="22" height="84" fill="url(#ap-shg)" />
          </g>
        </svg>
      </div>

      <div className="ap-text">
        <h1 className={`ap-title ${grotesk.className}`}>Opening admin console</h1>
        <div className="ap-msgs">
          <div className="ap-m" style={{ animationDelay: "0s" }}>Authenticating administrator</div>
          <div className="ap-m" style={{ animationDelay: "2s" }}>Loading live attendance &amp; locations</div>
          <div className="ap-m" style={{ animationDelay: "4s" }}>Preparing dashboards and reports</div>
        </div>
        <div className="ap-track">
          <div className="ap-bar" />
        </div>
      </div>
      <div className="ap-foot">
        <span className="ap-live" />
        Secure session · Admin access
      </div>
    </main>
  );
}
