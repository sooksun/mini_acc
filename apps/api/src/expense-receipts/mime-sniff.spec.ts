import { sniffMime } from './mime-sniff';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]), // 32-byte size, little-endian (arbitrary)
  Buffer.from('WEBP'),
  Buffer.from([0x56, 0x50, 0x38, 0x20]), // VP8 chunk header
]);

describe('sniffMime', () => {
  it('detects PDF', () => {
    expect(sniffMime(PDF)).toBe('application/pdf');
  });

  it('detects JPEG', () => {
    expect(sniffMime(JPEG)).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    expect(sniffMime(PNG)).toBe('image/png');
  });

  it('detects WEBP', () => {
    expect(sniffMime(WEBP)).toBe('image/webp');
  });

  it('returns null for ASCII text', () => {
    expect(sniffMime(Buffer.from('hello world this is plain text'))).toBeNull();
  });

  it('returns null for empty', () => {
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for WEBP-prefix without WEBP marker', () => {
    const fake = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('XXXX')]);
    expect(sniffMime(fake)).toBeNull();
  });

  it('returns null for partial PDF magic (truncated)', () => {
    expect(sniffMime(Buffer.from([0x25, 0x50]))).toBeNull();
  });
});
