import type { Session } from "next-auth";

// How recent a sign-in must be to count as "just signed in".
const FRESH_SIGN_IN_MS = 2 * 60_000;

/** True when the session was created by a credential sign-in within the last couple of minutes. */
export function isFreshSignIn(session: Session | null): boolean {
  return Boolean(session?.signedInAt && Date.now() - session.signedInAt < FRESH_SIGN_IN_MS);
}
