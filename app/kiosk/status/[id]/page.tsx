import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeWorkedMs, computeFieldOfficeSplit } from "@/lib/attendanceHours";
import { startOfISTDay } from "@/lib/istTime";
import StatusClient from "./StatusClient";

export default async function KioskStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
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
      const workedMs = computeWorkedMs(checkInRecord.timestamp, record.timestamp, checkInRecord.pauses);
      workHours = workedMs / (1000 * 60 * 60);

      // Only ever non-empty for FIELD-workMode employees (see
      // /api/kiosk/scan) — everyone else simply has no segments.
      if (checkInRecord.workSegments.length > 0) {
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
    />
  );
}
