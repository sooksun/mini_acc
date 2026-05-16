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

export const PaymentDirection = {
  IN: 'IN',
  OUT: 'OUT',
} as const;
export type PaymentDirection = (typeof PaymentDirection)[keyof typeof PaymentDirection];

export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  CREDIT_CARD: 'CREDIT_CARD',
  PROMPT_PAY: 'PROMPT_PAY',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  VOIDED: 'VOIDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const AccountingPeriodStatus = {
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  LOCKED: 'LOCKED',
  REOPENED: 'REOPENED',
} as const;
export type AccountingPeriodStatus = (typeof AccountingPeriodStatus)[keyof typeof AccountingPeriodStatus];

export const JournalSourceType = {
  SALES_DOCUMENT: 'SALES_DOCUMENT',
  EXPENSE_RECORD: 'EXPENSE_RECORD',
  PAYMENT: 'PAYMENT',
  INVENTORY_MOVEMENT: 'INVENTORY_MOVEMENT',
  FIXED_ASSET: 'FIXED_ASSET',
  MANUAL: 'MANUAL',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type JournalSourceType = (typeof JournalSourceType)[keyof typeof JournalSourceType];

export const JournalEntryStatus = {
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  VOIDED: 'VOIDED',
} as const;
export type JournalEntryStatus = (typeof JournalEntryStatus)[keyof typeof JournalEntryStatus];

export const VatRecordType = {
  OUTPUT: 'OUTPUT',
  INPUT: 'INPUT',
} as const;
export type VatRecordType = (typeof VatRecordType)[keyof typeof VatRecordType];

export const WhtRecordType = {
  PAYABLE: 'PAYABLE',
  RECEIVABLE: 'RECEIVABLE',
} as const;
export type WhtRecordType = (typeof WhtRecordType)[keyof typeof WhtRecordType];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RiskItemType = {
  MISSING_DOCUMENT: 'MISSING_DOCUMENT',
  DUPLICATE_DOCUMENT: 'DUPLICATE_DOCUMENT',
  VAT_RISK: 'VAT_RISK',
  WHT_RISK: 'WHT_RISK',
  UNMATCHED_BANK: 'UNMATCHED_BANK',
  LOW_PROFIT_PROJECT: 'LOW_PROFIT_PROJECT',
  STOCK_NEGATIVE: 'STOCK_NEGATIVE',
  EXPENSE_WITHOUT_APPROVAL: 'EXPENSE_WITHOUT_APPROVAL',
  EDIT_AFTER_CONFIRM: 'EDIT_AFTER_CONFIRM',
  TAX_ID_MISSING: 'TAX_ID_MISSING',
  PDF_GENERATION_ERROR: 'PDF_GENERATION_ERROR',
} as const;
export type RiskItemType = (typeof RiskItemType)[keyof typeof RiskItemType];

export const RiskItemStatus = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  ACCEPTED_RISK: 'ACCEPTED_RISK',
  DISMISSED: 'DISMISSED',
} as const;
export type RiskItemStatus = (typeof RiskItemStatus)[keyof typeof RiskItemStatus];

export const AiSuggestionStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  OVERRIDDEN: 'OVERRIDDEN',
} as const;
export type AiSuggestionStatus = (typeof AiSuggestionStatus)[keyof typeof AiSuggestionStatus];

export const AiSuggestionType = {
  DOCUMENT_EXTRACT: 'DOCUMENT_EXTRACT',
  ACCOUNT_CLASSIFY: 'ACCOUNT_CLASSIFY',
  BANK_MATCH: 'BANK_MATCH',
  RISK_FLAG: 'RISK_FLAG',
  MONTHLY_SUMMARY: 'MONTHLY_SUMMARY',
} as const;
export type AiSuggestionType = (typeof AiSuggestionType)[keyof typeof AiSuggestionType];

export const InventoryMovementType = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUST: 'ADJUST',
  RETURN_IN: 'RETURN_IN',
  RETURN_OUT: 'RETURN_OUT',
  OPENING_BALANCE: 'OPENING_BALANCE',
} as const;
export type InventoryMovementType = (typeof InventoryMovementType)[keyof typeof InventoryMovementType];

export const FixedAssetStatus = {
  ACTIVE: 'ACTIVE',
  DISPOSED: 'DISPOSED',
  WRITTEN_OFF: 'WRITTEN_OFF',
} as const;
export type FixedAssetStatus = (typeof FixedAssetStatus)[keyof typeof FixedAssetStatus];

export const BankStatementSide = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;
export type BankStatementSide = (typeof BankStatementSide)[keyof typeof BankStatementSide];

export const ProjectStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  UPDATE_COMPANY: 'UPDATE_COMPANY',
  UPDATE_VAT_STATUS: 'UPDATE_VAT_STATUS',
  UPDATE_DOCUMENT_NUMBERING_RULE: 'UPDATE_DOCUMENT_NUMBERING_RULE',
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
  VOID_JOURNAL: 'VOID_JOURNAL',
  CREATE_PAYMENT: 'CREATE_PAYMENT',
  VOID_PAYMENT: 'VOID_PAYMENT',
  CREATE_INVENTORY_MOVEMENT: 'CREATE_INVENTORY_MOVEMENT',
  CREATE_FIXED_ASSET: 'CREATE_FIXED_ASSET',
  DISPOSE_FIXED_ASSET: 'DISPOSE_FIXED_ASSET',
  RUN_DEPRECIATION: 'RUN_DEPRECIATION',
  IMPORT_BANK_STATEMENT: 'IMPORT_BANK_STATEMENT',
  MATCH_BANK_LINE: 'MATCH_BANK_LINE',
  UNMATCH_BANK_LINE: 'UNMATCH_BANK_LINE',
  SCAN_RISKS: 'SCAN_RISKS',
  RESOLVE_RISK: 'RESOLVE_RISK',
  ACCEPT_RISK: 'ACCEPT_RISK',
  DISMISS_RISK: 'DISMISS_RISK',
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
