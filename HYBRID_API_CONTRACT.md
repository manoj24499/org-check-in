# Hybrid work mode — API contract (backend → mobile app)

Hybrid employees work part of the day at the office and part at home. Their day is a timeline of
`OFFICE` / `TRANSIT` / `HOME` work segments. **Transit time is not work time.**

## Enums

| Enum | New values | Notes |
|---|---|---|
| `WorkMode` | `HYBRID` | Existing: `OFFICE`, `WFH`, `FIELD`. |
| `CheckInMode` (`Attendance.checkInMode`, `WorkSegment.mode`, `WorkSegment.heading`) | `HOME`, `TRANSIT` | HYBRID only. FIELD still uses only `OFFICE` / `FIELD`. A hybrid check-in's `checkInMode` is `OFFICE` or `HOME`. `heading` is only ever `OFFICE` or `HOME`. |

## Constants

| Name | Value | Where |
|---|---|---|
| `HYBRID_TRANSIT_WINDOW_MINUTES` | **45** | `lib/hybridSegments.ts`. Measured from `extendedAt ?? startedAt` of the TRANSIT segment. |
| Confirmed streak | 3 consecutive pings (same as everywhere else) | Arrival/departure never flips on one ping. |
| Hybrid default home radius | 100 m (admin can change) | `HYBRID_DEFAULT_HOME_RADIUS_METERS` in `lib/geofence.ts`. |

## Segment object (shared shape)

Returned by `GET/POST /api/mobile/me/work-segment` and inside `/api/kiosk/status` as `segment`.

```json
{
  "mode": "OFFICE" | "HOME" | "TRANSIT" | "FIELD" | null,
  "startedAt": "ISO" | null,
  "heading": "OFFICE" | "HOME" | null,      // TRANSIT only
  "promptedAt": "ISO" | null,                // set when the "have you arrived?" push went out for this window
  "transitMinutes": 12 | null,               // TRANSIT only: minutes since the transit started
  "transitWindowEndsAt": "ISO" | null,       // TRANSIT only: when the 45-min window runs out
  "transitExpired": false                    // true when TRANSIT is open and the window has run out
}
```
All fields are null/false when not checked in or there is no segment (OFFICE/WFH employees).

## Check-in — `POST /api/kiosk/scan` (online and offline)

Request unchanged except `checkInMode` now also accepts `"HOME"`:

- HYBRID, `checkInMode` omitted (recommended): accepted inside the office geofence (→ `checkInMode: "OFFICE"`) or
  inside the home geofence (→ `"HOME"`). Office is tried first. First segment = that place, `startMethod: CHECKIN`.
- HYBRID, `checkInMode: "OFFICE"` or `"HOME"`: only that place is checked. `"FIELD"` → 400.
- Outside both (online) → **409** `{ "error": "You are outside both the office and your home work location. Please check in from the office or from home." }`
  (with an explicit mode: `"You are outside your home work location."` / the normal office message).
- Offline (`offline` block) outside both → accepted, `offlineOutsideArea: true`, day starts at the nearer place.
- Mocked location → 409 as today. Lateness rules identical to OFFICE (late by shift start).
- Response unchanged in shape; `workMode: "HYBRID"`, `checkInMode: "OFFICE" | "HOME"`, plus `trackingToken`.
- Shared office kiosk: a hybrid employee there is checked in as `OFFICE`.

## Manual switch — `POST /api/mobile/me/work-segment` (Bearer)

| Body | Who | Effect |
|---|---|---|
| `{ "mode": "OFFICE" \| "FIELD" }` | FIELD | Unchanged. Response `{ mode, startedAt }`. |
| `{ "mode": "TRANSIT", "heading": "HOME" }` | HYBRID | "Switch to Home": closes current OFFICE/HOME, opens TRANSIT heading HOME (MANUAL). |
| `{ "mode": "TRANSIT", "heading": "OFFICE" }` | HYBRID | "Switch to Office". |
| `{ "mode": "HOME" }` / `{ "mode": "OFFICE" }` | HYBRID | "I've arrived" (or direct correction): closes current segment, opens that one (MANUAL). |
| `{ "extend": true }` | HYBRID, only while TRANSIT | "Still travelling": sets `extendedAt = now`, `promptedAt = null` → a fresh 45-min window. 409 if not in TRANSIT. |

HYBRID response: the segment object above. Same mode (and same heading) as current → no-op, returns current.

Errors: 401 unauthenticated · 400 invalid body / `TRANSIT` without `heading` / hybrid-only body from a FIELD user /
`FIELD` from a hybrid user / other work modes (`"This only applies to Field or Hybrid employees."`) ·
409 `"You're not checked in right now."` · 409 `"You're not travelling right now."` (extend outside TRANSIT) ·
409 `{ error: "Your status just changed. Please try again.", ...segment }` when a location ping switched it at the same moment.

Entering TRANSIT ends any open geofence auto-pause at that moment and clears a pending "left your work area" warning.

## Current segment — `GET /api/mobile/me/work-segment` (Bearer)

Returns the segment object. Use `transitExpired: true` to show the "Are you home yet? / Reached the office?" prompt
with **Arrived** (`POST {mode: heading}`) and **Still travelling** (`POST {extend: true}`).

