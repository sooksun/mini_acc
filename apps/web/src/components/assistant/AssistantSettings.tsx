'use client';

import { useAssistant } from '@/contexts/AssistantContext';

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-[13px] text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-text-mute">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand' : 'bg-surface-3'
        }`}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
          style={{ transform: `translateX(${checked ? 18 : 2}px)` }}
        />
      </button>
    </label>
  );
}

export function AssistantSettings() {
  const { enabled, autoAdvice, setEnabled, setAutoAdvice } = useAssistant();
  return (
    <div className="flex flex-col px-3 py-1">
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        label="เปิดผู้ช่วย AI"
        hint="ปิดเพื่อทำเองทั้งหมด (ยังกดเปิดใหม่ได้ที่นี่)"
      />
      <div className="h-px bg-border" />
      <Toggle
        checked={autoAdvice}
        onChange={setAutoAdvice}
        label="แนะนำอัตโนมัติเมื่อเปิดหน้า"
        hint="ปิดได้เมื่อใช้งานคล่องแล้ว"
      />
    </div>
  );
}
