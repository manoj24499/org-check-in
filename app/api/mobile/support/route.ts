import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  // Optional photo, same data-URL convention as every other photo upload in
  // this app (kiosk scan, field visits, overtime checkout) — decoded via
  // the shared decodePhoto() helper for the same validation/resize/size-cap.
  photo: z.string().optional(),
});

// Same cap as the other photo-accepting mobile routes — enough headroom for
// base64 encoding overhead plus the message field.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/**
 * An employee "report an issue" submission from the mobile app's Profile >
 * Help screen — see the schema comment on SupportTicket for why this is
 * deliberately simple (no category, no reply thread, no push notification;
 * an admin reviews it on /admin/support next time they load the dashboard).
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please describe the issue before submitting." }, { status: 400 });
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

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: auth.sub,
      message: parsed.data.message,
      hasPhoto: !!photoBuffer,
      photo: photoBuffer ? Buffer.from(photoBuffer) : undefined,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ id: ticket.id, createdAt: ticket.createdAt });
}
