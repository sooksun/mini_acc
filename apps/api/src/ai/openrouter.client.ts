import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  // จับ fenced block ที่อาจมีข้อความนำ/ท้าย (Claude บางครั้งใส่ preamble หรือ
  // postscript แม้กำหนด response_format: json_object). non-greedy เพื่อหยุดที่
  // closing fence แรกที่เจอ.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence?.[1]?.trim() ?? trimmed;
}

export interface ExtractedExpense {
  vendorName?: string;
  vendorTaxId?: string;
  documentNumber?: string;
  documentDate?: string;
  paidAt?: string;
  category?: string;
  subtotal?: string;
  vatAmount?: string;
  withholdingTaxAmount?: string;
  grandTotal?: string;
}

export interface ExtractionResult {
  payload: ExtractedExpense;
  confidence: number;
  model: string;
  /** True when the result came from the mock fallback (no API key configured). */
  mocked: boolean;
}

/**
 * Thin wrapper around OpenRouter chat-completion API. We deliberately keep it
 * minimal — only what the AI Inbox needs today (document field extraction).
 *
 * When OPENROUTER_API_KEY is unset, the client returns a clearly-labelled mock
 * with low confidence so the reviewer is forced to fill the fields in. This
 * lets us ship the workflow end-to-end without an API key in dev.
 */
@Injectable()
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);

  constructor(private config: ConfigService) {}

  async extractExpense(opts: { fileName: string; text?: string }): Promise<ExtractionResult> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    const model =
      this.config.get<string>('OPENROUTER_MODEL_EXTRACT') ?? 'anthropic/claude-sonnet-4';
    const timeoutMs = Number(this.config.get<string>('OPENROUTER_TIMEOUT_MS') ?? 30_000);
    const disabled = this.config.get<string>('AI_INBOX_DISABLED') === '1';
    const textChars = opts.text?.length ?? 0;

    // Egress kill switch — for customers with strict data-egress policies.
    // PDF text stays inside the perimeter, reviewer fills the fields by hand.
    if (disabled) {
      this.logger.log(
        `openrouter.extract.skipped reason=disabled fileName=${opts.fileName} textChars=${textChars}`,
      );
      return this.mockExtract(opts.fileName, model);
    }

    if (!apiKey) {
      this.logger.log(
        `openrouter.extract.skipped reason=no_api_key fileName=${opts.fileName} textChars=${textChars}`,
      );
      return this.mockExtract(opts.fileName, model);
    }

    // Audit-trail entry BEFORE the request — proves that PDF text (vendor names,
    // tax IDs, addresses, amounts) left the perimeter for $model. Pair with the
    // matching `extract.done` or `extract.failed` line via fileName + timestamp.
    const startedAt = Date.now();
    this.logger.log(
      `openrouter.extract.start fileName=${opts.fileName} model=${model} textChars=${textChars} timeoutMs=${timeoutMs}`,
    );

    try {
      const prompt = `Extract the following fields from this Thai expense receipt or tax invoice.
Return ONLY a JSON object with these keys (omit any you can't find with high confidence):
{
  "vendorName": string,
  "vendorTaxId": string (13 digits),
  "documentNumber": string,
  "documentDate": string (YYYY-MM-DD),
  "paidAt": string (YYYY-MM-DD),
  "category": string,
  "subtotal": string (number, 2 decimals),
  "vatAmount": string,
  "withholdingTaxAmount": string,
  "grandTotal": string,
  "confidence": number (0..1)
}

Document filename: ${opts.fileName}
Document text:
${(opts.text ?? '(no text extracted)').slice(0, 8000)}`;

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You extract structured fields from Thai accounting documents.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        // AbortSignal.timeout() throws DOMException(name='TimeoutError') in Node 20+.
        // ป้องกัน upload flow ค้างยาวเมื่อ OpenRouter ช้าหรือ network หาย.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter returned no content');

      // Claude (via OpenRouter) มัก wrap JSON ด้วย ```json ... ``` แม้ใส่
      // response_format: json_object — ดึง JSON ออกก่อน parse. ถ้า parse fail
      // log raw content เพื่อ debug แล้ว rethrow ให้ outer catch fall back ไป mock.
      let parsed: ExtractedExpense & { confidence?: number };
      try {
        parsed = JSON.parse(stripJsonFence(content)) as ExtractedExpense & {
          confidence?: number;
        };
      } catch (parseErr) {
        this.logger.warn(
          `OpenRouter JSON parse failed (${parseErr instanceof Error ? parseErr.message : String(parseErr)}). raw content (first 500): ${content.slice(0, 500)}`,
        );
        throw parseErr;
      }
      const { confidence, ...payload } = parsed;
      const clamped =
        typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0.7;
      this.logger.log(
        `openrouter.extract.done fileName=${opts.fileName} model=${model} durationMs=${Date.now() - startedAt} confidence=${clamped}`,
      );
      return { payload, confidence: clamped, model, mocked: false };
    } catch (err) {
      const isTimeout =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const reason = isTimeout
        ? `timed_out_${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      this.logger.warn(
        `openrouter.extract.failed fileName=${opts.fileName} model=${model} durationMs=${Date.now() - startedAt} reason=${reason} — falling back to mock`,
      );
      return this.mockExtract(opts.fileName, model);
    }
  }

  /**
   * Mock fallback. Returns a stub with low confidence so the reviewer can't
   * mistake it for a real extraction. The category is guessed from the
   * filename, which is genuinely useful for "ค่าซอฟต์แวร์ Adobe.pdf" style names.
   */
  private mockExtract(fileName: string, model: string): ExtractionResult {
    const lower = fileName.toLowerCase();
    let category: string | undefined;
    if (lower.includes('software') || lower.includes('saas') || lower.includes('subscription')) {
      category = 'ค่าซอฟต์แวร์';
    } else if (lower.includes('travel') || lower.includes('hotel') || lower.includes('flight')) {
      category = 'ค่าเดินทาง';
    } else if (lower.includes('office') || lower.includes('supplies')) {
      category = 'ค่าวัสดุสำนักงาน';
    }
    return {
      payload: {
        category,
        documentDate: new Date().toISOString().slice(0, 10),
      },
      confidence: 0.3,
      model: `${model} (mock)`,
      mocked: true,
    };
  }
}
