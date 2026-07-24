import { EventEmitter } from "events";

export type LocationUpdate = {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
};

// Single-process in-memory pub/sub: the SSE route below subscribes, and the
// kiosk location endpoint publishes whenever a new ping is saved. Good enough
// for this app's single-instance deployment — no external broker needed.
const globalForLocationEvents = globalThis as unknown as {
  locationEvents: EventEmitter | undefined;
};

export const locationEvents = globalForLocationEvents.locationEvents ?? new EventEmitter();
locationEvents.setMaxListeners(50);

if (process.env.NODE_ENV !== "production") {
  globalForLocationEvents.locationEvents = locationEvents;
}

export function publishLocationUpdate(update: LocationUpdate) {
  locationEvents.emit("update", update);
}
