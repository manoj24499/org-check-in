import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import LocationTrackerBoot from "@/components/LocationTrackerBoot";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Employee Check-In",
  description: "Internal employee check-in / check-out system",
  applicationName: "Inzivo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className="antialiased bg-background min-h-screen text-foreground font-sans"
        suppressHydrationWarning
      >
        {/* Applies the admin console's saved (or system) theme before first paint so
            a dark-mode admin never sees a flash of light. Only sets an attribute on
            <html>; styling is scoped to .admin-root (see globals.css), so nothing
            outside the admin area changes. Toggled in components/ThemeToggle.tsx. */}
        <Script
          id="admin-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("admin_theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-admin-theme",t)}catch(e){}})()`,
          }}
        />
        <LocationTrackerBoot />
        {children}
      </body>
    </html>
  );
}
