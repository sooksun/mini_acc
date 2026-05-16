import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import type { ExpenseReceiptStatus, Role } from '@hj/shared-types';

export interface ExpenseTransitionRule {
  allowedRoles: Role[];
  requireReason?: boolean;
  description?: string;
}

export type ExpenseTransitionRegistry = {
  [from in ExpenseReceiptStatus]?: { [to in ExpenseReceiptStatus]?: ExpenseTransitionRule };
};

export const EXPENSE_TRANSITIONS: ExpenseTransitionRegistry = {
  UPLOADED: {
    PENDING_VENDOR_APPROVAL: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      description: 'รออนุมัติผู้ขายใหม่',
    },
    READY_TO_ACCOUNT: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      description: 'ผูกกับผู้ขายเดิม',
    },
    REJECTED: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      requireReason: true,
      description: 'ปฏิเสธใบเสร็จ',
    },
  },
  PENDING_VENDOR_APPROVAL: {
    READY_TO_ACCOUNT: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      description: 'อนุมัติ/ผูกผู้ขาย',
    },
    REJECTED: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      requireReason: true,
      description: 'ปฏิเสธใบเสร็จ',
    },
  },
  READY_TO_ACCOUNT: {
    READY_TO_ACCOUNT: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      description: 'เปลี่ยนผู้ขายก่อนลงรายจ่าย',
    },
    ACCOUNTED: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      description: 'ลงรายจ่าย',
    },
    REJECTED: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      requireReason: true,
      description: 'ปฏิเสธใบเสร็จ',
    },
  },
  ACCOUNTED: {},
  REJECTED: {},
};

export class InvalidExpenseTransitionError extends UnprocessableEntityException {
  constructor(
    public readonly from: ExpenseReceiptStatus,
    public readonly to: ExpenseReceiptStatus,
    public override readonly cause: string,
  ) {
    super({
      statusCode: 422,
      code: 'INVALID_EXPENSE_TRANSITION',
      message: `ไม่สามารถเปลี่ยนสถานะใบเสร็จจาก ${from} → ${to}: ${cause}`,
      from,
      to,
      cause,
    });
  }
}

export interface ValidateExpenseTransitionInput {
  from: ExpenseReceiptStatus;
  to: ExpenseReceiptStatus;
  role: Role;
  reason?: string;
}

export function validateExpenseTransition(input: ValidateExpenseTransitionInput): ExpenseTransitionRule {
  const fromMap = EXPENSE_TRANSITIONS[input.from];
  if (!fromMap) {
    throw new InvalidExpenseTransitionError(
      input.from,
      input.to,
      'สถานะนี้ไม่อนุญาตให้เปลี่ยนต่อ (terminal)',
    );
  }

  const rule = fromMap[input.to];
  if (!rule) {
    throw new InvalidExpenseTransitionError(input.from, input.to, 'ไม่อนุญาต transition นี้');
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
    throw new InvalidExpenseTransitionError(input.from, input.to, 'ต้องระบุเหตุผล');
  }

  return rule;
}
