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
    <html lang="en" className={inter.variable}>
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
