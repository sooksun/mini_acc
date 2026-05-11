import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import type { DocumentStatus, Role } from '@hj/shared-types';
import { TRANSITIONS, TransitionRule } from './transitions';

export interface ValidateTransitionInput {
  from: DocumentStatus;
  to: DocumentStatus;
  role: Role;
  reason?: string;
}

export class InvalidTransitionError extends UnprocessableEntityException {
  constructor(
    public readonly from: DocumentStatus,
    public readonly to: DocumentStatus,
    public override readonly cause: string,
  ) {
    super({
      statusCode: 422,
      code: 'INVALID_TRANSITION',
      message: `ไม่สามารถเปลี่ยนสถานะจาก ${from} → ${to}: ${cause}`,
      from,
      to,
      cause,
    });
  }
}

export function validateTransition(input: ValidateTransitionInput): TransitionRule {
  const fromMap = TRANSITIONS[input.from];
  if (!fromMap) {
    throw new InvalidTransitionError(input.from, input.to, 'ไม่มี transition ที่อนุญาตจากสถานะนี้');
  }

  const rule = fromMap[input.to];
  if (!rule) {
    throw new InvalidTransitionError(input.from, input.to, 'ไม่อนุญาต transition นี้');
  }

  if (!rule.allowedRoles.includes(input.role)) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: `บทบาท ${input.role} ไม่สามารถเปลี่ยน ${input.from} → ${input.to}`,
      requiredRoles: rule.allowedRoles,
    });
  }

  if (rule.requireReason && !input.reason?.trim()) {
    throw new InvalidTransitionError(input.from, input.to, 'ต้องระบุเหตุผล');
  }

  return rule;
}
