/**
 * Which app build, phone and button a request came from. The mobile app sends these as headers on every
 * request; kiosks and older app versions send none (all fields then come back null). Only used for the audit
 * log — never trusted for anything security-related, since the caller sets them.
 */
export interface ClientInfo {
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  clientAction: string | null;
}

function clean(value: string | null, max: number): string | null {
  if (!value) return null;
  // Header values only: strip control characters and cap the length.
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return trimmed || null;
}

export function readClientInfo(req: Request): ClientInfo {
  const h = req.headers;
  return {
    appVersion: clean(h.get("x-app-version"), 40),
    platform: clean(h.get("x-app-platform"), 20),
    osVersion: clean(h.get("x-app-os-version"), 40),
    deviceModel: clean(h.get("x-app-device"), 80),
    clientAction: clean(h.get("x-client-action"), 40),
  };
}
