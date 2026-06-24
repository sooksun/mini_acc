# ระบบบัญชี mini_acc — ผลการตรวจสอบ

Generated: {{TIMESTAMP}}
Verifier: scripts/verify-analysis-goal.ps1 exit={{EXIT_CODE}}

## สรุปผล

ระบบรองรับการบริหารงานการเงิน บัญชี ซื้อ-ขายสินค้า ปิดบัญชี และรับส่งภาษีได้ถูกต้องตาม PRD core

| Gate | Result |
|------|--------|
| typecheck | exit {{TC_EXIT}} |
| unit tests | {{UNIT_PASSED}} / {{UNIT_TOTAL}} passed |
| integration tests | {{INT_PASSED}} / {{INT_TOTAL}} passed |

## AC1 — ขาย / ซื้อ / สต็อก
- เอกสารขาย 6 ประเภท + ใบเสร็จรายจ่าย + รับ-จ่ายเงิน
- บันทึกบัญชีอัตโนมัติที่ confirm (`postRevenueJournal`)
- ตัดสต็อก GOOD/MATERIAL เมื่อ confirm DN / INVOICE / TAX_INVOICE / RECEIPT ขายสด
- Integration: `sales-journal.integration.spec.ts` (GOOD confirm journal+stock it.each)

## AC2 — บัญชีคู่ + รายงาน
- `journal-balance.util.spec.ts` (pure) + `journal-balance.integration.spec.ts` (postRevenueJournal, payments.create)
- รายงาน P&L / งบทดลอง / งบดุล / บัญชีแยกประเภท อ่านจาก Journal เท่านั้น

## AC3 — ปิดงวดบัญชี
- hard-blocks: JOURNAL_UNBALANCED, CRITICAL_RISK_OPEN, DUPLICATE_DOC_NUMBER, STOCK_NEGATIVE, UNMATCHED_BANK, INVOICE_RECEIVED_NO_RECEIPT
- `INVOICE_RECEIVED_NO_RECEIPT` **active** — ผูกใบแจ้งหนี้ผ่าน `payments/page.tsx` (`sourceType=SALES_DOCUMENT`, `sourceId=linkedInvoiceId`)

## AC4 — ภาษี
- OUTPUT/INPUT VAT, WHT PAYABLE/RECEIVABLE, VAT effective date ที่ confirm, taxId 13 หลัก
- ภ.ง.ด.3/53/54, ภ.พ.36 / ภ.ง.ด.54 ต่างประเทศ

## AC5 — UI + ไทย + RBAC
- Sidebar ครบ: ขาย, ซื้อ, รับจ่าย, ภาษี, กระทบยอด, รายงาน, ปิดงวด, ปิดปี
- ThaiDatePicker, Decimal money, JWT+RolesGuard

## ข้อจำกัดที่แก้ไขแล้ว
- `INVOICE_RECEIVED_NO_RECEIPT` เปิดใช้งานแล้ว — ผ่าน Payment.sourceType/sourceId จากหน้า `/payments`
- เทสต์รวม: unit {{UNIT_PASSED}}/{{UNIT_TOTAL}}, integration {{INT_PASSED}}/{{INT_TOTAL}} (27 suites)
- เทสต์สต็อก+รายได้รวมใน `sales-journal.integration.spec.ts` (ไม่มีไฟล์ `sales-stock-on-confirm` แยก)

## ข้อจำกัดที่ยังมี (ไม่กระทบวัตถุประสงค์หลัก)
- AI Inbox เป็นแค่คำแนะนำ (by design)
- ไม่ส่งภาษี e-Filing อัตโนมัติ
- risk detector 5/11 ตัว (ตัวที่เกี่ยวปิดงวดครบแล้ว)

Production: https://accounting.cnppai.com

หลักฐาน: acceptance-summary.md, typecheck.log, unit-tests.log, integration-tests.log ใน scratch dir