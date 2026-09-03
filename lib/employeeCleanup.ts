import { prisma } from "@/lib/prisma";
import { buildCsv, csvField } from "@/lib/csv";
import { deleteFaceEnrollment } from "@/lib/faceVerify";

const RETENTION_DAYS = 7;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function attendanceCsvFor(records: { type: string; method: string; timestamp: Date; lateMinutes: number | null; leaveType: string; checkInMode: string | null }[]) {
  const header = "Type,Method,Timestamp,Late (min),Leave Type,Check-in Mode";
  const rows = records.map((r) =>
    [r.type, r.method, r.timestamp.toISOString(), r.lateMinutes ?? "", r.leaveType, r.checkInMode ?? ""].join(","),
  );
  return buildCsv(header, rows);
}

function reimbursementCsvFor(records: { date: Date; distanceKm: number; ratePerKm: number; amount: number; note: string | null }[]) {
  const header = "Date,Distance (km),Rate/km,Amount,Note";
  const rows = records.map((r) =>
    [r.date.toISOString().slice(0, 10), r.distanceKm, r.ratePerKm, r.amount, csvField(r.note ?? "")].join(","),
  );
  return buildCsv(header, rows);
}

function leaveRequestsCsvFor(
  records: {
    type: string;
    startDate: Date;
    endDate: Date;
    days: number;
    status: string;
    reason: string | null;
    reviewedAt: Date | null;
    reviewedByName: string | null;
    reviewNote: string | null;
  }[],
) {
  const header = "Type,Start Date,End Date,Days,Status,Reason,Reviewed At,Reviewed By,Review Note";
  const rows = records.map((r) =>
    [
      r.type,
      r.startDate.toISOString().slice(0, 10),
      r.endDate.toISOString().slice(0, 10),
      r.days,
      r.status,
      csvField(r.reason ?? ""),
      r.reviewedAt?.toISOString() ?? "",
      csvField(r.reviewedByName ?? ""),
      csvField(r.reviewNote ?? ""),
    ].join(","),
  );
  return buildCsv(header, rows);
}

/**
 * Finds every employee deactivated 7+ days ago, snapshots their attendance,
 * reimbursement, and leave-request history to CSV, saves that snapshot as a
 * DeletedEmployeeArchive row, and permanently deletes the User row (which
 * cascades away everything else — LocationPing, FieldVisit, ShiftAssignment,
 * PushToken, and the Attendance/TimeOffRequest/Reimbursement rows the CSVs
 * were just built from). Archive-then-delete happens in one transaction per
 * employee, so a crash partway through never deletes without having
 * archived first, and never leaves an orphaned archive with the user still
 * present. Afterward, also asks the face-verification service to forget that
 * employee's enrollment (see deleteFaceEnrollment in lib/faceVerify.ts) —
 * best-effort, since that service is external state this app doesn't own or
 * transact with.
 *
 * Run daily by the scheduler registered in instrumentation.ts. Also safe to
 * call directly (e.g. from an admin-triggered endpoint) — it's idempotent:
 * re-running finds nothing left to do once a given employee is deleted.
 */
export async function runDeactivatedEmployeeCleanup(): Promise<{ deletedCount: number; errors: string[] }> {
  const cutoff = daysAgo(RETENTION_DAYS);
  const due = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: false, deactivatedAt: { lte: cutoff } },
    select: { id: true, employeeCode: true, name: true, email: true, workMode: true, deactivatedAt: true },
  });

  let deletedCount = 0;
  const errors: string[] = [];

  for (const user of due) {
    try {
      const [attendance, reimbursements, leaveRequests] = await Promise.all([
        prisma.attendance.findMany({ where: { userId: user.id }, orderBy: { timestamp: "asc" } }),
        prisma.reimbursement.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
        prisma.timeOffRequest.findMany({ where: { userId: user.id }, orderBy: { startDate: "asc" } }),
      ]);

      await prisma.$transaction([
        prisma.deletedEmployeeArchive.create({
          data: {
            employeeCode: user.employeeCode,
            name: user.name,
            email: user.email,
            workMode: user.workMode,
            // Guaranteed non-null by the `where` filter above (active: false
            // implies deactivatedAt was set) — the `!` just satisfies the
            // nullable DB column's type.
            deactivatedAt: user.deactivatedAt!,
            attendanceCsv: attendanceCsvFor(attendance),
            reimbursementCsv: reimbursementCsvFor(reimbursements),
            leaveRequestsCsv: leaveRequestsCsvFor(leaveRequests),
          },
        }),
        prisma.user.delete({ where: { id: user.id } }),
      ]);

      // Best-effort: tell the face-verification service to forget this
      // employee's enrollment now that they're gone from this app's own DB.
      // Deliberately outside the transaction above (it's an external HTTP
      // call, not a DB write) and never allowed to fail this employee's
      // cleanup — the User row is already deleted by this point, so there's
      // nothing left to roll back to. A failure here just leaves a stale
      // enrollment on the service to be retried/cleaned up later; it's
      // logged, not thrown.
      const faceDelete = await deleteFaceEnrollment(user.employeeCode);
      if (faceDelete.outcome === "unavailable") {
        console.error(
          `[employeeCleanup] Failed to delete face enrollment for ${user.employeeCode}: ${faceDelete.reason}`,
        );
      }

      deletedCount++;
    } catch (err) {
      // One employee's failure (e.g. a transient DB error) must never abort
      // the rest of the batch — each is independent.
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${user.employeeCode}: ${message}`);
      console.error(`[employeeCleanup] Failed to archive/delete ${user.employeeCode}:`, err);
    }
  }

  return { deletedCount, errors };
}
