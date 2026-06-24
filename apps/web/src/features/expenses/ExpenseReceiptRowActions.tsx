import { checkAccount } from './expense-receipts.form';
import type { ExpenseReceipt } from './expense-receipts.types';

export function ExpenseReceiptRowActions({
  item,
  canApproveVendor,
  canUpload,
  canAccount,
  onApproveNewVendor,
  onLink,
  onAccount,
  onView,
  onEdit,
}: {
  item: ExpenseReceipt;
  canApproveVendor: boolean;
  canUpload: boolean;
  canAccount: boolean;
  onApproveNewVendor: () => void;
  onLink: () => void;
  onAccount: () => void;
  onView: () => void;
  onEdit: () => void;
}) {
  const preflight = checkAccount(item);
  const showLink =
    canUpload && (item.status === 'UPLOADED' || item.status === 'PENDING_VENDOR_APPROVAL');
  const showReLink = canUpload && item.status === 'READY_TO_ACCOUNT';
  const showApproveNew =
    canApproveVendor && item.status === 'PENDING_VENDOR_APPROVAL' && !!item.proposedVendorName;
  const showAccount = canAccount && item.status === 'READY_TO_ACCOUNT';
  const showEdit =
    canUpload && item.status !== 'ACCOUNTED' && item.status !== 'REJECTED';

  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={onView}
        title="เปิดไฟล์ใบเสร็จในแท็บใหม่"
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
      >
        ดูไฟล์
      </button>
      {showEdit && (
        <button
          onClick={onEdit}
          title="แก้ไขข้อมูล/ยอดเงินของใบเสร็จ"
          className="rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 text-[12px] font-medium text-brand hover:bg-brand/10"
        >
          แก้ไข
        </button>
      )}
      {showApproveNew && (
        <button
          onClick={onApproveNewVendor}
          className="rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10"
        >
          อนุมัติผู้ขายใหม่
        </button>
      )}
      {showLink && (
        <button
          onClick={onLink}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
        >
          ผูกผู้ขายเดิม
        </button>
      )}
      {showReLink && (
        <button
          onClick={onLink}
          title="เปลี่ยนผู้ขายที่ผูกไว้ก่อนลงรายจ่าย"
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] text-text-soft hover:bg-surface-3"
        >
          เปลี่ยนผู้ขาย
        </button>
      )}
      {showAccount && (
        <button
          onClick={onAccount}
          disabled={!preflight.ok}
          title={preflight.ok ? 'ลงรายจ่ายเข้าระบบ' : preflight.reason}
          className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
        >
          บันทึกรายจ่าย
        </button>
      )}
    </div>
  );
}