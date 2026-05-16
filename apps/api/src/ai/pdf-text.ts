import { Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

const logger = new Logger('PdfText');

/**
 * Extract text content from a PDF buffer so the LLM has something to read.
 * รองรับเฉพาะ PDF; image (jpeg/png/webp) คืน undefined — รอ vision phase หรือ OCR.
 * ไม่ throw ถ้า extract ไม่ได้ — กลับ undefined เพื่อให้ caller ใช้ mock/filename ตามเดิม.
 */
export async function extractPdfText(
  buffer: Buffer,
  mime: string,
): Promise<string | undefined> {
  if (mime !== 'application/pdf') return undefined;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text?.trim();
    return text && text.length > 0 ? text : undefined;
  } catch (err) {
    logger.warn(
      `pdf-parse failed (${err instanceof Error ? err.message : String(err)}) — proceeding without text`,
    );
    return undefined;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
