import { ConfigService } from '@nestjs/config';
import { OpenRouterClient, stripJsonFence } from './openrouter.client';

function clientWith(env: Record<string, string | undefined>): OpenRouterClient {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new OpenRouterClient(config);
}

describe('OpenRouterClient.chat', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the mockReply without calling fetch when no API key', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never);
    const client = clientWith({ OPENROUTER_API_KEY: undefined });
    const res = await client.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }], mockReply: 'CANNED' });
    expect(res).toEqual(expect.objectContaining({ content: 'CANNED', mocked: true }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the mockReply when ASSISTANT_DISABLED=1', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never);
    const client = clientWith({ OPENROUTER_API_KEY: 'sk-x', ASSISTANT_DISABLED: '1' });
    const res = await client.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }], mockReply: 'CANNED' });
    expect(res.mocked).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parses choices[0].message.content on a real call', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"ask","message":"hi"}' } }] }),
    } as never);
    const client = clientWith({ OPENROUTER_API_KEY: 'sk-x' });
    const res = await client.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }], json: true });
    expect(res.mocked).toBe(false);
    expect(res.content).toContain('"action":"ask"');
  });

  it('falls back to mockReply when fetch throws', async () => {
    jest.spyOn(global, 'fetch' as never).mockRejectedValue(new Error('network down'));
    const client = clientWith({ OPENROUTER_API_KEY: 'sk-x' });
    const res = await client.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }], mockReply: 'CANNED' });
    expect(res).toEqual(expect.objectContaining({ content: 'CANNED', mocked: true }));
  });
});

describe('stripJsonFence', () => {
  it('returns plain JSON unchanged', () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fence', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fence (no language tag)', () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips fenced block surrounded by preamble + postscript', () => {
    const input = 'Sure! Here is the JSON:\n```json\n{"a":1}\n```\nLet me know if you need anything else.';
    expect(stripJsonFence(input)).toBe('{"a":1}');
  });

  it('strips fenced block with preamble only', () => {
    expect(stripJsonFence('Here you go:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips fenced block with postscript only', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```\nDone.')).toBe('{"a":1}');
  });

  it('returns trimmed input when no fence present (caller will JSON.parse and fail loudly)', () => {
    expect(stripJsonFence('Here is the JSON: {"a":1}')).toBe('Here is the JSON: {"a":1}');
  });

  it('picks the first fenced block when multiple are present', () => {
    const input = '```json\n{"first":true}\n```\nand also:\n```json\n{"second":true}\n```';
    expect(stripJsonFence(input)).toBe('{"first":true}');
  });

  it('handles inner whitespace around the JSON body', () => {
    expect(stripJsonFence('```json\n   {"a":1}   \n```')).toBe('{"a":1}');
  });

  it('handles multiline JSON inside the fence', () => {
    const input = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```';
    expect(stripJsonFence(input)).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('trims outer whitespace before matching', () => {
    expect(stripJsonFence('\n\n  ```json\n{"a":1}\n```  \n')).toBe('{"a":1}');
  });
});
