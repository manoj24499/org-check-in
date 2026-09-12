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

// Required for the app to function at all — missing either of these doesn't
// fail here on its own; it fails much later and much less clearly (a bare,
// bodyless 500 from Prisma on the first real query for DATABASE_URL — see
// the 2026-09-03 production incident this app's README documents; a
// misleading generic 401 on every mobile request for MOBILE_JWT_SECRET,
// since lib/mobileAuth.ts's own "not configured" error gets caught and
// treated identically to "invalid token"). Checking here instead means a
// misconfigured deploy fails loudly and immediately at boot, in deploy
// logs, instead of silently shipping broken and only surfacing once a real
// user hits the affected path.
const REQUIRED_ENV_VARS = ["DATABASE_URL", "MOBILE_JWT_SECRET"] as const;

function checkRequiredEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "The app cannot start without these — set them and redeploy.",
    );
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  checkRequiredEnvVars();
  if (globalForCleanup.__employeeCleanupRegistered) return;
  globalForCleanup.__employeeCleanupRegistered = true;

  const { runDeactivatedEmployeeCleanup } = await import("@/lib/employeeCleanup");
  const { pruneExpiredRefreshTokens } = await import("@/lib/refreshTokenCleanup");

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

    try {
      const prunedCount = await pruneExpiredRefreshTokens();
      if (prunedCount > 0) {
        console.log(`[refreshTokenCleanup] Pruned ${prunedCount} expired refresh token row(s).`);
      }
    } catch (err) {
      console.error("[refreshTokenCleanup] Scheduled run failed:", err);
    }
  }

  // Runs once at startup (catches anything that became overdue while the
  // server was down), then once every 24h after that.
  void tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
