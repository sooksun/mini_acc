/**
 * Minimal Thai SMB chart of accounts.
 *
 * This is intentionally NOT a configurable per-company table yet — the feature
 * services need stable account codes to post journals against, and a real
 * "Chart of Accounts" UI is its own future module (PRD §14 #14). Until then,
 * every company shares the constants below.
 *
 * Numbering follows standard 4-digit Thai accounting convention:
 *   1xxx = สินทรัพย์ (Assets)
 *   2xxx = หนี้สิน (Liabilities)
 *   3xxx = ส่วนของผู้ถือหุ้น (Equity)
 *   4xxx = รายได้ (Revenue)
 *   5xxx = ค่าใช้จ่าย (Expenses)
 */
export interface AccountRef {
  code: string;
  name: string;
}

export const ACCOUNTS = {
  CASH: { code: '1110', name: 'เงินสด' },
  BANK: { code: '1120', name: 'เงินฝากธนาคาร' },
  AR: { code: '1130', name: 'ลูกหนี้การค้า' },
  INPUT_VAT: { code: '1151', name: 'ภาษีซื้อ' },
  WHT_RECEIVABLE: { code: '1152', name: 'ภาษีหัก ณ ที่จ่ายรอเรียกคืน' },
  OTHER_RECEIVABLE_WHT: { code: '1153', name: 'ลูกหนี้อื่น-ภาษีจ่ายแทนผู้ขายต่างประเทศ' },
  AP: { code: '2110', name: 'เจ้าหนี้การค้า' },
  OUTPUT_VAT: { code: '2151', name: 'ภาษีขาย' },
  WHT_PAYABLE: { code: '2152', name: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย' },
  REVENUE_SERVICE: { code: '4110', name: 'รายได้ค่าบริการ' },
  REVENUE_SALE: { code: '4120', name: 'รายได้จากการขาย' },
  EXPENSE_GENERAL: { code: '5000', name: 'ค่าใช้จ่ายทั่วไป' },
  WHT_BORNE_EXPENSE: { code: '5920', name: 'ภาษีจ่ายแทนผู้ขายต่างประเทศ' },
} as const satisfies Record<string, AccountRef>;

/**
 * Pick the expense account for a given category string. Falls back to the
 * generic "ค่าใช้จ่ายทั่วไป" code. We deliberately keep the category text in
 * `accountName` so reports group by what the user actually typed — the code
 * is just for sorting in the trial balance.
 */
export function expenseAccountForCategory(category: string | null | undefined): AccountRef {
  if (!category?.trim()) return ACCOUNTS.EXPENSE_GENERAL;
  return { code: ACCOUNTS.EXPENSE_GENERAL.code, name: category.trim() };
}
