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

// Match server-side DTOs (accept-suggestion.dto.ts, upload-expense-receipt.dto.ts).
// AI sometimes returns garbage like "874436547" (9-digit US-style EIN) for
// foreign vendors — we strip those at extraction time so the operator's review
// form starts clean instead of failing validation at submit.
const TAX_ID_RE = /^\d{13}$/;
const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

export function sanitizeExtractedExpense(raw: ExtractedExpense): ExtractedExpense {
  const out: ExtractedExpense = { ...raw };
  if (out.vendorTaxId !== undefined) {
    const cleaned = out.vendorTaxId.replace(/[\s-]/g, '').trim();
    out.vendorTaxId = TAX_ID_RE.test(cleaned) ? cleaned : undefined;
  }
  for (const f of ['subtotal', 'vatAmount', 'withholdingTaxAmount', 'grandTotal'] as const) {
    const v = out[f];
    if (v !== undefined) {
      const cleaned = v.replace(/,/g, '').trim();
      out[f] = MONEY_RE.test(cleaned) ? cleaned : undefined;
    }
  }
  return out;
}

const QTY_RE = /^\d+(\.\d{1,4})?$/;

export interface ExtractedReceiptLineItem {
  /** Product name exactly as printed on the receipt. */
  description: string;
  /** Numeric string; quantity bought. */
  quantity?: string;
  /** e.g. ชิ้น, กล่อง, ชุด. */
  unit?: string;
  /** PURCHASE price per single unit (before VAT), numeric string. */
  unitPrice?: string;
}

export interface ExtractedReceiptItems {
  vendorName?: string;
  documentNumber?: string;
  documentDate?: string;
  items: ExtractedReceiptLineItem[];
}

/** Keep only rows with a non-empty description and normalize money/quantity the
 *  same way sanitizeExtractedExpense does (strip commas, validate format). */
export function sanitizeReceiptItems(raw: ExtractedReceiptItems): ExtractedReceiptItems {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: ExtractedReceiptLineItem[] = [];
  for (const it of rawItems) {
    const description = typeof it?.description === 'string' ? it.description.trim() : '';
    if (!description) continue;
    const out: ExtractedReceiptLineItem = { description };
    if (typeof it.unit === 'string' && it.unit.trim()) out.unit = it.unit.trim();
    if (it.quantity !== undefined && it.quantity !== null) {
      const q = String(it.quantity).replace(/,/g, '').trim();
      if (QTY_RE.test(q)) out.quantity = q;
    }
    if (it.unitPrice !== undefined && it.unitPrice !== null) {
      const p = String(it.unitPrice).replace(/,/g, '').trim();
      if (MONEY_RE.test(p)) out.unitPrice = p;
    }
    items.push(out);
  }
  return {
    vendorName: raw.vendorName,
    documentNumber: raw.documentNumber,
    documentDate: raw.documentDate,
    items,
  };
}

export interface ExtractionResult {
  payload: ExtractedExpense;
  confidence: number;
  model: string;
  /** True when the result came from the mock fallback (no API key configured). */
  mocked: boolean;
}

export interface ReceiptItemsExtractionResult {
  payload: ExtractedReceiptItems;
  confidence: number;
  model: string;
  /** True when the result came from the mock fallback (no API key configured). */
  mocked: boolean;
}

export interface ChatResult {
  content: string;
  model: string;
  /** True when the result is the canned fallback (no API key / disabled / failure). */
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
  "vendorTaxId": string (EXACTLY 13 numeric digits — Thai tax ID format only. OMIT this field for foreign vendors / non-Thai tax IDs / anything shorter or longer than 13 digits),
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
      const sanitized = sanitizeExtractedExpense(payload);
      this.logger.log(
        `openrouter.extract.done fileName=${opts.fileName} model=${model} durationMs=${Date.now() - startedAt} confidence=${clamped}`,
      );
      return { payload: sanitized, confidence: clamped, model, mocked: false };
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
   * Line-item extraction for the "quotation from purchase receipts" flow. Unlike
   * extractExpense (header-only), this pulls every purchased product row so the
   * owner can turn them into catalog products + a draft quotation. Same mock
   * fallback contract: no API key / disabled / failure → empty items, low
   * confidence, so the reviewer fills the table by hand.
   */
  async extractReceiptItems(opts: {
    fileName: string;
    text?: string;
  }): Promise<ReceiptItemsExtractionResult> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    const model =
      this.config.get<string>('OPENROUTER_MODEL_EXTRACT') ?? 'anthropic/claude-sonnet-4';
    const timeoutMs = Number(this.config.get<string>('OPENROUTER_TIMEOUT_MS') ?? 30_000);
    const disabled = this.config.get<string>('AI_INBOX_DISABLED') === '1';
    const textChars = opts.text?.length ?? 0;

    if (disabled || !apiKey) {
      this.logger.log(
        `openrouter.extractItems.skipped reason=${disabled ? 'disabled' : 'no_api_key'} fileName=${opts.fileName} textChars=${textChars}`,
      );
      return this.mockReceiptItems(model);
    }

