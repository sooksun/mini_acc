'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocumentStatus } from '@hj/shared-types';
import { AppTopbar } from '@/components/AppTopbar';
import { ThaiDatePicker } from '@/components/ui/ThaiDatePicker';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatThaiDateShort } from '@/lib/format';
import { getUser } from '@/lib/auth';
import type { DocTypeMeta } from './doc-type-meta';

interface Doc {
  id: string;
  number: string;
  status: DocumentStatus;
  documentDate: string;
  customer: { nameTh: string };
  grandTotal: string;
  reference: string | null;
}

export function SalesDocumentsList({ meta }: { meta: DocTypeMeta }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DocumentStatus | ''>('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const role = getUser()?.role;
  const canCreate = role === 'OWNER' || role === 'ADMIN';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom + 'T00:00:00+07:00').toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo + 'T23:59:59+07:00').toISOString());
      params.set('take', '100');
      const res = await api<{ items: Doc[]; total: number }>(
        `${meta.apiBase}?${params.toString()}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, dateFrom, dateTo, meta.apiBase]);

  return (
    <>
      <AppTopbar title={meta.title} />
      <div className="flex-1 px-7 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
            <p className="mt-1 text-[13px] text-text-mute">
              เลขเริ่มต้น {meta.prefix}-2569-XXXX · DRAFT แก้ไขได้, USER_CONFIRMED ขึ้นไป ล็อกเลข
            </p>
          </div>
          {canCreate && (
            <Link
              href={meta.newHref as any}
              className="rounded-md bg-brand-gradient px-4 py-2 text-[13px] font-medium text-white shadow-md"
            >
              + สร้าง{meta.shortTitle}ใหม่
            </Link>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ / ชื่อลูกค้า / อ้างอิง"
            className="w-72 rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DocumentStatus | '')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          >
            <option value="">ทุกสถานะ</option>
            <option value="DRAFT">ฉบับร่าง</option>
            <option value="USER_CONFIRMED">ยืนยันแล้ว</option>
            <option value="ACCOUNTED">ลงบัญชี</option>
            <option value="LOCKED">ล็อก</option>
            <option value="VOIDED">ยกเลิก</option>
          </select>
          <div className="w-36">
            <ThaiDatePicker value={dateFrom} onChange={setDateFrom} placeholder="จากวันที่" />
          </div>
          <span className="text-[12px] text-text-mute">ถึง</span>
          <div className="w-36">
            <ThaiDatePicker value={dateTo} onChange={setDateTo} placeholder="ถึงวันที่" />
          </div>
          <span className="ml-auto text-[12.5px] text-text-mute">{total} รายการ</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-text-soft">
              <tr>
                <th className="px-4 py-3 font-medium">เลขที่</th>
                <th className="px-4 py-3 font-medium">ลูกค้า</th>
                <th className="px-4 py-3 font-medium">วันที่</th>
                <th className="px-4 py-3 text-right font-medium">ยอดรวม</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10">
                    <Empty
                      title={search || status ? 'ไม่พบรายการที่ค้นหา' : `ยังไม่มี${meta.shortTitle}`}
                      description={canCreate ? 'เริ่มจากการสร้างใบใหม่' : undefined}
                    />
                  </td>
                </tr>
              ) : (
                items.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => router.push(`${meta.listHref}/${q.id}` as any)}
                    className="cursor-pointer border-t border-border hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 font-mono text-[12.5px] font-medium">
                      {q.number.startsWith('DRAFT-') ? (
                        <span className="text-text-mute">{q.number}</span>
                      ) : (
                        q.number
                      )}
                    </td>
                    <td className="px-4 py-3">{q.customer.nameTh}</td>
                    <td className="px-4 py-3 text-text-soft">
                      {formatThaiDateShort(q.documentDate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money value={q.grandTotal} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={q.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
