import type { DocumentStatus } from '@prisma/client';
import type { DetectedRisk } from '../detected-risk';
import type { RiskDetector } from './types';

const CONFIRMED_STATUSES: DocumentStatus[] = [
  'USER_CONFIRMED',
  'ACCOUNTED',
  'PENDING_ACCOUNTANT',
  'ACCOUNTANT_APPROVED',
  'LOCKED',
];

export const detectTaxIdMissing: RiskDetector = async ({ companyId, prisma }) => {
  const docs = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: { in: ['TAX_INVOICE', 'RECEIPT_TAX_INVOICE'] },
      status: { in: CONFIRMED_STATUSES },
      OR: [{ customerSnapshotTaxId: null }, { customerSnapshotTaxId: '' }],
    },
    select: { id: true, number: true, type: true, customerSnapshotName: true },
  });
  return docs.map(
    (doc): DetectedRisk => ({
      type: 'TAX_ID_MISSING',
      level: 'CRITICAL',
      entityType: 'SalesDocument',
      entityId: doc.id,
      title: `${doc.type === 'TAX_INVOICE' ? 'ใบกำกับภาษี' : 'ใบเสร็จ/ใบกำกับภาษี'} ${doc.number} ไม่มีเลขผู้เสียภาษีลูกค้า`,
      description: `ลูกค้า "${doc.customerSnapshotName}" — เอกสารภาษีต้องมีเลขผู้เสียภาษี 13 หลักของผู้ซื้อ`,
    }),
  );
};

export const detectDuplicateDocumentNumbers: RiskDetector = async ({ companyId, prisma }) => {
  const dupNumbers = await prisma.salesDocument.groupBy({
    by: ['number'],
    where: {
      companyId,
      status: { not: 'VOIDED' },
      number: { not: { startsWith: 'DRAFT-' } },
    },
    _count: { number: true },
    having: { number: { _count: { gt: 1 } } },
  });
  return dupNumbers.map(
    (dup): DetectedRisk => ({
      type: 'DUPLICATE_DOCUMENT',
      level: 'CRITICAL',
      entityType: 'SalesDocumentNumber',
      entityId: dup.number,
      title: `เลขเอกสารขาย ${dup.number} ซ้ำ ${dup._count.number} ใบ`,
      description: 'เลขเอกสารต้องไม่ซ้ำ — ตรวจสอบและออกเลขใหม่/ยกเลิกใบที่ซ้ำ',
    }),
  );
};

export const detectVatRisk: RiskDetector = async ({ companyId, prisma }) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { vatEffectiveDate: true },
  });
  if (!company) return [];

  const vatRiskDocs = await prisma.salesDocument.findMany({
    where: {
      companyId,
      status: { in: CONFIRMED_STATUSES },
      vatAmount: { gt: 0 },
      ...(company.vatEffectiveDate ? { documentDate: { lt: company.vatEffectiveDate } } : {}),
    },
    select: { id: true, number: true, documentDate: true },
  });

  const effectiveStr = company.vatEffectiveDate
    ? `ก่อนวันขึ้นทะเบียน VAT (${company.vatEffectiveDate.toISOString().slice(0, 10)})`
    : 'บริษัทยังไม่ได้ตั้งค่าวันขึ้นทะเบียน VAT';

  return vatRiskDocs.map(
    (doc): DetectedRisk => ({
      type: 'VAT_RISK',
      level: 'HIGH',
      entityType: 'SalesDocument',
      entityId: doc.id,
      title: `เอกสาร ${doc.number} เรียกเก็บ VAT ${effectiveStr}`,
      description: `วันที่เอกสาร ${doc.documentDate.toISOString().slice(0, 10)} — เรียกเก็บ VAT ก่อนที่บริษัทจะขึ้นทะเบียนภาษีมูลค่าเพิ่ม`,
    }),
  );
};

export const detectEditAfterConfirm: RiskDetector = async ({ companyId, prisma }) => {
  const rows = await prisma.$queryRaw<
    { entityId: string; docNumber: string; confirmedAt: Date; editedAt: Date }[]
  >`
    SELECT sd.id AS entityId, sd.number AS docNumber, sd.confirmedAt AS confirmedAt,
           MAX(al.createdAt) AS editedAt
    FROM SalesDocument sd
    INNER JOIN AuditLog al
      ON al.entityType = 'SalesDocument'
      AND al.entityId = sd.id
      AND al.action = 'UPDATE_DOCUMENT'
    WHERE sd.companyId = ${companyId}
      AND sd.confirmedAt IS NOT NULL
      AND al.createdAt > sd.confirmedAt
    GROUP BY sd.id, sd.number, sd.confirmedAt
    ORDER BY editedAt DESC
    LIMIT 50
  `;
  return rows.map(
    (row): DetectedRisk => ({
      type: 'EDIT_AFTER_CONFIRM',
      level: 'MEDIUM',
      entityType: 'SalesDocument',
      entityId: row.entityId,
      title: `เอกสาร ${row.docNumber} ถูกแก้ไขหลังยืนยันแล้ว`,
      description: `แก้ไขเมื่อ ${new Date(row.editedAt).toISOString().slice(0, 10)} ซึ่งหลังจากยืนยันเมื่อ ${new Date(row.confirmedAt).toISOString().slice(0, 10)}`,
    }),
  );
};