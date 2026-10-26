/**
 * Display-only copy for the /plans page (taglines and feature lists). Mirrors the marketing site's
 * inzivo-website/lib/pricing.ts; prices themselves live in lib/billing/plans.ts, which is what a checkout charges.
 */

export type PlanContent = {
  tagline: string;
  featured?: boolean;
  /** What this plan adds on top of the previous one (shown as the list heading). */
  inheritsFrom?: string;
  features: string[];
  absent?: string[];
};

export const PLAN_CONTENT: Record<string, PlanContent> = {
  starter: {
    tagline: "One location, one shift pattern, no paperwork.",
    features: [
      "Mobile check-in on iOS and Android",
      "Photo-verified check-in and check-out",
      "One geofenced office location",
      "Live 'who's in right now' dashboard",
      "Attendance CSV export",
      "Push notifications for shift and check-out reminders",
      "Self-service timesheet for every employee",
      "Up to 3 admin accounts",
    ],
    absent: ["Shift rosters", "Leave workflow", "Field tracking"],
  },
  growth: {
    tagline: "The full HR loop: shifts, leave, overtime, approvals.",
    featured: true,
    inheritsFrom: "Starter",
    features: [
      "Unlimited office locations and geofences",
      "Shift library with grace periods and night shifts",
      "Leave requests, balances and holiday calendar",
      "Overtime requests with photo evidence",
      "Work-from-home mode against a registered address",
      "Timed permissions for short personal breaks",
      "Bulk-assign rosters to whole departments",
      "Bulk employee import and soft-delete restore",
      "Unlimited admin accounts with role scoping",
    ],
    absent: ["Live field tracking", "Face enrolment"],
  },
  scale: {
    tagline: "For teams whose work happens away from a building.",
    inheritsFrom: "Growth",
    features: [
      "Anywhere work mode with geofencing switched off",
      "Live location pings while on the clock",
      "Field visit trail with per-stop photos and dwell time",
      "Distance-based travel reimbursement figures",
      "Face enrolment on top of the presence photo",
      "Mock-GPS detection enforced server-side",
      "Biometric app unlock and background tracking",
      "REST API and webhooks for payroll handoff",
      "Priority support with a named engineer",
    ],
  },
};
