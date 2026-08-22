// Next.js's official server-startup hook (stable since Next 15) — `register()`
// runs once when the server process boots, in the Node.js runtime only (not
// the edge runtime, which is why `NEXT_RUNTIME` is checked below; this app
// doesn't use the edge runtime anywhere, but the check is what Next's own
// docs recommend for anything using Node APIs like setInterval).
//
// This is where the "delete an employee 7 days after deactivation" job (see
// lib/employeeCleanup.ts) gets scheduled. There's no external cron here —
// this app runs as a single long-lived Node process (not serverless), so an
// in-process daily interval is simpler and needs no extra infrastructure.
// It won't fire at all if the process never stays up for a full day, but
// every restart re-checks immediately, so nothing overdue silently waits
// past its 7 days for long.

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Next dev mode reloads this module on nearly every change without
// restarting the process — without this global guard, each reload would
// register another interval, running the job N times in parallel.
const globalForCleanup = globalThis as unknown as { __employeeCleanupRegistered?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalForCleanup.__employeeCleanupRegistered) return;
  globalForCleanup.__employeeCleanupRegistered = true;

  const { runDeactivatedEmployeeCleanup } = await import("@/lib/employeeCleanup");

  async function tick() {
    try {
      const { deletedCount, errors } = await runDeactivatedEmployeeCleanup();
      if (deletedCount > 0 || errors.length > 0) {
        console.log(
          `[employeeCleanup] Deleted ${deletedCount} employee(s) past the 7-day deactivation window.` +
            (errors.length > 0 ? ` ${errors.length} failed: ${errors.join("; ")}` : ""),
        );
      }
    } catch (err) {
      console.error("[employeeCleanup] Scheduled run failed:", err);
    }
  }

  // Runs once at startup (catches anything that became overdue while the
  // server was down), then once every 24h after that.
  void tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
