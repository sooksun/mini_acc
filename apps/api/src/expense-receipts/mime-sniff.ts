/**
 * Detect MIME from the leading bytes of a file buffer.
 *
 * We don't trust `Content-Type` from the client (a malicious uploader can set it
 * to `application/pdf` while sending a .exe), and we don't trust the filename
 * extension (same reason). This sniffer only knows the four formats we accept
 * for expense receipts — adding a new format means a new magic-byte rule here.
 *
 * Returns the canonical MIME string when a match is found, or `null` otherwise.
 */

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF = Buffer.from('RIFF');
const WEBP = Buffer.from('WEBP');

export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'application/pdf';
  }
  if (
    buffer.length >= JPEG_MAGIC.length &&
    buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= PNG_MAGIC.length &&
    buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
  ) {
    return 'image/png';
  }
  // WEBP: "RIFF" <4-byte little-endian size> "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF) &&
    buffer.subarray(8, 12).equals(WEBP)
  ) {
    return 'image/webp';
  }
  return null;
}
