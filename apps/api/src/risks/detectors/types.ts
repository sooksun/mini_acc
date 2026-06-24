import type { PrismaService } from '../../prisma/prisma.service';
import type { InventoryService } from '../../inventory/inventory.service';
import type { ProjectsService } from '../../projects/projects.service';
import type { DetectedRisk } from '../detected-risk';

export interface RiskDetectorContext {
  companyId: string;
  prisma: PrismaService;
  inventory: InventoryService;
  projects: ProjectsService;
}

export type RiskDetector = (ctx: RiskDetectorContext) => Promise<DetectedRisk[]>;