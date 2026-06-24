import { AccountType, NormalBalance, Prisma } from '@prisma/client';
import { ACCOUNTS, accountTypeByPrefix } from './accounts';

/**
 * The system chart of accounts — every code the automated posting paths use,
 * derived from the hard-coded ACCOUNTS constant. These rows are seeded per
 * company as `isSystem: true` (cannot be deleted). Users add their own accounts
 * on top via the Chart of Accounts settings screen.
 */
export interface SystemAccount {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
}

// Contra accounts: classified by their statement section (a 1xxx asset) but
// carrying the opposite normal balance. Accumulated depreciation reduces assets.
const CONTRA_CREDIT_CODES = new Set<string>(['1490']);

function deriveNormalBalance(code: string, type: AccountType): NormalBalance {
  if (CONTRA_CREDIT_CODES.has(code)) return NormalBalance.CREDIT;
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? NormalBalance.DEBIT
    : NormalBalance.CREDIT;
}

export const SYSTEM_ACCOUNTS: SystemAccount[] = Object.values(ACCOUNTS)
  .map((a) => {
    const type = accountTypeByPrefix(a.code) as AccountType;
    return { code: a.code, name: a.name, type, normalBalance: deriveNormalBalance(a.code, type) };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

/**
 * Idempotently seed the system chart for a company. Upserts each system account
 * by (companyId, code): inserts if missing, and re-asserts the system flag +
 * canonical type/normalBalance if present, but DOES NOT overwrite a name the
 * user may have customised (only fills the name on insert).
 *
 * Accepts a PrismaClient or a transaction client so it can run inside seed.ts,
 * company creation, or a backfill.
 */
export async function seedChartAccounts(
  db: Pick<Prisma.TransactionClient, 'chartAccount'>,
  companyId: string,
): Promise<void> {
  for (const a of SYSTEM_ACCOUNTS) {
    await db.chartAccount.upsert({
      where: { companyId_code: { companyId, code: a.code } },
      create: {
        companyId,
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        isSystem: true,
        isActive: true,
      },
      update: {
        // Keep the chart's structural truth in sync without clobbering a
        // user-renamed display name.
        type: a.type,
        normalBalance: a.normalBalance,
        isSystem: true,
      },
    });
  }
}
