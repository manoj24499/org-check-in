-- One-time repair for overnight shifts (e.g. 3:30 PM -> 12:30 AM).
-- A check-out recorded after midnight was saved under the NEXT day's dayKey, which made that day look
-- "already checked out" and blocked the real check-out. This moves each such CHECK_OUT back to the dayKey of
-- the CHECK_IN it closes (the nearest earlier check-in of the same employee).
--
-- STEP 1: preview what would change (read-only).
SELECT o.id AS checkout_id, u."employeeCode", o."timestamp" AS checkout_at,
       o."dayKey" AS current_key, i."dayKey" AS new_key, i."timestamp" AS checkin_at
FROM "Attendance" o
JOIN "User" u ON u.id = o."userId"
JOIN LATERAL (
  SELECT x.* FROM "Attendance" x
  WHERE x."userId" = o."userId" AND x.type = 'CHECK_IN' AND x."timestamp" < o."timestamp"
  ORDER BY x."timestamp" DESC LIMIT 1
) i ON true
WHERE o.type = 'CHECK_OUT' AND o."dayKey" <> i."dayKey"
ORDER BY o."timestamp" DESC;

-- STEP 2: apply (run only after checking the preview). Skips any row whose new key is already taken.
-- BEGIN;
-- WITH paired AS (
--   SELECT o.id AS out_id, o."userId" AS uid, i."dayKey" AS new_key
--   FROM "Attendance" o
--   JOIN LATERAL (
--     SELECT x.* FROM "Attendance" x
--     WHERE x."userId" = o."userId" AND x.type = 'CHECK_IN' AND x."timestamp" < o."timestamp"
--     ORDER BY x."timestamp" DESC LIMIT 1
--   ) i ON true
--   WHERE o.type = 'CHECK_OUT' AND o."dayKey" <> i."dayKey"
-- )
-- UPDATE "Attendance" a SET "dayKey" = p.new_key
-- FROM paired p
-- WHERE a.id = p.out_id
--   AND NOT EXISTS (
--     SELECT 1 FROM "Attendance" y
--     WHERE y."userId" = p.uid AND y.type = 'CHECK_OUT' AND y."dayKey" = p.new_key
--   );
-- COMMIT;
