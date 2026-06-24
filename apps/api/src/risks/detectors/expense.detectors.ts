import type { DetectedRisk } from '../detected-risk';
import type { RiskDetector } from './types';

export const detectWhtRisk: RiskDetector = async ({ companyId, prisma }) => {
  const whtRecords = await prisma.expenseRecord.findMany({
    where: { companyId, status: 'RECORDED', withholdingTaxAmount: { gt: 0 } },
    select: {
      id: true,
      documentNumber: true,
      vendor: { select: { nameTh: true, taxId: true } },
    },
  });
  const risks: DetectedRisk[] = [];
  for (const r of whtRecords) {
    const taxId = r.vendor?.taxId ?? null;
    if (!taxId || !/^\d{13}$/.test(taxId)) {
      risks.push({
        type: 'WHT_RISK',
        level: 'HIGH',
        entityType: 'ExpenseRecord',
        entityId: r.id,
        title: `รายจ่าย ${r.documentNumber ?? r.id} หักภาษี ณ ที่จ่ายแต่ผู้ขายไม่มีเลขผู้เสียภาษีที่ถูกต้อง`,
        description: `ผู้ขาย "${r.vendor?.nameTh ?? 'ไม่ระบุ'}" — ต้องมีเลขผู้เสียภาษี 13 หลักเพื่อยื่น ภ.ง.ด.3/53 และออกหนังสือรับรอง 50 ทวิ`,
      });
    }
  }
  return risks;
};

export const detectStuckExpenseReceipts: RiskDetector = async ({ companyId, prisma }) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stuckReceipts = await prisma.expenseReceipt.findMany({
    where: {
      companyId,
      status: { in: ['UPLOADED', 'PENDING_VENDOR_APPROVAL', 'READY_TO_ACCOUNT'] },
      createdAt: { lt: sevenDaysAgo },
    },
    select: { id: true, documentNumber: true, proposedVendorName: true, createdAt: true },
  });
  return stuckReceipts.map((r): DetectedRisk => {
    const daysOld = Math.floor((Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return {
      type: 'EXPENSE_WITHOUT_APPROVAL',
      level: 'MEDIUM',
      entityType: 'ExpenseReceipt',
      entityId: r.id,
      title: `ใบเสร็จ ${r.documentNumber ?? r.id} ค้างอยู่ ${daysOld} วันโดยไม่ผ่านการบันทึก`,
      description: `จาก "${r.proposedVendorName ?? 'ไม่ระบุผู้ขาย'}" — อัปโหลดมาแล้ว ${daysOld} วัน ยังไม่ได้บันทึกรายจ่าย`,
    };
  });
};