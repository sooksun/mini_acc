import type { DetectedRisk } from '../detected-risk';
import { detectUnmatchedBank } from './bank.detectors';
import { detectStuckExpenseReceipts, detectWhtRisk } from './expense.detectors';
import { detectNegativeStock } from './inventory.detectors';
import { detectOrphanExpenseRecords, detectUnbalancedJournal } from './journal.detectors';
import { detectLowProfitProjects } from './project.detectors';
import {
  detectDuplicateDocumentNumbers,
  detectEditAfterConfirm,
  detectTaxIdMissing,
  detectVatRisk,
} from './sales-document.detectors';
import type { RiskDetector, RiskDetectorContext } from './types';

export const RISK_DETECTORS: RiskDetector[] = [
  detectTaxIdMissing,
  detectUnbalancedJournal,
  detectOrphanExpenseRecords,
  detectDuplicateDocumentNumbers,
  detectNegativeStock,
  detectVatRisk,
  detectWhtRisk,
  detectUnmatchedBank,
  detectLowProfitProjects,
  detectStuckExpenseReceipts,
  detectEditAfterConfirm,
];

export async function runRiskDetectors(ctx: RiskDetectorContext): Promise<DetectedRisk[]> {
  const batches = await Promise.all(RISK_DETECTORS.map((detect) => detect(ctx)));
  return batches.flat();
}