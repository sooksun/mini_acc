export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  VIEWER: 'VIEWER',
  AI_AGENT: 'AI_AGENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const VatStatus = {
  NOT_REGISTERED: 'NOT_REGISTERED',
  REGISTERED: 'REGISTERED',
  CANCELLED: 'CANCELLED',
} as const;
export type VatStatus = (typeof VatStatus)[keyof typeof VatStatus];

export const DocumentType = {
  QUOTATION: 'QUOTATION',
  DELIVERY_NOTE: 'DELIVERY_NOTE',
  INVOICE: 'INVOICE',
  RECEIPT: 'RECEIPT',
  TAX_INVOICE: 'TAX_INVOICE',
  RECEIPT_TAX_INVOICE: 'RECEIPT_TAX_INVOICE',
  PURCHASE: 'PURCHASE',
  EXPENSE: 'EXPENSE',
  WHT_CERTIFICATE: 'WHT_CERTIFICATE',
  BANK_STATEMENT: 'BANK_STATEMENT',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  DRAFT: 'DRAFT',
  AI_EXTRACTED: 'AI_EXTRACTED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  USER_CONFIRMED: 'USER_CONFIRMED',
  ACCOUNTED: 'ACCOUNTED',
  PENDING_ACCOUNTANT: 'PENDING_ACCOUNTANT',
  ACCOUNTANT_APPROVED: 'ACCOUNTANT_APPROVED',
  LOCKED: 'LOCKED',
  VOIDED: 'VOIDED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const PartnerType = {
  CUSTOMER: 'CUSTOMER',
  VENDOR: 'VENDOR',
  BOTH: 'BOTH',
} as const;
export type PartnerType = (typeof PartnerType)[keyof typeof PartnerType];

export const ProductType = {
  GOOD: 'GOOD',
  SERVICE: 'SERVICE',
  MATERIAL: 'MATERIAL',
  ASSET: 'ASSET',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

export const ExpenseReceiptStatus = {
  UPLOADED: 'UPLOADED',
  PENDING_VENDOR_APPROVAL: 'PENDING_VENDOR_APPROVAL',
  READY_TO_ACCOUNT: 'READY_TO_ACCOUNT',
  ACCOUNTED: 'ACCOUNTED',
  REJECTED: 'REJECTED',
} as const;
export type ExpenseReceiptStatus = (typeof ExpenseReceiptStatus)[keyof typeof ExpenseReceiptStatus];

export const ExpenseRecordStatus = {
  RECORDED: 'RECORDED',
  VOIDED: 'VOIDED',
} as const;
export type ExpenseRecordStatus = (typeof ExpenseRecordStatus)[keyof typeof ExpenseRecordStatus];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  UPDATE_COMPANY: 'UPDATE_COMPANY',
  UPDATE_VAT_STATUS: 'UPDATE_VAT_STATUS',
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  CREATE_PARTNER: 'CREATE_PARTNER',
  UPDATE_PARTNER: 'UPDATE_PARTNER',
  DEACTIVATE_PARTNER: 'DEACTIVATE_PARTNER',
  CREATE_PRODUCT: 'CREATE_PRODUCT',
  UPDATE_PRODUCT: 'UPDATE_PRODUCT',
  DEACTIVATE_PRODUCT: 'DEACTIVATE_PRODUCT',
  CREATE_DOCUMENT: 'CREATE_DOCUMENT',
  UPDATE_DOCUMENT: 'UPDATE_DOCUMENT',
  CONFIRM_DOCUMENT: 'CONFIRM_DOCUMENT',
  VOID_DOCUMENT: 'VOID_DOCUMENT',
  GENERATE_PDF: 'GENERATE_PDF',
  DOWNLOAD_PDF: 'DOWNLOAD_PDF',
  UPLOAD_EXPENSE_RECEIPT: 'UPLOAD_EXPENSE_RECEIPT',
  LINK_EXPENSE_VENDOR: 'LINK_EXPENSE_VENDOR',
  APPROVE_EXPENSE_VENDOR: 'APPROVE_EXPENSE_VENDOR',
  RECORD_EXPENSE: 'RECORD_EXPENSE',
  REJECT_EXPENSE_RECEIPT: 'REJECT_EXPENSE_RECEIPT',
  CREATE_JOURNAL: 'CREATE_JOURNAL',
  CLOSE_PERIOD: 'CLOSE_PERIOD',
  REOPEN_PERIOD: 'REOPEN_PERIOD',
  EXPORT_ACCOUNTANT_PACK: 'EXPORT_ACCOUNTANT_PACK',
  AI_EXTRACT_DOCUMENT: 'AI_EXTRACT_DOCUMENT',
  AI_ACCEPT_SUGGESTION: 'AI_ACCEPT_SUGGESTION',
  AI_REJECT_SUGGESTION: 'AI_REJECT_SUGGESTION',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  initial: string | null;
  role: Role;
  companyId: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface CompanyDto {
  id: string;
  nameTh: string;
  nameEn: string | null;
  taxId: string;
  address: string;
  phone: string | null;
  email: string | null;
  brandShort: string | null;
  tagline: string | null;
  registeredAt: string;
  vatEffectiveDate: string | null;
  capital: string | null;
}
