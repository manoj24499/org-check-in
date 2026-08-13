import sharp from "sharp";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// These are presence-verification thumbnails, not photography — a phone
// camera's full sensor resolution (often 8-12+ megapixels) is enormously
// overkill for "can an admin tell who this is" and multiplies storage for
// no visible benefit. Capping the longest edge here also normalizes PNG/WEBP
// uploads down to a much more storage-efficient JPEG, uniformly for every
// client (web, mobile, any future one) with zero app-side changes needed.
const MAX_DIMENSION_PX = 640;
const JPEG_QUALITY = 75;

/**
 * Confirms the decoded bytes actually start with a recognized image file
 * signature. Without this, the base64 prefix check alone (`data:image/
 * jpeg;base64,...`) is just a client-asserted label — a caller can wrap
 * arbitrary bytes (HTML/SVG with an embedded script, for instance) behind
 * that same prefix and it would decode and store just fine. The
 * photo-serving routes already force `Content-Type: image/jpeg` and (as of
 * the CSP/security-headers pass) send `X-Content-Type-Options: nosniff`,
 * which together stop a browser from executing mislabeled content it's
 * served — this closes the other half: reject it at upload time instead of
 * only defusing it at serve time.
 */
function looksLikeImage(bytes: Uint8Array): boolean {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/**
 * Decodes a `data:image/(jpeg|jpg|png|webp);base64,...` string into resized,
 * recompressed JPEG bytes — returning null if the prefix doesn't match, the
 * base64 doesn't decode, the decoded bytes don't actually look like one of
 * those image formats, or sharp can't process it (a corrupt/truncated
 * upload). Shared by every route that accepts an uploaded photo (kiosk
 * check-in/out, mobile field visits) so both get the same validation,
 * storage-size cap, and can't drift out of sync with each other.
 */
export async function decodePhoto(dataUrl: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
    if (!looksLikeImage(bytes)) return null;

    const resized = await sharp(bytes)
      .rotate() // apply EXIF orientation before it's stripped below, so photos taken sideways come out upright
      .resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    // Copy into a plain ArrayBuffer-backed Uint8Array — Prisma's Bytes type
    // rejects Buffer's wider ArrayBufferLike (which also allows SharedArrayBuffer).
    return new Uint8Array(resized) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
}
