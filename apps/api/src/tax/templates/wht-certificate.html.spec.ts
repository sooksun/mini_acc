import { Prisma } from '@prisma/client';
import { buildWhtCertificateHtml } from './wht-certificate.html';

const company = {
  nameTh: 'หจก. ทดสอบ',
  nameEn: null,
  taxId: '0000000000001',
  address: 'เลขที่ 1 กรุงเทพฯ',
  phone: '021234567',
  email: null,
} as never;

function makeRecord(over: Record<string, unknown> = {}) {
  return {
    id: 'rec1',
    companyId: 'c1',
    recordType: 'PAYABLE',
    sourceType: 'FOREIGN_WHT',
    sourceId: 'ob1',
    paidAt: new Date('2026-09-07T12:00:00Z'),
    partnerName: 'Anysphere, Inc.',
    partnerTaxId: null,
    baseAmount: new Prisma.Decimal('1000'),
    rate: new Prisma.Decimal('5'),
    whtAmount: new Prisma.Decimal('50'),
    certNumber: 'PND54-2026-09-0001',
    category: 'ROYALTY',
    periodYear: 2026,
    periodMonth: 9,
    createdAt: new Date(),
    ...over,
  } as never;
}

describe('buildWhtCertificateHtml — foreign (ภ.ง.ด.54 / มาตรา 70)', () => {
  it('labels มาตรา 70 / ภ.ง.ด.54 and shows the foreign recipient + address', () => {
    const html = buildWhtCertificateHtml({
      company,
      partner: { nameTh: 'Anysphere, Inc.', address: 'San Francisco, CA, USA', taxId: null } as never,
      record: makeRecord(),
      copies: ['ORIGINAL'],
      isForeign: true,
    });
    expect(html).toContain('มาตรา 70');
    expect(html).toContain('ภ.ง.ด.54');
    expect(html).toContain('นิติบุคคลต่างประเทศ');
    expect(html).toContain('Anysphere, Inc.');
    expect(html).toContain('San Francisco, CA, USA');
    // The foreign cert must NOT claim the domestic Section 50 bis basis.
    expect(html).not.toContain('มาตรา 50 ทวิ');
    // ROYALTY → income-type 40(3) checkbox ticked
    expect(html).toContain('☑');
  });

  it('domestic record keeps มาตรา 50 ทวิ labeling and 50-ทวิ filename basis', () => {
    const html = buildWhtCertificateHtml({
      company,
      partner: { nameTh: 'บ. ในประเทศ จำกัด', address: 'กทม.', taxId: '0123456789012' } as never,
      record: makeRecord({
        sourceType: 'PAYMENT',
        partnerTaxId: '0123456789012',
        category: 'ค่าจ้างทำของ — 40(8)',
      }),
      copies: ['ORIGINAL'],
      isForeign: false,
    });
    expect(html).toContain('มาตรา 50 ทวิ');
    expect(html).not.toContain('มาตรา 70');
    expect(html).not.toContain('ภ.ง.ด.54');
  });
});
