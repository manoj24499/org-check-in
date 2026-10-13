import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { istDateKey, parseDateOnlyKey } from "@/lib/istTime";
import { sendPushNotification } from "@/lib/pushNotifications";
import { MAX_PLACES_PER_DAY, planVisitOrder, toAssignedPlaceDto } from "@/lib/assignedPlaces";

export const dynamic = "force-dynamic";

const optionalText = (max: number) => z.string().trim().max(max).optional();

const placeSchema = z.object({
  // Present when the admin is editing a place that is already saved.
  id: z.string().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120),
  address: optionalText(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: optionalText(500),
  contactName: optionalText(120),
  contactPhone: optionalText(30),
  notes: optionalText(500),
});

const saveSchema = z.object({ places: z.array(placeSchema).max(MAX_PLACES_PER_DAY) });

function dayKeyFrom(value: string | null): string | null {
  if (!value) return istDateKey();
  const parsed = parseDateOnlyKey(value);
  return parsed ? istDateKey(parsed) : null;
}

async function findEmployee(id: string, organizationId: string) {
  return prisma.user.findFirst({
    where: { id, organizationId, role: "EMPLOYEE", workMode: "FIELD" },
    select: { id: true, name: true },
  });
}

/** The places assigned to one field worker for one day (default today). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dayKey = dayKeyFrom(req.nextUrl.searchParams.get("date"));
  if (!dayKey) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  if (!(await findEmployee(id, admin.organizationId))) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const rows = await prisma.assignedPlace.findMany({
    where: { userId: id, dayKey },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { fieldVisit: { select: { reachedAt: true } } },
  });
  return NextResponse.json({ date: dayKey, places: rows.map(toAssignedPlaceDto) });
}

/**
 * Saves the whole list for a day. Places already visited are locked and left as they are; everything
 * else is replaced by what the admin sent. The pending places are put in a nearest-first order starting
 * from the office (the app re-plans from the worker's live position), and the worker gets a push when
 * new places were added.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dayKey = dayKeyFrom(req.nextUrl.searchParams.get("date"));
  if (!dayKey) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  if (dayKey < istDateKey()) {
    return NextResponse.json({ error: "Places can only be assigned for today or a later date." }, { status: 400 });
  }
  const employee = await findEmployee(id, admin.organizationId);
  if (!employee) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const existing = await prisma.assignedPlace.findMany({ where: { userId: id, dayKey } });
  const visitedCount = existing.filter((p) => p.status === "VISITED").length;
  if (visitedCount + parsed.data.places.length > MAX_PLACES_PER_DAY) {
    return NextResponse.json({ error: `At most ${MAX_PLACES_PER_DAY} places can be assigned for one day.` }, { status: 400 });
  }
  const editable = new Map(existing.filter((p) => p.status !== "VISITED").map((p) => [p.id, p]));
  const keep = new Set(parsed.data.places.flatMap((p) => (p.id && editable.has(p.id) ? [p.id] : [])));
  const removeIds = [...editable.keys()].filter((pid) => !keep.has(pid));

  const clean = (v?: string) => (v ? v : null);
  const adminName = admin.session.user?.name ?? null;
  const created = parsed.data.places.filter((p) => !(p.id && editable.has(p.id)));

  const savedIds = await prisma.$transaction(async (tx) => {
    if (removeIds.length > 0) await tx.assignedPlace.deleteMany({ where: { id: { in: removeIds }, userId: id } });
    const ids: string[] = [];
    for (const p of parsed.data.places) {
      const data = {
        name: p.name,
        address: clean(p.address),
        latitude: p.latitude,
        longitude: p.longitude,
        description: clean(p.description),
        contactName: clean(p.contactName),
        contactPhone: clean(p.contactPhone),
        notes: clean(p.notes),
      };
      if (p.id && editable.has(p.id)) {
        await tx.assignedPlace.update({ where: { id: p.id }, data: { ...data, status: "PENDING", skipReason: null } });
        ids.push(p.id);
      } else {
        const row = await tx.assignedPlace.create({ data: { ...data, userId: id, dayKey, assignedByName: adminName } });
        ids.push(row.id);
      }
    }
    return ids;
  });

  // Initial visiting order, from the office if one is set.
  const saved = await prisma.assignedPlace.findMany({ where: { id: { in: savedIds } } });
  const office = await prisma.officeLocation.findUnique({
    where: { organizationId: admin.organizationId },
    select: { latitude: true, longitude: true },
  });
  const plan = await planVisitOrder(office, saved);
  await prisma.$transaction(
    plan.ordered.map((p, i) => prisma.assignedPlace.update({ where: { id: p.stop.id }, data: { sortOrder: i + 1 } })),
  );

  if (created.length > 0) {
    const label = dayKey === istDateKey() ? "today" : dayKey;
    await sendPushNotification(
      id,
      "New places assigned",
      `${created.length} ${created.length === 1 ? "place was" : "places were"} assigned to you for ${label}. Open the app to see your route.`,
    );
  }

  const rows = await prisma.assignedPlace.findMany({
    where: { userId: id, dayKey },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { fieldVisit: { select: { reachedAt: true } } },
  });
  return NextResponse.json({ date: dayKey, places: rows.map(toAssignedPlaceDto), roadDistances: plan.roads });
}
