import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeWorkedMs, computeFieldOfficeSplit } from "@/lib/attendanceHours";
import { startOfISTDay } from "@/lib/istTime";
import StatusClient from "./StatusClient";

export default async function KioskStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ orgSlug?: string }>;
}) {
  const { id } = await params;
  const { orgSlug } = await searchParams;

  // Explicit `select` — this renders on the kiosk screen after every single
  // check-in/check-out, so pulling the full row (photo bytes) plus the full
  // related `user` row (pinHash included) each time was a real, frequent cost.
  const record = await prisma.attendance.findUnique({
    where: { id },
    select: {
      type: true,
      timestamp: true,
      userId: true,
      user: { select: { name: true } },
    },
  });

  if (!record) {
    return notFound();
  }

  let workHours = 0;
  let checkInTime = null;
  let fieldHours: number | null = null;
  let officeHours: number | null = null;

  if (record.type === "CHECK_OUT") {
    // Find the corresponding check-in for today
    const todayStart = startOfISTDay(record.timestamp);

    const checkInRecord = await prisma.attendance.findFirst({
      where: {
        userId: record.userId,
        type: "CHECK_IN",
        timestamp: {
          gte: todayStart,
          lte: record.timestamp,
        },
      },
      orderBy: { timestamp: "desc" },
      select: {
        timestamp: true,
        pauses: { select: { pausedAt: true, resumedAt: true } },
        workSegments: { select: { mode: true, startedAt: true, endedAt: true } },
      },
    });

    if (checkInRecord) {
      checkInTime = checkInRecord.timestamp;
      // Segments matter only for HYBRID: their transit time isn't work.
      const workedMs = computeWorkedMs(
        checkInRecord.timestamp,
        record.timestamp,
        checkInRecord.pauses,
        checkInRecord.workSegments,
      );
      workHours = workedMs / (1000 * 60 * 60);

      // Only ever non-empty for FIELD- and HYBRID-workMode employees (see
      // /api/kiosk/scan) — everyone else simply has no segments. The
      // Field/Office split is a FIELD view; a HYBRID day just shows its total.
      if (
        checkInRecord.workSegments.length > 0 &&
        !checkInRecord.workSegments.some((s) => s.mode === "HOME" || s.mode === "TRANSIT")
      ) {
        const split = computeFieldOfficeSplit(
          checkInRecord.timestamp,
          record.timestamp,
          checkInRecord.workSegments,
          checkInRecord.pauses,
        );
        fieldHours = split.fieldMs / (1000 * 60 * 60);
        officeHours = split.officeMs / (1000 * 60 * 60);
      }
    }
  }

  return (
    <StatusClient
      name={record.user.name}
      type={record.type}
      timestamp={record.timestamp}
      workHours={workHours}
      checkInTime={checkInTime}
      fieldHours={fieldHours}
      officeHours={officeHours}
      orgSlug={orgSlug}
    />
  );
}
