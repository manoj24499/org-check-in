# Inzivo Check-In — Backend & Admin Web (org-check-in) — Full Documentation

> Purpose of this file: anyone opening this folder should know **what this project does, what it is built with,
> how every part works, and where to look when something breaks**.
>
> Last updated: 25 Nov 2026. Companion mobile app docs: [`../checkin-native/DOCUMENTATION.md`](../checkin-native/DOCUMENTATION.md).
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
| `design-system/` | Brand rules (`BRAND.md`), tokens (`tokens.css/json/ts`), logo, HTML component reference. |
| `reports/` | Business documents (PDFs/XLSX: architecture, cost, launch plan, feature overview, competitor analysis, app screenshots). Not used by the code. |
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
| **Employee (web My Page)** | NextAuth Credentials `employee-login` (org code + employee code + PIN) | `lib/auth.ts` |
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

---

## 11. API reference — kiosk & mobile

### 11.1 Kiosk routes (`app/api/kiosk/`)
| Route | Auth | Purpose |
|---|---|---|
| `POST /api/kiosk/scan` | PIN in body (+ optional bearer) | Check in/out (§ 10.1) |
| `GET /api/kiosk/status` | optional bearer (bad bearer → 401) | Today's status. Anonymous kiosk call must be inside geofence and gets limited info |
| `POST /api/kiosk/location` | X-Tracking-Token / bearer | Location ping (§ 10.2) |
| `GET /api/kiosk/office-location` | public | Office geofence for an org |

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
| 500 | Internal server error | unhandled (check server logs `[POST /api/kiosk/scan]`) |

**`/api/kiosk/location` errors**: 429 (120/min), 400 zod, 404 session not found, 403 token mismatch, 200 `{tracking:false}` (user inactive / already checked out), bare 500 on DB error (no try/catch).

### 11.2 Mobile auth (`app/api/mobile/`)
| Route | Purpose | Key errors |
|---|---|---|
| `POST login` | org code + employee code + PIN → tokens | 401 invalid org / code-PIN, 403 suspended, 403 `DEVICE_MISMATCH`, 403 `PIN_CHANGE_REQUIRED`, 429 |
| `POST refresh` | rotate refresh token | 401 invalid/expired/reused, 401 inactive, 401 `DEVICE_MISMATCH` |
| `POST logout` | revoke refresh token | always success |
| `POST change-pin` | Bearer; new PIN + new tokens, other devices signed out | 403 current PIN wrong, 409 PIN taken |
| `POST set-initial-pin` | temp PIN → own PIN | 400 errors, 409 taken |
| `POST pin-reset/verify` | admin code → reset token | 400 invalid/expired, 403 too many wrong codes |
| `POST pin-reset/complete` | reset token + new PIN | 400 expired, 409 taken |

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

---

## 12. API reference — admin

All under `app/api/admin/`, auth `requireAdmin()` → 401 if not admin; other-org records → 404.

| Area | Routes |
|---|---|
| Admins / keys / settings | `admins` (GET/POST), `api-keys` (GET/POST), `api-keys/[id]` (DELETE = revoke), `billing-email` (PUT), `settings` (GET/PUT), `office-location` (GET/PUT) |
| Sidebar & alerts | `badge-counts` (GET, cached 5 s / face health 15 s per instance, `?fresh` skips), `notifications` (DELETE = dismiss for **all admins**) |
| Employees | `employees` (GET paged/search, POST create → returns PIN once), `employees/bulk` (POST ≤ 50, all-or-nothing), `employees/[id]` (GET, PATCH actions: `regenerate-pin`, `generate-reset-code`, `set-active`, `update-wfh-location`, `update-hybrid-location`, `clear-wfh-location`, `set-field-mode`, `set-face-verification`, `set-face-verification-exempt`, `approve-device`, `reset-device`), `employees/deleted/[id]/[kind]` (CSV archive) |
| Employee detail | `[id]/attendance`, `[id]/assigned-places` (FIELD only; GET/PUT ≤ 40/day, push on new places), `[id]/field-visit-days`, `[id]/leave-today` (POST/DELETE, push), `[id]/manual-entry`, `[id]/profile-photo`, `[id]/reimbursement`, `[id]/shift-schedule`, `[id]/visited-places` (route, stops, geocoding) |
| Attendance & exports | `attendance/[id]` (PATCH time only, same IST day), `attendance/export` (CSV), `leave-requests/export` (CSV), `field-workers/export` (Excel, ≤ 31 days, geocoding only ≤ 3 days) |
| Request queues (push on decision) | `leave-requests` (+`[id]`), `overtime-requests/[id]` (+photo), `timed-permissions` (+`[id]`), `manual-entry-requests/[id]`, `support` (+`[id]`, +photo), `field-visits/[id]/photo` |
| Shifts & holidays | `shifts`, `shifts/[id]`, `shifts/[id]/assignments`, `shifts/[id]/bulk-assign`, `holidays`, `holidays/[id]` |
| Map helpers | `locations/latest` (dashboard polls every 5 s), `places-nearby` (Overpass), `places-search` (ORS/Nominatim), `places-parse-link` (Google Maps links, SSRF-safe) |

