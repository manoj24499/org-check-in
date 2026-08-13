/**
 * Thrown by readJsonWithLimit when the request body exceeds the given byte
 * limit — callers should map this to a 413, distinct from a generic 400 for
 * actually-malformed JSON.
 */
export class PayloadTooLargeError extends Error {}

/**
 * Like `req.json()`, but enforces a byte limit *before* the whole body is
 * buffered into memory, rather than after. `req.json()` reads the entire
 * request into memory first and only lets a route check its size
 * afterward — an unauthenticated or lightly-authenticated caller (this is
 * used by the PIN-only kiosk scan and mobile field-visit routes, both of
 * which accept a base64 photo) could send an arbitrarily large body and
 * force that full allocation before any size check ever ran.
 *
 * Checks Content-Length first (fast path, catches well-behaved clients
 * immediately) and additionally polices the actual bytes read as a
 * streaming check — closing the gap a client could otherwise open by
 * omitting/understating Content-Length (e.g. chunked transfer-encoding).
 */
export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new PayloadTooLargeError();
  }

  if (!req.body) return JSON.parse("");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return JSON.parse(buffer.toString("utf-8"));
}
