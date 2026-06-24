import type { DetectedRisk } from '../detected-risk';
import type { RiskDetector } from './types';

export const detectNegativeStock: RiskDetector = async ({ companyId, inventory }) => {
  const stock = await inventory.stockSummary(companyId);
  const risks: DetectedRisk[] = [];
  for (const s of stock) {
    if (Number(s.onHand) < 0) {
      risks.push({
        type: 'STOCK_NEGATIVE',
        level: 'CRITICAL',
        entityType: 'Product',
        entityId: s.productId,
        title: `สินค้า ${s.nameTh} สต็อกติดลบ (${s.onHand} ${s.unit})`,
        description: 'สต็อกติดลบ — ตรวจสอบการเคลื่อนไหวสินค้า/ยอดยกมา',
      });
    }
  }
  return risks;
};