# Changelog — org-check-in (backend & admin web)

One file for all changes. Each date has its own section, **oldest at the top, newest at the bottom**.
Use it to answer "did anything change around the time this bug started?". Full details of any commit: `git show <hash>`.

**How to add a new entry:** scroll to the bottom, add a `## YYYY-MM-DD` heading, list the commits (hash, author,
message), what changed in plain words, files touched, migrations, and which `DOCUMENTATION.md` sections you updated.
Never paste secrets (keys, `.env` values, real URLs) here.

---

## 2026-11-23

- `f25b4b6` (manoj24499) — **Admin password change.** Changing or resetting an admin password signs out all of that
  admin's sessions (`User.passwordChangedAt`, `lib/sessionVersion.ts`).
- Migration: `20261121000000_password_changed_at`.
- Docs: `DOCUMENTATION.md` § 8, § 13.2.

## 2026-11-24

- `b3510a9` (manoj24499) — **Kiosk device pairing** (`/admin/kiosk-devices`, `POST /api/kiosk/pair`, `x-kiosk-device`
  header) and **My Page redesign** with check-in from the browser.
- `f9715e4` (manoj24499) — redirect issue fix.
- Migration: `20261123000000_kiosk_devices`.
- Docs: `DOCUMENTATION.md` § 10.8, § 10.9.

## 2026-11-25

- `1f683e0` (manoj24499) — **Multiple check-ins a day** ("Resume work", up to 6 check-ins = 5 resumes).
- `58b8ef4` (sakthi5) — first full `DOCUMENTATION.md`.
- Migrations: `20261125000000_attendance_resume`, `20261126000000_multiple_resumes`.
- Docs: `DOCUMENTATION.md` § 10.7.

## 2026-11-26

Commits (all merged into branch `org-checkin` by `350304c`, 18:28):

| Time (IST) | Commit | Author | Message |
|---|---|---|---|
| 15:34 | `0324fe7` | manoj24499 | some UI changes made |
| 15:46 | `9fbfed8` | manoj24499 | DOB added |
| 18:19 | `94cd8c2` | manoj24499 | added kiosk checkin sep |
| 18:24 | `93c3586` | sakthi5 | documentation updated (docs only) |
| 18:26 | `ebbb669` | manoj24499 | rate limit and pin error added for kiosk |

⚠ **Two new migrations — run `npx prisma migrate deploy` on every database before deploying this code**:
`20261127000000_user_date_of_birth` (adds `User.dateOfBirth`) and `20261128000000_pin_failures` (new `PinFailure` table).
Without them: **the whole admin console fails to load** — `app/admin/layout.tsx` calls `getAdminNotifications()` (which
now reads `PinFailure`) with no try/catch, and so do `/admin/notifications` and `badge-counts`; the admin employee page and
the DOB save fail (they use `dateOfBirth`), My Page silently loses the birthdays list and DOB prompt (those reads are
wrapped in `safe(...)`), and every wrong PIN logs `[pinFailures] could not record:` (sign-in itself still works).

**1. Date of birth & upcoming birthdays** (`0324fe7`, `9fbfed8`)
- New column `User.dateOfBirth` (`DATE`, date only).
- My Page asks for it once with a popup that **cannot be dismissed** (`components/mypage/DobPrompt.tsx`) — the employee
  can't use My Page until a valid date is saved.
- New route `POST /api/mobile/me/date-of-birth` (mobile bearer or web session): age 14–100, saves only if empty
  (409 "Your date of birth is already saved. Ask your admin to change it."), 10 per hour per employee.
- Admin sets / corrects / clears it on the employee page (`components/EmployeeDobEditor.tsx`) →
  `PATCH /api/admin/employees/[id]` action `set-date-of-birth` (`dateOfBirth: "YYYY-MM-DD"` or `null`).
- My Page shows "Upcoming birthdays" (next 3 in the org, day and month only, "Today" / "Tomorrow" / "in N days", own row
  "You"; 29 Feb falls on 28 Feb in other years) — `components/mypage/UpcomingBirthdays.tsx`.

**2. My Page redesign** (`0324fe7`)
- The check-in card shows a **live map** (and the office circle for OFFICE / HYBRID, or WFH picking Office). When a photo
  is needed the card **flips** to the camera ("Take photo & check in / check out"); "Back to map" flips it back.
  Map: `components/mypage/LiveMap.tsx` (react-leaflet + OpenStreetMap, GPS only while visible).
- **Request Overtime** button next to Request Leave / Request Permission (`components/mypage/RequestButtons.tsx`) →
  `POST /api/mobile/me/overtime`, which (GET and POST) now also accepts the web My Page session (`requireEmployee`).
- Request buttons and the birthdays list moved inside the check-in card.
- Sidebar (`components/mypage/MyPageSidebar.tsx`): Today, Hours & overtime, Calendar & activity, Leave balances (short
  labels when collapsed); sign-out → `/login/employee`. Styling in `app/my-page/mypage.css`.

