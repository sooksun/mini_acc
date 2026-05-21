import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
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
    // Persist packs under a throwaway temp dir so the repo's var/ stays clean.
    process.env.ATTACHMENT_DIR = join(tmpdir(), `hjacc-pack-test-${randomUUID()}`);
    env = await bootstrapTestEnv();
    service = env.app.get(AccountantPackService);
    closing = env.app.get(ClosingService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

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

  it('builds a ZIP, persists an ExportBatch, and re-downloads it', async () => {
    // Close a clean period (no docs, no risks) so all hard blocks pass.
    await closing.closePeriod(env.seed.companyId, env.seed.userId, 'OWNER', {
      year: 2026,
      month: 5,
    });

    const { filename, buffer, batchId } = await service.exportPack(
      env.seed.companyId,
      2026,
      5,
      env.seed.userId,
    );
    expect(filename).toContain('accountant-pack');
    expect(filename).toContain('2026-05');
    expect(filename.endsWith('.zip')).toBe(true);
    expect(batchId).toBeTruthy();

    // ZIP "local file header" magic: 0x50 0x4b 0x03 0x04 ("PK\x03\x04")
    expect(buffer.length).toBeGreaterThan(200);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    const text = buffer.toString('utf-8');
    expect(text).toContain('01_sales_register.xlsx');
    expect(text).toContain('12_risk_summary.pdf');
    expect(text).toContain('13_attachment_index.xlsx');
    expect(text).toContain('README.txt');

    // Persisted as an ExportBatch (PRD §18) — listable + re-downloadable.
    const batches = await service.listBatches(env.seed.companyId);
    const row = batches.find((b) => b.id === batchId);
    expect(row).toBeDefined();
    expect(row?.year).toBe(2026);
    expect(row?.month).toBe(5);
    expect(row?.sizeBytes).toBe(buffer.length);

    const dl = await service.downloadBatch(env.seed.companyId, batchId);
    expect(dl.filename).toBe(filename);
    expect(dl.buffer.length).toBe(buffer.length);
    expect(dl.buffer[0]).toBe(0x50);
  }, 60000);

  it('download throws when the batch id is unknown', async () => {
    await expect(
      service.downloadBatch(env.seed.companyId, 'nonexistent-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXPORT_NOT_FOUND' }),
    });
  });
});
