# Inzivo Check-In — Backend & Admin Web (org-check-in) — Full Documentation

> Purpose of this file: anyone opening this folder should know **what this project does, what it is built with,
> how every part works, and where to look when something breaks**.
>
> Last updated: 26 Nov 2026 (covers commits up to `1f683e0 multiple checkin added`). Companion mobile app docs: [`../checkin-native/DOCUMENTATION.md`](../checkin-native/DOCUMENTATION.md).
> Read [§ 1](#1-note-on-older-docs) first.

---

## Table of contents

1. [Note on older docs](#1-note-on-older-docs)
2. [What this project is](#2-what-this-project-is)
3. [Tech stack](#3-tech-stack)
4. [Folder structure](#4-folder-structure)
5. [Setup, running, deploying](#5-setup-running-deploying)
6. [Environment variables](#6-environment-variables)
7. [Background jobs (cron + startup interval)](#7-background-jobs-cron--startup-interval)
8. [Authentication (5 different mechanisms)](#8-authentication-5-different-mechanisms)
9. [Multi-tenancy (organizations)](#9-multi-tenancy-organizations)
10. [Core business logic](#10-core-business-logic)
11. [API reference — kiosk & mobile](#11-api-reference--kiosk--mobile)
12. [API reference — admin](#12-api-reference--admin)
13. [API reference — signup, billing, partner, misc](#13-api-reference--signup-billing-partner-misc)
14. [Web pages](#14-web-pages)
15. [Components](#15-components)
16. [Database (Prisma schema)](#16-database-prisma-schema)
17. [lib/ reference](#17-lib-reference)
18. [External services](#18-external-services)
19. [Important constants](#19-important-constants)
20. [Logging & diagnostics tables](#20-logging--diagnostics-tables)
21. [Troubleshooting — where to find the issue](#21-troubleshooting--where-to-find-the-issue)
22. [Known quirks / gaps](#22-known-quirks--gaps)

---

## 1. Note on older docs

| File | Status |
|---|---|
| `README.md` | Good for basic setup & multi-tenancy, but **outdated**: says "five small mobile routes" (now ~30), says rate-limiter is in-memory (now Postgres-backed), mobile app path is old (`D:\projects\Native\checkin-app` → now `..\checkin-native`), and refers to `.env.example` which **does not exist** in this folder. |
| `HYBRID_API_CONTRACT.md` | Current. Exact contract for the HYBRID work mode (enums, segment shape, scan/status/location/work-segment fields, push payloads). Read it when touching Hybrid. |
| `design-system/` | Brand rules and tokens — summarised in [§ 17b](#17b-design-system-design-system). |
| `reports/` | Business documents — listed in [§ 17c](#17c-reports-reports--business-documents-not-used-by-code). Not used by the code. |
| `Claude outputs/` | Screenshots from earlier AI sessions. Not used by the code. |
| `eas.json` | Leftover Expo config — not used by this Next.js project. |
| `.dev-server.log` | Old dev server output (Prisma query logs). |

---

## 2. What this project is

**Inzivo** — a multi-tenant employee attendance system. This one Next.js project is **both**:

1. **The backend API** for:
   - the **mobile app** (`../checkin-native`, Expo) — `/api/mobile/**` + `/api/kiosk/**`
   - the **web kiosk** (shared tablet at office) — `/kiosk/<orgCode>` + `/api/kiosk/**`
   - **partners/integrations** (payroll/HR systems) — `/api/v1/**` with API keys
   - a **cron caller** — `/api/cron/tracking-watch`
2. **The admin web dashboard** (`/admin/**`) — employees, live map, attendance, leave, shifts, field workers, settings.
3. **Employee web "My Page"** (`/my-page`) — own attendance.
4. **Signup / billing / activation** pages (`/register`, `/plans`, `/activate`, …).

Main features: PIN + selfie + geofence check-in, face verification (external service), live location tracking with
auto-pause outside the work area, auto check-out, offline check-ins, work modes OFFICE / WFH / FIELD / HYBRID,
field worker routes/visits/assigned places/reimbursement, leave/permissions/overtime/meetings/manual entries,
shifts & lateness, push notifications, email (activation, reset, trial), CSV/Excel exports, partner API.

---

## 3. Tech stack

| Area | Technology |
|---|---|
| Framework | **Next.js 16.4.1** (App Router) + **React 19.2** + TypeScript |
| Styling | Tailwind CSS 4, `lucide-react` icons, `react-confetti` |
| Database | **PostgreSQL** (Supabase pooler per code comments) via **Prisma 7.9** + `@prisma/adapter-pg` + `pg` |
| Auth (web) | **NextAuth v5 beta** (Credentials providers `admin-login`, `employee-login`), JWT sessions |
| Auth (mobile) | **jose** HS256 JWTs (`lib/mobileAuth.ts`) |
| Passwords/PINs | `bcrypt` (native, PIN scan) + `bcryptjs`, HMAC `pinLookupHash` |
| Validation | **zod 4** |
| Images | **sharp** (resize to 640 px JPEG q75) |
| Maps (web) | **Leaflet** + `react-leaflet`, OpenStreetMap tiles, ArcGIS satellite |
| Excel | **exceljs** |
| Push | **expo-server-sdk** (Expo push → FCM) |
| Email | **Resend** HTTP API (no SDK) |
| Face verification | External Python/InsightFace service (`FACE_VERIFY_URL`, over Tailscale) |
| Routing / geocoding | openrouteservice (`ORS_API_KEY`), Nominatim, Overpass |
| Hosting | Vercel (`@vercel/functions`, `VERCEL_ENV`) — see quirk about the startup interval in § 7 |
| Lint | ESLint 9 + `eslint-config-next` |

---

## 4. Folder structure

```
org-check-in/
├─ app/
│  ├─ api/
│  │  ├─ kiosk/         scan, status, location, office-location   (used by kiosk AND mobile app)
│  │  ├─ mobile/        login, refresh, logout, PIN flows, me/**, field-visits, support, holidays
│  │  ├─ admin/         all admin dashboard APIs
│  │  ├─ v1/            partner API (API key)
│  │  ├─ cron/          tracking-watch (every ~5 min)
│  │  ├─ activate, register, signup, plan-change, password-reset, billing/webhook, my-page, attendance, health, loadtest
│  ├─ admin/            admin pages
│  ├─ kiosk/            web kiosk (KioskClient.tsx) + status page
│  ├─ my-page/          employee web page
│  ├─ login, signin, auth/continue, activate, forgot-password, reset-password, register, plans, signup/dev-pay
│  ├─ layout.tsx, page.tsx, error.tsx, global-error.tsx, globals.css
├─ components/          React components for admin/kiosk/my-page (see § 15)
├─ lib/                 ALL business logic & helpers (see § 17)
│  ├─ billing/          plans, quote, gateway, fake adapter, provision, plan change, cleanup
│  └─ partnerApi/       API keys, auth, responses, attendance records
├─ prisma/              schema.prisma, migrations/, seed.ts
├─ scripts/             find-face-duplicate.mjs, fix-overnight-checkout-daykeys.sql
├─ types/next-auth.d.ts Session/JWT type extensions
├─ middleware.ts        Redirects non-admins from /admin, non-employees from /my-page
├─ instrumentation.ts   Boot env check + daily cleanup interval
├─ next.config.ts       Security headers (CSP etc.), bcrypt external
├─ prisma.config.ts     Prisma 7 config (DATABASE_URL, seed command)
├─ HYBRID_API_CONTRACT.md, README.md, design-system/, reports/
├─ .claude/launch.json  Claude Code preview config only: runs `npm run dev` on port 3000 (name "checkin-app-dev")
└─ Claude outputs/      11 PNG screenshots of marketing/landing-page previews (preview-desktop-*.png, preview-features-*.png,
                        preview-geofence-map.png, fixed-who-its-for.png …). Saved by Claude Code sessions. Not used by the app;
                        both folders are committed to git and are safe to ignore when debugging
```

---

## 5. Setup, running, deploying

### Prerequisites
- Node.js 20+
- PostgreSQL database (Supabase / Neon / Railway)
- Optional for full features: face-verify service, Resend account, openrouteservice key

### Local setup
```powershell
cd C:\checkin-web-native-backend\org-check-in
```
```powershell
npm install
```
(`postinstall` runs `prisma generate`.) Create `.env` with the variables in § 6 (there is **no `.env.example`** — copy key names from § 6).

```powershell
npx prisma migrate deploy
```
```powershell
npx prisma db seed
```
(Seed = **local dev only**: creates org `default` + first admin from `SEED_ADMIN_*`; it prints the admin password to the console. Never run on production.)

```powershell
npm run dev
```
- Landing http://localhost:3000 · Register `/register` · Admin login `/login` · Kiosk `/kiosk` or `/kiosk/<orgCode>` · My Page `/my-page`

### Scripts (`package.json`)
| Script | Does |
|---|---|
| `dev` | `next dev` |
| `build` | `prisma generate && next build` |
| `start` | `next start` |
| `lint` | `eslint` |
| `postinstall` | `prisma generate` |

### Changing the database schema
```powershell
npx prisma migrate dev --name short-description
```
Commit the new folder under `prisma/migrations/`. On production: `npx prisma migrate deploy` with the production `DATABASE_URL`.

### Using with the mobile app locally
The phone must reach this server: use your PC LAN IP (`http://192.168.x.x:3000`) or an **ngrok** tunnel, and put it in
the mobile app's `.env` (`EXPO_PUBLIC_API_URL`). Production backend is hosted on Vercel.

### Deploy (Vercel)
1. Set all env variables in Vercel project settings (`NEXTAUTH_URL` = production URL).
2. Run migrations against the production DB.
3. **Set up an external scheduler** to call `/api/cron/tracking-watch` every ~5 min with header `x-cron-secret` (see § 7) — there is no `vercel.json` cron in this repo.

---

## 6. Environment variables

> Values are secret — never commit `.env`. Only names are listed here.

| Variable | Required? | Purpose | Used in |
|---|---|---|---|
| `DATABASE_URL` | **Yes (boot fails without it)** | Postgres connection | `lib/prisma.ts`, `prisma.config.ts`, seed, scripts |
| `MOBILE_JWT_SECRET` | **Yes (boot fails without it)** | Signs mobile access/refresh tokens + PIN-reset tokens | `lib/mobileAuth.ts`, `lib/pinReset.ts` |
| `AUTH_SECRET` | Yes | NextAuth web session secret (read by next-auth internally) | next-auth |
| `NEXTAUTH_URL` | Yes | App base URL (email links, NextAuth) | `lib/appUrl.ts` |
| `PIN_LOOKUP_SECRET` | Strongly recommended (≥16 chars) | HMAC for fast PIN lookup/uniqueness. Missing → slow bcrypt scan (8 s budget) | `lib/credentials.ts` |
| `DB_POOL_MAX` | Optional (default 5) | Pool size per process (Supabase session pooler allows 15 total) | `lib/prisma.ts` |
| `DATABASE_POOL_URL` | Optional, recommended in production | Supabase **transaction-mode** pooler URL (port 6543). Used by the app at runtime instead of `DATABASE_URL`, so the 15-client session limit stops mattering. Migrations & scripts still use `DATABASE_URL` | `lib/prisma.ts` |
| `TRUSTED_PROXY_HOPS` | Optional (default 1) | Client IP parsing for rate limits | `lib/rateLimit.ts` |
| `RESEND_API_KEY`, `EMAIL_FROM` | For email | Resend email sending. Missing → prod throws, dev logs email to console | `lib/email.ts` |
| `FACE_VERIFY_URL` | For face check | Face service base URL | `lib/faceVerify.ts` |
| `FACE_VERIFY_TIMEOUT_MS` | Optional (10000) | Face call timeout | `lib/faceVerify.ts` |
| `FACE_VERIFY_API_KEY` | For face delete | `x-api-key` for deleting enrollments | `lib/faceVerify.ts` |
| `ORS_API_KEY` | For roads routing | openrouteservice directions/matrix/geocode | `lib/routing.ts`, `lib/placeSearch.ts` |
| `ROUTE_PREFERENCE` | Optional | `shortest` (default) / `recommended` / `fastest` | `lib/routing.ts` |
| `CRON_SECRET` | For cron | Auth header for `/api/cron/tracking-watch`. Missing → every call 401 | cron route |
| `MARKETING_SITE_URL` | Optional (default localhost:3001) | CORS origin + marketing links | `lib/cors.ts`, `lib/marketingSiteUrl.ts` |
| `BILLING_PROVIDER` | Optional (default `fake`) | Payment gateway. **`fake` throws in production** | `lib/billing/gateway.ts` |
| `FAKE_WEBHOOK_SECRET` | Dev billing | HMAC for fake webhooks | `lib/billing/adapters/fake.ts` |
| `LOADTEST_SECRET`, `LOADTEST_MAX_INFLIGHT` | Optional | Enables `/api/loadtest/*` probes (≥16 chars) | `lib/loadtestGuard.ts` |
| `SEED_ADMIN_EMAIL/PASSWORD/NAME` | Seed only | First admin for `db seed` | `prisma/seed.ts` |
| `NODE_ENV`, `VERCEL_ENV`, `NEXT_RUNTIME` | Set by platform | Production detection, dev logging | various |

Current local `.env` contains: DATABASE_URL, AUTH_SECRET, MOBILE_JWT_SECRET, NEXTAUTH_URL, BILLING_PROVIDER,
FAKE_WEBHOOK_SECRET, MARKETING_SITE_URL, SEED_ADMIN_*, FACE_VERIFY_*, RESEND_API_KEY, EMAIL_FROM, CRON_SECRET, ORS_API_KEY.
**Not set locally:** `PIN_LOOKUP_SECRET`, `DB_POOL_MAX`, `TRUSTED_PROXY_HOPS`, `ROUTE_PREFERENCE`, `LOADTEST_*`.

---

## 7. Background jobs (cron + startup interval)

### A. Cron endpoint — `app/api/cron/tracking-watch/route.ts` (call every ~5 min)
Header `x-cron-secret: <CRON_SECRET>`. Runs in order:
1. **Silent workers** (`lib/trackingWatch.ts`): FIELD check-ins + all HYBRID sessions with no ping for ≥ 10 min
   (re-alert every 30 min, give up after 6 h) → push "Location sharing has stopped", sets `trackingAlertSentAt`.
2. **Auto check-out** (`lib/autoCheckout.ts`): target = overtime end or shift end (+ meetings). Target + 10 min → warning push;
   warning + 5 min → AUTO CHECK_OUT recorded **at the target time**, closes pauses/segments/overtime, estimates end odometer.
3. **Shift start reminders** (`lib/shiftReminders.ts`): push 10 min before shift; "Time to check in" 5–60 min after start.
4. **Trial watch** (`lib/trialWatch.ts`): trial reminder / trial-ended emails; suspends expired trial orgs.

Returns `{ silent, alerted, autoCheckout{checked,warned,checkedOut}, shiftReminders, trials }`.
⚠ If step 1–3 throws, later steps don't run that cycle (bare 500).
⚠ **No scheduler is configured in this repo.** If nobody calls this URL, there are no auto check-outs, reminders or trial emails.

### B. Startup interval — `instrumentation.ts`
On server boot: checks `DATABASE_URL` + `MOBILE_JWT_SECRET` (throws if missing). Then once at start and every 24 h:
- `runDeactivatedEmployeeCleanup` — hard-deletes employees deactivated ≥ 7 days ago (CSV archive kept, face enrollment deleted)
- `pruneExpiredRefreshTokens` — refresh tokens 7 days past expiry
- `pruneBillingRecords` — old checkouts/tokens (30 d), payment events (180 d)

⚠ The comment assumes a **long-running Node process**. On Vercel serverless, this only runs when an instance boots —
cleanup timing is not guaranteed.

### C. Done inside requests
- **Photo retention (45 days)**: `expireOldPhotos()` runs inside every `/api/kiosk/scan` call (no separate cron).
- **Stale check-in closing**: on CHECK_IN, earlier-day sessions without check-out are auto-closed at that day's shift end.
- **Admin notifications** are **computed live** on page load (`lib/adminNotifications.ts`), not sent/stored.

---

## 8. Authentication (5 different mechanisms)

| Who | Mechanism | Where |
|---|---|---|
| **Admin (web)** | NextAuth Credentials `admin-login` (email + password, bcryptjs), JWT cookie | `lib/auth.ts`, `lib/auth.config.ts`, `lib/requireAdmin.ts` |
| **Employee (web My Page)** | NextAuth Credentials `employee-login` (org code + employee code + PIN). The same session can also **check in/out from My Page without typing the PIN again** | `lib/auth.ts`, `lib/webEmployee.ts` (`requireWebEmployee`, `requireEmployee` = mobile bearer OR web session) |
| **Paired kiosk PC** | `x-kiosk-device` header = long-lived device token from pairing (SHA-256 stored in `KioskDevice.tokenHash`) | `lib/kioskDevice.ts` (see § 10.8) |
| **Employee (mobile app)** | Bearer JWT: access 15 min / refresh 30 days (rotating, `RefreshToken` table, `jti`), `tokenVersion` revocation | `lib/mobileAuth.ts` → `requireMobileUser(req)` |
| **Check-in itself** | **PIN in body** of `/api/kiosk/scan` (kiosk and mobile) | `lib/credentials.ts` `verifyPin` |
| **Location pings** | `X-Tracking-Token` per session (SHA-256 stored on Attendance), fallback Bearer | `lib/trackingToken.ts` |
| **Partner API** | `Authorization: Bearer pk_live_…` (SHA-256 stored) | `lib/partnerApi/*` |
| **Cron / loadtest** | `x-cron-secret` / `x-loadtest-secret` | routes |

Important details:
- `middleware.ts` (Node runtime) only protects **pages** `/admin/*` (ADMIN) and `/my-page/*` (EMPLOYEE). **API routes check auth themselves.**
- Admin APIs return **401** for any auth failure (never 403); records from another org return **404**.
- **Tab security**: `components/TabSecurity.tsx` signs out a tab without `sessionStorage.tab_auth` → opening admin in a **new tab logs you out (by design)**.
- **Device binding** (`lib/deviceBinding.ts`): first phone (`X-App-Device-Id`) an employee signs in on is bound; other phones get `DEVICE_MISMATCH` (403 on login, **401 on refresh**). Admin approves/resets on the employee page (also bumps `tokenVersion` → signs the employee out).
- **`tokenVersion` bump** (PIN change, device approve/reset, PIN reset) = all mobile tokens of that user invalid.
- **Admin password change / reset signs out every admin session** of that user: `User.passwordChangedAt` is set, and the
  NextAuth `jwt` callback (`lib/auth.config.ts`) drops any session whose `signedInAt` is older (`lib/sessionVersion.ts`,
  cached 30 s per user per server → other browsers are signed out within ~30 s). If that DB lookup fails the session is
  **kept** (logged `[auth] session version check failed`). Sessions created before this feature have no `signedInAt` → treated as old.
- **PIN rules**: min 6 digits (`MIN_PIN_LENGTH`), max 10, unique per org (`pinLookupHash`), bcrypt cost 12. New employees get `pinMustChange: true` → mobile login returns `PIN_CHANGE_REQUIRED` → app uses `set-initial-pin`.
- **PIN reset**: admin generates a 6-digit code (24 h, 5 tries) → employee verifies in app → 10 min reset token → new PIN.
- **Rate limits** (Postgres `RateLimitBucket`): PIN guesses 10 / 5 min and 30 / hour per org+employee code (shared kiosk/mobile/web); per-IP limits per route.

---

## 9. Multi-tenancy (organizations)

- `Organization.slug` = **organization code** (used in kiosk URL `/kiosk/<slug>`, mobile login, My Page login).
- All data is scoped by `organizationId` (directly or through `User`).
- `Organization.status = SUSPENDED` blocks all logins (set manually in DB, or automatically when a trial ends).
- Plain `/kiosk` = org with slug `default` (legacy / seeded org).
- Trials: 7 days, max 5 employees (`lib/trial.ts`); employee creation/reactivation over the limit → **403**.
- Plans/billing: `lib/billing/*` — **only a fake gateway exists** (dev). Real payment provider not integrated.

---

## 10. Core business logic

### 10.1 Check-in / check-out — `app/api/kiosk/scan/route.ts`
Order of checks (first failure wins):
1. IP rate limit (20/min) → 2. body ≤ 6 MB + zod → 3. resolve org (bearer token's org, else `orgSlug`), suspended?
→ 4. PIN-guess limit → 5. photo retention sweep → 6. photo present (check-in; check-out if setting on)
→ 7. **verify PIN** (active EMPLOYEE) → 8. offline rules (`OFFLINE_AUTH`, `OFFLINE_DISABLED`, idempotent `clientId`, `OFFLINE_FUTURE` > 2 min, `OFFLINE_TOO_OLD` > 6 h)
→ 9. decode photo (sharp) → 10. **face verify** (if enabled; mismatch = 401; service down = allowed with `UNAVAILABLE`)
→ 11. close stale earlier-day check-ins → 12. approved leave today = 409
→ 13. HYBRID gate (office then home) / geofence for OFFICE & WFH (mock location = 409, outside = 409, offline outside = accepted & flagged)
→ 14. one check-in & one check-out per IST day → 15. odometer check → 16. lateness (`computeLateness`)
→ 17. transaction: create Attendance (+ first WorkSegment for FIELD/HYBRID, `trackingTokenHash`) → 18. check-out closes pauses/segments/overtime summary.
Every attempt (success or failure) is logged to **`CheckInAttempt`** with a `reasonCode`.

Full error table: § 11.1.

### 10.2 Location pings & auto-pause — `app/api/kiosk/location/route.ts`
- Auth by `X-Tracking-Token` (or bearer of same user). Rate 120/min per IP.
- `backfill: true` → stores trail only and replays pauses (`lib/pauseReplay.ts`).
- Session already checked out → `{tracking:false}` (app stops).
- **Timed permission**: approved permission opens a pause at start; at end resumes (or auto-checks-out if past shift end).
- **End-of-work reminder** push 10 min before shift/overtime end (if `shiftRemindersEnabled`).
- **Accuracy gate**: pings with accuracy > 150 m are stored but **ignored for decisions**.
- **FIELD**: 3-ping streak switches FIELD ↔ OFFICE segment automatically.
- **HYBRID**: arrival switches segment; departure only sends a "Heading home?" push; transit > 45 min sends a prompt.
- **Auto-pause**: confirmed outside geofence → `pauseWarningAt` + push "You've left your work area"; after 10 min → `AttendancePause`; back inside → resume.
- Admin "Live" = ping within **3 minutes** (`LIVE_THRESHOLD_MS` in `components/DashboardWorkspace.tsx`).

### 10.3 Work modes
| Mode | Geofence | Notes |
|---|---|---|
| OFFICE | office (`OfficeLocation`) | lateness enforced |
| WFH | home (or 2nd home, nearer); office if `checkInMode=OFFICE` | |
| FIELD | none (office only when choosing Office) | segments FIELD/OFFICE, distance, visits, assigned places, reimbursement, odometer |
| HYBRID | office or home (server decides) | segments OFFICE/HOME/TRANSIT, transit not counted as work; see `HYBRID_API_CONTRACT.md` |
Logic: `lib/geofenceTarget.ts`, `lib/geofence.ts`, `lib/hybridSegments.ts`, `lib/attendanceHours.ts`.

### 10.4 Time & days
- **Everything is IST (+5:30, fixed)** — `lib/istTime.ts`. `Attendance.dayKey` = IST `YYYY-MM-DD`, unique per (user, type, dayKey).
- Shifts: `HH:mm` IST, per weekday (`ShiftAssignment`), overnight if end ≤ start (`lib/shiftTime.ts`, `lib/shiftAssignment.ts`, `lib/activeSession.ts`).
- Lateness: ≤ 0 min NONE, ≤ threshold (default 60) PERMISSION, more HALF_DAY.
- Worked hours = span − pauses − transit (`lib/attendanceHours.ts`, mirrored in mobile app).

### 10.5 Requests (employee → admin)
| Request | Created by | Effect |
|---|---|---|
| Leave (`TimeOffRequest`) | mobile `me/leave-requests` | APPROVED blocks check-in; balances from `AppSettings` quotas |
| Timed permission | mobile `me/timed-permission` | **Does nothing until admin APPROVES**; then pauses during the window |
| Overtime | mobile `me/overtime` | **Takes effect immediately** (extends reminder/auto-checkout target); status is record-only |
| Meeting | mobile `me/meetings` | Outside shift only; extends auto-checkout target; no approval |
| Manual entry | mobile `me/manual-entry-requests` (last 7 days) | APPROVED creates MANUAL attendance |
| Support ticket | mobile `support` | Admin resolves → push |
Admin decisions send a **push** to the employee.

### 10.6 Offline check-ins
Mobile app queues; server accepts with `offline {clientId, capturedAt, timeVerified}` if `AppSettings.offlineCheckInEnabled`.
`clientId` makes it idempotent; outside-area offline check-ins are accepted but flagged `offlineOutsideArea` for admin review.

### 10.7 "Resume work" — several check-ins a day (`action: "RESUME"`)
Added in commit `1f683e0`. An employee who already checked out today can reopen the same day.
- Sent to `POST /api/kiosk/scan` with `action: "RESUME"`. Needs the **same photo, face check and geofence as a check-in**
  (geofence uses the mode the day started with; HYBRID may resume from office or home).
- Rules (all 409 unless noted): not offline (400 "Resume work isn't available offline."), must have checked in today,
  must be checked out, at most **6 check-ins per day = 5 resumes** (`lib/resumeLimit.ts`: `MAX_CHECKINS_PER_DAY`,
  `MAX_RESUMES_PER_DAY`), and **not after the shift end** ("Your shift has ended, so you can't resume…").
- What happens (one transaction):
  1. An `AttendanceResume` row keeps everything about the check-out being undone (time, photo, odometer, face status) plus the resume's photo/face/location.
  2. An `AttendancePause` with `isBreak: true` covers the gap (check-out → resume) so it is **not counted as work**.
  3. The CHECK_OUT row is **deleted** (a day can still only have one CHECK_OUT).
  4. The CHECK_IN gets a **new tracking token** (old one stops working), `pauseWarningAt` / `autoCheckoutWarnedAt` cleared.
  5. FIELD/HYBRID: a new work segment starts.
  6. `AttendanceEvent` kind **`WORK_RESUMED`** is logged. Response `{ id, type:"CHECK_IN", resumed:true, trackingToken, … }`.
- `GET /api/kiosk/status` now returns **`canResume`** and **`resumeUsed`** (limit reached). If the `AttendanceResume`
  table is missing (migration not applied) it logs `[status] resume lookup failed` and simply doesn't offer resume.
- `CheckInAttempt.reasonCode` for rejected resumes = `RESUME_REJECTED`. Race: "Your check-out changed. Reload the page…" (409).
- **Where it's used:** web My Page (`components/EmployeeCheckIn.tsx`, "Check in again" button). **The mobile app does not
  support RESUME yet** (it ignores `canResume`).

### 10.8 Kiosk devices (pairing a fixed office PC)
Added in commit `b3510a9`. Problem it solves: a desktop PC without GPS reports a location from its IP/Wi-Fi (often far off),
so geofenced check-ins failed on office kiosks.
1. Admin → **`/admin/kiosk-devices`** → create a device (name) → gets a one-time **8-character pairing code**
   (alphabet without look-alike characters, valid **15 min**, max **20 devices per org**). `POST /api/admin/kiosk-devices`.
2. On the kiosk PC, the code is entered → `POST /api/kiosk/pair` → returns a long-lived device token, stored in the
   browser's localStorage key **`kiosk_device_token`** (`app/kiosk/KioskClient.tsx`). Pair is rate-limited 10 / 15 min per IP.
3. The kiosk sends it as header **`x-kiosk-device`** on every request.
4. Effect on `/api/kiosk/scan` (CHECK_IN only, not signed-in callers): the **office coordinates are used instead of the
   browser location**, accuracy 0, `mocked=false`; WFH/HYBRID employees are treated as checking in at the **office**.
   PIN and face checks still apply. `/api/kiosk/status` skips the location requirement for a paired kiosk.
5. `/api/kiosk/office-location` returns `deviceValid: false` if the token is no longer valid, so the kiosk drops it.
6. Removing a device (`DELETE /api/admin/kiosk-devices/[id]`) revokes the token immediately. `lastUsedAt` updates at most every 10 min.

**Kiosk page side (`app/kiosk/KioskClient.tsx`)**
| What | Where | Behaviour |
|---|---|---|
| Constants | lines 68–69 | `DEVICE_TOKEN_KEY = "kiosk_device_token"`, `DEVICE_HEADER = "X-Kiosk-Device"` |
| Token load | ~line 182 | Read from localStorage after mount. `undefined` = not read yet, `null` = not paired (also if localStorage throws) |
| Header chip | ~lines 676–690 | Paired → green **"Paired kiosk"** chip. Not paired → **"Pair this kiosk"** button that opens the pairing form. Nothing shown while still loading |
| Pairing form | ~lines 700–725 | Text field (auto upper-case, placeholder "PAIRING CODE") + **Pair** button. Hint text tells the user to get the code from Admin → Kiosk devices |
| `handlePair()` | ~lines 545–575 | `POST /api/kiosk/pair` with `{orgSlug, code}`. Errors shown under the form: server `error` text, or "Could not pair this kiosk. Please try again.", "This browser blocked saving the pairing. Allow site data for this page and try again." (localStorage blocked), "Network error. Please try again." |
| Header sent | lines 194, 291, 355 | `X-Kiosk-Device` on `office-location`, the pre-PIN status lookup and the scan |
| Auto-unpair | ~lines 200–206 | If `office-location` answers `deviceValid: false` (admin removed it), the token is deleted from localStorage and the page goes back to "Pair this kiosk" |
| No browser location | lines 224–225, 484–489 | A paired kiosk never asks for or sends browser location; it submits straight away |

If a paired kiosk suddenly asks for location again: the token was removed (admin deleted the device, or the browser's site
data was cleared, or a private/incognito window is used). Pair it again.

### 10.9 Web check-in from My Page
Added in commit `b3510a9`. A signed-in employee on `/my-page` can check in / out / resume from the browser
(`components/EmployeeCheckIn.tsx`). `/api/kiosk/scan` accepts the web session instead of the PIN (`requireWebEmployee`),
but **only for the employee's own code** (another code → 400). Attempts are logged with `source: "WEB"`.
`mobile/me/leave-requests` and `mobile/me/timed-permission` also accept the web session (`requireEmployee`), so My Page can create requests.

### 10.10 Location accuracy tolerance (browser check-ins)
`/api/kiosk/scan` now accepts an optional `accuracy` (metres). If accuracy ≤ **300 m** (`IMPRECISE_LOCATION_M`), a
reading that *could* be inside (distance − accuracy ≤ radius) is accepted. If accuracy > 300 m and it might be inside,
the user gets 409 "Your device could only locate you to within about N m… Turn on Wi-Fi and location services…"
(`reasonCode` `LOCATION_IMPRECISE`). Old clients that don't send accuracy are held to the exact reading. The same
300 m tolerance applies to anonymous `/api/kiosk/status` lookups (`?accuracy=`).

---

## 11. API reference — kiosk & mobile

### 11.1 Kiosk routes (`app/api/kiosk/`)
| Route | Auth | Purpose |
|---|---|---|
| `POST /api/kiosk/scan` | PIN in body, or mobile bearer / web My Page session (own code only); optional `x-kiosk-device` | Check in / out / **RESUME** (§ 10.1, § 10.7–10.10) |
| `POST /api/kiosk/pair` | one-time pairing code | Pair a kiosk PC → device token (§ 10.8). 429 (10 / 15 min per IP), 400 "Enter the pairing code." / "That code isn't valid or has expired…" |
| `GET /api/kiosk/status` | optional bearer or web My Page session (bad bearer → 401) | Today's status (incl. `canResume`, `resumeUsed`). Anonymous kiosk call must be inside geofence and gets limited info. 429 at 60/min per IP (+30/min per IP for anonymous). Unknown code/org, inactive user, someone else's code, or anonymous caller outside the geofence → **200 `{exists:false}`**, never a 4xx |
| `POST /api/kiosk/location` | X-Tracking-Token / bearer | Location ping (§ 10.2) |
| `GET /api/kiosk/office-location` | public; if a bearer or My Page session is present, that caller's org is used instead of `orgSlug` (then `organizationName: null`) | Office geofence for an org. Unknown/inactive org → **200 `{officeLocation:null}`**. With `x-kiosk-device` also returns `deviceValid` |
| `/api/auth/[...nextauth]` | — | NextAuth's own handler (sign-in/out, session) for the `admin-login` / `employee-login` providers (§ 8) |
| `GET /api/cron/tracking-watch` | `x-cron-secret` | Background job, see § 7A |

**`/api/kiosk/scan` errors**
| Status | Code / message | Cause |
|---|---|---|
| 429 | Too many attempts | IP > 20/min, or PIN-guess limit |
| 413 | Request/Photo too large | body > 6 MB / photo > 4 MB |
| 400 | Invalid request | bad JSON/zod, HYBRID with FIELD mode, clientId of another user |
| 401 | kiosk isn't linked to an organization | bad org slug |
| 403 | organization disabled | SUSPENDED |
| 400 | A photo is required | missing photo |
| 401 | Not recognized… | wrong code/PIN, inactive, not employee |
| 403 | `OFFLINE_AUTH` / `OFFLINE_DISABLED` | offline rules |
| 400 / 422 | `OFFLINE_FUTURE` / `OFFLINE_TOO_OLD` | capturedAt clock checks |
| 400 | Invalid photo data | sharp couldn't decode |
| 401 | face service message | face mismatch |
| 409 | approved leave today | leave |
| 409 | Mock location detected | `mocked: true` |
| 400 | Location permission is required | no coords while geofence configured |
| 409 | outside the permitted office area / home / both | geofence |
| 409 | already checked in / check in first / already checked out | day rules or race |
| 400 | End km can't be less than start km | odometer |
| 409 | Your device could only locate you to within about N m… | browser accuracy > 300 m (`LOCATION_IMPRECISE`) |
| 400 | Resume work isn't available offline. | RESUME sent offline |
| 409 | haven't checked in today / still checked in / limit of 6 check-ins / shift has ended / check-out changed | RESUME rules (`RESUME_REJECTED`) |
| 400 | Invalid request. | web session tried another employee's code |
| 500 | Internal server error | unhandled (check server logs `[POST /api/kiosk/scan]`) |

**More `/api/kiosk/scan` behaviour worth knowing**
- Same offline `clientId` sent again → **200 with `idempotentReplay: true`** (no duplicate row). A unique-key race returns the
  winning record, otherwise 409 "already checked in/out".
- `OFFLINE_AUTH`: an offline item must come with the mobile **bearer token of that same employee** (a web session is not enough).
- Face mismatch → the refused photo is kept on the `CheckInAttempt` row (cleared later by retention cleanup).
- The CHECK_IN response carries `trackingToken` **once** — the phone must save it then.
- CHECK_OUT closes an open overtime request using `overtimeSummary` / `overtimeSummaryPhoto`.

**`/api/kiosk/location` errors**: 429 (120/min), 400 zod, 404 session not found (also when the id exists but is not a
CHECK_IN), 403 token mismatch, 200 `{tracking:false}` (user inactive / already checked out), bare 500 on DB error (no try/catch).
Backfilled (offline-buffered) samples return `{tracking, stored}` and are accepted even after the session ended, up to
check-out time + 60 s.

**`/api/kiosk/pair`** success → `{token, name}`. A code can be claimed only once (conditional update).

### 11.2 Mobile auth (`app/api/mobile/`)
| Route | Purpose | Key errors |
|---|---|---|
| `POST login` | org code + employee code + PIN → tokens | 400 "Invalid request.", 401 invalid org / code-PIN, 403 suspended, 403 `DEVICE_MISMATCH`, 403 `PIN_CHANGE_REQUIRED`, 429 (10/min per IP, or the shared PIN-guess limit) |
| `POST refresh` | rotate refresh token (**no rate limit**) | 400 "Invalid request.", 401 "Invalid or expired session. Please log in again." (invalid/expired/reused), 401 "Account is no longer active.", 401 `DEVICE_MISMATCH` |
| `POST logout` | revoke refresh token | 400 "Invalid request." if the body is missing/invalid; otherwise always `{success:true}` (even for a bad token) |
| `POST change-pin` | Bearer; new PIN + new tokens, other devices signed out | 400 "New PIN must be different", 403 current PIN wrong, 409 PIN taken, 429 (5/min per user — **shared bucket `change-pin:<userId>` with `/api/my-page/change-pin`**) |
| `POST set-initial-pin` | temp PIN → own PIN | 400 invalid org / invalid temporary PIN / already set up / must be different, 403 suspended org, 409 taken, 429 (10/min per IP or PIN-guess limit) |
| `POST pin-reset/verify` | admin code → reset token | 400 "Wrong reset code. N tries left." / expired, 403 suspended org or too many wrong codes, 429 (10/min per IP or PIN-guess limit) |
| `POST pin-reset/complete` | reset token + new PIN | 400 expired, 409 taken, 429 (10/min per IP) |

### 11.3 Mobile data (Bearer; missing/bad → 401)
| Route | Methods | Purpose |
|---|---|---|
| `me` | GET, PATCH | profile; PATCH `shiftRemindersEnabled` |
| `me/push-token` | POST | save Expo push token |
| `me/tracking-token` | POST | new tracking token for open session (6/min; old token stops working) |
| `me/attendance`, `me/attendance/[id]/photo` | GET | history (paged) / check-in photo |
| `me/face-enroll` | POST | selfie enrollment (`embedFace`); returns enrolled/failed/unavailable |
| `me/profile-photo` | GET, POST | profile photo |
| `me/field-summary` | GET | field distance/route/visits for active FIELD session |
| `me/reimbursements` | GET | monthly FIELD reimbursement |
| `me/late-arrivals` | GET | own late check-ins |
| `me/leave-requests`, `me/leave-requests/[id]` | GET, POST, PATCH | leave (PATCH = cancel) |
| `me/manual-entry-requests` | GET, POST | missed-day request |
| `me/meetings`, `me/meetings/[id]` | GET, POST, DELETE | meetings outside shift |
| `me/overtime` | GET, POST | overtime |
| `me/timed-permission` | GET, POST | permission (today only) |
| `me/work-segment` | GET, POST | FIELD/HYBRID segment switch (409 if a ping changed it simultaneously) |
| `me/assigned-places`, `.../[id]/skip` | GET, POST | admin-assigned places / skip with reason |
| `me/route-plan`, `me/route-leg` | POST | road routing (ORS) with straight-line fallback (`roads:false`) |
| `field-visits`, `field-visits/[id]/photo` | GET, POST | log visit (idempotent `clientId`, 422 if > 3 days old, 409 if not on a Field check-in) |
| `holidays` | GET | public holidays |
| `support` | POST | issue report |

**Limits and errors per mobile data route** (checked against the code)
| Route | Detail |
|---|---|
| `me/attendance`, `me/late-arrivals` | `take` default 30, max 100. `manual-entry-requests` and `meetings` GET return at most 50 |
| `me/face-enroll` | 5/min per user; body > 6 MB or photo > 4 MB → 413 |
| `me/profile-photo` POST | 10/min per user, same 413 limits; responses `Cache-Control: private, no-store` |
| `me/attendance/[id]/photo`, `field-visits/[id]/photo` | cached privately 3600 s; 403 someone else's photo, 404 missing |
| `me/meetings` POST | max 12 h long, start ≤ 12 h in the past, ≤ 14 days ahead; 400 inside the shift; 409 overlaps another meeting |
| `me/overtime`, `me/timed-permission` POST | 409 not checked in; 409 a request is already active |
| `me/leave-requests` POST | 409 already checked in on that day / overlapping request; 400 past date, all-holiday range, not enough balance. GET is bearer-only; POST also accepts the web My Page session (same split for `timed-permission`) |
| `me/leave-requests/[id]` PATCH | 409 "Only a pending request can be cancelled." |
| `field-visits` POST | 413 size limits; 422 if > 3 days old or > 2 min in the future; visit must be within 24 h of its check-in; 409 not on a Field check-in / assigned place no longer available |
| `me/tracking-token` | 409 "You're not checked in right now." |
| `me/route-plan` | max 60 `placeIds` |

---

## 12. API reference — admin

All under `app/api/admin/`, auth `requireAdmin()` → 401 if not admin; other-org records → 404.

| Area | Routes |
|---|---|
| Own account | `account/password` (POST `{currentPassword, newPassword ≥ 8}`; 429 after 5 tries / 15 min; 400 "Your current password is not correct." / "Choose a password different…"). Sets `passwordChangedAt` → **signs out all this admin's sessions, including the current one** |
| Kiosk devices | `kiosk-devices` (POST `{name}` → `{id, code, expiresInMinutes:15}`; 400 at 20 devices), `kiosk-devices/[id]` (DELETE → token revoked; 404) — see § 10.8 |
| Admins / keys / settings | `admins` (GET/POST), `api-keys` (GET/POST), `api-keys/[id]` (DELETE = revoke), `billing-email` (PUT), `settings` (GET/PUT), `office-location` (GET/PUT) |
| Sidebar & alerts | `badge-counts` (GET, cached 5 s / face health 15 s per instance, `?fresh` skips), `notifications` (DELETE = dismiss for **all admins**) |
| Employees | `employees` (GET paged/search, POST create → returns PIN once), `employees/bulk` (POST ≤ 50, all-or-nothing), `employees/[id]` (GET, PATCH actions: `regenerate-pin`, `generate-reset-code`, `set-active`, `update-wfh-location`, `update-hybrid-location`, `clear-wfh-location`, `set-field-mode`, `set-face-verification`, `set-face-verification-exempt`, `approve-device`, `reset-device`), `employees/deleted/[id]/[kind]` (CSV archive) |
| Employee detail | `[id]/attendance`, `[id]/assigned-places` (FIELD only; GET/PUT ≤ 40/day, push on new places), `[id]/field-visit-days`, `[id]/leave-today` (POST/DELETE, push), `[id]/manual-entry`, `[id]/profile-photo`, `[id]/reimbursement`, `[id]/shift-schedule`, `[id]/visited-places` (route, stops, geocoding) |
| Attendance & exports | `attendance/[id]` (PATCH time only, same IST day), `attendance/export` (CSV), `leave-requests/export` (CSV), `field-workers/export` (Excel, ≤ 31 days, geocoding only ≤ 3 days) |
| Request queues (push on decision) | `leave-requests` (+`[id]`), `overtime-requests/[id]` (+photo), `timed-permissions` (+`[id]`), `manual-entry-requests/[id]`, `support` (+`[id]`, +photo), `field-visits/[id]/photo` |
| Shifts & holidays | `shifts`, `shifts/[id]`, `shifts/[id]/assignments`, `shifts/[id]/bulk-assign`, `holidays`, `holidays/[id]` |
| Map helpers | `locations/latest` (dashboard polls every 5 s), `places-nearby` (Overpass), `places-search` (ORS/Nominatim), `places-parse-link` (Google Maps links, SSRF-safe) |

Notes: no API deletes an employee — deactivate → auto-deleted after 7 days. Admin-created employee + shift = assigned Mon–Sat
(the comment at `app/api/admin/employees/route.ts:16` says "all 7 weekdays" — the comment is outdated, the code at line 213 does Mon–Sat).
Errors: 400 zod, 403 trial limit, 409 duplicates/already-reviewed, 413 large photo, 422 unreadable Google Maps link
(`places-parse-link`), 502 external place APIs.

| Route | Extra detail (checked against the code) |
|---|---|
| `kiosk-devices` | POST only — there is **no list (GET) route**; the page reads devices server-side |
| `employees` GET | `pageSize` max 100 |
| `employees/bulk` | transaction timeout 30 s; on failure 500 and **nothing is saved** |
| `[id]/assigned-places` PUT | the 40/day limit counts already-visited + new places; only today or a future date (else 400) |
| `attendance/[id]` PATCH | 400 "Only the time can be changed, not the day.", plus check-in/check-out order errors |
| `field-workers/export` | 404 "No matching field workers."; 400 range > 31 days or start after end |
| `places-nearby` | 400 when the map window is too large |
| `notifications` DELETE | body `{key}` or `{keys}` (≤ 200); 400 for permission requests (they must be approved/rejected instead) |

---

## 13. API reference — signup, billing, partner, misc

### 13.1 Free-trial signup & account activation

**Flow:** `/register` form → `POST /api/register` → org + owner admin created (no password) → activation email (72 h link)
→ `/activate?token=…` → `POST /api/activate` sets password → **trial clock starts** (7 days) → admin signs in.

| Route | Auth | What it does | Errors |
|---|---|---|---|
| `GET /api/register/check-slug?slug=` | public, CORS (marketing site) | Live org-code availability. Slugs held by an in-progress paid checkout count as taken | 429 (30/min per IP). Otherwise `{available, reason: empty / invalid / taken / null}` |
| `POST /api/register` | public | Body: `organizationName`, `slug`, `adminName`, `adminEmail`, `phone` (6–20, digits/+()-), `teamSize` (1-5 / 6-20 / 21-50 / 51-200 / 200+), `industry?`, `extraEmail?` (→ `billingEmail`). One transaction: Organization (`isTrial`), AppSettings, admin `ADM001` (`isOwner`, no password), activation token (72 h). Then sends `trialActivationEmail`. Returns `emailSent` (false if Resend failed — account still exists) | 429 (5/min per IP), 400 "Invalid input." / org-code format, 409 "That organization code is already taken." / "That email is already in use.", 500 (`[POST /api/register]`) |
| `POST /api/activate` | token in body | `{token, password ≥ 8}`. Consumes the `ACCOUNT_ACTIVATION` token, sets password only if none exists, sets `trialEndsAt = now + 7 days` (once) | 429 (10/min per IP), 400 "Invalid input.", 400 `invalid_or_expired` (bad/used/expired token, or password already set — token is still consumed) |
| `POST /api/activate/resend` | public, CORS | `{email}` → new activation link, only for an **owner admin with no password yet**. Trial or normal activation email | **Always 200 `{ok:true}`** (no account enumeration). Silent limits: 5 / 10 min per IP, 3 / hour per email. Failures only in logs `[POST /api/activate/resend]` |

### 13.2 Admin password reset & change

| Route | Auth | What it does | Errors |
|---|---|---|---|
| `POST /api/password-reset/request` | public | `{email}` → emails a reset link (**60 min**) to an **activated, active admin** only (employees use PIN; not-yet-activated admins use activation) | **Always 200 `{ok:true}`**. Silent limits 5 / 10 min per IP, 3 / hour per email. Errors only in logs `[POST /api/password-reset/request]` |
| `POST /api/password-reset/confirm` | token in body | `{token, password ≥ 8}` → consumes `PASSWORD_RESET` token, sets password + `passwordChangedAt` (signs out all sessions, § 8) | 429 (10/min per IP), 400 "Invalid input.", 400 `invalid_or_expired` (bad/used/expired, not admin, inactive), 500 |
| `POST /api/admin/account/password` | admin session | Change own password (see § 12) | 429, 400 |
| Page `/reset-password` | — | Link target; after success goes to `/signin?reset=1` (no auto sign-in) | |

Script to set the seed admin's password from `.env`: `node scripts/set-seed-admin-password.cjs` (see § 17a).

### 13.3 Paid signup & plan change (billing)

⚠ Only the **fake** gateway exists (`BILLING_PROVIDER=fake`); it throws in production. New-org paid signup is now driven
from the **marketing site** (success/cancel URLs point to `MARKETING_SITE_URL/signup/complete`); this app mainly uses the
plan-change flow.

**Paid signup flow:** marketing site → `POST /api/signup/checkout` → `SignupCheckout` row (holds slug + email **45 min**)
→ gateway checkout → payment → `POST /api/billing/webhook` (or polling `GET /api/signup/status`) → `provisionPaidSignup`
creates org + admin + activation email.

**Plan change flow:** `/plans` (admin) → `POST /api/plan-change/checkout` → gateway (dev: `/signup/dev-pay`) →
webhook / `GET /api/plan-change/status` polling (`/plans/complete`, every 2.5 s) → `applyPlanChange` updates `planTier` / `seatLimit`.

| Route | Auth | What it does | Errors |
|---|---|---|---|
| `POST /api/signup/checkout` | public, CORS | Body: `plan` (starter/growth/scale), `cycle` (monthly/annual), `seats`, org name, slug, admin name/email, `acceptTerms: true`. **Price is recomputed on the server** (`computeQuote`), never trusted from the client. Creates `SignupCheckout`, starts gateway checkout. Returns `{ref, amountPaise, currency, quote, handoff}` | 429 (5/min per IP, 5/hour per email), 400 "Invalid input." / slug format / quote error (with `field`), 409 slug taken or held / "That email already has a workspace. Sign in instead.", **502 "Could not start checkout."** (gateway failed — checkout set CANCELLED, hold freed), 500 |
| `GET /api/signup/status?ref=` | public (ref = capability), CORS | Polling backup for the webhook. After 10 s asks the gateway directly and provisions if paid. Returns `{status: pending/provisioned/failed/needs_attention, activated, emailMasked ("j***@acme.com"), lastPaymentError}` | 429 (60/min per IP), 400 "Missing ref.", 404, 500 |
| `POST /api/plan-change/checkout` | admin session | `{plan, cycle, seats}` → `createPlanChangeCheckout` | 401, 429 (5/min per org, 10/min per IP), 400 invalid / quote error, 500 |
| `GET /api/plan-change/status?ref=` | admin session, **own org only** | Same polling logic → `applyPlanChange`. Returns `{status: pending/applied/failed/needs_attention, planId, seats, lastPaymentError}` | 401, 429, 400, 404 (also for another org's ref), 500 |
| `POST /api/billing/webhook` | gateway signature (fake: `x-fake-signature` HMAC with `FAKE_WEBHOOK_SECRET`) | Reads raw body, verifies signature, **dedupes on `PaymentEvent (provider, eventId)`** (duplicate → `{ok, duplicate:true}`). Finds the checkout in `SignupCheckout` or `PlanChangeCheckout`. `payment_failed` → stores `lastPaymentError` (checkout stays open for a retry). `payment_succeeded` → provision / apply plan; records `outcome` on the PaymentEvent. **No rate limit** (gateway IPs are shared) | 400 "Invalid signature.", **500 on unexpected errors on purpose** (so the gateway retries). Unknown checkout / missing fields → logged and 200 |
| `POST /api/signup/dev-pay` | dev only (404 in production) | Backs the "Simulate success/failure" buttons on `/signup/dev-pay`: signs a fake event and forwards it to `/api/billing/webhook`, then redirects (same-origin only) | 404 in production |

**Statuses:** `SignupCheckout` PENDING → PROVISIONED / CANCELLED / NEEDS_ATTENTION (amount or currency mismatch — needs a human).
`PlanChangeCheckout` PENDING → APPLIED / CANCELLED / NEEDS_ATTENTION. Cleanup after 30 days (`lib/billing/cleanup.ts`).

**Where to look when billing breaks:** logs `[POST /api/signup/checkout] Gateway error`, `[POST /api/billing/webhook] …`
(signature failed / no checkout / missing fields), tables `SignupCheckout`, `PlanChangeCheckout`, `PaymentEvent` (`outcome`),
`lib/billing/provision.ts`, `lib/billing/planChange.ts`.

### 13.4 Other routes

| Route | Purpose |
|---|---|
| `POST /api/my-page/change-pin` | Web employee PIN change (signs out all mobile sessions) |
| `GET /api/attendance/[id]/photo` | Check-in photo for web session (owner or admin) |
| `GET /api/health` | `{status, checks{database, faceVerification}}` — 503 if DB down |
| `GET /api/loadtest/[probe]` | Load-test probes (`ping`, `db`, `cpu`, `face`), only if `LOADTEST_SECRET` set; unknown probe → 404 |
| `/api/v1/*` (partner) | `health`, `attendance`, `employees`, `calendar`, `locations`, `leave-types`, `attendance-statuses`. API key, 120 req/min per org. Errors `{error:{code,message,requestId}}` codes `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500 |

---

## 14. Web pages

| Path | What |
|---|---|
| `/` | Landing (links to kiosk / login) |
| `/login`, `/login/admin`, `/signin`, `/login/employee` | Login pickers & forms |
| `/auth/continue` | Continue after sign-in on marketing site (must be fresh, < 2 min) |
| `/register` | Org signup |
| `/activate`, `/forgot-password`, `/reset-password` | Account email flows |
| `/plans`, `/plans/complete`, `/signup/dev-pay` | Plans & billing (dev-pay = fake checkout) |
| `/kiosk`, `/kiosk/[orgSlug]`, `/kiosk/status/[id]` | Web kiosk (`KioskClient.tsx`): employee code → status lookup → camera selfie → PIN → scan. **Kiosk tracks location (60 s pings) only for WFH employees checking in from home.** Form auto-clears after 30 s idle |
| `/my-page` | Employee portal (redesigned in `b3510a9`, styles in `app/my-page/mypage.css`): **check in / out / "Check in again" (resume) from the browser** (`EmployeeCheckIn`), attendance calendar & stats, leave/permission request buttons, sidebar & tabs (`components/mypage/*`) |
| `/admin/account` | Change own admin password (`ChangeAdminPasswordForm`) |
| `/admin/kiosk-devices` | Create / remove paired kiosk PCs, shows the pairing code once (`KioskDevicesPanel`) |
| `/admin/dashboard` | `DashboardWorkspace` tabs: **status** (current status table, mark leave, badges for face skipped / offline / outside, CSV export), **map** (everyone live), **calendar** (pick an employee). Since commit `f25b4b6` the separate "pending permissions", "missed face checks" and "silent field workers" cards and the face-service banner are **no longer shown** — those alerts are only in `/admin/notifications` |
| `/admin/employees`, `/admin/employees/[id]`, `/admin/employees/deleted` | Employee management |
| `/admin/field-workers`, `/admin/location-history` | Field routes/visits/assign places; Hybrid/WFH route history |
| `/admin/leave`, `/admin/leave-balances`, `/admin/permissions`, `/admin/overtime`, `/admin/meetings`, `/admin/manual-entries` | Requests |
| `/admin/shifts`, `/admin/office-location`, `/admin/settings`, `/admin/notifications`, `/admin/support` | Config & inbox |
Errors in pages: `app/error.tsx` (logs `[app/error.tsx]`; in production shows **"Reference: <digest>"** — search that digest in the server log to find the real error), `app/global-error.tsx`.

---

## 15. Components

All in `components/` (80 files). Paths below are relative to that folder.

### 15.0 Patterns used everywhere (read first when debugging UI)
- **Saving:** forms send JSON, then call `router.refresh()` (re-renders the server page with new data). Errors show the
  server's `error` text in a red box inside the component; a non-JSON reply shows "Unexpected server response.".
- **"Saved"** messages stay 3 s; **"Copied"** 2 s.
- **Request queues** use `useSyncedState` (local edits are overwritten by the next server data — if a list "reverts", the
  server's data won) and call `refreshAdminCounts()` (event `admin-counts-refresh`) so sidebar badges update at once.
- **Leaflet maps** are always loaded with `next/dynamic(..., { ssr: false })`. Tiles: OpenStreetMap; satellite: Esri ArcGIS.
  Blocked tile hosts = grey map. Leaflet only re-measures on a window `resize`, so several components fire one artificially.
- **Silent failures** (code ignores the HTTP result — check the browser **Network tab**, not the UI):
  `EmployeeActions` (all actions), `HolidayManager` delete, `ShiftTable` delete, `WfhLocationTable` / `FieldLocationTable`
  remove, `ApiKeysPanel` revoke, dashboard calendar fetch, `AdminShell` badge polling, `VisitDatePicker`.
- **Unused (no importers):** `FaceVerifyStatusBanner`, `LocationMap` / `LocationMapModal`, `SignOutButton`,
  `PendingPermissionsPanel`, `MyPageWorkspace` (replaced by `mypage/*`).

### 15.1 Shell, auth, plumbing
| Component | What / where | API & timing | Gotchas |
|---|---|---|---|
| `AdminShell.tsx` | Admin frame: sidebar rail (desktop, widens on hover) or top bar + drawer (mobile); theme toggle, tour, user card, change password, sign-out. `app/admin/layout.tsx` | `GET /api/admin/badge-counts` on mount, page change, focus/visible, every **15 s**; `?fresh=1` on `admin-counts-refresh` | If `signature` changes → `router.refresh()` (open page reloads data). Errors swallowed (badges stay stale). Fires `resize` 340 ms after the rail toggles |
| `adminCountsEvent.ts` | `refreshAdminCounts()` window event | – | call after approve/decline/delete |
| `useSyncedState.ts` | state that resets when server props change | – | see 15.0 |
| `AdminTour.tsx` | First-run guided tour of the sidebar | – | localStorage **`admin_tour_done`**; auto-starts 900 ms after first dashboard visit; Esc / → / ← keys; targets `[data-tour="nav-<href>"]` |
| `AdminSignInForm.tsx` | Admin email/password form (`/signin`, `/login/admin`) | `signIn("admin-login")` | Sets sessionStorage **`tab_auth`**; 20 s safety timeout; one combined error message for bad password / not activated / trial ended — check server for the real cause |
| `TabSecurity.tsx` | Signs out a tab with no `tab_auth` | `signOut()` | **Main cause of "random logout"**: new/duplicated tab or pasted URL. Every sign-in path must set `tab_auth` |
| `Providers.tsx` | NextAuth SessionProvider | – | – |
| `AuthFields.tsx`, `AuthSplit.tsx`, `AuthShell.tsx` | Form fields; split sign-in layout; card layout for forgot/reset password | – | presentational |
| `Logo.tsx` | Z-gate logo, static/animated | – | animation keyframes in `app/globals.css` |
| `TrialBanner.tsx` | Trial days left (red near the end) | – | from `lib/trial` |
| `LocationTrackerBoot.tsx` | Resumes browser location tracking after a refresh (root layout) | `lib/locationTracker` | – |
| `ThemeInitScript.tsx` / `ThemeToggle.tsx` | Light/dark theme before first paint / toggle | – | localStorage **`admin_theme`**, `<html data-admin-theme>`, scoped to `.admin-root` |
| `admin/ui.tsx` | Shared Card, buttons, PageHeader, StatCard, Pill, Avatar, EmptyState, Segmented, table classes | – | no API, used by 19 pages |

### 15.2 Dashboard & live map
| Component | What | API & timing | Gotchas |
|---|---|---|---|
| `DashboardWorkspace.tsx` | Tabs: status / map / calendar | `GET /api/admin/locations/latest` every **5 s** + on focus/online/visible; calendar → `GET /api/admin/employees/{id}/attendance`; export link → `attendance/export` | **Live = ping within 3 min** (`LIVE_THRESHOLD_MS`). Poll errors silent; calendar error = empty calendar. SSE was removed on purpose (unreliable on Vercel) |
| `AllEmployeesMap.tsx` | Everyone on a map: green live, amber not sending, red outside, grey off | uses dashboard feed | fits all once, then keeps your pan/zoom |
| `LiveLocationModal.tsx` | One person's route today + live dot | `GET …/{id}/visited-places` on open and every **30 s** | "Couldn't refresh the route. Showing the last known position." |
| `FullscreenMapFrame.tsx` | Fullscreen wrapper for maps | – | iOS Safari falls back to a fixed overlay |
| `MarkLeaveControl.tsx` | Mark today as leave / undo | `POST` / `DELETE …/{id}/leave-today` | – |
| `RecentActivityList.tsx` | Last 3 days of punches with photos | `GET /api/attendance/{id}/photo` | times pinned to IST (server clock is UTC) |

### 15.3 Employees
| Component | What | API | Gotchas |
|---|---|---|---|
| `EmployeeTable.tsx` | Paged, searchable list | `GET /api/admin/employees?page&pageSize&q&mode` | search debounce 300 ms; "Couldn't load employees. Try again." |
| `AddEmployeeForm.tsx` | Create employee (mode, home location, shift, optional face photo) | `POST /api/admin/employees` | **PIN shown once**; copy needs HTTPS/localhost |
| `BulkAddEmployeeForm.tsx` | CSV import | `POST /api/admin/employees/bulk` | CSV only (`.xlsx` rejected with a hint), max **1 MB**; result CSV with PINs matched **by row order** |
| `EmployeeActions.tsx` | Regenerate PIN, reset code, activate/deactivate, face on/off/exempt, approve/clear device | `PATCH /api/admin/employees/{id}` `{action}` | **Never checks the result** — a failed action just refreshes |
| `ManualEntryButton.tsx` | Admin manual entry (7 days back) | `POST …/{id}/manual-entry` | – |
| `ManualEntriesWorkspace.tsx` | Employees' manual-entry requests | `PATCH /api/admin/manual-entry-requests/{id}` | – |
| `ShiftScheduleEditor.tsx` | One employee's week (0 = Sunday) | `PUT …/{id}/shift-schedule` | – |
| `EmployeePicker.tsx` / `MultiEmployeePicker.tsx` | Search & pick employees | – | client-side only |
| `WfhLocationTable.tsx` | WFH / Hybrid home locations (+ 2nd home for WFH) | `PATCH …/{id}` actions | remove ignores failures |
| `FieldLocationTable.tsx` | Field ("Anywhere") roster | `PATCH …/{id}` `set-field-mode` / `clear-wfh-location` | remove ignores failures |
| `OfficeLocationForm.tsx` + `OfficeLocationMap.tsx` | Office lat/lng/radius with draggable map | `PUT /api/admin/office-location` | defaults to Delhi 28.6139, 77.209 / 50 m; tries browser location; marker icons from unpkg CDN |

### 15.4 Field workers & location history
| Component | What | API & timing | Gotchas |
|---|---|---|---|
| `FieldWorkersPanel.tsx` | Roster + Journey / Assign switch | – | – |
| `VisitedPlacesPanel.tsx` | Day's route, stops, odometer vs GPS km, reimbursement | `GET …/{id}/visited-places[?date]`, `PUT …/{id}/reimbursement`, visit photos | jumps to `mostRecentDataDate` if today is empty; reimbursement uses odometer when both readings exist, else GPS |
| `VisitedPlacesMap.tsx` | Route map: gaps > 5 min dashed, direction arrows, km markers, nearby places | `GET /api/admin/places-nearby` at zoom ≥ 15, debounce 600 ms | nearby cache 3000 entries |
| `VisitDatePicker.tsx` | Month calendar with active days | `GET …/{id}/field-visit-days?month=[&any=1]` | errors → empty (silent) |
| `FieldExportDialog.tsx` | Excel export | `GET /api/admin/field-workers/export` | max 31 days |
| `AssignPlacesPanel.tsx` + `AssignPlacesMap.tsx` | Assign a day's places (search, map click, nearby, pasted link) | `GET/PUT …/{id}/assigned-places`, `places-search` (3+ chars, 600 ms), `places-parse-link`, `office-location` | max 40; same spot within ~15 m rejected; unsaved-changes confirm |
| `LocationHistoryPanel.tsx` | Hybrid/WFH route history (7-day chips + calendar) | `GET …/{id}/visited-places?view=route` | stale responses ignored |

### 15.5 Attendance calendar
`AttendanceCalendar.tsx` (dashboard calendar tab, employee page). Groups by the day the **session started** (overnight
check-out stays on its check-in day). Shows segments (TRANSIT not counted), pause reasons (geofence / permission /
**break** from resume), face badges, offline flags, leave/holiday labels. With `editable`, admin edits times →
`PATCH /api/admin/attendance/{id}`. Photos → `GET /api/attendance/{id}/photo`.

### 15.6 Requests & notifications
| Component | Page | API |
|---|---|---|
| `LeaveRequestsPanel.tsx` | `/admin/leave` | `PATCH /api/admin/leave-requests/{id}` `{decision, note}` |
| `HolidayManager.tsx` | `/admin/leave` | `POST /api/admin/holidays`, `DELETE …/{id}` (result not checked) |
| `LeaveBalancesTable.tsx` | `/admin/leave-balances` | none ("running low" = < 2 days) |
| `OvertimeStatusPanel.tsx` / `OvertimeHistoryList.tsx` | `/admin/overtime` | `PATCH /api/admin/overtime-requests/{id}` (+ photo) |
| `PermissionsWorkspace.tsx` | `/admin/permissions` | `PATCH /api/admin/timed-permissions/{id}` |
| `SupportTicketList.tsx` | `/admin/support` | `PATCH /api/admin/support/{id}` `{status, adminNote}` (resolve pushes to employee), photo |
| `NotificationsList.tsx` | `/admin/notifications` | `DELETE /api/admin/notifications` (hides for **all admins**); permission items approve/decline |

### 15.7 Shifts
| Component | API | Gotchas |
|---|---|---|
| `ShiftTable.tsx` | `POST/PATCH/DELETE /api/admin/shifts…`, `PATCH …/{id}/assignments` | roster edits optimistic, roll back on failure ("Couldn't save the change."); delete result not checked; equal start/end rejected; end ≤ start = overnight |
| `BulkAssignModal.tsx` | `POST /api/admin/shifts/{id}/bulk-assign` | warns about conflicting shifts, doesn't block |

### 15.8 Settings & account
| Component | API | Notes |
|---|---|---|
| `AppSettingsForm.tsx` | `PUT /api/admin/settings` | check-out photo, offline check-in; toggle reverted on error |
| `LatenessThresholdForm.tsx` / `OutsideAlertForm.tsx` / `LeaveQuotaForm.tsx` / `ReimbursementRateForm.tsx` | `PUT /api/admin/settings` | 1–480 min / 0–480 (0 = off) / whole numbers / ≥ 0 |
| `AdminsPanel.tsx` | `POST /api/admin/admins` | no remove |
| `ApiKeysPanel.tsx` | `POST` / `DELETE /api/admin/api-keys` | key shown once; revoke failure silent |
| `OrgCodePanel.tsx`, `PlanPanel.tsx`, `BillingEmailForm.tsx` | – / – / `PUT /api/admin/billing-email` | org code copy; plan link to `/plans` |
| `ChangeAdminPasswordForm.tsx` | `POST /api/admin/account/password` | signs out after 2 s (all sessions invalidated) |
| `KioskDevicesPanel.tsx` | `POST` / `DELETE /api/admin/kiosk-devices` | pairing code shown once (15 min) |

### 15.9 Kiosk, camera & My Page
| Component | What | API & timing | Gotchas |
|---|---|---|---|
| `CameraCapture.tsx` | Front camera → JPEG (q 0.7) | `getUserMedia` | **needs HTTPS or localhost**; "This device doesn't support camera access." / "Camera access is required…" |
| `EmployeeCheckIn.tsx` | My Page check in / out / **Check in again** (resume) | `GET /api/kiosk/status`, `GET /api/kiosk/office-location`, `POST /api/kiosk/scan` (`mode:"session"`, no PIN) | geolocation high accuracy 10 s then rough fallback; sends `accuracy`; starts/stops browser tracking (`lib/locationTracker`); keeps a screen **Wake Lock** while working — tracking stops if the tab closes or phone locks |
| `mypage/RequestButtons.tsx` | Leave / permission requests from My Page | `POST /api/mobile/me/leave-requests`, `POST /api/mobile/me/timed-permission` (web session accepted) | dates in IST |
| `mypage/MyPageSidebar.tsx`, `MyPageTabs.tsx`, `MyPageCards.tsx` | Sidebar (section links + change PIN), Calendar/Activity/Requests tabs (weeks start Monday), insight & leave cards | – | styles `app/my-page/mypage.css` (`--mp-*` vars) |
| `ChangePinButton.tsx` | Employee PIN change | `POST /api/my-page/change-pin` | signs out mobile sessions |

---

## 16. Database (Prisma schema)

`prisma/schema.prisma` (PostgreSQL). Client: `lib/prisma.ts` — pool **max 5** (`DB_POOL_MAX`), and **photo columns are omitted by default**
(`attendance.photo`, `fieldVisit.photo`, `overtimeRequest.photo`, `supportTicket.photo`, `user.profilePhoto`) — add new photo columns there too
(a missed one caused a Supabase egress overage). Use `omit: { photo: false }` to read them.

### Models
| Group | Models |
|---|---|
| Kiosk | `KioskDevice` (org, name, `pairingCodeHash` + `pairingExpiresAt` until paired, `tokenHash` unique once paired, `pairedAt`, `lastUsedAt`; cascades on org delete) |
| Resume | `AttendanceResume` (one row per "Resume work": the undone check-out's time/photo/odometer/face + the resume's photo/face/location; indexed by `attendanceId` and `(userId, resumedAt)`); `AttendancePause.isBreak` = gap between check-out and resume |
| Tenant/users | `Organization` (slug, status, plan, trial), `User` (admins & employees; PIN/password hashes, `passwordChangedAt`, `tokenVersion`, device binding, work mode, home/home2, face flags, `active`/`deactivatedAt`), `UserToken` (activation/reset) |
| Auth infra | `RateLimitBucket`, `RefreshToken`, `PaymentEvent` |
| Diagnostics | `CheckInAttempt` (every scan attempt), `AttendanceEvent` (auto-checkout, manual entry, push sent) |
| Billing | `SignupCheckout`, `PlanChangeCheckout`, `OrganizationApiKey` |
| Shifts | `Shift`, `ShiftAssignment` (user × weekday), `ShiftReminder` |
| Attendance | `Attendance` (one row per CHECK_IN/CHECK_OUT, unique user+type+dayKey; photo, lateness, face, offline, odometer, tracking token), `AttendancePause`, `TimedPermission`, `OvertimeRequest`, `WorkSegment`, `ManualEntryRequest` |
| Field/location | `LocationPing` (`isTrail`), `FieldVisit` (`clientId` unique), `AssignedPlace`, `PlaceNameCache`, `OfficeLocation` (one per org; none = no geofence) |
| Settings/leave/misc | `AppSettings` (one per org), `PublicHoliday`, `TimeOffRequest`, `Reimbursement`, `SupportTicket`, `PushToken`, `Meeting`, `DismissedNotification`, `DeletedEmployeeArchive` |

### Enums
`Role` ADMIN/EMPLOYEE · `OrgStatus` ACTIVE/SUSPENDED · `AttendanceType` CHECK_IN/CHECK_OUT · `AttendanceMethod` QR(legacy)/PIN/AUTO/MANUAL ·
`WorkMode` OFFICE/WFH/FIELD/HYBRID · `CheckInMode` OFFICE/FIELD/HOME/TRANSIT · `LeaveType` NONE/PERMISSION/HALF_DAY ·
`FaceVerifyStatus` NOT_CHECKED/MATCHED/MISMATCH/UNAVAILABLE · `TimeOffType` CASUAL/SICK/EARNED · request statuses PENDING/APPROVED/REJECTED(/CANCELLED) ·
`AssignedPlaceStatus` PENDING/VISITED/SKIPPED · `WorkSegmentStartMethod` CHECKIN/AUTO/MANUAL · billing statuses.

### Migrations
46 migrations in `prisma/migrations/` from `20260902_init` to `20261126000000_multiple_resumes` (organizations, billing, partner API,
offline check-in, tracking token, hybrid, check-in attempt log, attendance events, second home, device binding, meetings,
then: `20261121000000_password_changed_at`, `20261123000000_kiosk_devices`, `20261125000000_attendance_resume`,
`20261126000000_multiple_resumes` (drops the one-resume-per-day unique index)).
⚠ **Apply new migrations to every database** (`npx prisma migrate deploy`) before deploying code that uses them.
Note: two migrations share timestamp `20261021000000`.

---

## 17. lib/ reference

| File | What it does |
|---|---|
| `prisma.ts` | Prisma client, pg pool, photo omit |
| `auth.ts`, `auth.config.ts`, `requireAdmin.ts`, `freshSignIn.ts`, `safeCallbackUrl.ts` | Web auth |
| `mobileAuth.ts`, `pinReset.ts`, `userToken.ts`, `trackingToken.ts`, `refreshTokenCleanup.ts`, `deviceBinding.ts` | Tokens / device |
| `credentials.ts` | PIN hashing, lookup hash, PIN generation, employee code allocation |
| `rateLimit.ts`, `cors.ts`, `readJsonBody.ts`, `clientInfo.ts`, `loadtestGuard.ts` | Request helpers |
| `organization.ts`, `orgSlug.ts`, `settings.ts`, `trial.ts`, `trialWatch.ts`, `isProduction.ts`, `appUrl.ts`, `marketingSiteUrl.ts` | Org & config |
| `email.ts`, `emailTemplates.ts`, `emailAssets.ts` (generated) | Email |
| `faceVerify.ts` | Face service client (verify, embed, delete, health) — fails open |
| `istTime.ts`, `shiftTime.ts`, `shiftAssignment.ts`, `activeSession.ts`, `attendanceHours.ts` | Time, shifts, worked hours |
| `autoCheckout.ts`, `shiftReminders.ts`, `trackingWatch.ts`, `stationaryWatch.ts`, `employeeCleanup.ts` | Background jobs |
| `meetings.ts`, `offlineCheckIn.ts`, `pauseReplay.ts`, `manualEntry.ts`, `timeOff.ts`, `attendanceEvents.ts` | Attendance rules |
| `geofence.ts`, `geofenceTarget.ts`, `hybridSegments.ts`, `locationClustering.ts`, `locationTracker.ts` (browser kiosk) | Location |
| `adminNotifications.ts`, `adminCounts.ts` | Admin alerts (computed live) & badges |
| `pushNotifications.ts` | Expo push (never throws, logs `PUSH_SENT`) |
| `geocoding.ts`, `placeSearch.ts`, `routing.ts`, `nearbyPlaces.ts`, `assignedPlaces.ts`, `placeOrder.ts`, `visitedPlaces.ts`, `mapLinks.ts` | Places & routing |
| `photoUpload.ts`, `csv.ts`, `bulkEmployeeCsv.ts`, `pagination.ts`, `greeting.ts` | Misc |
| `billing/*` | plans (INR, GST 18 %), quote, gateway (fake only), provision, plan change, holds, cleanup |
| `partnerApi/*` | API keys, auth, responses, daily attendance builder |
| `kioskDevice.ts` | Kiosk pairing: 8-char codes (15 min), device tokens, `resolveKioskDevice(req, orgId)` via header `x-kiosk-device` |
| `resumeLimit.ts` | `MAX_CHECKINS_PER_DAY = 6`, `MAX_RESUMES_PER_DAY = 5` |
| `sessionVersion.ts` | `isAdminSessionStale` (password changed after sign-in; 30 s cache), `forgetPasswordChange` |
| `webEmployee.ts` | `requireWebEmployee` (My Page session as employee proof), `requireEmployee` (mobile bearer or web session) |

### 17a. Scripts (`scripts/`)

| Script | When to use |
|---|---|
| `node scripts/find-face-duplicate.mjs <photo.jpg> [EMPxxx]` | Find which enrolled employee a photo matches (suspected duplicate enrollment). Needs `DATABASE_URL` + reachable `FACE_VERIFY_URL`. Read-only |
| `scripts/fix-overnight-checkout-daykeys.sql` | One-time repair for overnight-shift check-outs saved under the wrong `dayKey`. Run step 1 (preview) first; step 2 (update) is commented out |
| `node scripts/set-seed-admin-password.cjs` | Sets the password of `SEED_ADMIN_EMAIL` to `SEED_ADMIN_PASSWORD` from `.env` (seed only creates the admin once). Writes directly to the DB in `DATABASE_URL` — careful which DB it points at |

### 17b. Design system (`design-system/`)

The **target brand**, taken from the mobile app's "Inzivo Redesign" theme. Start with `design-system/BRAND.md`.
- Files: `BRAND.md` (rules), `tokens.json` / `tokens.css` (`--inzivo-*`) / `tokens.ts`, `logo.svg` (the "Z-gate" mark), `components/reference.html` (open in a browser for a live visual sheet).
- Key rules: brand orange `#ef6c00`; background `#FBF9F7`; **primary buttons are outlined, never filled**; solid fill only on dark "presence" panels; semantic colours always with a 10 % tint background; Inter font; spacing 4/8/16/24/32/48; radius 8 default (12/16 larger, 14 for sheets/dialogs, 999 pills); min tap height 50 px.
- ⚠ **Known inconsistency:** the web admin/kiosk (`app/globals.css`) still uses an older palette ("Nocturne": `#e8eaf2` background, `#f06400` orange). Use the tokens in `design-system/` for new UI, not `globals.css`.

**`app/globals.css` (487 lines) — what is actually in it** (this is the CSS the web app really uses):
| Lines | Content |
|---|---|
| 1 | `@import "tailwindcss"` (Tailwind v4, configured in CSS — there is no `tailwind.config` file; only `postcss.config.mjs`) |
| 9–17 | `:root` light tokens: `--background #e8eaf2`, `--foreground #292b31`, `--color-muted`, `--color-muted-2`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-soft` |
| 20–44 | `@theme inline`: maps the tokens to Tailwind classes (`bg-surface`, `text-muted`, `border-border` …), `--color-primary #f06400`, `--color-primary-dark #c05000`, font Inter (`--font-inter`), mono Geist, **custom breakpoints** `sm 500px`, `md 768px`, `lg 1100px`, `xl 1440px` (not Tailwind defaults) |
| 47–137 | `body`, `.fade-rule`, logo animations (`.logo-anim-*`), sign-in page animations (`.auth-grid`, `.auth-blip`, `.auth-chip`, `.auth-sweep`, `.auth-pulse`) |
| 149–~245 | Admin canvas background and **admin dark mode**: `html[data-admin-theme="dark"] .admin-root { … }` redefines the tokens and also **overrides Tailwind colour scales** (`--color-slate-*`, `--color-orange-*`, `--color-red-*`, `--color-amber-*`, `--color-emerald-*`, `--color-indigo-*`, `--color-sky-*` as translucent tints), plus `--admin-card #151821` |
| 249–271 | `.no-scrollbar`, product-tour animations (`.tour-card`, `.tour-pulse`) |
| 298–329 | Leaflet map styles: `.leaflet-container`, tooltip labels `.vp-label`, `.vp-hover`, pulsing marker `.vp-pulse` |
| 338–365 | `.admin-root select` (dark-mode dropdowns), lucide icon stroke width 1.7 |
| 369–421 | Page/list animations: `.page-enter`, `.admin-stagger`, `.lift`, calendar `.cal-swap` / `.cal-day`, loading `.skeleton` |
| 428–487 | Landing/kiosk animations: `.lp-rise`, `.lp-float`, `.lp-ring`, `.lp-scan`, PIN-dot fill `.lp-dot` (`lp-d1`…`lp-d4`), `.lp-result`, `.lp-grid` |

Every animation block has a `@media (prefers-reduced-motion: reduce)` override that turns it off.
**Where to look:** a colour looks wrong only in admin dark mode → the `data-admin-theme="dark"` block (because it re-maps
Tailwind's own `slate/orange/red…` classes, a component that uses e.g. `bg-red-50` looks different in dark mode). A layout
breaks at an odd width → remember the custom breakpoints above. Map label styling → the `.leaflet-*` / `.vp-*` block.

### 17c. Reports (`reports/`) — business documents, not used by code

All files were opened and read. ⚠ Several contain real-looking employee names/emails — don't share them outside the team.

| File | What's inside | Up to date? |
|---|---|---|
| `Inzivo_tech_stack.pdf` (2 pp) | Prepared for a security/performance test. Three parts: Android app, backend (admin + kiosk), face service. Backend Next.js 16.4.1, React 19.2, Prisma 7.9 + pg adapter, Postgres on Supabase (Tokyo region), NextAuth v5, Zod 4, sharp, Leaflet; jose HS256 mobile tokens 15 min / 30 days; bcrypt; cron every 5 min. Mobile RN 0.81 / Expo 54 / EAS APK. Face service FastAPI + InsightFace/ArcFace on port 8000 (fails open). Hosting: one AWS EC2 (4 vCPU / 8 GB), nginx, pm2, health check `/api/health` | **Current** — versions match `package.json` |
| `inzivo-architecture-cost.pdf` (3 pp, USD) | System diagram, monthly cost table (**≈ USD 115–142 / month**, EC2 ≈ 80 %), cost per employee at 25/100/250/500, cost drivers, savings. Lists Supabase, MongoDB Atlas (face data), Resend, Expo push, OSM/Esri tiles | Superseded by the INR version |
| `inzivo-architecture-cost-inr.pdf` (4 pp, INR) | Same in rupees (**≈ INR 11,160–13,770 / month**), plus a page on onboarding a new 100-employee org (+≈ INR 2,720 / month) and optional upgrades | Current cost reference |
| `inzivo-architecture-diagrams.pdf` (5 pp) | System overview; Office/WFH/Field rules matrix; check-in flow; ping/geofence/auto-pause flow; field tracking pipeline (10 s GPS, 200 m place merge, 5-min gap rule, odometer accuracy) | ⚠ **Outdated:** no HYBRID mode (added 10 Nov 2026) |
| `inzivo-feature-overview.pdf` (6 pp, "code as of 10 Oct 2026") | Marketing site, admin console, mobile app, backend, reports, hosting; notes payment gateway and verified email domain "on hold" | ⚠ Predates HYBRID |
| `inzivo-development-timeline.pdf` (1 p) | 8-week Nov–Dec grid: security/launch prep, payment gateway, tenant management, privacy → mobile/field testing, load test, pilot + Play Store, release | Plan only |
| `inzivo-launch-plan.pdf` (2 pp, 27 Oct 2026) | Pre-launch checklist (MUST/SHOULD/CONFIRM: HTTPS only, privacy policy, backups, app ID, Play Store listing, offline check-in, payment gateway, tests, shared rate limiter, load test, pilot) and a 9-week plan 2 Nov–31 Dec 2026 (feature freeze 27 Nov, RC 24 Dec, launch ready 31 Dec) | Partly open: the mobile `app.json` still has cleartext traffic, `RECORD_AUDIO` and the `com.anonymous.checkinapp` ID; offline check-in is now built |
| `inzivo-project-portfolio.pdf` (28 pp, Oct 2026) | Full sales/portfolio deck: business case, product figures (98 endpoints, 12 admin screens, 15 app screens, 31 tables), features, architecture, security, GPS accuracy test, roadmap | ⚠ Says "AWS Mumbai / PostgreSQL 17" while the tech-stack doc says Supabase Tokyo. Superseded by v2 |
| `inzivo-project-portfolio-v2.pdf` (10 pp) | Condensed deck + roadmap page | ⚠ **Claims more than the code has:** says payment gateway, verified email domain and a "live-face check" are delivered — the code has only the fake billing adapter (`lib/billing/adapters/fake.ts`) and no liveness check |
| `attendance_EMP111-EMP142_last7days.pdf` (1 p) | 7-day attendance grid 11–17 Nov 2026 for 31 employees: code, name, mode (OFC/HYB/WFH), daily in/out with late / auto / next-day flags, In / Not in / No out counts | Current sample of the attendance export |
| `inzivo-competitor-analysis.xlsx` (5 sheets) | At a Glance (vs Keka, greytHR, Zoho People, Truein, Connecteam, Hubstaff); Prices (₹); What to Improve (priority list); Competitor Details; Inzivo Feature Lists | Business doc |
| `field-tracking-accuracy-data-usage.xlsx` (4 sheets, 7 Oct 2026) | Summary (data use per GPS interval, e.g. 10 s ≈ 0.60 MB/day); Accuracy records (odometer vs GPS distance, one 135 km trip 98.4 % accurate); Interval simulation (15–300 s); Data usage findings (recommends 15 s) | Useful background for § 10.2 tuning |
| `bulk-add-employees.csv` | Header `Name,Email,WorkMode,HomeLatitude,HomeLongitude,HomeRadius`; 11 OFFICE rows. Use as a template for the admin bulk import (`employees/bulk`, ≤ 50 rows) | Template |
| `app-screens/*.png` (8) | Login, dashboard, check-in, places, navigation, requests, history, profile. `_illustrative.txt` says they are **drawn designs, not real screenshots** | Design mock-ups |

**Which to trust:** for facts, trust the code and this document first, then `Inzivo_tech_stack.pdf` and the INR cost PDF.
The diagrams, feature overview and portfolio decks are older snapshots and may describe things differently.

---

## 18. External services

| Service | Used for | Config | If it's down |
|---|---|---|---|
| PostgreSQL (Supabase) | everything | `DATABASE_URL` | app fails; `/api/health` 503; rate limiter throws too |
| Face verify service (InsightFace, via Tailscale) | `/verify`, `/embed`, delete | `FACE_VERIFY_*` | check-ins **allowed** with `UNAVAILABLE`; `FACE_SERVICE` / `FACE_MISSED` notifications (the banner component is no longer mounted) |
| Expo Push (→ FCM) | all pushes | none (tokens from app) | silently not delivered; see `AttendanceEvent` `PUSH_SENT` |
| Resend | emails | `RESEND_API_KEY`, `EMAIL_FROM` | prod throws on send; dev logs to console |
| openrouteservice | routes, matrix, place search | `ORS_API_KEY` | straight-line fallback; search falls back to Nominatim |
| Nominatim (OSM) | reverse geocode / search | — (1 req/s) | unnamed places |
| Overpass | nearby places on admin map | — | 502 from `places-nearby` |
| OSM / ArcGIS tiles, unpkg | web maps | CSP allows them | blank map tiles |

---

## 19. Important constants

| Constant | Value | File |
|---|---|---|
| Mobile access / refresh token | 15 min / 30 days | `lib/mobileAuth.ts` |
| PIN length | 6–10 digits | `lib/credentials.ts` |
| PIN guess limit | 10 / 5 min, 30 / hour | `lib/rateLimit.ts` |
| Scan / status / location IP limits | 20 / 60 / 120 per min | routes |
| Body limit / photo limit | 6 MB / 4 MB, resized to 640 px | `lib/photoUpload.ts` |
| Photo retention | 45 days | `kiosk/scan` |
| Offline max age / future slack | 6 h / 2 min | `lib/offlineCheckIn.ts` |
| Geofence default radius | 50 m (hybrid home 100 m) | `lib/geofence.ts` |
| Ping accuracy cut-off | 150 m | `pauseReplay.ts`, location route |
| Auto-pause | 3-ping streak, gaps ≤ 5 min, 10 min grace | `lib/pauseReplay.ts` |
| Live threshold | 3 min | `components/DashboardWorkspace.tsx` |
| Hybrid transit window | 45 min | `lib/hybridSegments.ts` |
| Auto-checkout | warn +10 min after target, check out +5 min after warning, 36 h lookback | `lib/autoCheckout.ts` |
| Silent tracking | 10 min, re-alert 30 min, give up 6 h | `lib/trackingWatch.ts` |
| Shift reminders | 10 min before; 5–60 min after | `lib/shiftReminders.ts` |
| Deactivated employee deletion | 7 days | `lib/employeeCleanup.ts` |
| PIN reset code | 24 h, 5 tries; reset token 10 min | `lib/pinReset.ts` |
| Trial | 7 days, 5 employees | `lib/trial.ts` |
| Assigned places | max 40 / day | `lib/assignedPlaces.ts` |
| Manual entry window | 7 days back | `lib/manualEntry.ts` |
| CSV row cap | 50,000 | `lib/csv.ts` |
| Partner API | 120 req/min per org | `lib/partnerApi/withAuth.ts` |
| DB pool | 5 per process | `lib/prisma.ts` |
| Check-ins per day (resume) | 6 (= 5 resumes) | `lib/resumeLimit.ts` |
| Browser location tolerance | accuracy ≤ 300 m accepted | `kiosk/scan`, `kiosk/status` |
| Kiosk pairing code | 8 chars, 15 min; max 20 devices / org | `lib/kioskDevice.ts`, admin route |
| Activation link / password reset link | 72 h / 60 min | `api/register`, `api/password-reset/request` |
| Paid checkout hold | 45 min | `api/signup/checkout`, `lib/billing/planChange.ts` |
| Admin session version cache | 30 s | `lib/sessionVersion.ts` |

---

## 20. Logging & diagnostics tables

Use these first when investigating a user complaint:

| Where | What you learn |
|---|---|
| **`CheckInAttempt`** table | Every check-in/out attempt with `outcome`, `reasonCode` (INVALID_PIN, OUTSIDE_AREA, MOCK_LOCATION, FACE_MISMATCH, OFFLINE_*, ALREADY_CHECKED_IN, …), HTTP status, source (KIOSK/MOBILE), IP, coordinates, app version/device, duration. ⚠ reasonCode is derived from the error **message text** — changing a message can change its code. |
| **`AttendanceEvent`** table | `AUTO_CHECKOUT` (with `detail.trigger`: STALE_PREVIOUS_DAY, PERMISSION_END, SHIFT_END, OVERTIME_END), `AUTO_CHECKOUT_WARNING`, `MANUAL_ENTRY`, `PUSH_SENT` (devices / delivered / errors), `WORK_RESUMED` |
| `AttendanceResume` | every "Resume work": which check-out was undone and when, face status of the resume |
| `KioskDevice` | paired kiosks, `pairedAt`, `lastUsedAt` (is the kiosk still in use?) |
| `CheckInAttempt.source` | `KIOSK`, `MOBILE` or **`WEB`** (My Page); new reason codes `RESUME_REJECTED`, `LOCATION_IMPRECISE` |
| `LocationPing` | raw pings (`isTrail` for field samples) |
| `AttendancePause`, `WorkSegment` | why time was paused / which segment |
| `RateLimitBucket` | key like `scan:<ip>`, `pin-guess:<org>:<code>` — delete a row to unblock |
| `RefreshToken`, `User.tokenVersion`, `User.boundDeviceId/pendingDevice*` | session / device problems |
| Server logs (Vercel / terminal) | lines like `[POST /api/kiosk/scan] Unhandled error`, `[employeeCleanup]`, `[partner-api] Unhandled error`, `[GET /api/health]` |
| `/api/health` | DB and face-service status |
| Prisma query logs | in development (`.dev-server.log`) |

Request headers from the mobile app (`X-App-Version`, `X-App-Device`, `X-App-Platform`, `X-App-Device-Id`) identify which build/phone sent a request.

---

## 21. Troubleshooting — where to find the issue

| Symptom | Likely cause | Look here |
|---|---|---|
| Server won't start: "Missing required environment variable" | `DATABASE_URL` / `MOBILE_JWT_SECRET` | `instrumentation.ts`, `.env` / Vercel env |
| Every mobile request 401 | `MOBILE_JWT_SECRET` changed/missing, token expired & refresh failed | `lib/mobileAuth.ts`, `mobile/refresh` |
| Bare 500 from Prisma on first query | DB URL wrong / DB down / pool exhausted (`EMAXCONNSESSION`) | `lib/prisma.ts` (`DB_POOL_MAX`), DB provider dashboard, `/api/health` |
| Many 429 from one office | all clients share an IP / wrong `TRUSTED_PROXY_HOPS` | `lib/rateLimit.ts`, `RateLimitBucket` |
| Employee "Not recognized" | wrong PIN/code, inactive, wrong org | `CheckInAttempt` (`INVALID_PIN`), `User.active` |
| Employee locked out of PIN | PIN-guess buckets | `RateLimitBucket` `pin-guess:*` |
| "Registered to a different phone" | device binding | admin → employee page → Approve/Reset device; `lib/deviceBinding.ts` |
| Login asks to set PIN | `pinMustChange` (new employee / regenerated PIN) | expected — app uses set-initial-pin |
| "Outside the permitted area" but user is there | wrong office/home coords or radius, GPS accuracy | `/admin/office-location`, employee home location, `lib/geofenceTarget.ts` |
| Check-in passed without face check | face service down → `UNAVAILABLE` | `FACE_VERIFY_URL`, `/api/health`, `/admin/notifications` (FACE_SERVICE / FACE_MISSED), "face skipped" badge on the dashboard status tab |
| Face mismatch for the right person / suspected duplicate | bad enrollment | re-enroll via employee page; `scripts/find-face-duplicate.mjs` |
| Employee shows Offline on dashboard | no ping in 3 min: phone killed app, no network, token 403 | `LocationPing` for user; mobile app tracking; `kiosk/location` 403 (tracking token) |
| Pings arriving but no auto-pause | accuracy > 150 m, gaps > 5 min, approved permission active, HYBRID in transit, FIELD not in OFFICE segment | `kiosk/location`, `lib/pauseReplay.ts` |
| No auto check-out / no shift reminders / no trial emails | cron not called or `CRON_SECRET` mismatch | external scheduler → `/api/cron/tracking-watch` |
| Strange auto check-out | see `AttendanceEvent` AUTO_CHECKOUT `detail.trigger` | `lib/autoCheckout.ts`, `kiosk/scan` stale close, `kiosk/location` permission end |
| Overnight shift check-out blocked | wrong `dayKey` on old rows | `scripts/fix-overnight-checkout-daykeys.sql`, `lib/activeSession.ts` |
| Push not received | no `PushToken`, Expo/FCM issue | `AttendanceEvent` `PUSH_SENT`, `PushToken` table, `lib/pushNotifications.ts` |
| Emails not arriving | Resend key / sender domain | `lib/email.ts`, Resend dashboard |
| Photo returns 404 | older than 45 days (deleted) | `expireOldPhotos` in `kiosk/scan` |
| Offline check-in rejected | `OFFLINE_*` codes | `AppSettings.offlineCheckInEnabled`, `lib/offlineCheckIn.ts` |
| Timed permission had no effect | not APPROVED by admin | `/admin/permissions` |
| Can't add employee (403) | trial limit (5) | `lib/trial.ts`, `/plans` |
| Admin logged out when opening new tab | `TabSecurity` (by design) | `components/TabSecurity.tsx` |
| Badges/notifications not updating instantly | per-instance cache 5–15 s | `badge-counts` route |
| Route planning straight lines | ORS key missing / ORS down | `lib/routing.ts` |
| Admin map blank | tile CDNs blocked by network / CSP | `next.config.ts` CSP `img-src` |
| Partner integration error | API key revoked / rate limit | `requestId` in error, `OrganizationApiKey`, logs `[partner-api]` |
| Signup/payment fails in production | `BILLING_PROVIDER=fake` throws in prod | `lib/billing/gateway.ts` |
| Deleted employee data needed | archive CSV | `/admin/employees/deleted` |
| Office kiosk PC says "outside the office area" | desktop has no GPS; location from IP/Wi-Fi | pair it: `/admin/kiosk-devices` (§ 10.8); check `localStorage.kiosk_device_token` on the kiosk |
| Paired kiosk stopped working as "at office" | device removed by admin / token lost (browser data cleared) | `KioskDevice` row, re-pair with a new code |
| "Your device could only locate you to within about N m" | browser accuracy > 300 m | user turns on Wi-Fi/location; or pair the kiosk |
| "Check in again" / resume refused | offline, limit of 6 check-ins, shift ended, not checked out | § 10.7, `lib/resumeLimit.ts`, `CheckInAttempt` `RESUME_REJECTED` |
| Resume not offered at all | `AttendanceResume` migration not applied | server log `[status] resume lookup failed`; run `prisma migrate deploy` |
| Worked hours lower after a resume | the gap is a break (`AttendancePause.isBreak`) | expected |
| Admin signed out everywhere | password changed or reset (`passwordChangedAt`) | expected; § 8 |
| Admin can't sign in after resetting | reset link expired (60 min) or already used (`invalid_or_expired`) | request a new link; `UserToken` table |
| Activation email never arrived | Resend failure (`emailSent:false`) or link expired (72 h) | `/activate` → resend form; logs `[POST /api/register] Failed to send the activation email` |
| "Organization code already taken" but no such org | slug held by an in-progress paid checkout (45 min) | `SignupCheckout` (status PENDING, `holdExpiresAt`) |
| Payment done but org/plan not created | webhook failed / NEEDS_ATTENTION (amount mismatch) | `PaymentEvent.outcome`, `SignupCheckout`/`PlanChangeCheckout` status, webhook logs |
| Error page shows "Reference: …" | production hides the message | search the digest in server logs |
| "Too many connections" / `EMAXCONNSESSION` | session pooler limit (15) | set `DATABASE_POOL_URL` (transaction pooler) or lower `DB_POOL_MAX` |

---

## 22. Known quirks / gaps

- **No `.env.example`** in this folder (README and `lib/appUrl.ts` refer to it).
- **README is partly outdated** (§ 1).
- **No cron schedule configured** in the repo — something external must call `/api/cron/tracking-watch`.
- `instrumentation.ts` daily cleanup assumes a long-lived server; on Vercel it runs only on cold starts.
- **Real payment gateway not implemented** (fake only; throws in production).
- No automated tests; only `npm run lint`.
- Several routes have no top-level try/catch (kiosk/location, kiosk/status, mobile data routes) → unexpected DB errors are bare 500s.
- Admin `support` GET passes `?status` to Prisma unvalidated; `holidays` GET doesn't validate `?year`.
- `UserToken` schema comment says "activation only" but PASSWORD_RESET exists.
- Seed script prints the admin password.
- Duplicate migration timestamp `20261021000000` (works, runs alphabetically).
- `eas.json` here is unused (Expo leftover).
- ⚠ **`AttendanceResume.checkOutPhoto` and `resumePhoto` are not in the default photo `omit` in `lib/prisma.ts`**, so any
  query that loads AttendanceResume rows without a `select` pulls photo bytes (the same kind of mistake once caused a
  Supabase egress overage). Worth adding them to the omit list.
- The schema comment on `AttendanceResume` / `Attendance.resumes` still says "at most one per day", but migration
  `20261126000000_multiple_resumes` removed that limit (now up to 5 resumes, enforced in code).
- The mobile app does not support "Resume work" yet (web My Page only).
- Kiosk pairing codes are 8 characters / 15 min; the kiosk keeps its token in browser localStorage — clearing site data un-pairs it.
