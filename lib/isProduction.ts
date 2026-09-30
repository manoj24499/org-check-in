/**
 * The one canonical "are we actually running in production" check —
 * checking only NODE_ENV isn't reliable everywhere: Vercel sets it to
 * "production" for both production and preview deploys, so VERCEL_ENV is
 * what actually distinguishes them there, while a non-Vercel deployment
 * (bare Node process, Docker, etc.) has no VERCEL_ENV at all and depends
 * on NODE_ENV alone. Checking both, either-true-wins, covers every
 * deployment shape this app might run under.
 *
 * Used to gate anything that must never run/leak outside a real
 * production deploy: the dev-only fake payment gateway
 * (lib/billing/adapters/fake.ts, lib/billing/gateway.ts) and logging a
 * raw activation token before a real email provider exists
 * (lib/billing/provision.ts, app/api/activate/resend/route.ts).
 */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}
