// Tiny shared switch for the post-sign-in preloader. The login forms turn it on; the host in the root layout
// (components/SignInPreloaderHost.tsx) shows it and turns it off. It lives outside any page so it survives the
// move from the login screen to My Page or the admin console without a gap.
export type SignInPreloader = { variant: "employee" | "admin"; startedAt: number } | null;

let state: SignInPreloader = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showSignInPreloader(variant: "employee" | "admin") {
  state = { variant, startedAt: Date.now() };
  emit();
}
export function hideSignInPreloader() {
  state = null;
  emit();
}
export function subscribeSignInPreloader(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export const getSignInPreloader = () => state;
