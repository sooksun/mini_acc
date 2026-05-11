'use client';

import { useState } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  onConfirm: (reason?: string) => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  destructive,
  requireReason,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (requireReason && reason.trim().length < 3) return;
    setBusy(true);
    try {
      await onConfirm(requireReason ? reason : undefined);
      setReason('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] text-text-soft hover:bg-surface-3 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || (requireReason && reason.trim().length < 3)}
            className={`rounded-md px-3.5 py-2 text-[13px] font-medium text-white shadow-md disabled:opacity-50 ${
              destructive ? 'bg-bad' : 'bg-brand-gradient'
            }`}
          >
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </>
      }
    >
      {description && <p className="text-[13.5px] text-text-soft">{description}</p>}
      {requireReason && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] text-text-soft">เหตุผล (ขั้นต่ำ 3 ตัวอักษร)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
      )}
    </Modal>
  );
}
