'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { ExpenseForm } from './expense-receipts.form';
import { ExpenseReceiptField } from './ExpenseReceiptField';

export function CapitalizationFields({
  form,
  setForm,
}: {
  form: ExpenseForm;
  setForm: Dispatch<SetStateAction<ExpenseForm>>;
}) {
  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1 block text-[12.5px] text-text-soft">
            ชื่อผู้ซื้อบนใบ (กรอกเมื่อไม่ใช่ชื่อกิจการ)
          </span>
          <input
            value={form.billedToName}
            onChange={(e) => setForm((v) => ({ ...v, billedToName: e.target.value }))}
            placeholder="เช่น ชื่อบุคคลบนใบแจ้งหนี้ Cursor"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
        </label>
        {form.billedToName.trim() && (
          <div className="md:col-span-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn">
            ถ้าชื่อบนใบไม่ใช่ชื่อกิจการ ให้แนบใบสำคัญจ่ายคืน + เหตุผลใช้ในกิจการ และแก้ billing name รอบหน้า
          </div>
        )}
        <label className="flex items-center gap-2 text-[12.5px] text-text-soft md:col-span-2">
          <input
            type="checkbox"
            checked={form.treatAsIntangible}
            onChange={(e) =>
              setForm((v) => ({
                ...v,
                treatAsIntangible: e.target.checked,
                treatAsPrepaid: e.target.checked ? false : v.treatAsPrepaid,
              }))
            }
          />
          ลงเป็นสินทรัพย์ไม่มีตัวตน (ตัดจำหน่ายแทนลงค่าใช้จ่ายทันที)
        </label>
        {form.treatAsIntangible && (
          <ExpenseReceiptField
            label="อายุการใช้งาน (เดือน)"
            value={form.intangibleUsefulLifeMonths}
            onChange={(intangibleUsefulLifeMonths) =>
              setForm((v) => ({ ...v, intangibleUsefulLifeMonths }))
            }
            placeholder="36"
          />
        )}
        <label className="flex items-center gap-2 text-[12.5px] text-text-soft md:col-span-2">
          <input
            type="checkbox"
            checked={form.treatAsPrepaid}
            onChange={(e) =>
              setForm((v) => ({
                ...v,
                treatAsPrepaid: e.target.checked,
                treatAsIntangible: e.target.checked ? false : v.treatAsIntangible,
              }))
            }
          />
          ค่าใช้จ่ายจ่ายล่วงหน้า — ทยอยตัดรายเดือนตามช่วงบริการ (prepaid)
        </label>
        <ExpenseReceiptField
          type="date"
          label="ช่วงบริการ — เริ่ม"
          value={form.serviceStart}
          onChange={(serviceStart) => setForm((v) => ({ ...v, serviceStart }))}
        />
        <ExpenseReceiptField
          type="date"
          label="ช่วงบริการ — สิ้นสุด"
          value={form.serviceEnd}
          onChange={(serviceEnd) => setForm((v) => ({ ...v, serviceEnd }))}
        />
        {form.treatAsPrepaid && (
          <div className="md:col-span-2 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-[12px] text-text-soft">
            {form.serviceStart && form.serviceEnd
              ? 'จะลงเป็นค่าใช้จ่ายจ่ายล่วงหน้า (สินทรัพย์) แล้วทยอยตัดเข้าค่าใช้จ่ายรายเดือนตามช่วงบริการ — กดปุ่ม “ตัด prepaid” เพื่อลงบัญชีแต่ละงวด'
              : 'ระบุช่วงบริการ (เริ่ม-สิ้นสุด) เพื่อให้ระบบสร้างตารางตัดรายเดือน'}
          </div>
        )}
      </div>
    </div>
  );
}