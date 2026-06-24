import type { PrismaService } from '../../prisma/prisma.service';
import type { DetectedRisk } from '../detected-risk';

function riskKey(r: { type: string; entityType?: string | null; entityId?: string | null }): string {
  return `${r.type}\0${r.entityType ?? ''}\0${r.entityId ?? ''}`;
}

/** Insert only risks whose (type, entityType, entityId) key is not already present. */
export async function persistNewRisks(
  prisma: PrismaService,
  companyId: string,
  detected: DetectedRisk[],
): Promise<number> {
  if (detected.length === 0) return 0;

  const existing = await prisma.riskItem.findMany({
    where: {
      companyId,
      OR: detected.map((r) => ({
        type: r.type,
        entityType: r.entityType ?? null,
        entityId: r.entityId ?? null,
      })),
    },
    select: { type: true, entityType: true, entityId: true },
  });
  const seen = new Set(existing.map(riskKey));

  const fresh: DetectedRisk[] = [];
  for (const risk of detected) {
    const k = riskKey(risk);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(risk);
  }

  if (fresh.length === 0) return 0;

  const result = await prisma.riskItem.createMany({
    data: fresh.map((risk) => ({
      companyId,
      type: risk.type,
      level: risk.level,
      status: 'OPEN' as const,
      entityType: risk.entityType,
      entityId: risk.entityId,
      title: risk.title,
      description: risk.description,
    })),
  });
  return result.count;
}