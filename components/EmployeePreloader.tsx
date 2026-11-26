import { Space_Grotesk } from "next/font/google";
import "./employee-preloader.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600"] });

/**
 * Full-screen "Signing you in" screen for the employee portal: shown from the moment the PIN is accepted until My Page
 * has loaded (the login form renders it, and app/my-page/loading.tsx shows it on any later slow load).
 */
export default function EmployeePreloader() {
  return (
    <main className="ep-root" role="status" aria-live="polite" aria-label="Signing you in">
      <div className="ep-mark">
        <div className="ep-rp" style={{ animationDelay: "0s" }} />
        <div className="ep-rp" style={{ animationDelay: "1.2s" }} />
        <div className="ep-rp" style={{ animationDelay: "2.4s" }} />
        <svg className="ep-lg" width="200" height="200" viewBox="16 16 72 72" fill="none" role="img" aria-label="Inzivo logo">
          <defs>
            <clipPath id="ep-zc">
              <rect x="16" y="16" width="72" height="72" />
            </clipPath>
            <linearGradient id="ep-shg" x1="0" y1="0" x2="1" y2="0">
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
          <g clipPath="url(#ep-zc)">
            <rect className="ep-lt" x="16" y="16" width="72" height="14" fill="#1A1512" />
            <path className="ep-ld" d="M88 16 L38 88 H16 L66 16 Z" fill="#EF6C00" />
            <rect className="ep-lb" x="16" y="74" width="72" height="14" fill="#1A1512" />
            <rect className="ep-sh" x="16" y="10" width="22" height="84" fill="url(#ep-shg)" />
          </g>
        </svg>
      </div>

      <div className="ep-text">
        <h1 className={`ep-title ${grotesk.className}`}>Signing you in</h1>
        <div className="ep-msgs">
          <div className="ep-m" style={{ animationDelay: "0s" }}>Verifying your session</div>
          <div className="ep-m" style={{ animationDelay: "2s" }}>Syncing today&rsquo;s check-in status</div>
          <div className="ep-m" style={{ animationDelay: "4s" }}>Almost there, getting your page ready</div>
        </div>
        <div className="ep-track">
          <div className="ep-bar" />
        </div>
      </div>
      <div className="ep-foot">Employee portal · Please don&rsquo;t close this tab</div>
    </main>
  );
}
