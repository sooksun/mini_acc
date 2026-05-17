import { AiConfidenceBadge, getConfidenceTier } from './AiConfidenceBadge';

export interface AiExtractedFieldProps {
  label: string;
  /** The AI-extracted value rendered next to the label. */
  value: React.ReactNode;
  /** 0..1 confidence score from the AI model. */
  confidence?: number;
  /** Render the raw extracted text below (when value is a corrected display). */
  rawText?: string;
  /** Called when the operator clicks the inline accept button. */
  onAccept?: () => void;
  /** Called when the operator clicks the inline reject button. */
  onReject?: () => void;
  /** Custom edit handler — typically opens a modal pre-filled with `value`. */
  onEdit?: () => void;
  /** Inline validation error to display below the field (red helper text). */
  error?: string;
}

/**
 * Display an AI-extracted field with its confidence score. Low-confidence
 * fields get a distinct border so they catch the operator's eye during review.
 *
 * AI is advisory per PRD §6.5 — every field needs explicit human action before
 * it affects the journal. This component is the surface where that happens.
 */
export function AiExtractedField({
  label,
  value,
  confidence,
  rawText,
  onAccept,
  onReject,
  onEdit,
  error,
}: AiExtractedFieldProps) {
  const tier = confidence != null ? getConfidenceTier(confidence) : undefined;
  // Inline validation error wins over confidence tier — invalid is invalid.
  const borderCls = error
    ? 'border-bad'
    : tier === 'low'
      ? 'border-bad/50'
      : tier === 'medium'
        ? 'border-warn/40'
        : 'border-border';

  return (
    <div className={`rounded-md border ${borderCls} bg-surface p-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-text-mute">{label}</span>
        {confidence != null && <AiConfidenceBadge score={confidence} />}
      </div>
      <div className="mt-1 text-[14px] font-medium text-text break-words">{value}</div>
      {rawText && rawText !== String(value) && (
        <div className="mt-1 text-[11.5px] text-text-mute">ต้นฉบับ: {rawText}</div>
      )}
      {error && <div className="mt-1 text-[11.5px] text-bad">{error}</div>}
      {(onAccept || onReject || onEdit) && (
        <div className="mt-2 flex gap-2 text-[11.5px]">
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="rounded-md border border-ok/40 bg-ok/5 px-2 py-0.5 text-ok hover:bg-ok/10"
            >
              ยอมรับ
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md border border-border bg-surface px-2 py-0.5 text-text-soft hover:bg-surface-3"
            >
              แก้ไข
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="rounded-md border border-bad/40 bg-bad/5 px-2 py-0.5 text-bad hover:bg-bad/10"
            >
              ไม่ใช่
            </button>
          )}
        </div>
      )}
    </div>
  );
}
