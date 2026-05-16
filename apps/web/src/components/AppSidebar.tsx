'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/auth';

type NavItem = { href: string; label: string; pill?: number };
type NavGroup = { key: string; group: string; items: NavItem[]; defaultOpen: boolean };

const NAV: NavGroup[] = [
  {
    key: 'overview',
    group: 'ภาพรวม',
    defaultOpen: true,
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/profit-loss', label: 'สรุปกำไรขาดทุน' },
    ],
  },
  {
    key: 'sales',
    group: 'เอกสารขาย',
    defaultOpen: true,
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
    key: 'expenses',
    group: 'รายจ่าย',
    defaultOpen: true,
    items: [
      { href: '/ai-inbox', label: 'AI Inbox' },
      { href: '/expenses/receipts', label: 'อัปโหลดใบเสร็จ' },
    ],
  },
  {
    key: 'finance',
    group: 'การเงิน',
    defaultOpen: true,
    items: [
      { href: '/payments', label: 'รับ/จ่ายเงิน' },
      { href: '/bank', label: 'Bank Reconciliation' },
      { href: '/tax', label: 'ภาษี VAT/WHT' },
      { href: '/wht-certificates', label: 'หนังสือรับรอง 50 ทวิ' },
    ],
  },
  {
    key: 'master',
    group: 'ข้อมูลหลัก',
    defaultOpen: false,
    items: [
      { href: '/customers', label: 'ลูกค้า' },
      { href: '/vendors', label: 'ผู้ขาย' },
      { href: '/products', label: 'สินค้า/บริการ' },
      { href: '/inventory', label: 'คลังสินค้า' },
      { href: '/assets', label: 'ทรัพย์สินถาวร' },
    ],
  },
  {
    key: 'compliance',
    group: 'ปิดงวด & ตรวจสอบ',
    defaultOpen: false,
    items: [
      { href: '/risks', label: 'Risk Center' },
      { href: '/closing', label: 'ปิดงวดบัญชี' },
      { href: '/accountant-pack', label: 'Accountant Pack' },
    ],
  },
  {
    key: 'settings',
    group: 'จัดการและตั้งค่า',
    defaultOpen: false,
    items: [
      { href: '/settings/company', label: 'ตั้งค่าบริษัท' },
      { href: '/settings/users', label: 'ผู้ใช้และสิทธิ์' },
      { href: '/settings/document-numbering', label: 'เลขเอกสาร' },
      { href: '/settings/audit-log', label: 'Audit Log' },
    ],
  },
];

const STORAGE_KEY = 'hj-sidebar-groups';

function initialOpen(): Record<string, boolean> {
  return Object.fromEntries(NAV.map((g) => [g.key, g.defaultOpen]));
}

export function AppSidebar({ user }: { user: { fullName: string; initial: string | null; role: string } | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setOpen((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    const activeGroup = NAV.find((g) => g.items.some((i) => pathname?.startsWith(i.href)));
    if (activeGroup) {
      setOpen((prev) => (prev[activeGroup.key] ? prev : { ...prev, [activeGroup.key]: true }));
    }
  }, [pathname]);

  function toggleGroup(key: string) {
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }

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
    <aside className="sticky top-0 flex h-screen w-[248px] flex-col gap-3 border-r border-border bg-surface/80 px-4 py-5 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2 pb-3">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-gradient text-[15px] font-bold text-white shadow-md">
          SN
        </div>
        <div>
          <div className="text-[15px] font-bold tracking-tight">HJ Account AI</div>
          <div className="mt-px text-[11px] text-text-mute">หจก. โซลูชั่น เนกซ์เจน</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {NAV.map((g) => {
          const isOpen = open[g.key] ?? g.defaultOpen;
          const hasActive = g.items.some((i) => pathname?.startsWith(i.href));
          return (
            <div key={g.key} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                aria-expanded={isOpen}
                className={`flex items-center justify-between rounded-[10px] px-3 py-1.5 text-[10.5px] uppercase tracking-[0.12em] transition-colors hover:bg-surface-3 ${
                  hasActive ? 'text-text' : 'text-text-faint hover:text-text-soft'
                }`}
              >
                <span>{g.group}</span>
                <svg
                  className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M4.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-0.5">
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
              )}
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="flex items-center gap-2.5 border-t border-border p-2.5">
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
