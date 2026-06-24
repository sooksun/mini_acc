import { Injectable } from '@nestjs/common';
import type {
  AssistantAction,
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantFieldSchema,
  AssistantPageAdviceResponse,
  AssistantPageContext,
  AuthUser,
} from '@hj/shared-types';
import { OpenRouterClient, stripJsonFence } from '../ai/openrouter.client';
import { AuditLogService } from '../audit-log/audit-log.service';

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_FIELDS = 60;
const MAX_SCREEN_TEXT = 4000;
const MAX_STATIC_ADVICE = 2000;

/** Mock reply when OpenRouter is off — uses client-provided route copy, not a
 *  duplicated server-side table. */
function mockPageAdvice(ctx: AssistantPageContext): string {
  const fromClient = ctx.staticAdvice?.trim();
  if (fromClient) {
    if (ctx.mode === 'edit') {
      return `${fromClient} (โหมดแก้ไข — ผู้ช่วย AI ยังไม่พร้อม ตรวจค่าที่กรอกไว้ก่อนบันทึก)`;
    }
    return fromClient;
  }
  if (ctx.mode === 'edit') {
    return `ตรวจค่าที่กรอกในหน้า "${ctx.title}" ให้ครบถ้วนก่อนบันทึกครับ`;
  }
  return `หน้านี้คือ "${ctx.title}" — บอกผมได้ว่าต้องการทำอะไร เดี๋ยวผมช่วยแนะนำทีละขั้นครับ`;
}

/** Compact render of a field value for the edit-review prompt. */
function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '(ว่าง)';
  if (Array.isArray(v)) return `${v.length} รายการ`;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
  return String(v).slice(0, 200);
}

