'use client';

import type { Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import { computeThb, type ExpenseForm } from './expense-receipts.form';
import { ExpenseReceiptField } from './ExpenseReceiptField';

export function ForeignExpenseSection({
  form,
  setForm,
}: {
  form: ExpenseForm;
  setForm: Dispatch<SetStateAction<ExpenseForm>>;
}) {
  const thb = computeThb(form.foreignSubtotal, form.fxRate);
  const isService = form.expenseNature === 'SERVICE';
  const rate = form.reverseChargeVatRate || '7';
  const pp36 =
    isService && form.reverseChargeVat && thb
      ? ((Number(thb) * Number(rate)) / 100).toFixed(2)
      : '';

  const whtRate = Number(form.foreignWhtRate || '0') || 0;
  const whtActive = !!form.foreignWhtType && whtRate > 0 && !!thb;
  const whtAmount = whtActive
    ? form.foreignWhtBorneBy === 'GROSSED_UP'
      ? Number(thb) / (1 - whtRate / 100) - Number(thb)
      : (Number(thb) * whtRate) / 100
    : 0;

  async function suggestRate() {
    try {
      const params = new URLSearchParams();
      if (form.dtaCountry) params.set('country', form.dtaCountry);
      params.set('incomeType', form.foreignWhtType || 'OTHER');
      const res = await api<{ rate: string } | null>(
        `/expense-receipts/foreign-wht-rate?${params.toString()}`,
      );
      if (res && res.rate) setForm((v) => ({ ...v, foreignWhtRate: res.rate }));
    } catch {
      /* suggestion only */
    }
  }

  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
        <input
          type="checkbox"
          checked={form.isForeign}
          onChange={(e) => setForm((v) => ({ ...v, isForeign: e.target.checked }))}
        />
        รายจ่ายต่างประเทศ (ต่างสกุลเงิน / ภ.พ.36)
      </label>

      {form.isForeign && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label>
            <span className="mb-1 block text-[12.5px] text-text-soft">ประเภท</span>
            <select
              value={form.expenseNature}
              onChange={(e) =>
                setForm((v) => ({ ...v, expenseNature: e.target.value as '' | 'GOODS' | 'SERVICE' }))
              }
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
            >
              <option value="">— เลือก —</option>
              <option value="SERVICE">บริการ / ซอฟต์แวร์ (ภ.พ.36)</option>
              <option value="GOODS">สินค้า (VAT ที่ศุลกากร)</option>
            </select>
          </label>
          <ExpenseReceiptField
            label="สกุลเงิน (เช่น USD)"
            value={form.currency}
            onChange={(currency) => setForm((v) => ({ ...v, currency }))}
            placeholder="USD"
          />
          <ExpenseReceiptField
            label="อัตราแลกเปลี่ยน (บาท/หน่วย)"
            value={form.fxRate}
            onChange={(fxRate) => setForm((v) => ({ ...v, fxRate }))}
            placeholder="36.50"
          />
          <ExpenseReceiptField
            label={`ยอดสกุลต่างประเทศ${form.currency ? ` (${form.currency})` : ''}`}
            value={form.foreignSubtotal}
            onChange={(foreignSubtotal) => setForm((v) => ({ ...v, foreignSubtotal }))}
            placeholder="106.65"
          />

          <div className="md:col-span-2 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-[12px] text-text-soft">
            ยอดบาทที่จะลงบัญชี ={' '}
            <span className="font-mono font-medium text-text">{thb || '—'}</span> บาท — VAT
            ในใบ = 0 (ผู้ขายต่างประเทศไม่เก็บ VAT ไทย)
          </div>

          {form.expenseNature === 'GOODS' && (
            <div className="md:col-span-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn">
              สินค้านำเข้า: VAT 7% เกิดที่ศุลกากร ใช้ใบขนสินค้า/ใบเสร็จกรมศุลกากรเป็นภาษีซื้อแยก —
              ระบบไม่ตั้ง ภ.พ.36 ให้
            </div>
          )}

          {isService && (
            <>
              <label className="flex items-center gap-2 text-[12.5px] text-text-soft md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.usedInThailand}
                  onChange={(e) => setForm((v) => ({ ...v, usedInThailand: e.target.checked }))}
                />
                บริการนี้ใช้ในประเทศไทย (เข้าเงื่อนไข ภ.พ.36)
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-text-soft">
                <input
                  type="checkbox"
                  checked={form.reverseChargeVat}
                  onChange={(e) => setForm((v) => ({ ...v, reverseChargeVat: e.target.checked }))}
                />
                ต้องนำส่ง VAT แทน (ภ.พ.36)
              </label>
              <ExpenseReceiptField
                label="อัตรา VAT ภ.พ.36 (%)"
                value={form.reverseChargeVatRate}
                onChange={(reverseChargeVatRate) => setForm((v) => ({ ...v, reverseChargeVatRate }))}
                placeholder="7"
              />
              {pp36 && (
                <div className="md:col-span-2 rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-[12px] text-ok">
                  ภ.พ.36 ที่ต้องนำส่ง ≈ <span className="font-mono font-medium">{pp36}</span> บาท —
                  ระบบจะตั้งยอดให้หลังลงรายจ่าย แล้วเครดิตภาษีซื้อเดือนถัดไป
                </div>
              )}
              <ExpenseReceiptField
                label="ประเทศคู่สัญญา (DTA, เช่น US)"
                value={form.dtaCountry}
                onChange={(dtaCountry) => setForm((v) => ({ ...v, dtaCountry }))}
                placeholder="US"
              />
            </>
          )}

          <div className="md:col-span-2 border-t border-border pt-3">
            <div className="mb-2 text-[12.5px] font-medium text-text-soft">
              หัก ณ ที่จ่าย (ภ.ง.ด.54)
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-[12.5px] text-text-soft">ประเภทเงินได้</span>
                <select
                  value={form.foreignWhtType}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      foreignWhtType: e.target.value as '' | 'ROYALTY' | 'SERVICE' | 'OTHER',
                    }))
                  }
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                >
                  <option value="">— ไม่หัก ณ ที่จ่าย —</option>
                  <option value="ROYALTY">ค่าสิทธิ 40(3) (license/ซอฟต์แวร์)</option>
                  <option value="SERVICE">ค่าบริการ/กำไรธุรกิจ</option>
                  <option value="OTHER">อื่น ๆ</option>
                </select>
              </label>
              {form.foreignWhtType && (
                <label>
                  <span className="mb-1 block text-[12.5px] text-text-soft">ผู้รับภาระภาษี</span>
                  <select
                    value={form.foreignWhtBorneBy}
                    onChange={(e) =>
                      setForm((v) => ({
                        ...v,
                        foreignWhtBorneBy: e.target.value as
                          | ''
                          | 'WITHHELD'
                          | 'RECOVERABLE'
                          | 'GROSSED_UP',
                      }))
                    }
                    className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                  >
                    <option value="">— เลือก —</option>
                    <option value="WITHHELD">หักจากผู้ขาย</option>
                    <option value="RECOVERABLE">จ่ายเต็ม เรียกคืนภายหลัง</option>
                    <option value="GROSSED_UP">กิจการรับภาระเอง (gross-up)</option>
                  </select>
                </label>
              )}
              {form.foreignWhtType && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <ExpenseReceiptField
                      label="อัตรา (%)"
                      value={form.foreignWhtRate}
                      onChange={(foreignWhtRate) => setForm((v) => ({ ...v, foreignWhtRate }))}
                      placeholder="5"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={suggestRate}
                    className="mb-[1px] rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-text-soft hover:bg-surface-3"
                  >
                    ดึงอัตราแนะนำ
                  </button>
                </div>
              )}
              {whtAmount > 0 && (
                <div className="md:col-span-2 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-[12px] text-text-soft">
                  ภ.ง.ด.54 ประมาณ{' '}
                  <span className="font-mono font-medium text-text">{whtAmount.toFixed(2)}</span> บาท
                  {form.foreignWhtBorneBy === 'WITHHELD'
                    ? ' — กรอกยอดนี้ในช่อง “หัก ณ ที่จ่าย” ด้วย เพื่อหักจากยอดจ่ายผู้ขาย'
                    : form.foreignWhtBorneBy === 'GROSSED_UP'
                      ? ' (gross-up — เป็นค่าใช้จ่ายเพิ่มของกิจการ)'
                      : form.foreignWhtBorneBy === 'RECOVERABLE'
                        ? ' (จ่ายเต็มก่อน ตั้งเป็นลูกหนี้รอเรียกคืน)'
                        : ''}
                  {' — นักบัญชีต้องยืนยันประเภท/อัตราตามอนุสัญญา'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}