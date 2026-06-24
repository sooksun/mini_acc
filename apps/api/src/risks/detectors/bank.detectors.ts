import type { DetectedRisk } from '../detected-risk';
import type { RiskDetector } from './types';

export const detectUnmatchedBank: RiskDetector = async ({ companyId, prisma }) => {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const unmatchedLines = await prisma.bankStatementLine.findMany({
    where: { companyId, matchedPaymentId: null, postedAt: { lt: currentMonthStart } },
    select: { id: true, postedAt: true, amount: true, side: true, description: true, bankAccount: true },
    take: 50,
    orderBy: { postedAt: 'asc' },
  });
  return unmatchedLines.map(
    (line): DetectedRisk => ({
      type: 'UNMATCHED_BANK',
      level: 'HIGH',
      entityType: 'BankStatementLine',
      entityId: line.id,
      title: `รายการธนาคาร ${line.bankAccount} (${line.postedAt.toISOString().slice(0, 10)}) ยังไม่จับคู่`,
      description: `${line.side === 'CREDIT' ? 'รับ' : 'จ่าย'} ${Number(line.amount).toLocaleString('th-TH')} บาท — "${line.description.slice(0, 80)}"`,
    }),
  );
};