# Employee Check-In / Check-Out App

Internal attendance system built with Next.js (App Router), PostgreSQL, and Prisma.

## Features

- **Kiosk mode** (`/kiosk`) — public shared-device screen. Employees type their Employee ID + PIN to check in or out.
- **Admin dashboard** (`/admin`) — email/password login. See who's currently checked in, today's activity log, manage employees (add, deactivate, regenerate PIN), export all attendance as CSV.
- **Employee "My Page"** (`/my-page`) — employees log in with Employee ID + PIN to see their own attendance history only.
- Roles are enforced by middleware; employees can never see other employees' data, and only admins can manage employees.

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
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` — your first admin account

Then create the database tables and seed the first admin:

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

Run it:

```bash
npm run dev
```

- Landing page: http://localhost:3000
- Kiosk: http://localhost:3000/kiosk
- Login: http://localhost:3000/login (use the admin email/password you set in `.env`)

## 3. Using it

1. Log in as admin → **Employees** → **+ Add Employee**. This shows a one-time PIN — write it down or share it with the employee (e.g. via a private message). It cannot be retrieved again, only regenerated.
2. Point the kiosk device (tablet/laptop) at `/kiosk`. Employees type their Employee ID + PIN.
3. Every PIN entry automatically alternates between Check In and Check Out — no separate buttons needed.
4. Employees can check their own history any time at `/my-page` (Employee ID + PIN login). Admins see everyone's status live on `/admin/dashboard`.

## 4. Deploying (Vercel + Neon/Supabase)

1. Push this project to a GitHub repo (keep it **private**, since this is for internal use).
2. Import it into [Vercel](https://vercel.com/new).
3. Add the same environment variables from `.env` in the Vercel project settings. Set `NEXTAUTH_URL` to your production URL (e.g. `https://checkin.yourcompany.com`).
4. After the first deploy, run the schema push once against your production database:
   ```bash
   DATABASE_URL="<your production url>" npx prisma db push
   DATABASE_URL="<your production url>" SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npx prisma db seed
   ```
   (Run this from your local machine — it just needs network access to your DB.)
5. Since this is private/internal, also consider putting Vercel's [password protection](https://vercel.com/docs/deployment-protection) or restricting the kiosk device to your office network/VPN.

## 5. Notes on scale

Built comfortably for ~100 employees / ~10 admins. A couple of things worth knowing as you grow:

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
