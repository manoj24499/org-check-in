import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/webEmployee";
import { istDateKey, parseDateOnlyKey } from "@/lib/istTime";

const bodySchema = z.object({ dateOfBirth: z.string() });

/**
 * The employee's own date of birth, given once (from the My Page prompt). It can't be changed from here afterwards:
 * a wrong date is corrected by an admin. Only the day and month are ever shown to other people.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  const dob = parsed.success ? parseDateOnlyKey(parsed.data.dateOfBirth) : null;
  if (!dob) return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });

  const today = parseDateOnlyKey(istDateKey())!;
  const age = (today.getTime() - dob.getTime()) / (365.25 * 24 * 3600_000);
  if (age < 14 || age > 100) {
    return NextResponse.json({ error: "That date of birth doesn't look right. Please check it." }, { status: 400 });
  }

  // Only fills an empty value, so two tabs can't overwrite each other.
  const res = await prisma.user.updateMany({
    where: { id: auth.sub, organizationId: auth.organizationId, dateOfBirth: null },
    data: { dateOfBirth: dob },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Your date of birth is already saved. Ask your admin to change it." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
