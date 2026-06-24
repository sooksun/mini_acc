/**
 * Canonical system account codes and names for automated journal posting.
 *
 * Each company also has a `ChartAccount` table (seeded from these constants as
 * `isSystem: true`, plus user-defined accounts via Settings). Feature services
 * post against the stable codes below; reports and year-end closing classify
 * accounts by chart type with `accountTypeByPrefix` as the prefix fallback.
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

export type AccountStatementType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

/**
 * Single source of truth for classifying an account code by its leading digit
 * when no chart-table row exists. Used by the reports, the year-end closing,
 * and the chart seed so all three agree on what a code "is". Anything outside
 * 1-4 (5xxx and any non-standard nominal code like 6xxx) is expense-nature, so
 * the three financial statements tie out: a 6xxx code with no chart row is an
 * expense to the P&L, folds into the balance sheet's earnings, and is closed to
 * retained earnings — identically.
 */
export function accountTypeByPrefix(code: string): AccountStatementType {
  switch (code[0]) {
    case '1':
      return 'ASSET';
    case '2':
      return 'LIABILITY';
    case '3':
      return 'EQUITY';
    case '4':
      return 'REVENUE';
    default:
      return 'EXPENSE';
  }
}

export const ACCOUNTS = {
  CASH: { code: '1110', name: 'เงินสด' },
  BANK: { code: '1120', name: 'เงินฝากธนาคาร' },
  AR: { code: '1130', name: 'ลูกหนี้การค้า' },
  PREPAID_EXPENSE: { code: '1180', name: 'ค่าใช้จ่ายจ่ายล่วงหน้า' },
  INPUT_VAT: { code: '1151', name: 'ภาษีซื้อ' },
  WHT_RECEIVABLE: { code: '1152', name: 'ภาษีหัก ณ ที่จ่ายรอเรียกคืน' },
  OTHER_RECEIVABLE_WHT: { code: '1153', name: 'ลูกหนี้อื่น-ภาษีจ่ายแทนผู้ขายต่างประเทศ' },
  INTANGIBLE_ASSET: { code: '1410', name: 'สินทรัพย์ไม่มีตัวตน - โปรแกรมคอมพิวเตอร์' },
  // Contra-asset (credit-normal). Nets against gross asset cost so the balance
  // sheet shows net book value. Posted by FixedAssetsService.runDepreciation().
  ACCUM_DEPRECIATION: { code: '1490', name: 'ค่าเสื่อมราคาสะสม' },
  AP: { code: '2110', name: 'เจ้าหนี้การค้า' },
  OUTPUT_VAT: { code: '2151', name: 'ภาษีขาย' },
  WHT_PAYABLE: { code: '2152', name: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย' },
  // Equity (3xxx). CAPITAL is entered via a manual opening-balance journal.
  // RETAINED_EARNINGS (3300) receives year-end closing entries from
  // YearEndClosingService; until close, interim P&L shows on the synthetic
  // 3310 line (see SYNTHETIC_CURRENT_PERIOD_EARNINGS below — not seeded).
  CAPITAL: { code: '3100', name: 'ทุนจดทะเบียน' },
  RETAINED_EARNINGS: { code: '3300', name: 'กำไรสะสม' },
  REVENUE_SERVICE: { code: '4110', name: 'รายได้ค่าบริการ' },
  REVENUE_SALE: { code: '4120', name: 'รายได้จากการขาย' },
  EXPENSE_GENERAL: { code: '5000', name: 'ค่าใช้จ่ายทั่วไป' },
  DEPRECIATION_EXPENSE: { code: '5500', name: 'ค่าเสื่อมราคา' },
  WHT_BORNE_EXPENSE: { code: '5920', name: 'ภาษีจ่ายแทนผู้ขายต่างประเทศ' },
} as const satisfies Record<string, AccountRef>;

/**
 * Balance-sheet display row only — not a ledger account and not seeded into
 * ChartAccount. Reports add this synthetic equity line so an interim sheet
 * balances before year-end close folds the result into 3300.
 */
export const SYNTHETIC_CURRENT_PERIOD_EARNINGS: AccountRef = {
  code: '3310',
  name: 'กำไร(ขาดทุน)สะสม - งวดปัจจุบัน',
};

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
