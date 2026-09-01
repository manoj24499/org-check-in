/**
 * Client for the external face-verification service (a separate Python/
 * InsightFace API, not part of this app). /api/kiosk/scan calls POST /verify
 * at check-in for employees with faceVerificationEnabled; POST /embed is
 * called once, from /api/admin/employees, at employee-creation time (when an
 * admin supplies a photo) to enroll that employee's reference face on the
 * service. Either way, the service is the sole owner of enrolled reference
 * data — this app never stores it, only ever relaying an employeeCode plus
 * whichever photo (enrollment or check-in) that call is about.
 *
 * Response shape observed from the service (POST /verify, multipart
 * `employee_id` + `image`):
 *   match:    { success: true,  status: "MATCHED",      message: "FACE VERIFIED", similarity: 1.0 }
 *   mismatch: { success: false, status: "WRONG_PERSON",  message: "WRONG PERSON",  similarity: 0.04 }
 * Only `success` is treated as authoritative for the match/no-match
 * decision — anything else the service might return for other rejection
 * reasons (no face found, multiple faces, unknown employee_id, ...) still
 * has `success: false`, so it's handled the same way here: reject, and pass
 * its `message` straight through to the caller rather than guessing at
 * every possible `status` string.
 *
 * POST /embed's response shape isn't documented anywhere (its OpenAPI schema
 * just shows `{}`) — embedFace() below logs the raw response the first few
 * times it's used so that shape can be confirmed/tightened once real
 * enrollments have gone through.
 */

export type FaceVerifyResult =
  | { outcome: "matched"; similarity: number | null }
  | { outcome: "mismatch"; message: string; similarity: number | null }
  | { outcome: "unavailable"; reason: string };

export type FaceEmbedResult =
  | { outcome: "enrolled" }
  | { outcome: "failed"; message: string }
  | { outcome: "unavailable"; reason: string };

interface FaceVerifyResponse {
  success?: boolean;
  status?: string;
  message?: string;
  similarity?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Calls the face-verification service for one check-in photo. Never throws —
 * any network error, timeout, or unparseable response comes back as
 * `{ outcome: "unavailable" }` so the caller (the kiosk scan route) can
 * apply its own fail-open policy instead of this helper deciding that.
 */
export async function verifyFace(
  employeeCode: string,
  photo: Uint8Array<ArrayBuffer>,
): Promise<FaceVerifyResult> {
  const baseUrl = process.env.FACE_VERIFY_URL;
  if (!baseUrl) {
    return {
      outcome: "unavailable",
      reason: "FACE_VERIFY_URL is not configured",
    };
  }

  const timeoutMs =
    Number(process.env.FACE_VERIFY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.set("employee_id", employeeCode);
    form.set("image", new Blob([photo], { type: "image/jpeg" }), "checkin.jpg");

    const res = await fetch(new URL("/verify", baseUrl), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    console.log(`face res: ${res}`);
    if (!res.ok) {
      return {
        outcome: "unavailable",
        reason: `Face verify service returned ${res.status}`,
      };
    }

    const data: FaceVerifyResponse = await res.json();
    console.log(`face data: ${JSON.stringify(data)}`);
    const similarity =
      typeof data.similarity === "number" ? data.similarity : null;

    if (data.success === true) {
      return { outcome: "matched", similarity };
    }
    return {
      outcome: "mismatch",
      message: data.message || "Face verification failed.",
      similarity,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    return { outcome: "unavailable", reason };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Enrolls one employee's reference photo with the face-verification service
 * (POST /embed) — called once, at employee-creation time, when an admin
 * supplies a photo. Never throws, same fail-open contract as verifyFace: any
 * network error, timeout, or unparseable response comes back as
 * `{ outcome: "unavailable" }` so the caller can still create the employee
 * and just leave faceVerificationEnabled off rather than failing the whole
 * request.
 */
export async function embedFace(
  employeeCode: string,
  photo: Uint8Array<ArrayBuffer>,
): Promise<FaceEmbedResult> {
  const baseUrl = process.env.FACE_VERIFY_URL;
  if (!baseUrl) {
    return {
      outcome: "unavailable",
      reason: "FACE_VERIFY_URL is not configured",
    };
  }

  const timeoutMs =
    Number(process.env.FACE_VERIFY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.set("employee_id", employeeCode);
    form.set("image", new Blob([photo], { type: "image/jpeg" }), "enroll.jpg");

    const res = await fetch(new URL("/embed", baseUrl), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        outcome: "unavailable",
        reason: `Face embed service returned ${res.status}`,
      };
    }

    const data: FaceVerifyResponse = await res.json().catch(() => ({}));
    // Shape of /embed's response isn't documented — log it raw until it's
    // been observed for real (see file header) so this can be tightened.
    console.log(`face embed response for ${employeeCode}: ${JSON.stringify(data)}`);

    if (data.success === false) {
      return { outcome: "failed", message: data.message || "Face enrollment failed." };
    }
    // No explicit `success: false` (including no `success` field at all,
    // which /embed may just omit on the happy path) is treated as enrolled.
    return { outcome: "enrolled" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    return { outcome: "unavailable", reason };
  } finally {
    clearTimeout(timeout);
  }
}