    const startedAt = Date.now();
    this.logger.log(
      `openrouter.extractItems.start fileName=${opts.fileName} model=${model} textChars=${textChars} timeoutMs=${timeoutMs}`,
    );

    try {
      const prompt = `Extract every purchased line item from this Thai purchase receipt or tax invoice.
The buyer is a reseller (ซื้อมา-ขายไป), so each row is a product they bought to resell.
Return ONLY a JSON object with these keys (omit header fields you can't find):
{
  "vendorName": string,
  "documentNumber": string,
  "documentDate": string (YYYY-MM-DD),
  "items": [
    {
      "description": string (product name exactly as printed),
      "quantity": string (number; use "1" if not shown),
      "unit": string (e.g. ชิ้น, กล่อง, ชุด; use "ชิ้น" if not shown),
      "unitPrice": string (PRICE PER SINGLE UNIT before VAT, 2 decimals — NOT the line total)
    }
  ],
  "confidence": number (0..1)
}
List every distinct product row. EXCLUDE summary rows (subtotal, VAT, discount, grand total, shipping).

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
            {
              role: 'system',
              content: 'You extract structured line items from Thai accounting documents.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter returned no content');

      let parsed: ExtractedReceiptItems & { confidence?: number };
      try {
        parsed = JSON.parse(stripJsonFence(content)) as ExtractedReceiptItems & {
          confidence?: number;
        };
      } catch (parseErr) {
        this.logger.warn(
          `OpenRouter items JSON parse failed (${parseErr instanceof Error ? parseErr.message : String(parseErr)}). raw (first 500): ${content.slice(0, 500)}`,
        );
        throw parseErr;
      }
      const { confidence, ...payload } = parsed;
      const clamped =
        typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0.7;
      const sanitized = sanitizeReceiptItems(payload);
      this.logger.log(
        `openrouter.extractItems.done fileName=${opts.fileName} model=${model} durationMs=${Date.now() - startedAt} items=${sanitized.items.length} confidence=${clamped}`,
      );
      return { payload: sanitized, confidence: clamped, model, mocked: false };
    } catch (err) {
      const isTimeout =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const reason = isTimeout
        ? `timed_out_${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      this.logger.warn(
        `openrouter.extractItems.failed fileName=${opts.fileName} model=${model} durationMs=${Date.now() - startedAt} reason=${reason} — falling back to mock`,
      );
      return this.mockReceiptItems(model);
    }
  }

  /**
   * Generic chat completion — the transport for the floating-panel assistant.
   * Reuses the same fetch / timeout / fallback contract as the extractors but
   * stays schema-agnostic: it returns the raw assistant `content`, and the
   * caller (AssistantService) owns parsing + key-whitelisting.
   *
   * Kill switch is `ASSISTANT_DISABLED` (separate from the AI-Inbox egress flag
   * `AI_INBOX_DISABLED`). No key / disabled / failure → the caller-supplied
   * `mockReply` (or a safe default), `mocked: true`, no network call.
   */
  async chat(opts: {
    system: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    json?: boolean;
    mockReply?: string;
  }): Promise<ChatResult> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    const model =
      this.config.get<string>('OPENROUTER_MODEL_EXTRACT') ?? 'anthropic/claude-sonnet-4';
    const timeoutMs = Number(this.config.get<string>('OPENROUTER_TIMEOUT_MS') ?? 30_000);
    const disabled = this.config.get<string>('ASSISTANT_DISABLED') === '1';
    const fallback =
      opts.mockReply ??
      (opts.json
        ? '{"action":"ask","message":"ผู้ช่วยยังไม่พร้อมใช้งานในขณะนี้"}'
        : 'ผู้ช่วยยังไม่พร้อมใช้งานในขณะนี้');

    if (disabled || !apiKey) {
      this.logger.log(
        `openrouter.chat.skipped reason=${disabled ? 'disabled' : 'no_api_key'} msgs=${opts.messages.length}`,
      );
      return { content: fallback, model: `${model} (mock)`, mocked: true };
    }

    const startedAt = Date.now();
    this.logger.log(
      `openrouter.chat.start model=${model} msgs=${opts.messages.length} json=${opts.json ? 1 : 0} timeoutMs=${timeoutMs}`,
    );
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: opts.system }, ...opts.messages],
          temperature: 0,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter returned no content');
      this.logger.log(
        `openrouter.chat.done model=${model} durationMs=${Date.now() - startedAt} chars=${content.length}`,
      );
      return { content, model, mocked: false };
    } catch (err) {
      const isTimeout =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const reason = isTimeout
        ? `timed_out_${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      this.logger.warn(
        `openrouter.chat.failed model=${model} durationMs=${Date.now() - startedAt} reason=${reason} — falling back to mock`,
      );
      return { content: fallback, model: `${model} (mock)`, mocked: true };
    }
  }

  private mockReceiptItems(model: string): ReceiptItemsExtractionResult {
    return {
      payload: { items: [] },
      confidence: 0.3,
      model: `${model} (mock)`,
      mocked: true,
    };
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
