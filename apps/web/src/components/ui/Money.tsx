import { formatThaiCurrency } from '@/lib/format';

export function Money({
  value,
  symbol = true,
  className,
}: {
  value: string | number;
  symbol?: boolean;
  className?: string;
}) {
  const text = formatThaiCurrency(value);
  return <span className={`font-mono tabular-nums ${className ?? ''}`}>{symbol ? `฿ ${text}` : text}</span>;
}
