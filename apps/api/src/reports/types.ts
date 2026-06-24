export type ProfitLossMonthly = {
  month: number;
  monthLabel: string;
  revenue: number;
  expense: number;
  profit: number;
  marginPercent: number;
};

export type ProfitLossBreakdown = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type ProfitLossSummary = {
  mode: 'monthly' | 'yearly';
  period: {
    year: number;
    beYear: number;
    month?: number;
    label: string;
  };
  totals: {
    revenue: number;
    revenueGross: number;
    expense: number;
    expenseGross: number;
    profit: number;
    marginPercent: number;
  };
  revenueByType: ProfitLossBreakdown[];
  expenseByCategory: ProfitLossBreakdown[];
  monthly: ProfitLossMonthly[];
};

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'OTHER';

export type TrialBalanceRow = {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  accountTypeLabel: string;
  debit: number;
  credit: number;
};

export type TrialBalanceSummary = {
  asOf: {
    year: number;
    beYear: number;
    month?: number;
    label: string;
  };
  rows: TrialBalanceRow[];
  totals: {
    debit: number;
    credit: number;
    balanced: boolean;
  };
};

export type BalanceSheetRow = {
  accountCode: string;
  accountName: string;
  amount: number;
  synthetic?: boolean;
};

export type BalanceSheetSummary = {
  asOf: { year: number; beYear: number; month?: number; label: string };
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesAndEquity: number;
    balanced: boolean;
  };
};

export type GeneralLedgerLine = {
  date: string;
  journalEntryId: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export type GeneralLedgerReport = {
  account: {
    code: string;
    name: string;
    accountType: AccountType;
    accountTypeLabel: string;
  };
  period: { year: number; beYear: number; month?: number; label: string };
  openingBalance: number;
  lines: GeneralLedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
};

export type DashboardSummary = {
  period: { year: number; month: number; beYear: number; monthLabel: string };
  thisMonth: { revenue: number; expense: number; profit: number };
  thisYear: { revenue: number; expense: number; profit: number };
  monthly: ProfitLossMonthly[];
  pending: {
    draftSalesDocs: number;
    pendingExpenses: number;
    aiInboxPending: number;
    openRisks: number;
    criticalRisks: number;
    unmatchedBank: number;
  };
};

export type ChartAccountListItem = {
  code: string;
  name: string;
  accountType: AccountType;
  accountTypeLabel: string;
};