# Employee Check-In / Check-Out App

Multi-tenant attendance system built with Next.js (App Router), PostgreSQL, and Prisma. Each organization that registers gets its own fully isolated employees, shifts, settings, and attendance history — none of it is ever visible to another organization.

## Features

- **Self-serve organization signup** (`/register`) — any organization can register itself and get its own admin, with no manual setup on your part. See [Multi-tenancy](#multi-tenancy) below.
- **Kiosk mode** (`/kiosk/<organization-code>`) — public shared-device screen for one specific organization. Employees type their Employee ID + PIN to check in or out.
- **Admin dashboard** (`/admin`) — email/password login, scoped to the admin's own organization. See who's currently checked in, today's activity log, manage employees (add, deactivate, regenerate PIN), export all attendance as CSV, and add other admins to the organization.
- **Employee "My Page"** (`/my-page`) — employees log in with their organization code + Employee ID + PIN to see their own attendance history only.
- Roles are enforced by middleware; employees can never see other employees' data (in their own or any other organization), and only admins can manage employees (in their own organization only).

## Multi-tenancy

Every organization is fully isolated: its own employees, shifts, office location/geofence, leave policy, and attendance history. A new organization gets started at `/register` — no admin intervention needed. That flow creates the organization and its first admin (marked as the organization's owner) in one step; that admin can then add more admins for their own organization from **Settings**.

Every organization is identified by a short, URL-safe **organization code** (e.g. `acme-corp`) — chosen at registration, shown to admins, and used three places:

- The kiosk URL for that organization: `/kiosk/acme-corp` (bookmark this on the physical kiosk device).
- The mobile app's login screen, alongside Employee ID + PIN.
- The "My Page" web login, alongside Employee ID + PIN.

The plain `/kiosk` route (no organization code in the URL) still works, for backward compatibility with already-deployed kiosk devices — it's treated as the one organization seeded via `prisma db seed` (see below), not a general-purpose default. Every organization registered through `/register` gets its own `/kiosk/<code>` URL and should use that.

An organization's admin can suspend it (support/billing action, not exposed in the UI yet — set `Organization.status` to `SUSPENDED` directly in the database) to immediately block every login surface (kiosk, mobile, "My Page", and admin dashboard) for that organization, while its data is preserved untouched.

## 1. Prerequisites

- Node.js 20+
- A PostgreSQL database — easiest options for this deploy target:
  - [Neon](https://neon.tech) (generous free tier, serverless Postgres)
  - [Supabase](https://supabase.com)
  - [Railway](https://railway.app)

## 2. Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — connection string from your Postgres provider
- `AUTH_SECRET` — generate with `npx auth secret` or `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` for local dev; your real domain in production
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` — optional, only for `prisma db seed` below

Then create the database tables:

```bash
npx prisma generate
npx prisma migrate deploy
```

`prisma db seed` (below) is a **local-dev-only bootstrap** — it creates one "Default Organization" and its first admin directly in the database, skipping the real signup flow, so a fresh local database has something to log into immediately:

```bash
npx prisma db seed
```

A **real** organization (including this one, in production) should sign up through `/register` instead — see [Multi-tenancy](#multi-tenancy) above. Don't run `db seed` against a production database that already has real organizations in it.

Run it:

```bash
npm run dev
```

- Landing page: http://localhost:3000
- Register a new organization: http://localhost:3000/register
- Kiosk for the locally-seeded org: http://localhost:3000/kiosk
- Login: http://localhost:3000/login

## 3. Using it

1. New organization: go to `/register`, fill in your organization's name and pick an organization code (e.g. `acme-corp`) — this creates your organization and signs you in as its first admin.
2. As admin → **Employees** → **+ Add Employee**. This shows a one-time PIN — write it down or share it with the employee (e.g. via a private message). It cannot be retrieved again, only regenerated.
3. Point the kiosk device (tablet/laptop) at `/kiosk/<your-organization-code>` and bookmark it there — that URL is specific to your organization. Employees type their Employee ID + PIN.
4. Every PIN entry automatically alternates between Check In and Check Out — no separate buttons needed.
5. Employees can check their own history any time at `/my-page` (organization code + Employee ID + PIN login). Admins see everyone's status live on `/admin/dashboard`.
6. Need a second admin for your organization? Add one from **Settings → Admins**.

## 4. Deploying (Vercel + Neon/Supabase)

1. Push this project to a GitHub repo.
2. Import it into [Vercel](https://vercel.com/new).
3. Add the same environment variables from `.env` in the Vercel project settings. Set `NEXTAUTH_URL` to your production URL (e.g. `https://checkin.yourcompany.com`).
4. After the first deploy, apply migrations to the production database:
   ```bash
   DATABASE_URL="<your production url>" npx prisma migrate deploy
   ```
   (Run this from your local machine — it just needs network access to your DB.)
5. **Don't run `prisma db seed` against production** — every real organization, including your own first one, signs up through `/register` at your production URL instead (see [Multi-tenancy](#multi-tenancy) above). `db seed` is a local-dev-only shortcut.
6. If you'd rather keep this instance private to your own organization only (not offering self-serve signup to the public), put Vercel's [password protection](https://vercel.com/docs/deployment-protection) in front of `/register`, or remove/gate that route entirely.

## 5. Notes on scale

Built comfortably for ~100 employees / ~10 admins. A couple of things worth knowing as you grow:

- **Changing `prisma/schema.prisma`**: run `npx prisma migrate dev --name <short-description>` (not `db push`) — it generates a new file under `prisma/migrations/`, applies it to your local DB, and regenerates the client. Commit the generated migration folder along with your schema change. `prisma/migrations/` was baselined once against the schema as it stood at that point (a no-op migration recording what was already live, generated the same way `db push` had always kept it in sync) — no data changed, this only replaced how future changes are tracked and rolled out.
- The kiosk rate-limiter (`app/api/kiosk/scan/route.ts`) is in-memory, which is fine for a single kiosk/serverless instance under light load. If you run multiple kiosks at high volume, swap it for a Redis-backed limiter (e.g. Upstash).
- PINs and passwords are hashed with bcrypt.
- Regenerating a PIN immediately invalidates the old one.
- Check-in also rejects the request outright if the client flags the submitted location as coming from a mock-location provider (`mocked: true`) — see the mobile app's `useGeofence` for where that's detected.

## 6. Tech stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma ORM
- NextAuth v5 (Credentials provider — one for admin email/password, one for employee ID/PIN)

## 7. Mobile app

A companion Expo (React Native) app lives at `D:\projects\Native\checkin-app`
and talks to this backend directly — no separate mobile backend. It reuses
`/api/kiosk/*` for check-in/out (PIN, same as the physical kiosk) and
live location, and uses five small additive routes under `app/api/mobile/**`
(`lib/mobileAuth.ts`) for a bearer-token login/session, since NextAuth's own
`employee-login` provider is cookie-session only. Those routes reuse the
existing bcrypt/Prisma logic verbatim — no duplicated business logic, no
schema changes.
