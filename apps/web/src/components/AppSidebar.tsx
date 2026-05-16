'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/auth';

const NAV: { group: string; items: { href: string; label: string; pill?: number }[] }[] = [
  {
    group: 'ภาพรวม',
    items: [{ href: '/dashboard', label: 'Dashboard' }],
  },
  {
    group: 'ข้อมูลหลัก',
    items: [
      { href: '/customers', label: 'ลูกค้า' },
      { href: '/vendors', label: 'ผู้ขาย' },
      { href: '/products', label: 'สินค้า/บริการ' },
      { href: '/inventory', label: 'คลังสินค้า' },
      { href: '/assets', label: 'ทรัพย์สินถาวร' },
    ],
  },
  {
    group: 'เอกสารขาย',
    items: [
      { href: '/sales/quotations', label: 'ใบเสนอราคา' },
      { href: '/sales/invoices', label: 'ใบแจ้งหนี้' },
      { href: '/sales/delivery-notes', label: 'ใบส่งของ' },
      { href: '/sales/receipts', label: 'ใบเสร็จ' },
      { href: '/sales/tax-invoices', label: 'ใบกำกับภาษี' },
      { href: '/sales/receipt-tax-invoices', label: 'ใบเสร็จ/ภาษี' },
    ],
  },
  {
    group: 'รายจ่าย',
    items: [
      { href: '/ai-inbox', label: 'AI Inbox' },
      { href: '/expenses/receipts', label: 'อัปโหลดใบเสร็จ' },
    ],
  },
  {
    group: 'การเงิน',
    items: [
      { href: '/payments', label: 'รับ/จ่ายเงิน' },
      { href: '/bank', label: 'Bank Reconciliation' },
      { href: '/tax', label: 'ภาษี VAT/WHT' },
      { href: '/wht-certificates', label: 'หนังสือรับรอง 50 ทวิ' },
    ],
  },
  {
    group: 'ปิดงวด/Risk',
    items: [
      { href: '/risks', label: 'Risk Center' },
      { href: '/closing', label: 'ปิดงวดบัญชี' },
      { href: '/accountant-pack', label: 'Accountant Pack' },
    ],
  },
  {
    group: 'ตั้งค่า',
    items: [
      { href: '/settings/company', label: 'ตั้งค่าบริษัท' },
      { href: '/settings/users', label: 'ผู้ใช้และสิทธิ์' },
      { href: '/settings/document-numbering', label: 'เลขเอกสาร' },
      { href: '/settings/audit-log', label: 'Audit Log' },
    ],
  },
];

export function AppSidebar({ user }: { user: { fullName: string; initial: string | null; role: string } | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore — token might already be expired
    }
    clearSession();
    router.replace('/login');
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[248px] flex-col gap-4 border-r border-border bg-surface/80 px-4 py-5 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2 pb-3">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-gradient text-[15px] font-bold text-white shadow-md">
          SN
        </div>
        <div>
          <div className="text-[15px] font-bold tracking-tight">HJ Account AI</div>
          <div className="mt-px text-[11px] text-text-mute">หจก. โซลูชั่น เนกซ์เจน</div>
        </div>
      </div>

      {NAV.map((g) => (
        <div key={g.group} className="flex flex-col gap-0.5">
          <div className="px-3 pb-1.5 pt-2 text-[10.5px] uppercase tracking-[0.12em] text-text-faint">
            {g.group}
          </div>
          {g.items.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href as any}
                className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors ${
                  active
                    ? 'bg-brand-gradient text-white shadow-md'
                    : 'text-text-soft hover:bg-surface-3 hover:text-text'
                }`}
              >
                <span>{item.label}</span>
                {item.pill !== undefined && item.pill > 0 && (
                  <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] text-text-soft">
                    {item.pill}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      {user && (
        <div className="mt-auto flex items-center gap-2.5 border-t border-border p-2.5">
          <div className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-brand-gradient text-[13px] font-semibold text-white">
            {user.initial ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{user.fullName}</div>
            <div className="text-[11px] text-text-mute">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="rounded-md border border-border px-2 py-1 text-[11px] text-text-soft transition-colors hover:bg-surface-3 hover:text-text"
          >
            ออก
          </button>
        </div>
      )}
    </aside>
  );
}