Notes: no API deletes an employee — deactivate → auto-deleted after 7 days. Admin-created employee + shift = assigned Mon–Sat. Errors: 400 zod, 403 trial limit, 409 duplicates/already-reviewed, 413 large photo, 502 external place APIs.

---

## 13. API reference — signup, billing, partner, misc

| Route | Purpose |
|---|---|
| `POST /api/register`, `GET /api/register/check-slug` | Self-serve org signup (free trial) + slug availability |
| `POST /api/activate`, `POST /api/activate/resend` | Account activation from email link (resend always says ok) |
| `POST /api/password-reset/request`, `/confirm` | Admin password reset by email |
| `/api/signup/checkout`, `/status`, `/dev-pay` | Paid signup checkout (fake gateway in dev) |
| `/api/plan-change/checkout`, `/status` | Change plan/seats |
| `POST /api/billing/webhook` | Payment gateway webhook (deduped via `PaymentEvent`) |
| `POST /api/my-page/change-pin` | Web employee PIN change (signs out all mobile sessions) |
| `GET /api/attendance/[id]/photo` | Check-in photo for web session (owner or admin) |
| `GET /api/health` | `{status, checks{database, faceVerification}}` — 503 if DB down |
| `GET /api/loadtest/[probe]` | Load-test probes (`ping`, `db`, `cpu`, `face`), only if `LOADTEST_SECRET` set |
| `/api/v1/*` (partner) | `health`, `attendance`, `employees`, `calendar`, `locations`, `leave-types`, `attendance-statuses`. API key, 120 req/min per org. Errors `{error:{code,message,requestId}}` codes `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500 |

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
| `/my-page` | Employee's own attendance calendar & stats |
| `/admin/dashboard` | Live status, map, pending permissions, missed face checks, silent field workers |
| `/admin/employees`, `/admin/employees/[id]`, `/admin/employees/deleted` | Employee management |
| `/admin/field-workers`, `/admin/location-history` | Field routes/visits/assign places; Hybrid/WFH route history |
| `/admin/leave`, `/admin/leave-balances`, `/admin/permissions`, `/admin/overtime`, `/admin/meetings`, `/admin/manual-entries` | Requests |
| `/admin/shifts`, `/admin/office-location`, `/admin/settings`, `/admin/notifications`, `/admin/support` | Config & inbox |
Errors in pages: `app/error.tsx` (logs `[app/error.tsx]`), `app/global-error.tsx`.

---

## 15. Components

`components/` (admin/kiosk UI). Key ones:
- **Shell**: `AdminShell` (sidebar, badges, polls `badge-counts` every 15 s, refreshes page when signature changes), `AdminTour`, `admin/ui.tsx`, `TabSecurity`, `Providers`, `ThemeInitScript`/`ThemeToggle`.
- **Dashboard/map**: `DashboardWorkspace` (polls `locations/latest` every 5 s, `LIVE_THRESHOLD_MS` = 3 min), `AllEmployeesMap`, `LiveLocationModal` (30 s refresh), `LocationMap(Modal)`, `FullscreenMapFrame`, `PendingPermissionsPanel`, `MarkLeaveControl`, `RecentActivityList`, `FaceVerifyStatusBanner`, `TrialBanner`, `NotificationsList`.
- **Employees**: `AddEmployeeForm`, `BulkAddEmployeeForm`, `EmployeeTable`, `EmployeeActions` (PIN, reset code, face, device), `EmployeePicker`, `MultiEmployeePicker`, `ManualEntryButton`, `ManualEntriesWorkspace`, `WfhLocationTable`, `FieldLocationTable`, `OfficeLocationForm/Map`.
- **Field**: `FieldWorkersPanel`, `VisitedPlacesPanel`, `VisitedPlacesMap`, `VisitDatePicker`, `AssignPlacesPanel/Map`, `FieldExportDialog`, `LocationHistoryPanel`.
- **Attendance**: `AttendanceCalendar` (editable times for admin), `MyPageWorkspace`.
- **Requests**: `LeaveRequestsPanel`, `HolidayManager`, `LeaveBalancesTable`, `LeaveQuotaForm`, `PermissionsWorkspace`, `OvertimeStatusPanel`, `OvertimeHistoryList`, `SupportTicketList`.
- **Shifts**: `ShiftTable`, `BulkAssignModal`, `ShiftScheduleEditor`.
- **Settings**: `AppSettingsForm`, `ReimbursementRateForm`, `LatenessThresholdForm`, `OutsideAlertForm`, `OrgCodePanel`, `PlanPanel`, `BillingEmailForm`, `AdminsPanel`, `ApiKeysPanel`.
- **Auth/kiosk**: `AdminSignInForm`, `AuthSplit`, `AuthShell`, `AuthFields`, `SignOutButton`, `ChangePinButton`, `CameraCapture`, `LocationTrackerBoot`, `Logo`.

---

## 16. Database (Prisma schema)

`prisma/schema.prisma` (PostgreSQL). Client: `lib/prisma.ts` — pool **max 5** (`DB_POOL_MAX`), and **photo columns are omitted by default**
(`attendance.photo`, `fieldVisit.photo`, `overtimeRequest.photo`, `supportTicket.photo`, `user.profilePhoto`) — add new photo columns there too
(a missed one caused a Supabase egress overage). Use `omit: { photo: false }` to read them.

### Models
| Group | Models |
|---|---|
| Tenant/users | `Organization` (slug, status, plan, trial), `User` (admins & employees; PIN/password hashes, `tokenVersion`, device binding, work mode, home/home2, face flags, `active`/`deactivatedAt`), `UserToken` (activation/reset) |
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
42 migrations in `prisma/migrations/` from `20260902_init` to `20261119010000_meetings` (organizations, billing, partner API,
offline check-in, tracking token, hybrid, check-in attempt log, attendance events, second home, device binding, meetings).
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

---

## 18. External services

| Service | Used for | Config | If it's down |
|---|---|---|---|
| PostgreSQL (Supabase) | everything | `DATABASE_URL` | app fails; `/api/health` 503; rate limiter throws too |
| Face verify service (InsightFace, via Tailscale) | `/verify`, `/embed`, delete | `FACE_VERIFY_*` | check-ins **allowed** with `UNAVAILABLE`; admin banner + `FACE_SERVICE` notification |
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

---

## 20. Logging & diagnostics tables

Use these first when investigating a user complaint:

| Where | What you learn |
|---|---|
| **`CheckInAttempt`** table | Every check-in/out attempt with `outcome`, `reasonCode` (INVALID_PIN, OUTSIDE_AREA, MOCK_LOCATION, FACE_MISMATCH, OFFLINE_*, ALREADY_CHECKED_IN, …), HTTP status, source (KIOSK/MOBILE), IP, coordinates, app version/device, duration. ⚠ reasonCode is derived from the error **message text** — changing a message can change its code. |
| **`AttendanceEvent`** table | `AUTO_CHECKOUT` (with `detail.trigger`: STALE_PREVIOUS_DAY, PERMISSION_END, SHIFT_END, OVERTIME_END), `AUTO_CHECKOUT_WARNING`, `MANUAL_ENTRY`, `PUSH_SENT` (devices / delivered / errors) |
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
| Check-in passed without face check | face service down → `UNAVAILABLE` | `FACE_VERIFY_URL`, `/api/health`, dashboard "Missed face checks" |
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
