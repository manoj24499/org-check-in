import { useState } from "react";

/**
 * Like useState, but when the server hands the component a new `initial` (after the admin site re-renders the
 * page to pick up new requests or alerts) the state is replaced by it. Edits made in the meantime, such as
 * removing a request after approving it, still apply at once, and the next server data wins.
 */
export function useSyncedState<T>(initial: T) {
  const [state, setState] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setState(initial);
  }
  return [state, setState] as const;
}
