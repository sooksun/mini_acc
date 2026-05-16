import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountantPackService } from './accountant-pack.service';
import { ClosingService } from '../closing/closing.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('AccountantPackService (integration)', () => {
  let env: TestEnv;
  let service: AccountantPackService;
  let closing: ClosingService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    service = env.app.get(AccountantPackService);
    closing = env.app.get(ClosingService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  it('refuses export when period does not exist', async () => {
    await expect(
      service.exportPack(env.seed.companyId, 2099, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses export when period exists but is OPEN', async () => {
    await env.prisma.accountingPeriod.create({
      data: {
        companyId: env.seed.companyId,
        year: 2026,
        month: 4,
        status: 'OPEN',
      },
    });
    await expect(
      service.exportPack(env.seed.companyId, 2026, 4),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERIOD_NOT_LOCKED' }),
    });
  });

  it('streams a ZIP starting with PK header when period is LOCKED', async () => {
    // Close a clean period (no docs, no risks) so all hard blocks pass.
    await closing.closePeriod(env.seed.companyId, env.seed.userId, 'OWNER', {
      year: 2026,
      month: 5,
    });

    const { filename, stream } = await service.exportPack(env.seed.companyId, 2026, 5);
    expect(filename).toContain('accountant-pack');
    expect(filename).toContain('2026-05');
    expect(filename.endsWith('.zip')).toBe(true);

    const buf = await streamToBuffer(stream);
    // ZIP "local file header" magic: 0x50 0x4b 0x03 0x04 ("PK\x03\x04")
    expect(buf.length).toBeGreaterThan(200);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);

    // The Central Directory at the end should reference our expected files.
    // Decoded as UTF-8 across the whole buffer, filenames appear verbatim.
    const text = buf.toString('utf-8');
    expect(text).toContain('01_sales_register.xlsx');
    expect(text).toContain('06_vat_report.xlsx');
    expect(text).toContain('08_journal_entries.xlsx');
    expect(text).toContain('12_risk_summary.pdf');
    expect(text).toContain('13_attachment_index.xlsx');
    expect(text).toContain('README.txt');
  }, 60000);
});
