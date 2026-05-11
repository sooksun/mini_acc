import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { taxId: '0573567001472' },
    update: {},
    create: {
      nameTh: 'ห้างหุ้นส่วนจำกัด โซลูชั่น เนกซ์เจน',
      nameEn: 'Solutions Nextgen Limited Partnership',
      taxId: '0573567001472',
      address:
        '468/449 หมู่ที่ 3 ตำบลบ้านดู่ อำเภอเมืองเชียงราย จังหวัดเชียงราย 57100',
      phone: '081-277-1948',
      email: 'contact@solutionsnextgen.co.th',
      brandShort: 'SN',
      tagline: 'นวัตกรรม การศึกษา การรักษา',
      registeredAt: new Date('2024-05-09T00:00:00+07:00'),
      vatEffectiveDate: new Date('2024-07-08T00:00:00+07:00'),
      capital: 1_000_000,
    },
  });

  const existingVat = await prisma.companyVatStatus.findFirst({
    where: { companyId: company.id, effectiveFrom: new Date('2024-07-08T00:00:00+07:00') },
  });
  if (!existingVat) {
    await prisma.companyVatStatus.create({
      data: {
        companyId: company.id,
        status: 'REGISTERED',
        effectiveFrom: new Date('2024-07-08T00:00:00+07:00'),
        reason: 'Initial VAT registration',
      },
    });
  }

  const ownerHash = await argon2.hash('owner123!');
  const adminHash = await argon2.hash('admin123!');

  await prisma.user.upsert({
    where: { email: 'owner@solutionsnextgen.co.th' },
    update: {},
    create: {
      companyId: company.id,
      email: 'owner@solutionsnextgen.co.th',
      passwordHash: ownerHash,
      fullName: 'นางสาววุฒิพร สอนนวล',
      initial: 'วพ',
      role: 'OWNER',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@solutionsnextgen.co.th' },
    update: {},
    create: {
      companyId: company.id,
      email: 'admin@solutionsnextgen.co.th',
      passwordHash: adminHash,
      fullName: 'ผู้ดูแลระบบ',
      initial: 'AD',
      role: 'ADMIN',
    },
  });

  const numberingRules = [
    { type: 'QUOTATION', prefix: 'QT' },
    { type: 'DELIVERY_NOTE', prefix: 'DN' },
    { type: 'INVOICE', prefix: 'INV' },
    { type: 'RECEIPT', prefix: 'RC' },
    { type: 'TAX_INVOICE', prefix: 'TAX' },
    { type: 'RECEIPT_TAX_INVOICE', prefix: 'RT' },
  ] as const;

  for (const r of numberingRules) {
    await prisma.documentNumberingRule.upsert({
      where: { companyId_type: { companyId: company.id, type: r.type } },
      update: {},
      create: {
        companyId: company.id,
        type: r.type,
        prefix: r.prefix,
        padding: 4,
        resetPolicy: 'YEARLY',
      },
    });
  }

  await prisma.partner.upsert({
    where: { companyId_code: { companyId: company.id, code: 'CUST-001' } },
    update: {},
    create: {
      companyId: company.id,
      type: 'CUSTOMER',
      code: 'CUST-001',
      nameTh: 'โรงเรียนบ้านพญาไพร',
      address: 'เลขที่ 111 หมู่ 6 ต. เทอดไทย อ. แม่ฟ้าหลวง จ. เชียงราย',
    },
  });

  await prisma.product.upsert({
    where: { companyId_code: { companyId: company.id, code: 'SVC-001' } },
    update: {},
    create: {
      companyId: company.id,
      type: 'SERVICE',
      code: 'SVC-001',
      nameTh: 'ค่าออกแบบและพัฒนาโปรแกรมสำเร็จรูป',
      unit: 'รายการ',
      unitPrice: 100000,
      vatable: true,
    },
  });

  console.log('Seed complete.');
  console.log('  OWNER login: owner@solutionsnextgen.co.th / owner123!');
  console.log('  ADMIN login: admin@solutionsnextgen.co.th / admin123!');
  console.log(`  Numbering rules: ${numberingRules.length}`);
  console.log('  Sample partner: CUST-001 / Sample product: SVC-001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