## Status — `GET /api/kiosk/status?employeeCode=…` (Bearer) — new fields

Existing fields unchanged (`checkInMode` can now be `"HOME"`). Added:

```json
{
  "segment": <segment object> | null,        // any workMode with a timeline (FIELD too); null when not checked in / no segment
  "hybrid": null | {                         // non-null only for workMode HYBRID
    "officeTarget": { "latitude": 0, "longitude": 0, "radiusMeters": 0 } | null,
    "homeTarget":   { "latitude": 0, "longitude": 0, "radiusMeters": 0 } | null,
    "trackingRequired": true,                // true while checked in: pings drive arrival/departure detection
    "transitWindowMinutes": 45,
    "segmentMinutes": { "officeMinutes": 0, "homeMinutes": 0, "transitMinutes": 0 } | null  // today's session, up to check-out or now
  }
}
```
Live "worked so far" for hybrid = existing pause-adjusted time − `segmentMinutes.transitMinutes`
(or simply `officeMinutes + homeMinutes`).

`GET /api/mobile/me` and login are unchanged: `workMode` may be `"HYBRID"`; `homeLatitude/homeLongitude/homeRadiusMeters`
already returned. Office location still from `GET /api/kiosk/office-location`.

## Attendance history — `GET /api/mobile/me/attendance` (Bearer) — new fields per record

```json
{
  "segments": [{ "mode": "OFFICE"|"HOME"|"TRANSIT"|"FIELD", "heading": "HOME"|"OFFICE"|null, "startedAt": "ISO", "endedAt": "ISO"|null }],
  "segmentMinutes": { "officeMinutes": 0, "homeMinutes": 0, "transitMinutes": 0 } | null   // hybrid CHECK_IN rows only
}
```
The app must exclude TRANSIT from day hours (worked = check-out − check-in − pauses − transit, transit net of pauses).

## Location pings — `POST /api/kiosk/location`

Request/response unchanged. Keep sending pings for the whole hybrid check-in (also during TRANSIT).
Server behaviour per ping for HYBRID:
- OFFICE segment → geofenced against the office; HOME → against home; TRANSIT → no geofence (no warning, no pause).
- TRANSIT heading X + confirmed inside X → TRANSIT closed, X segment opened (`startMethod: AUTO`).
- OFFICE/HOME + confirmed outside → **no auto-switch**; one departure push per departure (cleared when back inside).
  The usual 10-minute grace auto-pause still applies as a fallback (its own generic push is suppressed for hybrid).
- TRANSIT past the 45-min window → one push per window (`promptedAt` set). The day is never auto-ended.
- Timed permission end: resumes on confirmed return to the current place; during TRANSIT resumes on the clock.

## Push notifications (Expo `data` payload; all values are strings)

| When | Title | Body | `data` |
|---|---|---|---|
| Confirmed departure from OFFICE | `Heading home?` | `Tap Switch to Home in the app. If you're not travelling, return within 10 minutes or your working time will be paused.` | `{ "type": "HYBRID_DEPARTURE", "attendanceId", "segmentId", "from": "OFFICE", "suggestedHeading": "HOME" }` |
| Confirmed departure from HOME | `Heading to the office?` | `Tap Switch to Office in the app. If you're not travelling, return within 10 minutes or your working time will be paused.` | `{ "type": "HYBRID_DEPARTURE", "attendanceId", "segmentId", "from": "HOME", "suggestedHeading": "OFFICE" }` |
| Transit window expired, heading HOME | `Are you home yet?` | `Open the app to confirm you've arrived, or tell us you're still travelling.` | `{ "type": "HYBRID_TRANSIT_EXPIRED", "attendanceId", "segmentId", "heading": "HOME" }` |
| Transit window expired, heading OFFICE | `Have you reached the office?` | same | `{ "type": "HYBRID_TRANSIT_EXPIRED", "attendanceId", "segmentId", "heading": "OFFICE" }` |

Suggested deep links: `HYBRID_DEPARTURE` → work-segment screen with "Switch to {suggestedHeading}" highlighted
(`POST {mode:"TRANSIT", heading: suggestedHeading}`); `HYBRID_TRANSIT_EXPIRED` → Arrived / Still travelling prompt.
Existing pushes (shift end, auto-checkout, tracking stopped) are unchanged; "Location sharing has stopped" now also
goes to hybrid employees whose phone stops pinging while checked in.

## Admin API (for reference)

- `POST /api/admin/employees` accepts optional `workMode` (`OFFICE|WFH|FIELD|HYBRID`) + `homeLatitude`, `homeLongitude`,
  `homeRadiusMeters`. WFH/HYBRID require home coords; HYBRID requires the org's office location.
- `PATCH /api/admin/employees/{id}` `{ action: "update-hybrid-location", latitude, longitude, radiusMeters? }` → sets HYBRID
  (office location must exist; default radius 100). `clear-wfh-location` reverts to OFFICE.
- Bulk upload CSV accepts `HYBRID` (home coords required). `GET /api/admin/employees?mode=HYBRID` filters.
- Attendance CSV export adds `Worked (min), Office (min), Home (min), Transit (min)` on CHECK_OUT rows.
- Partner API `workedMinutes` excludes transit.
