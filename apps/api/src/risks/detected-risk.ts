import type { RiskItemType, RiskLevel } from '@hj/shared-types';

export interface DetectedRisk {
  type: RiskItemType;
  level: RiskLevel;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
}