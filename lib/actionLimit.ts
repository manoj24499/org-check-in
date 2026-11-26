import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";

/**
 * Caps how often one signed-in employee can send a given kind of request (leave, permission, overtime and so on).
 * Returns a 429 response to send back when the cap is exceeded, otherwise null. Generous enough that nobody doing
 * real work notices it; it only stops a script, or a stuck button, from flooding the admin's inbox.
 */
export async function limitEmployeeAction(
  userId: string,
  action: string,
  max: number,
  windowMs = 60 * 60_000,
): Promise<NextResponse | null> {
  if (await isRateLimited(`emp-action:${action}:${userId}`, windowMs, max)) {
    return NextResponse.json(
      { error: "Too many requests in a short time. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }
  return null;
}
