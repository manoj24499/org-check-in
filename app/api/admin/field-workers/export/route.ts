import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { clusterPings, computeTotalDistanceMeters, type RawPing } from "@/lib/locationClustering";
import { reverseGeocode } from "@/lib/geocoding";
import { endOfISTDay, istDateKey, parseDateOnlyKey, startOfISTDay } from "@/lib/istTime";

export const dynamic = "force-dynamic";

const MAX_DAYS = 31;
// Reverse geocoding is throttled to ~1 lookup/second (see lib/geocoding.ts), so
// naming auto-detected stops is only done for short ranges; longer ones list
// coordinates + a map link instead of making the download take minutes.
const GEOCODE_MAX_DAYS = 3;
const DAY_MS = 86_400_000;

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const fmtTime = (d: Date | null | undefined) => (d ? timeFmt.format(d).toUpperCase() : "");
const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

function fmtDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { vertical: "middle" };
  row.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

/**
 * Excel export of field workers' days — where they went, when they reached,
 * and how far they travelled — for a picked date range and one employee or all
 * field workers. Three sheets: a per-day summary, the stops the employee logged
 * by hand (with their description), and the stops detected from GPS.
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD, employeeId=<id>|all.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const from = parseDateOnlyKey(params.get("from") ?? "");
  const to = parseDateOnlyKey(params.get("to") ?? "");
  if (!from || !to) return NextResponse.json({ error: "Pick a valid from and to date." }, { status: 400 });
  if (to < from) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  const dayCount = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (dayCount > MAX_DAYS) {
    return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });
  }

  const employeeId = params.get("employeeId") ?? "all";
  const employees = await prisma.user.findMany({
    where: {
      organizationId: admin.organizationId,
      role: "EMPLOYEE",
      ...(employeeId === "all" ? { active: true, workMode: "FIELD" } : { id: employeeId }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeCode: true },
  });
  if (employees.length === 0) return NextResponse.json({ error: "No matching field workers." }, { status: 404 });

  const windowStart = startOfISTDay(from);
  const windowEnd = endOfISTDay(to);
  const geocode = dayCount <= GEOCODE_MAX_DAYS;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inzivo";
  const summary = workbook.addWorksheet("Daily summary");
  const stops = workbook.addWorksheet("Logged stops");
  const detected = workbook.addWorksheet("Detected stops");

  summary.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Employee ID", key: "code", width: 13 },
    { header: "Name", key: "name", width: 22 },
    { header: "Check-in", key: "in", width: 11 },
    { header: "Check-out", key: "out", width: 11 },
    { header: "Start km (odometer)", key: "startKm", width: 19 },
    { header: "End km (odometer)", key: "endKm", width: 18 },
    { header: "Odometer distance (km)", key: "odoKm", width: 21 },
    { header: "GPS distance (km)", key: "km", width: 18 },
    { header: "Stops logged", key: "stops", width: 13 },
    { header: "Reimbursement (₹)", key: "reimb", width: 18 },
    { header: "Note", key: "note", width: 28 },
  ];
  stops.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Employee ID", key: "code", width: 13 },
    { header: "Name", key: "name", width: 22 },
    { header: "Place", key: "place", width: 30 },
    { header: "Description", key: "desc", width: 40 },
    { header: "Contact person", key: "cname", width: 22 },
    { header: "Phone", key: "cphone", width: 16 },
    { header: "Email", key: "cmail", width: 26 },
    { header: "Remarks", key: "remarks", width: 36 },
    { header: "Reached at", key: "at", width: 12 },
    { header: "Latitude", key: "lat", width: 12 },
    { header: "Longitude", key: "lng", width: 12 },
    { header: "Map", key: "map", width: 14 },
  ];
  detected.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Employee ID", key: "code", width: 13 },
    { header: "Name", key: "name", width: 22 },
    { header: "Place", key: "place", width: 34 },
    { header: "Arrived", key: "arr", width: 11 },
    { header: "Left", key: "dep", width: 11 },
    { header: "Time spent", key: "dur", width: 12 },
    { header: "Latitude", key: "lat", width: 12 },
    { header: "Longitude", key: "lng", width: 12 },
    { header: "Map", key: "map", width: 14 },
  ];

  let totalKm = 0;

  for (const emp of employees) {
    const [pings, attendance, fieldVisits, reimbursements] = await Promise.all([
      prisma.locationPing.findMany({
        where: { userId: emp.id, timestamp: { gte: windowStart, lte: windowEnd } },
        orderBy: { timestamp: "asc" },
        select: { latitude: true, longitude: true, timestamp: true, accuracy: true },
      }),
      prisma.attendance.findMany({
        where: { userId: emp.id, timestamp: { gte: windowStart, lte: windowEnd } },
        orderBy: { timestamp: "asc" },
        select: { type: true, timestamp: true, odometerKm: true },
      }),
      prisma.fieldVisit.findMany({
        where: { attendance: { userId: emp.id }, reachedAt: { gte: windowStart, lte: windowEnd } },
        orderBy: { reachedAt: "asc" },
        select: { name: true, description: true, contactName: true, contactPhone: true, contactEmail: true, remarks: true, reachedAt: true, latitude: true, longitude: true },
      }),
      prisma.reimbursement.findMany({
        where: { userId: emp.id, date: { gte: from, lte: to } },
        select: { date: true, amount: true, note: true },
      }),
    ]);

    const byDay = <T,>(items: T[], at: (i: T) => Date) => {
      const m = new Map<string, T[]>();
      for (const it of items) {
        const k = istDateKey(at(it));
        (m.get(k) ?? m.set(k, []).get(k)!).push(it);
      }
      return m;
    };
    const pingsByDay = byDay(pings as RawPing[], (p) => p.timestamp);
    const attByDay = byDay(attendance, (a) => a.timestamp);
    const visitsByDay = byDay(fieldVisits, (v) => v.reachedAt);
    const reimbByDay = new Map(reimbursements.map((r) => [istDateKey(r.date), r]));

    for (let i = 0; i < dayCount; i++) {
      const key = istDateKey(new Date(from.getTime() + i * DAY_MS));
      const dayPings = pingsByDay.get(key) ?? [];
      const dayAtt = attByDay.get(key) ?? [];
      const dayVisits = visitsByDay.get(key) ?? [];
      if (dayPings.length === 0 && dayAtt.length === 0 && dayVisits.length === 0) continue;

      const checkIn = dayAtt.find((a) => a.type === "CHECK_IN");
      const checkOut = dayAtt.find((a) => a.type === "CHECK_OUT" && (!checkIn || a.timestamp > checkIn.timestamp));
      const km = Math.round((computeTotalDistanceMeters(dayPings) / 1000) * 100) / 100;
      totalKm += km;
      const reimb = reimbByDay.get(key);

      summary.addRow({
        date: key,
        code: emp.employeeCode,
        name: emp.name,
        in: fmtTime(checkIn?.timestamp),
        out: fmtTime(checkOut?.timestamp),
        startKm: checkIn?.odometerKm ?? "",
        endKm: checkOut?.odometerKm ?? "",
        odoKm:
          checkIn?.odometerKm != null && checkOut?.odometerKm != null
            ? Math.round((checkOut.odometerKm - checkIn.odometerKm) * 10) / 10
            : "",
        km,
        stops: dayVisits.length,
        reimb: reimb?.amount ?? "",
        note: reimb?.note ?? "",
      });

      for (const v of dayVisits) {
        const row = stops.addRow({
          date: key,
          code: emp.employeeCode,
          name: emp.name,
          place: v.name,
          desc: v.description ?? "",
          cname: v.contactName ?? "",
          cphone: v.contactPhone ?? "",
          cmail: v.contactEmail ?? "",
          remarks: v.remarks ?? "",
          at: fmtTime(v.reachedAt),
          lat: v.latitude,
          lng: v.longitude,
          map: { text: "Open map", hyperlink: mapLink(v.latitude, v.longitude) },
        });
        row.getCell("desc").alignment = { wrapText: true, vertical: "top" };
        row.getCell("remarks").alignment = { wrapText: true, vertical: "top" };
        row.getCell("map").font = { color: { argb: "FF2563EB" }, underline: true };
      }

      for (const c of clusterPings(dayPings)) {
        const place = geocode
          ? ((await reverseGeocode(c.centroidLatitude, c.centroidLongitude)) ?? "")
          : "";
        const row = detected.addRow({
          date: key,
          code: emp.employeeCode,
          name: emp.name,
          place: place || `${c.centroidLatitude.toFixed(5)}, ${c.centroidLongitude.toFixed(5)}`,
          arr: fmtTime(c.arrivedAt),
          dep: fmtTime(c.departedAt),
          dur: fmtDuration(c.departedAt.getTime() - c.arrivedAt.getTime()),
          lat: c.centroidLatitude,
          lng: c.centroidLongitude,
          map: { text: "Open map", hyperlink: mapLink(c.centroidLatitude, c.centroidLongitude) },
        });
        row.getCell("map").font = { color: { argb: "FF2563EB" }, underline: true };
      }
    }
  }

  if (summary.rowCount > 1) {
    const total = summary.addRow({ date: "Total", km: Math.round(totalKm * 100) / 100 });
    total.font = { bold: true };
  }
  for (const sheet of [summary, stops, detected]) styleHeader(sheet);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const who = employees.length === 1 ? employees[0].employeeCode : "all-field-workers";
  const fileName = `field-report_${who}_${istDateKey(from)}_to_${istDateKey(to)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
