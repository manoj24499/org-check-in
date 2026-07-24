import type { Metadata } from "next";
import "./globals.css";
import LocationTrackerBoot from "@/components/LocationTrackerBoot";

export const metadata: Metadata = {
  title: "Employee Check-In",
  description: "Internal employee check-in / check-out system",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 min-h-screen text-slate-900">
        <LocationTrackerBoot />
        {children}
      </body>
    </html>
  );
}
