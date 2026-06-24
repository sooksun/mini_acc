import type { AssistantPageContext, AuthUser } from '@hj/shared-types';
import { AssistantService } from './assistant.service';
import type { OpenRouterClient, ChatResult } from '../ai/openrouter.client';
import type { AuditLogService } from '../audit-log/audit-log.service';

const USER: AuthUser = {
  id: 'u1',
  email: 't@e.com',
  fullName: 'Test',
  initial: null,
  role: 'OWNER',
  companyId: 'c1',
};

const CTX: AssistantPageContext = {
  route: '/products',
  title: 'สินค้า/บริการ',
  fields: [
    { name: 'nameTh', label: 'ชื่อ', type: 'text', required: true },
    { name: 'unitPrice', label: 'ราคา', type: 'number', required: true },
  ],
  currentValues: {},
};

/** Build a service with a stubbed OpenRouterClient whose chat() returns `content`. */
function makeService(content: string, mocked = false) {
  const chat = jest.fn<Promise<ChatResult>, [unknown]>().mockResolvedValue({
    content,
    model: 'test',
    mocked,
  });
  const openrouter = { chat } as unknown as OpenRouterClient;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditLogService;
  return { service: new AssistantService(openrouter, audit), chat, record };
}

describe('AssistantService', () => {
  it('whitelists fill values — drops keys not in the schema (incl. __proto__)', async () => {
    const { service } = makeService(
      JSON.stringify({
        action: 'fill',
        message: 'กรอกให้แล้ว',
        values: { nameTh: 'ปากกา', unitPrice: '10', bogus: 'x', __proto__: { polluted: true } },
      }),
    );
    const res = await service.chat(USER, CTX, [{ role: 'user', content: 'เพิ่มปากกา 10 บาท' }]);
    expect(res.action).toBe('fill');
    if (res.action === 'fill') {
      expect(res.values).toEqual({ nameTh: 'ปากกา', unitPrice: '10' });
      expect('bogus' in res.values).toBe(false);
      // prototype not polluted
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it('records an AI_ASSISTANT_FILL audit (keys only) on a fill', async () => {
    const { service, record } = makeService(
      JSON.stringify({ action: 'fill', message: 'ok', values: { nameTh: 'ก' } }),
    );
    await service.chat(USER, CTX, [{ role: 'user', content: 'x' }]);
    expect(record).toHaveBeenCalledTimes(1);
    const arg = record.mock.calls[0][0];
    expect(arg.action).toBe('AI_ASSISTANT_FILL');
    expect(arg.metadata).toEqual({ route: '/products', filledKeys: ['nameTh'] });
  });

  it('does NOT audit on an ask', async () => {
    const { service, record } = makeService(JSON.stringify({ action: 'ask', message: 'ราคาเท่าไร?' }));
    const res = await service.chat(USER, CTX, [{ role: 'user', content: 'เพิ่มปากกา' }]);
    expect(res.action).toBe('ask');
    expect(record).not.toHaveBeenCalled();
  });

  it('degrades malformed JSON to an ask (never throws)', async () => {
    const { service } = makeService('this is not json at all');
    const res = await service.chat(USER, CTX, [{ role: 'user', content: 'x' }]);
    expect(res.action).toBe('ask');
    expect(typeof res.message).toBe('string');
  });

  it('forces an unknown action to ask', async () => {
    const { service } = makeService(JSON.stringify({ action: 'save', message: 'บันทึกแล้ว' }));
    const res = await service.chat(USER, CTX, [{ role: 'user', content: 'x' }]);
    expect(res.action).toBe('ask'); // no save/submit ever surfaces
  });

  it('propagates the mocked flag (no-key / disabled path)', async () => {
    const { service } = makeService('{"action":"ask","message":"ยังไม่พร้อม"}', true);
    const res = await service.chat(USER, CTX, [{ role: 'user', content: 'x' }]);
    expect(res.mocked).toBe(true);
  });

  it('caps the conversation to the last 20 messages and clamps content length', async () => {
    const { service, chat } = makeService(JSON.stringify({ action: 'ask', message: 'ok' }));
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: 'user' as const,
      content: 'x'.repeat(5000) + i,
    }));
    await service.chat(USER, CTX, messages);
    const sent = chat.mock.calls[0][0] as { messages: { content: string }[] };
    expect(sent.messages.length).toBe(20);
    expect(sent.messages[0].content.length).toBeLessThanOrEqual(4000);
  });

  it('pageAdvice returns the model content + mocked flag', async () => {
    const { service } = makeService('หน้านี้ใช้จัดการสินค้า', true);
    const res = await service.pageAdvice(USER, CTX);
    expect(res.message).toContain('สินค้า');
    expect(res.mocked).toBe(true);
  });

  it('pageAdvice passes client staticAdvice as mockReply (no server route table)', async () => {
    const { service, chat } = makeService('จากโมเดล', false);
    await service.pageAdvice(USER, {
      ...CTX,
      mode: 'edit',
      staticAdvice: 'คำแนะนำจาก client',
    });
    const sent = chat.mock.calls[0][0] as { mockReply: string };
    expect(sent.mockReply).toContain('คำแนะนำจาก client');
    expect(sent.mockReply).toContain('โหมดแก้ไข');
  });

  it('pageAdvice in edit mode feeds the current field values into the prompt', async () => {
    const { service, chat } = makeService('ตรวจราคาให้ดี', false);
    await service.pageAdvice(USER, {
      ...CTX,
      mode: 'edit',
      currentValues: { nameTh: 'ปากกา', unitPrice: '' },
    });
    const sent = chat.mock.calls[0][0] as { system: string };
    expect(sent.system).toContain('แก้ไข'); // edit-focused prompt
    expect(sent.system).toContain('ปากกา'); // current value echoed
    expect(sent.system).toContain('(ว่าง)'); // empty field flagged
  });
});
