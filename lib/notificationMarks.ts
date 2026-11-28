// Which My Page notifications this browser has read or cleared, per employee. Kept in localStorage (like the phone app
// keeps its own marks on the phone) and shared between the bell and the notifications card through this tiny store.
export type NotifMarks = { read: Record<string, true>; dismissed: Record<string, true> };
type Snapshot = { marks: NotifMarks; loaded: boolean };

const EMPTY: Snapshot = { marks: { read: {}, dismissed: {} }, loaded: false };
let snap: Snapshot = EMPTY;
let storageKey = "";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Loads the saved marks for this employee once; later calls for the same employee do nothing. */
export function initNotificationMarks(userId: string) {
  const key = `mp.notifications.v1:${userId}`;
  if (key === storageKey && snap.loaded) return;
  storageKey = key;
  let marks: NotifMarks = { read: {}, dismissed: {} };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as NotifMarks;
      if (parsed && typeof parsed.read === "object" && typeof parsed.dismissed === "object") marks = parsed;
    }
  } catch {
    // Private mode or a corrupt value: start with nothing marked.
  }
  snap = { marks, loaded: true };
  emit();
}

function save(marks: NotifMarks) {
  snap = { marks, loaded: true };
  try {
    localStorage.setItem(storageKey, JSON.stringify(marks));
  } catch {
    // Ignored: the marks just will not survive a reload.
  }
  emit();
}

export function markNotificationsRead(ids: string[]) {
  const read = { ...snap.marks.read };
  for (const id of ids) read[id] = true;
  save({ ...snap.marks, read });
}

export function dismissNotifications(ids: string[]) {
  const read = { ...snap.marks.read };
  const dismissed = { ...snap.marks.dismissed };
  for (const id of ids) {
    read[id] = true;
    dismissed[id] = true;
  }
  save({ read, dismissed });
}

export const subscribeNotificationMarks = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
export const getNotificationMarks = () => snap;
export const getServerNotificationMarks = () => EMPTY;
