import { Empty } from './Empty';
import { Spinner } from './Spinner';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Custom renderer; receives the full row. */
  render?: (row: T) => React.ReactNode;
  /** Pulls a value when `render` is omitted. */
  accessor?: (row: T) => React.ReactNode;
  /** Cell alignment. Defaults to left. */
  align?: 'left' | 'right' | 'center';
  /** Optional fixed width — passed as Tailwind className (e.g. "w-24"). */
  widthClass?: string;
  /** Use tabular-nums for money/number columns. */
  numeric?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Click handler for the whole row. */
  onRowClick?: (row: T) => void;
}

const alignCls = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'ยังไม่มีข้อมูล',
  emptyDescription,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <table className="w-full text-[13.5px]">
        <thead className="bg-surface-2 text-left text-text-soft">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium ${alignCls(col.align)} ${col.widthClass ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center">
                <Spinner />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10">
                <Empty title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-t border-border ${onRowClick ? 'cursor-pointer hover:bg-surface-2' : ''}`}
              >
                {columns.map((col) => {
                  const content = col.render
                    ? col.render(row)
                    : col.accessor
                      ? col.accessor(row)
                      : null;
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${alignCls(col.align)} ${col.numeric ? 'font-mono tabular-nums' : ''}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
