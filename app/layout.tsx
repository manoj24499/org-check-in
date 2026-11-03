import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
      <head>
        {/* Applies the admin console's saved (or system) theme before first paint so
            a dark-mode admin never sees a flash of light. Only sets an attribute on
            <html>; styling is scoped to .admin-root (see globals.css), so nothing
            outside the admin area changes. Toggled in components/ThemeToggle.tsx.
            A plain server-rendered <script>, not next/script: that one is a client
            component, and React warns about <script> tags rendered on the client. */}
        <script
          id="admin-theme-init"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("admin_theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-admin-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="antialiased bg-background min-h-screen text-foreground font-sans"
        suppressHydrationWarning
      >
        <LocationTrackerBoot />
        {children}
      </body>
    </html>
  );
}