/**
 * The floating-panel assistant. Deliberately injects NO Prisma/business repo —
 * it only proxies OpenRouter and writes an advisory audit row on fill. The
 * returned `AssistantAction` union has no submit/save variant, so the AI can
 * never mutate; the user clicks Save on the page (the guarded mutation path).
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly openrouter: OpenRouterClient,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Contextual guidance. The web panel calls this only for EDIT (Update) pages —
   * create/read/delete use pre-designed static advice client-side. So the prompt
   * is review-focused: look at the values already filled + the on-screen data and
   * advise what to check / correct / complete for THIS record.
   */
  async pageAdvice(
    _user: AuthUser,
    context: AssistantPageContext,
  ): Promise<AssistantPageAdviceResponse> {
    const ctx = this.clampContext(context);
    const isEdit = ctx.mode === 'edit';
    const fieldLines = ctx.fields
      .map((f) => `- ${f.label}${f.required ? ' (จำเป็น)' : ''}: ${formatValue(ctx.currentValues?.[f.name])}`)
      .join('\n');

    const system = isEdit
      ? `คุณเป็นผู้ช่วยระบบบัญชีไทยสำหรับ หจก. ขนาดเล็ก ผู้ใช้กำลัง "แก้ไข" ข้อมูลในหน้า "${ctx.title}" (${ctx.route})
ดูค่าที่กรอกไว้แล้วและข้อมูลบนหน้าจอ แล้วแนะนำสั้น ๆ (1-3 ประโยค) ว่าควรตรวจ/แก้/เติมอะไรให้ถูกต้องและครบสำหรับรายการนี้โดยเฉพาะ
อ้างอิงค่าจริงที่เห็น เช่น ช่องที่ยังว่าง ความไม่สอดคล้อง หรือสิ่งที่อาจพลาด
ห้ามแนะนำให้กดบันทึก/ยืนยันแทนผู้ใช้ ห้ามแต่งตัวเลขที่ไม่มีในข้อมูล
ค่าที่กรอกไว้ตอนนี้:
${fieldLines || '(ไม่มีช่อง)'}`.trim()
      : `คุณเป็นผู้ช่วยระบบบัญชีไทยสำหรับ หจก. ขนาดเล็ก ผู้ใช้เพิ่งเปิดหน้า "${ctx.title}" (${ctx.route})
ตอบสั้น 1-3 ประโยคเป็นภาษาไทย: หน้านี้ใช้ทำอะไร และงานที่พบบ่อยทำยังไง
ห้ามแนะนำให้กดบันทึก/ยืนยันแทนผู้ใช้ ห้ามแต่งตัวเลข`.trim();

    const userMsg = ctx.screenText
      ? `ข้อความบนหน้าจอ:\n${ctx.screenText}`
      : 'แนะนำการแก้ไขข้อมูลรายการนี้ให้หน่อย';

    const result = await this.openrouter.chat({
      system,
      messages: [{ role: 'user', content: userMsg }],
      mockReply: mockPageAdvice(ctx),
    });
    return { message: result.content.trim(), mocked: result.mocked };
  }

  /** Multi-turn clarify→fill. Returns ask|fill (never save). */
  async chat(
    user: AuthUser,
    context: AssistantPageContext,
    messages: AssistantChatMessage[],
  ): Promise<AssistantChatResponse> {
    const ctx = this.clampContext(context);
    const msgs = this.clampMessages(messages);

    const result = await this.openrouter.chat({
      system: this.buildChatSystem(ctx),
      messages: msgs,
      json: true,
      mockReply:
        '{"action":"ask","message":"ขณะนี้ผู้ช่วย AI ยังไม่พร้อม (ยังไม่ได้ตั้งค่า API key) — กรอกฟอร์มเองไปก่อนได้เลยครับ"}',
    });

    const action = this.parseAndWhitelist(result.content, ctx.fields);

    if (action.action === 'fill') {
      // Advisory audit — record WHICH keys were filled, not their values.
      await this.audit
        .record({
          companyId: user.companyId,
          userId: user.id,
          action: 'AI_ASSISTANT_FILL',
          entityType: 'AssistantForm',
          entityId: ctx.route,
          metadata: { route: ctx.route, filledKeys: Object.keys(action.values) },
        })
        .catch(() => undefined);
    }

    return { ...action, mocked: result.mocked };
  }

  private buildChatSystem(ctx: AssistantPageContext): string {
    const fields = ctx.fields
      .map((f) => {
        const opts = f.options?.length
          ? ` ตัวเลือก: ${f.options.map((o) => `${o.value}=${o.label}`).join(', ')}`
          : '';
        return `- ${f.name} (${f.label}) ประเภท:${f.type}${f.required ? ' [จำเป็น]' : ''}${f.hint ? ` — ${f.hint}` : ''}${opts}`;
      })
      .join('\n');
    const current = JSON.stringify(ctx.currentValues ?? {});
    return `คุณเป็นผู้ช่วยกรอกฟอร์มในระบบบัญชีไทย ผู้ใช้กำลังอยู่หน้า "${ctx.title}" (${ctx.route})
ฟอร์มมีช่องต่อไปนี้ (อ้างอิงด้วย "ชื่อ field" ตามนี้เท่านั้น):
${fields || '(หน้านี้ไม่มีฟอร์มให้กรอก)'}
ค่าปัจจุบันในฟอร์ม: ${current}
${ctx.screenText ? `ข้อความบนหน้าจอ:\n${ctx.screenText}\n` : ''}
หน้าที่ของคุณ:
1) คุยกับผู้ใช้เป็นภาษาไทย ถามทีละคำถามสั้น ๆ จนได้ข้อมูลครบทุกช่องที่ [จำเป็น]
2) เมื่อข้อมูลครบ ส่งค่าที่จะกรอกลงฟอร์ม
กฎ (สำคัญมาก):
- ตอบเป็น JSON อย่างเดียว รูปแบบใดรูปแบบหนึ่ง:
  {"action":"ask","message":"คำถามภาษาไทย"}
  หรือ {"action":"fill","message":"สรุปสั้น ๆ ว่ากรอกอะไรให้","values":{"ชื่อ field": ค่า}}
- ใช้เฉพาะชื่อ field ที่ระบุไว้เท่านั้น ห้ามคิดชื่อใหม่
- วันที่รูปแบบ YYYY-MM-DD, จำนวนเงิน/ตัวเลขเป็น string ตัวเลข, checkbox เป็น true/false
- field ประเภท partner/product ให้ใส่ "ชื่อ" ที่ผู้ใช้บอก (ผู้ใช้จะเลือกตัวจริงเอง)
- field ประเภท items เป็น array ของ {description, quantity, unitPrice, unit?}
- ห้ามกดบันทึก/ยืนยันแทนผู้ใช้ — คุณแค่กรอกค่าให้ ผู้ใช้จะตรวจและกดบันทึกเอง
- ถ้ายังขาดข้อมูลจำเป็น ให้ใช้ action "ask"`.trim();
  }

  /** Parse the model's JSON and DROP any key not in the page's schema. */
  private parseAndWhitelist(content: string, fields: AssistantFieldSchema[]): AssistantAction {
    let parsed: { action?: string; message?: unknown; values?: unknown } | null = null;
    try {
      parsed = JSON.parse(stripJsonFence(content));
    } catch {
      return { action: 'ask', message: 'ขออภัย ผมยังไม่เข้าใจ ลองพิมพ์ใหม่อีกครั้งได้ไหมครับ' };
    }
    const message = typeof parsed?.message === 'string' ? parsed.message : '';
    if (parsed?.action === 'fill') {
      const allowed = new Set(fields.map((f) => f.name));
      const raw =
        parsed.values && typeof parsed.values === 'object'
          ? (parsed.values as Record<string, unknown>)
          : {};
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (allowed.has(k)) clean[k] = v; // unknown / __proto__ / injected keys dropped
      }
      return { action: 'fill', message: message || 'กรอกข้อมูลให้แล้ว ตรวจสอบก่อนบันทึกนะครับ', values: clean };
    }
    // Anything that isn't a valid `fill` degrades to a clarifying question.
    return { action: 'ask', message: message || 'ช่วยบอกรายละเอียดเพิ่มเติมได้ไหมครับ' };
  }

  private clampContext(context: AssistantPageContext): AssistantPageContext {
    return {
      route: String(context.route ?? ''),
      title: String(context.title ?? ''),
      fields: Array.isArray(context.fields) ? context.fields.slice(0, MAX_FIELDS) : [],
      currentValues:
        context.currentValues && typeof context.currentValues === 'object'
          ? context.currentValues
          : {},
      listEmpty: context.listEmpty,
      screenText:
        typeof context.screenText === 'string'
          ? context.screenText.slice(0, MAX_SCREEN_TEXT)
          : undefined,
      mode: context.mode,
      staticAdvice:
        typeof context.staticAdvice === 'string'
          ? context.staticAdvice.slice(0, MAX_STATIC_ADVICE)
          : undefined,
    };
  }

  private clampMessages(messages: AssistantChatMessage[]): AssistantChatMessage[] {
    const arr = Array.isArray(messages) ? messages : [];
    return arr.slice(-MAX_MESSAGES).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, MAX_MESSAGE_CHARS),
    }));
  }
}
