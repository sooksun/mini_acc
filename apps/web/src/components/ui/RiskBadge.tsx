import type { RiskLevel } from '@hj/shared-types';

export const RISK_META: Record<RiskLevel, { label: string; cls: string }> = {
  LOW: { label: 'ต่ำ', cls: 'border-info/40 bg-info/10 text-info' },
  MEDIUM: { label: 'ปานกลาง', cls: 'border-warn/40 bg-warn/10 text-warn' },
  HIGH: { label: 'สูง', cls: 'border-warn/60 bg-warn/20 text-warn' },
  CRITICAL: { label: 'วิกฤต', cls: 'border-bad/60 bg-bad/15 text-bad' },
};

export function getRiskMeta(level: RiskLevel) {
  return RISK_META[level];
}

export function RiskBadge({ level, showDot = false }: { level: RiskLevel; showDot?: boolean }) {
  const meta = RISK_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${meta.cls}`}
    >
      {showDot && (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            level === 'CRITICAL'
              ? 'bg-bad'
              : level === 'HIGH' || level === 'MEDIUM'
                ? 'bg-warn'
                : 'bg-info'
          }`}
        />
      )}
      {meta.label}
    </span>
  );
}
