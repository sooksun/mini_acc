import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const AUDIT_KEY = 'audit:meta';

export interface AuditMeta {
  action: string;
  entityType?: string;
  getEntityId?: (req: Request, res: any) => string | undefined;
  getReason?: (req: Request, res: any) => string | undefined;
  getMetadata?: (req: Request, res: any) => Record<string, unknown> | undefined;
}

export const AuditAction = (
  action: string,
  options: Omit<AuditMeta, 'action'> = {},
) => SetMetadata(AUDIT_KEY, { action, ...options });
