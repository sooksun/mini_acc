export type ConfidenceTier = 'high' | 'medium' | 'low';

export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  medium: 0.6,
} as const;

/**
 * Convert a confidence number (0..1) into a tier. Values out of range and NaN
 * fall through to "low" — caller usually wants the human to double-check those.
 */
export function getConfidenceTier(score: number): ConfidenceTier {
  if (!Number.isFinite(score)) return 'low';
  if (score >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/** Format a 0..1 score as "85%" (rounded). Clamps to [0, 100]. */
export function formatConfidencePercent(score: number): string {
  if (!Number.isFinite(score)) return '0%';
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return `${pct}%`;
}

const TIER_CLS: Record<ConfidenceTier, string> = {
  high: 'border-ok/40 bg-ok/10 text-ok',
  medium: 'border-warn/40 bg-warn/10 text-warn',
  low: 'border-bad/40 bg-bad/10 text-bad',
};

const TIER_LABEL: Record<ConfidenceTier, string> = {
  high: 'เชื่อถือได้',
  medium: 'ตรวจสอบ',
  low: 'ต้องตรวจ',
};

export function AiConfidenceBadge({
  score,
  showPercent = true,
  showLabel = false,
}: {
  score: number;
  /** Render the numeric percent. Default true. */
  showPercent?: boolean;
  /** Render the Thai tier label after the percent. */
  showLabel?: boolean;
}) {
  const tier = getConfidenceTier(score);
  const cls = TIER_CLS[tier];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {showPercent && <span className="tabular-nums">{formatConfidencePercent(score)}</span>}
      {showLabel && <span>{TIER_LABEL[tier]}</span>}
    </span>
  );
}
