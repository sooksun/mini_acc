import { ProjectsService } from './projects.service';
import { InvoicesService } from '../sales/invoices.service';
import {
  bootstrapTestEnv,
  teardownTestEnv,
  TestEnv,
} from '../../test/setup-integration';

describe('ProjectsService (integration)', () => {
  let env: TestEnv;
  let projects: ProjectsService;
  let invoices: InvoicesService;

  beforeAll(async () => {
    env = await bootstrapTestEnv();
    projects = env.app.get(ProjectsService);
    invoices = env.app.get(InvoicesService);
  });

  afterAll(async () => {
    await teardownTestEnv(env);
  });

  it('creates, lists and updates a project', async () => {
    const created = await projects.create(env.seed.companyId, {
      code: 'PRJ-001',
      name: 'เว็บไซต์ลูกค้า A',
      customerId: env.seed.customerId,
      budget: 50000,
    });
    expect(created.status).toBe('ACTIVE');
    expect(created.customerName).toBe('ลูกค้าทดสอบ');
    expect(created.budget).toBe('50000');

    const listed = await projects.list(env.seed.companyId, {});
    expect(listed.items.some((p) => p.id === created.id)).toBe(true);

    const updated = await projects.update(env.seed.companyId, created.id, {
      name: 'เว็บไซต์ลูกค้า A (เฟส 2)',
      status: 'COMPLETED',
    });
    expect(updated.name).toBe('เว็บไซต์ลูกค้า A (เฟส 2)');
    expect(updated.status).toBe('COMPLETED');
  });

  it('rejects duplicate code', async () => {
    await projects.create(env.seed.companyId, { code: 'PRJ-DUP', name: 'A' });
    await expect(
      projects.create(env.seed.companyId, { code: 'PRJ-DUP', name: 'B' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('computes profit = revenue (tagged sales) − cost (tagged expenses)', async () => {
    const project = await projects.create(env.seed.companyId, { name: 'งานติดตั้งระบบ' });

    // Revenue: a confirmed INVOICE tagged to the project (subtotal 1000).
    const inv = await invoices.create(env.seed.companyId, env.seed.userId, {
      customerId: env.seed.customerId,
      projectId: project.id,
      documentDate: '2026-05-10T00:00:00+07:00',
      vatRate: 7,
      whtRate: 0,
      items: [
        { productId: env.seed.productId, description: 'งาน', unit: 'งาน', quantity: 1, unitPrice: 1000, vatable: true },
      ],
    });
    await invoices.confirm(env.seed.companyId, env.seed.userId, 'OWNER', inv.id);

    // Cost: an expense record tagged to the project (subtotal 400).
    const vendor = await env.prisma.partner.create({
      data: { companyId: env.seed.companyId, type: 'VENDOR', nameTh: 'ผู้ขายทดสอบ' },
    });
    const receipt = await env.prisma.expenseReceipt.create({
      data: {
        companyId: env.seed.companyId,
        status: 'ACCOUNTED',
        originalFileName: 'r.pdf',
        storedPath: '/tmp/r.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    });
    await env.prisma.expenseRecord.create({
      data: {
        companyId: env.seed.companyId,
        receiptId: receipt.id,
        vendorId: vendor.id,
        projectId: project.id,
        status: 'RECORDED',
        expenseDate: new Date('2026-05-12T00:00:00+07:00'),
        subtotal: '400',
        vatAmount: '28',
        grandTotal: '428',
      },
    });

    const profit = await projects.profit(env.seed.companyId, project.id);
    expect(profit.revenue).toBe(1000);
    expect(profit.cost).toBe(400);
    expect(profit.profit).toBe(600);
    expect(profit.marginPercent).toBe(60);
    expect(profit.salesCount).toBe(1);
    expect(profit.expenseCount).toBe(1);
  });
});
