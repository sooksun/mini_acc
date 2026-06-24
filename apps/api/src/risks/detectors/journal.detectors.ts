import type { DetectedRisk } from '../detected-risk';
import type { RiskDetector } from './types';

export const detectUnbalancedJournal: RiskDetector = async ({ companyId, prisma }) => {
  const unbalanced = await prisma.$queryRaw<
    { id: string; totalDebit: string; totalCredit: string }[]
  >`
    SELECT id, totalDebit, totalCredit
    FROM JournalEntry
    WHERE companyId = ${companyId}
      AND status = 'POSTED'
      AND totalDebit <> totalCredit
  `;
  return unbalanced.map(
    (je): DetectedRisk => ({
      type: 'JOURNAL_UNBALANCED',
      level: 'CRITICAL',
      entityType: 'JournalEntry',
      entityId: je.id,
      title: `Journal entry ${je.id} ไม่สมดุล: Dr ${je.totalDebit} ≠ Cr ${je.totalCredit}`,
    }),
  );
};

export const detectOrphanExpenseRecords: RiskDetector = async ({ companyId, prisma }) => {
  const orphanExpense = await prisma.$queryRaw<{ id: string; documentNumber: string | null }[]>`
    SELECT er.id, er.documentNumber
    FROM ExpenseRecord er
    WHERE er.companyId = ${companyId}
      AND er.status = 'RECORDED'
      AND NOT EXISTS (
        SELECT 1 FROM JournalEntry je
        WHERE je.companyId = er.companyId
          AND je.sourceType = 'EXPENSE_RECORD'
          AND je.sourceId = er.id
          AND je.status = 'POSTED'
      )
  `;
  return orphanExpense.map(
    (er): DetectedRisk => ({
      type: 'MISSING_DOCUMENT',
      level: 'HIGH',
      entityType: 'ExpenseRecord',
      entityId: er.id,
      title: `รายจ่าย ${er.documentNumber ?? er.id} ไม่มี journal entry`,
      description: 'รายการลงรายจ่ายแล้วแต่ไม่พบ journal entry — ระบบ posting อาจมี bug',
    }),
  );
};