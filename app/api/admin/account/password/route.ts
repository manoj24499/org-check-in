import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { forgetPasswordChange } from "@/lib/sessionVersion";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, "The new password must be at least 8 characters.").max(200),
});

/** Lets the signed-in admin change their own password. The current password is required, so a left-open session
 * can't be used to lock the real admin out. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Guessing the current password through this form is the same attack as guessing it at sign-in.
  if (await isRateLimited(`admin-change-pw:${admin.userId}`, 15 * 60_000, 5)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: admin.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Your current password is not correct." }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }

  // passwordChangedAt signs out every existing admin session, including this one (they sign in again).
  await prisma.user.update({
    where: { id: admin.userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() },
  });
  forgetPasswordChange(admin.userId);
  return NextResponse.json({ ok: true });
}
