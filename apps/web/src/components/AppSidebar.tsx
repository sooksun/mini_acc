'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/auth';

type NavItem = { href: string; label: string; pill?: number; roles?: string[] };
type NavSection = 'DAILY' | 'MONTHLY' | 'YEARLY';
type NavGroup = { key: string; group: string; items: NavItem[]; defaultOpen: boolean; section: NavSection };

// How often each section is used — shown as a divider above the first group of
// each section. Groups are ordered to follow the actual work sequence.
const SECTION_LABELS: Record<NavSection, string> = {
  DAILY: 'ใช้ทุกวัน',
  MONTHLY: 'ทุกสิ้นเดือน',
  YEARLY: 'ปีละครั้ง · ตั้งค่า',
};

const NAV: NavGroup[] = [
  // ===== ใช้ทุกวัน — งานเดินเอกสาร/รับจ่ายประจำวัน =====
  {
    key: 'overview',
    section: 'DAILY',
    group: 'ภาพรวม',
    defaultOpen: true,
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/profit-loss', label: 'สรุปกำไรขาดทุน' },
    ],
  },
  {
    key: 'sales',
    section: 'DAILY',
    group: 'เอกสารขาย',
    defaultOpen: true,
    items: [
      { href: '/sales/quotations', label: 'ใบเสนอราคา' },
      { href: '/sales/delivery-notes', label: 'ใบส่งของ' },
      { href: '/sales/invoices', label: 'ใบแจ้งหนี้' },
      { href: '/sales/receipt-tax-invoices', label: 'ใบเสร็จ/ใบกำกับภาษี' },
    ],
  },
  {
    key: 'expenses',
    section: 'DAILY',
    group: 'รายจ่าย',
    defaultOpen: true,
    items: [
      { href: '/ai-inbox', label: 'AI Inbox' },
      { href: '/expenses/receipts', label: 'อัปโหลดใบเสร็จ' },
    ],
  },
  {
    key: 'money',
    section: 'DAILY',
    group: 'รับ-จ่ายเงิน',
    defaultOpen: true,
    items: [{ href: '/payments', label: 'รับ/จ่ายเงิน' }],
  },
  {
    key: 'master',
    section: 'DAILY',
    group: 'ข้อมูลหลัก',
    defaultOpen: false,
    items: [
      { href: '/customers', label: 'ลูกค้า' },
      { href: '/vendors', label: 'ผู้ขาย' },
      { href: '/products', label: 'สินค้า/บริการ' },
      { href: '/projects', label: 'โครงการ' },
      { href: '/inventory', label: 'คลังสินค้า' },
      { href: '/assets', label: 'ทรัพย์สินถาวร' },
    ],
  },

  // ===== ทุกสิ้นเดือน — ภาษี → กระทบยอด → รายงาน → ปิดงวด =====
  {
    key: 'tax',
    section: 'MONTHLY',
    group: 'ภาษี',
    defaultOpen: false,
    items: [
      { href: '/tax', label: 'ภาษี VAT/WHT' },
      { href: '/wht-certificates', label: 'หนังสือรับรอง 50 ทวิ' },
    ],
  },
  {
    key: 'reconcile',
    section: 'MONTHLY',
    group: 'กระทบยอด & ความเสี่ยง',
    defaultOpen: false,
    items: [
      { href: '/bank', label: 'กระทบยอดบัญชีธนาคาร' },
      { href: '/risks', label: 'ศูนย์ความเสี่ยง' },
    ],
  },
  {
    key: 'reports',
    section: 'MONTHLY',
    group: 'รายงานบัญชี',
    defaultOpen: false,
    items: [
      { href: '/trial-balance', label: 'งบทดลอง' },
      { href: '/balance-sheet', label: 'งบแสดงฐานะการเงิน' },
      { href: '/general-ledger', label: 'บัญชีแยกประเภท' },
    ],
  },
  {
    key: 'closing',
    section: 'MONTHLY',
    group: 'ปิดงวด',
    defaultOpen: false,
    items: [
      { href: '/closing', label: 'ปิดงวดบัญชี' },
      { href: '/accountant-pack', label: 'แพ็กสำหรับนักบัญชี' },
    ],
  },

  // ===== ปีละครั้ง · ตั้งค่า =====
  {
    key: 'yearend',
    section: 'YEARLY',
    group: 'สิ้นปี',
    defaultOpen: false,
    items: [{ href: '/year-end-closing', label: 'ปิดบัญชีสิ้นปี' }],
  },
  {
    key: 'settings',
    section: 'YEARLY',
    group: 'ตั้งค่าระบบ',
    defaultOpen: false,
    items: [
      { href: '/settings/company', label: 'ตั้งค่าบริษัท' },
      { href: '/settings/chart-accounts', label: 'ผังบัญชี' },
      { href: '/settings/markup', label: 'Markup เริ่มต้น', roles: ['OWNER'] },
      { href: '/settings/users', label: 'ผู้ใช้และสิทธิ์' },
      { href: '/settings/document-numbering', label: 'เลขเอกสาร' },
      { href: '/settings/audit-log', label: 'บันทึกการตรวจสอบ' },
      { href: '/settings/danger', label: 'โซนอันตราย', roles: ['OWNER'] },
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
        <img
          src="/logo.png"
          alt="Solution Nextgen"
          className="h-[70px] w-[70px] rounded-[10px] object-contain"
        />
        <div>
          <div className="text-[15px] font-bold tracking-tight">Solution Nextgen</div>
          <div className="mt-px text-[11px] text-text-mute">หจก. โซลูชั่น เนกซ์เจน</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {NAV.map((g, idx) => {
          const isOpen = open[g.key] ?? g.defaultOpen;
          const hasActive = g.items.some((i) => pathname?.startsWith(i.href));
          const showSection = idx === 0 || NAV[idx - 1]!.section !== g.section;
          return (
            <Fragment key={g.key}>
              {showSection && (
                <div className={`flex items-center gap-2 px-2 ${idx === 0 ? 'mt-0' : 'mt-3'} mb-0.5`}>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-mute/70">
                    {SECTION_LABELS[g.section]}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                aria-expanded={isOpen}
                className={`flex items-center justify-between rounded-[10px] px-3 py-1.5 text-[15px] uppercase tracking-[0.06em] transition-colors hover:bg-surface-3 ${
                  hasActive ? 'text-text' : 'text-text-mute hover:text-text'
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
                  {g.items.filter((item) => !item.roles || item.roles.includes(user?.role ?? '')).map((item) => {
                    const active = pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href as any}
                        className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[15px] transition-colors ${
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
            </Fragment>
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
