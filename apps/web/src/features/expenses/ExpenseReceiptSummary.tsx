import type { ExpenseReceiptStatus } from '@hj/shared-types';
import { EXPENSE_RECEIPT_STATUS } from './expense-receipts.types';

export function ExpenseSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn' | 'ok';
}) {
  const cls = tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-text';
  return (
    <div className="rounded-lg border border-border bg-surface/80 px-4 py-3 shadow-sm">
      <div className="text-[12px] text-text-mute">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

export function ExpenseStatusBadge({ status }: { status: ExpenseReceiptStatus }) {
  const meta = EXPENSE_RECEIPT_STATUS[status];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11.5px] ${meta.cls}`}>
      {meta.label}
    </span>
  );
}