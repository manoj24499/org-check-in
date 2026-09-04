-- Add Attendance.dayKey (IST calendar-day key, e.g. "2026-09-03") and enforce
-- at most one CHECK_IN and one CHECK_OUT per employee per IST day at the
-- database level — closing the check-in/check-out race that an app-level
-- read-then-create check alone can't (see /api/kiosk/scan and lib/istTime.ts).
--
-- Written by hand rather than via `prisma migrate dev` because that command
-- can't backfill a new NOT NULL column non-interactively. "timestamp" is a
-- `timestamp without time zone` column storing UTC wall-clock digits (the
-- Prisma/pg convention for tz-naive columns) — adding 5h30m directly via
-- naive interval arithmetic (not `AT TIME ZONE`, which would reinterpret
-- rather than convert) recovers the correct IST calendar day, matching
-- lib/istTime.ts's istDateKey(). Verified against production data before
-- writing this migration: zero existing (userId, type, IST day) duplicates,
-- so the unique constraint below applies cleanly.

-- 1. Add as nullable first — can't add NOT NULL with no default on a
--    populated table.
ALTER TABLE "Attendance" ADD COLUMN "dayKey" TEXT;

-- 2. Backfill every existing row from its own timestamp.
UPDATE "Attendance"
SET "dayKey" = to_char(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD');

-- 3. Now safe to require it going forward — every row (existing rows via
--    the backfill above, new rows via the app, which always sets it).
ALTER TABLE "Attendance" ALTER COLUMN "dayKey" SET NOT NULL;

-- 4. The actual guarantee: one CHECK_IN and one CHECK_OUT per employee per
--    IST day, enforced atomically regardless of request timing.
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_type_dayKey_key" UNIQUE ("userId", "type", "dayKey");
