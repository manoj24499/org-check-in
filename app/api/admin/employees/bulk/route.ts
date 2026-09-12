import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generateUniquePin, hashPin, allocateNextEmployeeCode } from "@/lib/credentials";
import { DEFAULT_GEOFENCE_RADIUS_METERS } from "@/lib/geofence";

// Postgres' default transaction timeout comfortably covers a normal admin
// batch, but this loop's per-row work (a PIN hash at bcrypt cost 12, ~100ms
// each — see lib/credentials.ts) adds up for a large one. 30s covers a
// batch of a few hundred rows with headroom; a batch that large is unusual
// enough that failing loudly (rather than silently truncating) is the right
// behavior.
const BULK_CREATE_TRANSACTION_TIMEOUT_MS = 30_000;

const bulkCreateSchema = z.array(
  z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      workMode: z.enum(["OFFICE", "WFH", "FIELD"]).default("OFFICE"),
      homeLatitude: z.coerce.number().min(-90).max(90).optional(),
      homeLongitude: z.coerce.number().min(-180).max(180).optional(),
      homeRadiusMeters: z.coerce.number().min(1).max(100_000).optional(),
    })
    .refine(
      (row) => row.workMode !== "WFH" || (row.homeLatitude !== undefined && row.homeLongitude !== undefined),
      { message: "WFH employees require Home Latitude and Home Longitude." },
    ),
);

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bulkCreateSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const rowIndex = typeof issue?.path[0] === "number" ? issue.path[0] : undefined;
    const rowLabel =
      rowIndex !== undefined && Array.isArray(json)
        ? (json[rowIndex]?.email ?? `row ${rowIndex + 1}`)
        : undefined;
    return NextResponse.json(
      {
        error: rowLabel
          ? `Invalid data for ${rowLabel}: ${issue?.message ?? "check the row and try again."}`
          : "Invalid input. Ensure rows have valid name, email, and (for WFH) home coordinates.",
      },
      { status: 400 },
    );
  }

  // Duplicates *within* the submitted batch — the DB check just below only
  // catches an email already belonging to an existing user, so two rows in
  // the same batch sharing an email would otherwise both pass it, then fail
  // on the `email` unique constraint mid-loop (see the transaction note
  // below for why that used to be a real problem).
  const emailCounts = new Map<string, number>();
  for (const row of parsed.data) {
    emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
  }
  const duplicatesInBatch = [...emailCounts.entries()].filter(([, count]) => count > 1).map(([email]) => email);
  if (duplicatesInBatch.length > 0) {
    return NextResponse.json({
      error: `Duplicate emails within this batch: ${duplicatesInBatch.join(', ')}`
    }, { status: 400 });
  }

  const existingEmails = await prisma.user.findMany({
    where: { email: { in: parsed.data.map(u => u.email) } },
    select: { email: true }
  });

  if (existingEmails.length > 0) {
    return NextResponse.json({
      error: `Some emails are already in use: ${existingEmails.map(e => e.email).join(', ')}`
    }, { status: 409 });
  }

  // PIN generation + hashing happens BEFORE the transaction, not inside it —
  // generateUniquePin() does a full linear bcrypt-compare scan against every
  // active employee (see lib/credentials.ts) and hashPin() is bcrypt cost 12
  // (~100ms each); doing both per-row inside the transaction would eat
  // straight into BULK_CREATE_TRANSACTION_TIMEOUT_MS for no reason, since
  // none of this needs the transaction's atomicity. generateUniquePin()
  // only ever checks already-persisted rows, so it can't see PINs picked
  // earlier in this same batch — tracked separately here via
  // `pinsUsedInBatch` so two rows in one submission can't collide with each
  // other either.
  const pinsUsedInBatch = new Set<string>();
  const rowsWithPins: Array<(typeof parsed.data)[number] & { pin: string; pinHash: string }> = [];
  for (const empData of parsed.data) {
    let pin = await generateUniquePin();
    while (pinsUsedInBatch.has(pin)) {
      pin = await generateUniquePin();
    }
    pinsUsedInBatch.add(pin);
    const pinHash = await hashPin(pin);
    rowsWithPins.push({ ...empData, pin, pinHash });
  }

  // Whole batch succeeds or none of it does — previously each row was
  // created one at a time with no transaction, so a failure partway through
  // (e.g. a constraint violation this route hadn't anticipated) left the
  // earlier rows already committed as real employee accounts with generated
  // PINs, while the request itself 500'd before those PINs were ever
  // returned to the admin — orphaned accounts nobody had credentials for.
  let createdEmployees;
  try {
    createdEmployees = await prisma.$transaction(
      async (tx) => {
        const created = [];
        // Looped (not createMany) because each row needs its own
        // allocateNextEmployeeCode() call (an atomic DB counter, not
        // COUNT(*)/MAX() — see its own comment) rather than incrementing a
        // local variable: COUNT(*) undercounts once anyone's ever been
        // deleted (lib/employeeCleanup.ts), producing employeeCode
        // collisions with currently-active employees. PIN + hash are
        // already computed above, so this loop is just the DB write.
        for (const empData of rowsWithPins) {
          const employeeCode = await allocateNextEmployeeCode();
          const { pin, pinHash } = empData;

          const user = await tx.user.create({
            data: {
              name: empData.name,
              email: empData.email,
              role: "EMPLOYEE",
              employeeCode,
              pinHash,
              workMode: empData.workMode,
              homeLatitude: empData.workMode === "WFH" ? empData.homeLatitude : null,
              homeLongitude: empData.workMode === "WFH" ? empData.homeLongitude : null,
              homeRadiusMeters: empData.homeRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
            },
          });

          created.push({
            id: user.id,
            employeeCode: user.employeeCode,
            name: user.name,
            email: user.email,
            pin,
          });
        }
        return created;
      },
      { timeout: BULK_CREATE_TRANSACTION_TIMEOUT_MS },
    );
  } catch (err) {
    console.error("[POST /api/admin/employees/bulk] Batch failed, nothing was created:", err);
    return NextResponse.json(
      { error: "Couldn't create these employees — nothing was saved. Please check the data and try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    created: createdEmployees
  });
}
