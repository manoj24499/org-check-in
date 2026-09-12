import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generateUniquePin, hashPin, allocateNextEmployeeCode } from "@/lib/credentials";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { embedFace } from "@/lib/faceVerify";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";
import { EMPLOYEES_PAGE_SIZE } from "@/lib/pagination";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  // Optional convenience — assigns this shift for all 7 weekdays right away
  // (see ShiftAssignment) so a new OFFICE employee doesn't start with no
  // shift at all. An admin who needs a mixed weekly schedule instead can
  // still fine-tune individual days afterward from the employee's own page
  // (see ShiftScheduleEditor) — this is just a faster starting point.
  shiftId: z.string().min(1).optional(),
  // Optional reference photo (data URL, same convention as /api/kiosk/scan)
  // — when supplied, it's forwarded to the face-verification service's
  // /embed endpoint (see lib/faceVerify.ts) to enroll this employee, and
  // faceVerificationEnabled is turned on automatically once that succeeds.
  // Never stored here: this app only relays it, the service is the sole
  // owner of enrolled reference photos.
  photo: z.string().optional(),
});

// Same cap as /api/kiosk/scan's request-body limit, for the same reason: a
// base64 photo inflates the body well past MAX_PHOTO_BYTES, so this needs
// enough headroom for that encoding overhead plus the other form fields.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

// Supports the admin employee list's pagination + search (see
// components/EmployeeTable.tsx and app/admin/employees/page.tsx, which share
// this route's page-size constant via lib/pagination.ts). `q` matches
// against name/email/employeeCode, case-insensitive — the same three fields
// the table's previous client-side-only filter checked, just now run
// server-side so it covers every employee, not just the currently-loaded
// page.
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "", 10) || EMPLOYEES_PAGE_SIZE));
  const q = searchParams.get("q")?.trim();

  const where = {
    role: "EMPLOYEE" as const,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { employeeCode: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [employees, total] = await Promise.all([
    prisma.user.findMany({
      where,
      // Join order, matching the page's default (non-search) listing — see
      // that page's own comment for why createdAt beats alphabetical here.
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        active: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ employees, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let json: unknown;
    try {
      json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return NextResponse.json({ error: "Request is too large." }, { status: 413 });
      }
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    let photoBuffer: Uint8Array<ArrayBuffer> | null = null;
    if (parsed.data.photo) {
      photoBuffer = await decodePhoto(parsed.data.photo);
      if (!photoBuffer) {
        return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
      }
      if (photoBuffer.length > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }

    let shift: { id: string; name: string | null; startTime: string; endTime: string } | null = null;
    if (parsed.data.shiftId) {
      shift = await prisma.shift.findUnique({
        where: { id: parsed.data.shiftId },
        select: { id: true, name: true, startTime: true, endTime: true },
      });
      if (!shift) {
        return NextResponse.json({ error: "Selected shift no longer exists." }, { status: 400 });
      }
    }

    // Atomically allocated, persistent counter — see allocateNextEmployeeCode's
    // own comment for why this can't just be MAX(employeeCode).
    const employeeCode = await allocateNextEmployeeCode();

    const pin = await generateUniquePin();
    const pinHash = await hashPin(pin);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: "EMPLOYEE",
        employeeCode,
        pinHash,
      },
    });

    // Monday–Saturday, same shift — the quick-start default described
    // above. Sunday (weekday 0, JS Date.getDay() convention — see
    // ShiftScheduleEditor) is deliberately left unassigned so it defaults
    // to "No shift" (the usual weekly off day) rather than a workday; an
    // admin can still assign one from the employee's profile if this
    // particular employee does work Sundays.
    if (shift) {
      await prisma.shiftAssignment.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({ userId: user.id, shiftId: shift!.id, weekday: i + 1 })),
      });
    }

    // Enroll the reference photo with the face-verification service (see
    // lib/faceVerify.ts) and flip faceVerificationEnabled on once that
    // succeeds. A failed/unavailable embed never fails employee creation
    // itself — the employee still exists, just without face verification
    // until an admin retries with a better photo from the employee's
    // profile page (see the "set-face-verification" action in
    // app/api/admin/employees/[id]/route.ts).
    let faceEnrollment: { status: "enrolled" | "failed" | "unavailable"; message?: string } | null =
      null;
    if (photoBuffer) {
      const result = await embedFace(employeeCode, photoBuffer);
      if (result.outcome === "enrolled") {
        await prisma.user.update({
          where: { id: user.id },
          data: { faceVerificationEnabled: true },
        });
        faceEnrollment = { status: "enrolled" };
      } else if (result.outcome === "failed") {
        faceEnrollment = { status: "failed", message: result.message };
      } else {
        faceEnrollment = { status: "unavailable", message: result.reason };
      }
    }

    // Return the plaintext PIN once, at creation time, so the admin can hand it
    // to the employee. It is never retrievable again after this response.
    return NextResponse.json({
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      pin,
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
      faceEnrollment,
    });
  } catch (err) {
    console.error("[POST /api/admin/employees] Unhandled error:", err);
    // The real error (which can include DB constraint/column names or other
    // schema details) goes to the server log above — never to the client,
    // matching every other route's error handling in this app.
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
