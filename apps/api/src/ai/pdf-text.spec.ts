// Mock pdf-parse before importing the module under test so the import-time
// `new PDFParse(...)` ใน extractPdfText สามารถ instantiate ตัว mock ได้
// โดยไม่ต้องโหลด @napi-rs/canvas binaries.
const mockGetText = jest.fn();
const mockDestroy = jest.fn();
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

import { extractPdfText } from './pdf-text';
import { PDFParse } from 'pdf-parse';

const PDFParseMock = PDFParse as unknown as jest.Mock;

describe('extractPdfText', () => {
  beforeEach(() => {
    mockGetText.mockReset();
    mockDestroy.mockReset();
    mockDestroy.mockResolvedValue(undefined);
    PDFParseMock.mockClear();
  });

  it('returns undefined for non-PDF mime types without invoking the parser', async () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'text/plain', '']) {
      const result = await extractPdfText(Buffer.from('whatever'), mime);
      expect(result).toBeUndefined();
    }
    expect(PDFParseMock).not.toHaveBeenCalled();
    expect(mockGetText).not.toHaveBeenCalled();
  });

  it('returns the trimmed text when the parser yields a non-empty string', async () => {
    mockGetText.mockResolvedValue({ text: '  Vendor: ACME\nTotal: 1,070\n  ' });
    const result = await extractPdfText(Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(result).toBe('Vendor: ACME\nTotal: 1,070');
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the parser yields an empty string', async () => {
    mockGetText.mockResolvedValue({ text: '' });
    const result = await extractPdfText(Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(result).toBeUndefined();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the parser yields whitespace-only text', async () => {
    mockGetText.mockResolvedValue({ text: '   \n\t  ' });
    const result = await extractPdfText(Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(result).toBeUndefined();
  });

  it('returns undefined when the parser result has no text field', async () => {
    mockGetText.mockResolvedValue({});
    const result = await extractPdfText(Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(result).toBeUndefined();
  });

  it('swallows parser errors and returns undefined (does not throw)', async () => {
    mockGetText.mockRejectedValue(new Error('corrupted PDF: trailer not found'));
    const result = await extractPdfText(Buffer.from('not a real PDF'), 'application/pdf');
    expect(result).toBeUndefined();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('still calls destroy when the parser throws (resource cleanup)', async () => {
    mockGetText.mockRejectedValue(new Error('boom'));
    await extractPdfText(Buffer.from('x'), 'application/pdf');
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('still resolves cleanly when destroy itself rejects', async () => {
    mockGetText.mockResolvedValue({ text: 'hello' });
    mockDestroy.mockRejectedValue(new Error('double-destroy'));
    const result = await extractPdfText(Buffer.from('x'), 'application/pdf');
    expect(result).toBe('hello');
  });

  it('passes a Uint8Array view of the buffer to PDFParse', async () => {
    mockGetText.mockResolvedValue({ text: 'ok' });
    await extractPdfText(Buffer.from('hello'), 'application/pdf');
    expect(PDFParseMock).toHaveBeenCalledTimes(1);
    const passed = PDFParseMock.mock.calls[0]![0] as { data: Uint8Array };
    expect(passed.data).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(passed.data).toString('utf8')).toBe('hello');
  });
});
