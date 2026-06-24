import type { DetectedRisk } from '../detected-risk';
import type { RiskDetector } from './types';

const LOW_MARGIN_THRESHOLD = 10;

export const detectLowProfitProjects: RiskDetector = async ({ companyId, prisma, projects }) => {
  const activeProjects = await prisma.project.findMany({
    where: { companyId, status: 'ACTIVE' },
    select: { id: true, name: true, code: true },
  });
  if (activeProjects.length === 0) return [];

  const totals = await projects.profitTotalsBatch(
    companyId,
    activeProjects.map((p) => p.id),
  );

  const risks: DetectedRisk[] = [];
  for (const proj of activeProjects) {
    const { revenue, cost } = totals.get(proj.id) ?? { revenue: 0, cost: 0 };
    if (revenue <= 0) continue;
    const margin = ((revenue - cost) / revenue) * 100;
    if (margin >= LOW_MARGIN_THRESHOLD) continue;

    const isLoss = margin < 0;
    risks.push({
      type: 'LOW_PROFIT_PROJECT',
      level: isLoss ? 'HIGH' : 'MEDIUM',
      entityType: 'Project',
      entityId: proj.id,
      title: `โครงการ ${proj.code ? `${proj.code} – ` : ''}${proj.name} ${isLoss ? 'ขาดทุน' : 'กำไรต่ำ'} (${margin.toFixed(1)}%)`,
      description: `รายรับ ${revenue.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท  ต้นทุน ${cost.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท — margin ${isLoss ? 'ติดลบ' : 'ต่ำกว่าเกณฑ์ 10%'}`,
    });
  }
  return risks;
};