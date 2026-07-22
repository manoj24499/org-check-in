import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StatusClient from "./StatusClient";

export default async function KioskStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const record = await prisma.attendance.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!record) {
    return notFound();
  }

  let workHours = 0;
  let checkInTime = null;

  if (record.type === "CHECK_OUT") {
    // Find the corresponding check-in for today
    const todayStart = new Date(record.timestamp);
    todayStart.setHours(0, 0, 0, 0);

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
    });

    if (checkInRecord) {
      checkInTime = checkInRecord.timestamp;
      const diffMs = record.timestamp.getTime() - checkInRecord.timestamp.getTime();
      workHours = diffMs / (1000 * 60 * 60);
    }
  }

  return (
    <StatusClient
      name={record.user.name}
      type={record.type}
      timestamp={record.timestamp}
      workHours={workHours}
      checkInTime={checkInTime}
    />
  );
}
