import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

    if (!apiKey) {
      return this.mockExtract(opts.fileName, model);
    }

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

      const parsed = JSON.parse(content) as ExtractedExpense & { confidence?: number };
      const { confidence, ...payload } = parsed;
      return {
        payload,
        confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0.7,
        model,
        mocked: false,
      };
    } catch (err) {
      this.logger.warn(
        `OpenRouter extract failed (${err instanceof Error ? err.message : String(err)}) — falling back to mock`,
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
