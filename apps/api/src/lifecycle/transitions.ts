import type { DocumentStatus, Role } from '@hj/shared-types';

export interface TransitionRule {
  allowedRoles: Role[];
  requireReason?: boolean;
  description?: string;
}

export type TransitionRegistry = {
  [from in DocumentStatus]?: { [to in DocumentStatus]?: TransitionRule };
};

export const TRANSITIONS: TransitionRegistry = {
  DRAFT: {
    PENDING_REVIEW: {
      allowedRoles: ['OWNER', 'ADMIN'],
      description: 'ส่งให้ตรวจ',
    },
    USER_CONFIRMED: {
      allowedRoles: ['OWNER', 'ADMIN'],
      description: 'ยืนยันโดยตรง (เอกสารขาย)',
    },
    AI_EXTRACTED: {
      allowedRoles: ['AI_AGENT'],
      description: 'AI ดึงข้อมูลเสร็จ',
    },
    VOIDED: {
      allowedRoles: ['OWNER', 'ADMIN'],
      requireReason: true,
      description: 'ยกเลิกฉบับร่าง',
    },
  },
  AI_EXTRACTED: {
    PENDING_REVIEW: {
      allowedRoles: ['AI_AGENT', 'OWNER', 'ADMIN'],
      description: 'ส่งให้ตรวจหลัง AI สรุป',
    },
  },
  PENDING_REVIEW: {
    USER_CONFIRMED: {
      allowedRoles: ['OWNER', 'ADMIN'],
      description: 'ผู้ใช้ยืนยันข้อมูล',
    },
    DRAFT: {
      allowedRoles: ['OWNER', 'ADMIN'],
      description: 'ส่งกลับเป็นร่าง',
    },
  },
  USER_CONFIRMED: {
    ACCOUNTED: {
      allowedRoles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      description: 'ลงบัญชี (สร้าง Journal)',
    },
    VOIDED: {
      allowedRoles: ['OWNER', 'ACCOUNTANT'],
      requireReason: true,
      description: 'ยกเลิกหลังยืนยัน',
    },
  },
  ACCOUNTED: {
    PENDING_ACCOUNTANT: {
      allowedRoles: ['OWNER', 'ADMIN'],
      description: 'ส่งให้นักบัญชีตรวจ',
    },
    VOIDED: {
      allowedRoles: ['OWNER', 'ACCOUNTANT'],
      requireReason: true,
      description: 'ยกเลิกหลังลงบัญชี',
    },
  },
  PENDING_ACCOUNTANT: {
    ACCOUNTANT_APPROVED: {
      allowedRoles: ['ACCOUNTANT'],
      description: 'นักบัญชีอนุมัติ',
    },
    USER_CONFIRMED: {
      allowedRoles: ['ACCOUNTANT'],
      requireReason: true,
      description: 'ตีกลับให้ผู้ใช้แก้',
    },
  },
  ACCOUNTANT_APPROVED: {
    LOCKED: {
      allowedRoles: ['ACCOUNTANT', 'OWNER'],
      description: 'ล็อกเอกสาร',
    },
  },
  LOCKED: {
    VOIDED: {
      allowedRoles: ['OWNER', 'ACCOUNTANT'],
      requireReason: true,
      description: 'ยกเลิกหลังล็อก (ต้องสร้างใบปรับปรุง)',
    },
  },
  VOIDED: {},
};

export const TERMINAL_STATES: DocumentStatus[] = ['VOIDED'];

export function isTerminal(status: DocumentStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

export function getAvailableTransitions(
  from: DocumentStatus,
  role: Role,
): Array<{ to: DocumentStatus; rule: TransitionRule }> {
  const fromMap = TRANSITIONS[from];
  if (!fromMap) return [];
  return Object.entries(fromMap)
    .filter(([, rule]) => rule!.allowedRoles.includes(role))
    .map(([to, rule]) => ({ to: to as DocumentStatus, rule: rule! }));
}