**3. Separate admin / employee sign-in + sign-in preloader** (`94cd8c2`)
- `middleware.ts`: non-admins on `/admin/*` → `/login/admin`; non-employees on `/my-page/*` → `/login/employee` (was
  `/login`). Admin sign-out → `/login/admin`; `TabSecurity` signs out to the login page of the current area.
- "Back" links removed from `/login/admin` and `/login/employee` (the `/login` picker still exists).
- Full-screen preloader after a successful sign-in ("Signing you in" / "Opening admin console"):
  `components/SignInPreloaderHost.tsx` (in `app/layout.tsx`), switched on by `lib/signInPreloader.ts`. Stays at least
  **5 s**, fades once `/admin…` or `/my-page` is open, force-hidden after 30 s. Files: `AdminPreloader.tsx`,
  `EmployeePreloader.tsx`, `admin-preloader.css`, `employee-preloader.css`.

**4. Wrong-PIN alerts for admins** (`ebbb669`)
- New table `PinFailure` (org, user, code, `source` WEB / MOBILE / KIOSK, `outcome` WRONG_PIN / LOCKED, IP), written by
  `lib/pinFailures.ts` `recordPinFailure()` — fire-and-forget; rows older than 14 days deleted on ~1 in 50 writes.
- Recorded only for a real, active employee: wrong PIN at `/api/kiosk/scan`, `/api/mobile/login`, web `employee-login`
  (`lib/auth.ts`); `LOCKED` when the PIN-guess limit already blocks the attempt.
- New admin notification `PIN_FAILURES` ("Repeated wrong PIN attempts", red "Wrong PINs"): **≥ 5 wrong PINs in 30 min**
  for one employee; dismiss key `pin:<userId>:<hour>` (`lib/adminNotifications.ts`, `components/NotificationsList.tsx`).

**5. Per-employee request rate limits** (`ebbb669`)
- `lib/actionLimit.ts` `limitEmployeeAction()` → 429 "Too many requests in a short time. Please wait a few minutes and
  try again." (bucket `emp-action:<action>:<userId>`).
- POST `me/leave-requests` 10 / h, `me/overtime` 10 / h, `me/timed-permission` 15 / h, `me/date-of-birth` 10 / h.
  Affects the mobile app and My Page.

**6. Small things**
- `lib/webEmployee.ts`: `SESSION_CHANGED_MESSAGE` ("Your sign-in has changed or expired … Reload this page and sign in
  again."); `requireWebEmployee` logs `[webEmployee] refused: …` — look for it when My Page actions return 401.

**Quirks noticed**
- The `PinFailure` model was inserted between the `CheckInAttempt` comment and the `CheckInAttempt` model in `schema.prisma`.
- The `pin_failures` migration comment says "web and phone" but kiosk failures are recorded too.
- Migration folders are dated 27 / 28 Nov although committed on 26 Nov (harmless).
- The preloader adds a fixed 5 s minimum to every web sign-in.
- The mobile app has no date-of-birth screen.

## 2026-11-28

- No code changes. `DOCUMENTATION.md` brought up to date with the 26 Nov commits (up to merge `350304c`), and this
  changelog created.
- Docs sections updated: header, § 4 (changelog folder), § 8 (login redirects, preloader, wrong-PIN recording),
  § 10.5 + new § 10.11 date of birth, § 10.12 wrong-PIN alert, § 10.13 request limits, § 11.3 (`me/date-of-birth`,
  overtime web session, 429s), § 12 (`set-date-of-birth`, `PIN_FAILURES`), § 14 (My Page, login pages), § 15 (new
  components), § 16 (`dateOfBirth`, `PinFailure`, 48 migrations), § 17 (`actionLimit`, `pinFailures`,
  `signInPreloader`, `webEmployee`), § 19–22 (constants, diagnostics, troubleshooting, quirks).
- Mobile-app docs updated too — see `../checkin-native/changelog/CHANGELOG.md`.

**Code change (later the same day, not committed yet): field workers switch Office / Field automatically on My Page**
- File: `components/EmployeeCheckIn.tsx` only. No API, schema or migration change.
- Before check-in, a FIELD employee's Office / Field toggle is picked from the browser location (inside the office
  radius → Office, outside → Field). Tapping the toggle overrides it. The office circle is always shown on their map.
- After check-in, a badge shows "Office mode" / "Field mode" from `GET /api/kiosk/status` → `segment.mode`, refreshed
  every 30 s. The switch is made by the existing server logic (`evaluateWorkSegment`, 3 pings in a row).
- Checked: `tsc` and `eslint` pass. Not yet tried in a browser with a real field employee.
- Docs: `DOCUMENTATION.md` § 10.9 (new "Field workers: automatic Office / Field"), § 15 (`EmployeeCheckIn.tsx` row).
