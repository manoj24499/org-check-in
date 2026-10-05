const IST_OFFSET_MS = 5.5 * 3600_000;

/** Time-of-day greeting and a long date label, both in IST (the app's operating timezone). */
export function istGreeting(now: Date = new Date()): { greeting: string; dateLabel: string } {
  const hour = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  return {
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    dateLabel: now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Kolkata",
    }),
  };
}
