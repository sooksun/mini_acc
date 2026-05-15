export type StatTone = 'default' | 'ok' | 'warn' | 'bad' | 'info';

export interface StatDelta {
  /** Raw value to show. Negative renders red, positive renders green. */
  value: number;
  /** Optional formatter; defaults to "+N" / "-N". */
  format?: (n: number) => string;
  /** Suffix like "%", "บาท". */
  suffix?: string;
}

export interface StatCardProps {
  label: string;
  value: string;
  tone?: StatTone;
  /** Right-aligned icon slot — pass a small inline SVG / lucide icon. */
  icon?: React.ReactNode;
  /** Optional sub-line under the value (e.g. range, comparison). */
  hint?: string;
  /** Delta indicator. */
  delta?: StatDelta;
}

const toneValueCls: Record<StatTone, string> = {
  default: 'text-text',
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
};

export function formatDelta(d: StatDelta): { text: string; cls: string } {
  const fmt = d.format ?? ((n) => (n > 0 ? `+${n}` : `${n}`));
  const cls = d.value > 0 ? 'text-ok' : d.value < 0 ? 'text-bad' : 'text-text-mute';
  return { text: `${fmt(d.value)}${d.suffix ?? ''}`, cls };
}

export function StatCard({ label, value, tone = 'default', icon, hint, delta }: StatCardProps) {
  const valueCls = toneValueCls[tone];
  return (
    <div className="rounded-lg border border-border bg-surface/80 px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] text-text-mute">{label}</div>
        {icon && <div className="text-text-mute">{icon}</div>}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueCls}`}>{value}</div>
      <div className="mt-1 flex items-baseline gap-2 text-[11.5px]">
        {delta && (() => {
          const d = formatDelta(delta);
          return <span className={`font-medium ${d.cls}`}>{d.text}</span>;
        })()}
        {hint && <span className="text-text-mute">{hint}</span>}
      </div>
    </div>
  );
}
