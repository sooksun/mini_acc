# PRD v2.0 — HJ Account AI
## ระบบบัญชี หจก. ขนาดเล็กแบบ AI-First พร้อมเอกสารใบเสนอราคา / ใบส่งของ / ใบเสร็จรับเงิน / ใบกำกับภาษี

**เวอร์ชัน:** 2.0  
**สถานะ:** Ready for Design Handoff → Frontend Handoff → Backend Handoff  
**กลุ่มเป้าหมาย:** หจก. ขนาดเล็กที่ทำธุรกิจซื้อมาขายไป รับจ้างทำของ ซ่อมแซม จัดสร้าง และผลิตซอฟต์แวร์  
**Frontend:** Next.js + TypeScript + Tailwind CSS  
**Backend:** NestJS + Prisma + MariaDB  
**Locale:** ภาษาไทยเป็นหลัก, วันที่แสดงเป็นพุทธศักราช, Timezone: Asia/Bangkok  
**Document Template Master:** Invoice-PP-003-2569.pdf  

---

## 1. Executive Summary

HJ Account AI คือระบบบัญชีและเอกสารสำหรับ หจก. ขนาดเล็กที่ต้องการบันทึกรายรับ รายจ่าย เอกสารขาย เอกสารซื้อ โครงการ สินค้า ภาษี และชุดส่งสำนักงานบัญชี โดยมี AI ช่วยลดงานกรอกมือ ตรวจเอกสาร แนะนำหมวดบัญชี เตือนความเสี่ยง และช่วยปิดงวดรายเดือน

ระบบนี้ไม่ได้ออกแบบมาแทนนักบัญชีเต็มรูปแบบ แต่ทำหน้าที่เป็น “ระบบเอกสารและข้อมูลบัญชีกลาง” ที่ทำให้เจ้าของกิจการและสำนักงานบัญชีทำงานร่วมกันได้ง่ายขึ้น

หลักการสำคัญ:

```text
AI ช่วยอ่าน
AI ช่วยแนะนำ
AI ช่วยตรวจ
ผู้ใช้ยืนยัน
นักบัญชีตรวจ
ระบบล็อกข้อมูลและเก็บประวัติ
```

---

## 2. Problem Statement

หจก. ขนาดเล็กมักมีปัญหาหลักดังนี้

1. รายรับรายจ่ายกระจัดกระจายอยู่ในสมุด, LINE, Excel, สลิป, รูปถ่าย และไฟล์ PDF
2. เอกสารขาย เช่น ใบเสนอราคา ใบส่งของ ใบเสร็จรับเงิน และใบกำกับภาษี ไม่เป็นระบบเดียวกัน
3. เจ้าของกิจการไม่แน่ใจว่ารายการใดเป็นค่าใช้จ่าย ต้นทุนโครงการ สินค้า หรือทรัพย์สิน
4. การแยก VAT / หัก ณ ที่จ่าย / ลูกหนี้ / เจ้าหนี้ ยังพึ่งพาความจำและสำนักงานบัญชีมากเกินไป
5. ปิดงวดรายเดือนยาก เพราะเอกสารขาด รายการธนาคารไม่ตรง และไม่รู้ว่าข้อมูลใดเสี่ยง
6. นักบัญชีได้รับข้อมูลช้า ไม่ครบ หรือไม่เรียงตามระบบ
7. ธุรกิจหลายประเภท เช่น ซื้อมาขายไป + งานซ่อม + งานซอฟต์แวร์ ทำให้ต้นทุนและกำไรจริงมองยาก

---

## 3. Product Vision

สร้างระบบบัญชีขนาดเล็กที่ “ใช้งานง่ายเหมือนสมุดรับจ่าย แต่มีวินัยแบบระบบบัญชี” และใช้ AI ช่วยงานซ้ำ งานอ่านเอกสาร งานตรวจความเสี่ยง และงานสรุปข้อมูล

เป้าหมายสุดท้าย:

```text
เอกสารครบ
ตัวเลขย้อนกลับได้
ภาษีไม่หลุดง่าย
ปิดงวดได้
ส่งสำนักงานบัญชีได้
เจ้าของรู้กำไรจริง
```

---

## 4. Scope

### 4.1 In Scope

ระบบ v2.0 ต้องรองรับ

1. ตั้งค่าข้อมูล หจก.
2. ผู้ใช้และสิทธิ์
3. ลูกค้า / ผู้ขาย / คู่ค้า
4. AI Document Inbox
5. ใบเสนอราคา
6. ใบส่งของ
7. ใบแจ้งหนี้
8. ใบเสร็จรับเงิน
9. ใบเสร็จรับเงิน/ใบกำกับภาษี
10. รายจ่าย / เอกสารซื้อ
11. รับเงิน / จ่ายเงิน
12. โครงการและต้นทุนงาน
13. สินค้า / วัสดุ / คลังเบื้องต้น
14. ทรัพย์สินถาวรเบื้องต้น
15. VAT / WHT Dashboard
16. Journal Entry อัตโนมัติแบบย่อ
17. Bank Statement Import และ Matching เบื้องต้น
18. AI Risk Center
19. Month-End Closing
20. Accountant Pack Export
21. PDF Template ตามไฟล์ต้นแบบ
22. วันที่ไทย / พ.ศ. / Timezone Asia/Bangkok

### 4.2 Out of Scope สำหรับ MVP

ยังไม่ทำใน MVP แรก

1. ยื่นภาษีอัตโนมัติแทนผู้ใช้
2. เชื่อมต่อ API ธนาคารจริง
3. e-Tax Invoice เต็มรูปแบบตามมาตรฐาน production
4. Payroll เต็มระบบ
5. POS เต็มระบบ
6. Multi-branch accounting complex
7. ระบบบัญชีแยกประเภทเต็มรูปแบบระดับ ERP
8. การคำนวณค่าเสื่อมเพื่อยื่นภาษีโดยอัตโนมัติ
9. การตัดสินกฎภาษีซับซ้อนโดย AI โดยไม่มีนักบัญชีตรวจ

---

## 5. Success Metrics

ระบบถือว่าสำเร็จเมื่อ

1. เจ้าของกิจการสามารถออกใบเสนอราคา ใบส่งของ ใบเสร็จรับเงิน และใบกำกับภาษีได้จากระบบเดียว
2. รายจ่ายอย่างน้อย 80% สามารถแนบเอกสารและให้ AI อ่านข้อมูลตั้งต้นได้
3. ปิดงวดรายเดือนได้โดยมี Checklist และ Risk Center
4. Export Accountant Pack ได้ครบ
5. ทุกตัวเลขในรายงานสามารถย้อนกลับไปหาเอกสารต้นทางได้
6. วันที่ที่แสดงต่อผู้ใช้ทั้งหมดเป็นภาษาไทยและพุทธศักราช
7. AI ไม่สามารถยืนยันรายการ ลบเอกสาร หรือปิดงวดเองได้
8. ระบบรองรับงานหลายประเภทของ หจก.: ขายสินค้า, บริการ, ซ่อม, จัดสร้าง, ซอฟต์แวร์

---

## 6. Users & Roles

### 6.1 OWNER

เจ้าของ หจก.

สิทธิ์:
- ดูข้อมูลทั้งหมด
- อนุมัติรายการสำคัญ
- เห็นรายงานกำไร / เงินสด / ลูกหนี้ / เจ้าหนี้
- ปิดงวดร่วมกับ Accountant
- Export Accountant Pack
- ตั้งค่าบริษัท เอกสาร เลขเอกสาร และผู้ใช้

### 6.2 ADMIN

เจ้าหน้าที่ธุรการ / ผู้ช่วย

สิทธิ์:
- สร้างเอกสารขาย
- บันทึกรายจ่าย
- อัปโหลดเอกสาร
- ตรวจข้อมูลที่ AI อ่าน
- จัดการลูกค้าและผู้ขาย
- บันทึกรับเงินและจ่ายเงิน

### 6.3 ACCOUNTANT

นักบัญชี / สำนักงานบัญชี

สิทธิ์:
- ตรวจรายการบัญชี
- ตรวจ VAT / WHT
- ตรวจ Journal
- ตรวจปิดงวด
- Export รายงานบัญชี
- ล็อกงวด

### 6.4 VIEWER

ผู้ดูรายงาน

สิทธิ์:
- ดู Dashboard และรายงานตามที่ได้รับอนุญาต
- ไม่สามารถแก้ไขข้อมูลได้

### 6.5 AI_AGENT

AI ภายในระบบ

สิทธิ์:
- อ่านเอกสาร
- Extract ข้อมูล
- แนะนำหมวดบัญชี
- ตรวจความเสี่ยง
- สรุปรายงาน
- ห้ามยืนยันข้อมูล
- ห้ามลบข้อมูล
- ห้ามปิดงวด
- ห้าม Void เอกสาร

---

## 7. Core Business Rules

### 7.1 Human-in-the-loop

```text
AI สร้างข้อเสนอแนะได้
AI เติมข้อมูลร่างได้
แต่ผู้ใช้หรือ Accountant ต้องกดยืนยัน
```

### 7.2 Source of Truth

ทุกตัวเลขต้องย้อนกลับได้

```text
Report → Journal → Source Document → Attachment → Audit Log
```

### 7.3 Document Immutability

```text
DRAFT: แก้ไข/ลบได้
CONFIRMED: แก้ไขได้โดยมี Audit Log
ACCOUNTED: แก้ยอดเงินโดยตรงไม่ได้ ต้องทำรายการปรับปรุง
LOCKED: แก้ไม่ได้ ต้องทำเอกสารปรับปรุงหรือ Void
VOIDED: ไม่ใช้คำนวณรายงาน แต่ต้องเก็บไว้
```

### 7.4 Tax Safety

ระบบต้องใช้ Tax Rule แบบตั้งค่าได้ ไม่ hardcode กฎถาวร และต้องมีสถานะ “รอนักบัญชีตรวจ” สำหรับรายการภาษีที่ไม่มั่นใจ

### 7.5 PDF Evidence

เมื่อ Generate PDF จริงแล้ว ระบบต้องเก็บไฟล์ PDF, วันที่สร้าง, ผู้สร้าง และ version ของข้อมูลไว้เป็นหลักฐาน

---

## 8. Document Status Model

สถานะกลางสำหรับเอกสาร

```text
DRAFT
AI_EXTRACTED
PENDING_REVIEW
USER_CONFIRMED
ACCOUNTED
PENDING_ACCOUNTANT
ACCOUNTANT_APPROVED
LOCKED
VOIDED
```

### State Transition

```text
DRAFT
→ AI_EXTRACTED
→ PENDING_REVIEW
→ USER_CONFIRMED
→ ACCOUNTED
→ PENDING_ACCOUNTANT
→ ACCOUNTANT_APPROVED
→ LOCKED
```

การ Void:

```text
USER_CONFIRMED / ACCOUNTED / LOCKED
→ VOIDED
```

เงื่อนไข:
- VOID ต้องระบุเหตุผล
- LOCKED แล้วห้ามแก้ไขข้อมูลเดิม
- VOIDED ต้องคงเลขเอกสาร
- การเปลี่ยนสถานะต้องบันทึก Audit Log

---

## 9. Date & Locale Requirement

### 9.1 Storage

ฐานข้อมูลเก็บวันที่เป็น DateTime มาตรฐาน

```text
Database: UTC / ISO DateTime
API: ISO string
Frontend Display: Thai Buddhist Calendar
Timezone: Asia/Bangkok
```

### 9.2 Display

ตัวอย่าง

```text
Database: 2026-05-10T03:30:00.000Z
Frontend: 10 พฤษภาคม 2569
Short format: 10/5/69
```

### 9.3 จุดที่ต้องแสดงวันที่ไทย

- วันที่เอกสาร
- วันที่รับเงิน
- วันที่จ่ายเงิน
- วันที่อัปโหลดเอกสาร
- วันที่ครบกำหนดชำระ
- วันที่สร้าง PDF
- วันที่ปิดงวด
- วันที่แก้ไขล่าสุด
- วันที่ในรายงาน
- วันที่ใน Audit Log
- วันที่ใน PDF

### 9.4 Utility

```ts
export function formatThaiDate(date: string | Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(date));
}

export function formatThaiDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(date));
}

export function formatThaiDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(date));
}
```

---

## 10. Document Template Requirement

ใช้ไฟล์ Invoice-PP-003-2569.pdf เป็น Visual Master Template โดยแบ่งตามหน้า:

```text
หน้า 1 = ใบเสนอราคา
หน้า 2 = ใบส่งของ
หน้า 3 = ใบเสร็จรับเงิน
```

ระบบต้องรองรับเอกสาร

```text
QUOTATION
DELIVERY_NOTE
INVOICE
RECEIPT
TAX_INVOICE
RECEIPT_TAX_INVOICE
```

### 10.1 Layout หลัก

ทุกเอกสารต้องมี

1. โลโก้
2. ชื่อกิจการภาษาไทย
3. ชื่อกิจการภาษาอังกฤษ
4. ที่อยู่สำนักงานใหญ่
5. เบอร์โทรศัพท์
6. เลขประจำตัวผู้เสียภาษี
7. ป้าย “สำหรับลูกค้า”
8. กรอบชื่อเอกสาร
9. ข้อมูลลูกค้า
10. เลขที่เอกสาร
11. วันที่เอกสาร
12. ตารางรายการ
13. ตัวอักษรยอดเงิน
14. ตารางสรุปยอด
15. หมายเหตุ
16. ช่องลงนาม 3 ช่อง

### 10.2 Document Title Logic

```text
QUOTATION → ใบเสนอราคา
DELIVERY_NOTE → ใบส่งของ
INVOICE → ใบแจ้งหนี้
RECEIPT → ใบเสร็จรับเงิน
TAX_INVOICE → ใบกำกับภาษี
RECEIPT_TAX_INVOICE → ใบเสร็จรับเงิน/ใบกำกับภาษี
```

### 10.3 Theme Colors

```ts
export const documentTheme = {
  QUOTATION: {
    title: "ใบเสนอราคา",
    primaryColor: "#8B2E2E",
  },
  DELIVERY_NOTE: {
    title: "ใบส่งของ",
    primaryColor: "#D96B00",
  },
  INVOICE: {
    title: "ใบแจ้งหนี้",
    primaryColor: "#4B5563",
  },
  RECEIPT: {
    title: "ใบเสร็จรับเงิน",
    primaryColor: "#2F7F89",
  },
  TAX_INVOICE: {
    title: "ใบกำกับภาษี",
    primaryColor: "#1F5F8B",
  },
  RECEIPT_TAX_INVOICE: {
    title: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    primaryColor: "#1F5F8B",
  },
};
```

---

## 11. Document Numbering

ระบบต้องรองรับการตั้งค่าเลขเอกสาร

### 11.1 Recommended Prefix

```text
QT = ใบเสนอราคา
DN = ใบส่งของ
INV = ใบแจ้งหนี้
RC = ใบเสร็จรับเงิน
TAX = ใบกำกับภาษี
RT = ใบเสร็จรับเงิน/ใบกำกับภาษี
```

### 11.2 Format

```text
{PREFIX}-{BUDDHIST_YEAR}-{RUNNING}
```

ตัวอย่าง:

```text
QT-2569-0001
DN-2569-0001
INV-2569-0001
RT-2569-0001
```

### 11.3 Rule

- DRAFT ใช้เลข Preview ชั่วคราวได้
- CONFIRM แล้วจึง Lock เลขจริง
- VOID ต้องคงเลขไว้
- เลขเอกสารต้องไม่ซ้ำ
- เลขเอกสารแยกตามประเภทและปีได้
- Running number reset ได้แบบ YEARLY หรือ NEVER

---

## 12. PDF Calculation Logic

### 12.1 Field

```text
subtotal = sum(items.quantity * items.unitPrice)
vatAmount = subtotal * vatRate
totalAfterVat = subtotal + vatAmount
withholdingTax = whtBase * whtRate
grandTotal = totalAfterVat
netReceived = grandTotal - withholdingTax
```

### 12.2 Display Summary

ตารางสรุปยอดควรแยก VAT และ WHT ให้ชัดเจนกว่าต้นแบบ

```text
รวมเงิน / TOTAL AMOUNT
ภาษีมูลค่าเพิ่ม / VAT
รวมเงินรวมภาษี / TOTAL AFTER VAT
หักภาษี ณ ที่จ่าย / WITHHOLDING TAX
ยอดเงินสุทธิ / NET RECEIVED
```

### 12.3 Amount in Words

ระบบต้องแปลงจำนวนเงินเป็นตัวอักษรไทย

```text
100,000.00 → หนึ่งแสนบาทถ้วน
93,457.94 → เก้าหมื่นสามพันสี่ร้อยห้าสิบเจ็ดบาทเก้าสิบสี่สตางค์
```

---

## 13. Signature Logic

### 13.1 Quotation

```text
ผู้สั่งสินค้า
วันที่

ผู้เสนอราคา
วันที่

ในนาม [ชื่อกิจการ]
ผู้มีอำนาจลงนาม
```

### 13.2 Delivery Note

```text
ได้รับสินค้าตามรายการข้างบนไว้เรียบร้อยแล้ว

ผู้รับสินค้า
วันที่

ผู้ส่งสินค้า
วันที่

ในนาม [ชื่อกิจการ]
ผู้มีอำนาจลงนาม
```

### 13.3 Receipt / Tax Invoice

```text
ผู้จ่ายเงิน
วันที่

ผู้รับเงิน
วันที่

ในนาม [ชื่อกิจการ]
ผู้มีอำนาจลงนาม
```

---

## 14. Core Modules

ระบบแบ่งเป็น 18 Modules

```text
1. Auth
2. Company Settings
3. Users & Roles
4. Partners: Customers / Vendors
5. Document Upload & Attachments
6. AI Document Inbox
7. Sales Documents
8. Purchase / Expense
9. Payments
10. Projects
11. Inventory
12. Fixed Assets
13. VAT / WHT
14. Journal
15. Bank Reconciliation
16. AI Risk Center
17. Month-End Closing
18. Accountant Pack
```

---

## 15. Main Workflow

### 15.1 Sales Workflow

```text
สร้างลูกค้า
→ สร้างใบเสนอราคา
→ ลูกค้ายอมรับ
→ แปลงเป็นใบแจ้งหนี้
→ รับเงิน
→ บันทึก WHT ถ้ามี
→ ออกใบเสร็จรับเงิน / ใบกำกับภาษี
→ สร้าง Journal
→ รวมในรายงาน
```

### 15.2 Delivery Workflow

```text
มี Invoice หรือ Sales Order
→ สร้างใบส่งของ
→ ระบุรายการที่จะส่ง
→ ผู้รับสินค้าเซ็นรับ
→ ระบบเปลี่ยนสถานะส่งมอบ
→ ถ้าเป็นสินค้าให้ตัด Stock
→ เก็บ PDF เป็นหลักฐาน
```

### 15.3 Expense Workflow

```text
อัปโหลดใบเสร็จ / ใบแจ้งหนี้
→ AI อ่านเอกสาร
→ ผู้ใช้ตรวจข้อมูล
→ เลือกผู้ขาย
→ เลือกหมวดรายจ่าย
→ เลือกโครงการ / สินค้า / ทรัพย์สิน ถ้าเกี่ยวข้อง
→ ตรวจ VAT / WHT
→ บันทึก
→ สร้าง Journal
```

### 15.4 Month-End Workflow

```text
เลือกงวด
→ ระบบตรวจเอกสาร
→ AI ตรวจความเสี่ยง
→ ตรวจ VAT / WHT
→ ตรวจ Bank Matching
→ ตรวจ Journal Dr = Cr
→ แก้ Critical Risk
→ Accountant ตรวจ
→ Owner / Accountant ปิดงวด
→ Lock เอกสาร
→ Export Accountant Pack
```

---

## 16. AI Use Cases

### 16.1 AI Document Reader

อ่านเอกสาร เช่น

```text
ใบเสร็จ
ใบกำกับภาษี
ใบแจ้งหนี้
ใบเสนอราคา
ใบส่งของ
สลิปโอนเงิน
Statement
หนังสือรับรองหัก ณ ที่จ่าย
สัญญา
```

AI Extract ข้อมูล

```text
documentType
documentDate
documentNo
sellerName
buyerName
taxId
branchNo
subtotal
vatAmount
totalAmount
withholdingTaxAmount
paymentMethod
bankReference
lineItems
```

### 16.2 AI Account Classifier

ตัวอย่าง

```text
ซื้อ Router เพื่อขายต่อ → สินค้าคงเหลือ
ซื้อ Router ใช้ในโครงการ → ต้นทุนโครงการ
ค่า Server → ค่า Software / Hosting
จ้างฟรีแลนซ์ทำ UI → ค่าจ้างทำของ / ต้นทุนโครงการ
ซื้อ Notebook ใช้ในกิจการ → ทรัพย์สินถาวร
```

### 16.3 AI Tax Risk

AI เตือน แต่ไม่ตัดสินแทนนักบัญชี

```text
รายการนี้อาจเกี่ยวข้องกับ WHT
ใบกำกับภาษีนี้เลขผู้เสียภาษีไม่ชัด
รายรับสะสมใกล้เกณฑ์ VAT
เงินเข้าแต่ยังไม่มีเอกสารขาย
รายจ่ายไม่มีเอกสารแนบ
```

### 16.4 AI Bank Matcher

```text
Statement transaction
→ Match กับ Invoice / Payment / Expense
→ ให้ Confidence Score
→ ผู้ใช้ยืนยัน
```

### 16.5 AI Monthly Summary

```text
เดือนนี้รายรับเท่าไร
รายจ่ายเท่าไร
กำไรเบื้องต้นเท่าไร
มี Risk กี่รายการ
มีเอกสารรอนักบัญชีตรวจกี่รายการ
```

---

## 17. Risk Center

### 17.1 Risk Types

```text
MISSING_DOCUMENT
DUPLICATE_DOCUMENT
VAT_RISK
WHT_RISK
UNMATCHED_BANK
LOW_PROFIT_PROJECT
STOCK_NEGATIVE
EXPENSE_WITHOUT_APPROVAL
EDIT_AFTER_CONFIRM
TAX_ID_MISSING
PDF_GENERATION_ERROR
```

### 17.2 Risk Level

```text
LOW
MEDIUM
HIGH
CRITICAL
```

### 17.3 Risk Status

```text
OPEN
IN_REVIEW
RESOLVED
ACCEPTED_RISK
DISMISSED
```

### 17.4 Hard Block ก่อนปิดงวด

ปิดงวดไม่ได้ถ้ามี

```text
Journal ไม่สมดุล
เอกสารขายเลขซ้ำ
Critical Tax Risk
Stock ติดลบ
รายการธนาคารสำคัญไม่จับคู่
Invoice รับเงินแล้วแต่ไม่มี Receipt
```

---

## 18. Accountant Pack

ระบบต้อง Export ชุดข้อมูลเป็น ZIP

```text
01_sales_register.xlsx
02_delivery_register.xlsx
03_purchase_register.xlsx
04_payment_register.xlsx
05_bank_reconciliation.xlsx
06_vat_report.xlsx
07_wht_report.xlsx
08_journal_entries.xlsx
09_inventory_report.xlsx
10_fixed_asset_register.xlsx
11_project_profit_report.xlsx
12_risk_summary.pdf
13_attachment_index.xlsx
attachments/
generated_pdfs/
```

AI ต้องสร้าง Summary ให้ Accountant

```text
สรุปเดือน
รายรับรวม
รายจ่ายรวม
กำไรเบื้องต้น
รายการ VAT
รายการ WHT
รายการเอกสารขาด
รายการรอตรวจ
รายการผิดปกติ
```

---

## 19. Data Model Summary

### 19.1 Core Entities

```text
Company
CompanySetting
User
Role
Partner
Document
Attachment
AiSuggestion
SalesDocument
SalesDocumentItem
PurchaseDocument
PurchaseDocumentItem
Payment
Project
Product
InventoryMovement
FixedAsset
VatRecord
WithholdingTaxRecord
JournalEntry
JournalEntryLine
AccountingPeriod
RiskItem
AuditLog
ExportBatch
DocumentTemplate
DocumentNumberingRule
GeneratedPdf
```

### 19.2 Important Enums

```text
DocumentType:
QUOTATION
DELIVERY_NOTE
INVOICE
RECEIPT
TAX_INVOICE
RECEIPT_TAX_INVOICE
PURCHASE
EXPENSE
WHT_CERTIFICATE
BANK_STATEMENT

DocumentStatus:
DRAFT
AI_EXTRACTED
PENDING_REVIEW
USER_CONFIRMED
ACCOUNTED
PENDING_ACCOUNTANT
ACCOUNTANT_APPROVED
LOCKED
VOIDED

RiskLevel:
LOW
MEDIUM
HIGH
CRITICAL

AiSuggestionStatus:
PENDING
ACCEPTED
REJECTED
OVERRIDDEN
```

---

## 20. API Specification Summary

### Auth

```text
POST /auth/login
POST /auth/logout
GET /auth/me
```

### Company

```text
GET /company
PATCH /company
GET /company/settings
PATCH /company/settings
```

### Partners

```text
GET /partners
POST /partners
GET /partners/:id
PATCH /partners/:id
```

### Documents

```text
POST /documents/upload
GET /documents
GET /documents/:id
PATCH /documents/:id/review
POST /documents/:id/confirm
POST /documents/:id/void
```

### PDF

```text
GET /document-templates
PATCH /document-templates/:id
GET /document-numbering-rules
PATCH /document-numbering-rules/:id
POST /documents/:id/preview-pdf
POST /documents/:id/generate-pdf
GET /documents/:id/download-pdf
```

### Sales

```text
GET /sales/quotations
POST /sales/quotations
POST /sales/quotations/:id/convert-to-invoice

GET /sales/invoices
POST /sales/invoices
POST /sales/invoices/:id/confirm

GET /sales/delivery-notes
POST /sales/delivery-notes

GET /sales/receipts
POST /sales/receipts
```

### Expenses

```text
GET /expenses
POST /expenses
GET /expenses/:id
POST /expenses/:id/confirm
```

### Payments

```text
GET /payments
POST /payments
POST /payments/:id/match
```

### Projects

```text
GET /projects
POST /projects
GET /projects/:id
GET /projects/:id/profit
```

### Inventory

```text
GET /products
POST /products
GET /inventory/movements
POST /inventory/movements
```

### Tax

```text
GET /tax/dashboard
GET /tax/vat-report
GET /tax/wht-report
GET /tax/risks
```

### Closing

```text
GET /closing/:period
POST /closing/:period/check
POST /closing/:period/close
```

### Accountant Pack

```text
POST /accountant-pack/export
GET /accountant-pack/:id/download
```

### Audit Log

```text
GET /audit-logs
```

---

## 21. Frontend Requirements

### 21.1 Stack

```text
Next.js
TypeScript
Tailwind CSS
App Router
Thai-first UI
Responsive Design
```

### 21.2 Pages

```text
/login
/dashboard
/ai-inbox
/documents/upload
/documents/[id]/review
/documents/[id]/pdf-preview
/customers
/vendors
/sales/quotations
/sales/invoices
/sales/delivery-notes
/sales/receipts
/expenses
/projects
/inventory
/tax
/risks
/closing
/accountant-pack
/settings/company
/settings/document-template
/settings/document-numbering
```

### 21.3 Components

```text
AppSidebar
AppTopbar
StatCard
StatusBadge
RiskBadge
ThaiDate
DataTable
DocumentUpload
AiConfidenceBadge
AiExtractedField
ReviewPanel
MoneyDisplay
EmptyState
ConfirmDialog
MonthEndChecklist
AccountantPackExportPanel
DocumentA4Page
CompanyHeader
DocumentTitleBox
CustomerInfoSection
DocumentMetaSection
DocumentItemsTable
AmountInWordsBox
AmountSummaryBox
DocumentNotes
SignatureSection
PdfPreviewToolbar
```

### 21.4 Utilities

```text
formatThaiDate
formatThaiDateShort
formatThaiDateTime
formatThaiCurrency
numberToThaiBahtText
getDocumentTheme
getSignatureLabelsByDocumentType
getStatusColor
getRiskColor
```

---

## 22. Backend Requirements

### 22.1 Stack

```text
NestJS
TypeScript
Prisma
MariaDB
REST API
JWT Authentication
Role-based Access Control
```

### 22.2 Modules

```text
AuthModule
UsersModule
CompaniesModule
PartnersModule
DocumentsModule
AttachmentsModule
AiInboxModule
SalesModule
ExpensesModule
PaymentsModule
ProjectsModule
InventoryModule
TaxModule
JournalModule
RisksModule
ClosingModule
AccountantPackModule
AuditLogModule
DocumentTemplatesModule
DocumentNumberingModule
PdfGenerationModule
```

### 22.3 Backend Business Rules

1. AI ห้าม Confirm เอกสารเอง
2. LOCKED ห้ามแก้ไข
3. VOIDED ห้ามใช้คำนวณรายงาน
4. Journal ต้อง Dr = Cr
5. ปิดงวดไม่ได้ถ้ามี Critical Risk
6. รายจ่ายที่เป็นต้นทุนโครงการต้องมี projectId
7. สินค้าออกต้องตรวจ stock
8. ทุกการแก้ไขเอกสารสำคัญต้องมี Audit Log
9. Void ต้องระบุ reason
10. Accountant Pack ต้องสร้างจากงวดที่ปิดแล้ว
11. ถ้า VAT status ไม่พร้อม ห้ามออก TAX_INVOICE
12. PDF จริงต้องเก็บเป็นหลักฐาน

---

## 23. PDF Rendering Requirement

### 23.1 Technical Recommendation

แนะนำใช้ HTML/CSS → PDF ด้วย Playwright หรือ Puppeteer เพราะควบคุมภาษาไทย ตาราง และ Layout A4 ได้ง่ายกว่าเขียนพิกัด PDF เอง

### 23.2 Requirements

```text
A4 portrait
Thai font embedded หรือใช้ระบบที่ render Thai ได้ถูกต้อง
รองรับสระและวรรณยุกต์ไทย
ตัดบรรทัดภาษาไทยได้
ตารางตรงกับต้นแบบมากที่สุด
รองรับเอกสารหลายหน้า
เก็บ PDF ที่ generate แล้ว
Preview ก่อน generate จริงได้
```

### 23.3 PDF Modes

```text
Preview Mode:
- ใช้สำหรับดูตัวอย่าง
- อาจมี watermark “DRAFT”
- ไม่ lock เลขเอกสารจริง

Generate Mode:
- สร้าง PDF จริง
- Lock เลขเอกสาร
- เก็บไฟล์
- บันทึก Audit Log
```

---

## 24. Security & Audit

### 24.1 Security

- JWT Auth
- Role-based Access Control
- File upload validation
- File size limit
- Allowed MIME types
- Server-side validation
- Sensitive action confirmation
- No direct public file path without authorization

### 24.2 Audit Log Events

```text
LOGIN
CREATE_DOCUMENT
UPDATE_DOCUMENT
CONFIRM_DOCUMENT
VOID_DOCUMENT
GENERATE_PDF
DOWNLOAD_PDF
CREATE_JOURNAL
UPDATE_PARTNER
CLOSE_PERIOD
REOPEN_PERIOD
EXPORT_ACCOUNTANT_PACK
AI_EXTRACT_DOCUMENT
AI_ACCEPT_SUGGESTION
AI_REJECT_SUGGESTION
```

---

## 25. Acceptance Criteria

MVP v2.0 ถือว่าสมบูรณ์เมื่อผ่านเกณฑ์ต่อไปนี้

1. ตั้งค่าข้อมูล หจก. ได้
2. จัดการผู้ใช้และสิทธิ์ได้
3. จัดการลูกค้าและผู้ขายได้
4. อัปโหลดเอกสารได้
5. AI Inbox รับข้อมูลเอกสารรอตรวจได้
6. ผู้ใช้ตรวจและยืนยันข้อมูลจาก AI ได้
7. ออกใบเสนอราคา PDF ได้ตามต้นแบบ
8. ออกใบส่งของ PDF ได้ตามต้นแบบ
9. ออกใบแจ้งหนี้ได้
10. ออกใบเสร็จรับเงิน PDF ได้ตามต้นแบบ
11. ออกใบเสร็จรับเงิน/ใบกำกับภาษีได้ตามสถานะ VAT
12. บันทึกรายจ่ายพร้อมเอกสารแนบได้
13. บันทึกรับเงินและจ่ายเงินได้
14. แยกต้นทุนโครงการได้
15. จัดการสินค้า/วัสดุเบื้องต้นได้
16. บันทึกทรัพย์สินถาวรได้
17. ตรวจ VAT/WHT เบื้องต้นได้
18. สร้าง Journal อัตโนมัติได้
19. มี Risk Center
20. มี Audit Log
21. ปิดงวดรายเดือนได้
22. Export Accountant Pack ได้
23. วันที่ทั้งหมดแสดงเป็นภาษาไทย/พ.ศ.
24. PDF ใช้วันที่ไทยและจำนวนเงินตัวอักษรไทย
25. AI ไม่มีสิทธิ์ทำ action สำคัญแทนมนุษย์

---

## 26. Development Roadmap

### Sprint 1 — Design Foundation

```text
Information Architecture
Design System
Core Layout
Dashboard Wireframe
PDF Template Wireframe
```

### Sprint 2 — Backend Foundation

```text
NestJS Setup
Prisma + MariaDB
Auth
User / Role
Company Settings
Audit Log
```

### Sprint 3 — Document & Partner

```text
Customer / Vendor
Document Upload
Attachment
AI Inbox Mock
Document Review
```

### Sprint 4 — Sales Documents & PDF

```text
Quotation
Invoice
Delivery Note
Receipt
Tax Invoice
PDF Preview
PDF Generation
Document Numbering
```

### Sprint 5 — Expenses & Payments

```text
Expense
Purchase Document
Payment In
Payment Out
Basic Journal
```

### Sprint 6 — Tax & Risk

```text
VAT Dashboard
WHT Records
Tax Risk
AI Risk Center
```

### Sprint 7 — Project & Inventory

```text
Project Costing
Product
Inventory Movement
Fixed Asset
```

### Sprint 8 — Closing & Accountant Pack

```text
Bank Matching
Month-End Closing
Accountant Pack Export
Final Acceptance Test
```

---

## 27. Handoff Prompt — Design First

ใช้ Prompt นี้ส่งต่อให้ Cursor Design / Course Design

```text
คุณคือ Senior UX/UI Product Designer

ให้ออกแบบระบบ HJ Account AI ซึ่งเป็นระบบบัญชี หจก. ขนาดเล็กแบบ AI-First สำหรับธุรกิจซื้อมาขายไป รับจ้างทำของ ซ่อมแซม จัดสร้าง และผลิตซอฟต์แวร์

ต้องใช้ไฟล์ Invoice-PP-003-2569.pdf เป็น Visual Master Template สำหรับเอกสาร:
1. ใบเสนอราคา
2. ใบส่งของ
3. ใบเสร็จรับเงิน
4. ใบเสร็จรับเงิน/ใบกำกับภาษี

Frontend จะใช้ Next.js + Tailwind CSS
UI เป็นภาษาไทย
วันที่ต้องแสดงเป็นพุทธศักราช เช่น 10 พฤษภาคม 2569

ให้ออกแบบ:
1. Information Architecture
2. User Flow
3. Wireframe รายหน้า
4. PDF Layout Guideline ขนาด A4
5. Component List
6. Design System
7. Dashboard
8. AI Inbox
9. Sales Documents
10. Expense
11. Project
12. Inventory
13. Tax Center
14. Risk Center
15. Month-End Closing
16. Accountant Pack
17. Settings: Company, Template, Numbering

สไตล์:
- Clean
- Modern Thai Business Dashboard
- Sidebar Navigation
- Card Layout
- ตารางอ่านง่าย
- Badge แสดงสถานะ
- Risk สี LOW/MEDIUM/HIGH/CRITICAL
- Mobile responsive สำหรับหน้า dashboard
- PDF ต้อง fixed A4
```

---

## 28. Handoff Prompt — Frontend

```text
คุณคือ Senior Frontend Engineer

ให้พัฒนา Frontend ระบบ HJ Account AI ด้วย:
- Next.js
- TypeScript
- Tailwind CSS
- App Router

ข้อกำหนด:
1. UI ภาษาไทย
2. วันที่แสดงเป็นพุทธศักราชทุกจุด
3. Timezone Asia/Bangkok
4. ห้ามแสดง ISO date ให้ผู้ใช้เห็น
5. ใช้ Component-based architecture
6. รองรับ Role-based UI
7. มี mock data ระยะแรก
8. PDF Preview ต้องยึดไฟล์ Invoice-PP-003-2569.pdf เป็นแม่แบบ

Pages:
- /login
- /dashboard
- /ai-inbox
- /documents/upload
- /documents/[id]/review
- /documents/[id]/pdf-preview
- /customers
- /vendors
- /sales/quotations
- /sales/invoices
- /sales/delivery-notes
- /sales/receipts
- /expenses
- /projects
- /inventory
- /tax
- /risks
- /closing
- /accountant-pack
- /settings/company
- /settings/document-template
- /settings/document-numbering

Components:
- AppSidebar
- AppTopbar
- StatCard
- StatusBadge
- RiskBadge
- ThaiDate
- DataTable
- DocumentUpload
- AiConfidenceBadge
- AiExtractedField
- ReviewPanel
- MoneyDisplay
- EmptyState
- ConfirmDialog
- MonthEndChecklist
- AccountantPackExportPanel
- DocumentA4Page
- CompanyHeader
- DocumentTitleBox
- CustomerInfoSection
- DocumentMetaSection
- DocumentItemsTable
- AmountInWordsBox
- AmountSummaryBox
- DocumentNotes
- SignatureSection
- PdfPreviewToolbar

Utilities:
- formatThaiDate
- formatThaiDateShort
- formatThaiDateTime
- formatThaiCurrency
- numberToThaiBahtText
- getDocumentTheme
- getSignatureLabelsByDocumentType
- getStatusColor
- getRiskColor

ให้จัดโครงสร้าง:
src/
  app/
  components/
  features/
  lib/
  services/
  types/
```

---

## 29. Handoff Prompt — Backend

```text
คุณคือ Senior Backend Engineer

ให้พัฒนา Backend ระบบ HJ Account AI ด้วย:
- NestJS
- TypeScript
- Prisma
- MariaDB
- REST API
- JWT Authentication
- Role-based Access Control

ต้องรองรับ:
1. Auth
2. Users / Roles
3. Company Settings
4. Partners
5. Documents / Attachments
6. AI Inbox
7. Sales Documents
8. PDF Generation
9. Expenses
10. Payments
11. Projects
12. Inventory
13. Fixed Assets
14. VAT / WHT
15. Journal
16. Risks
17. Closing
18. Accountant Pack
19. Audit Log

Business Rules:
1. AI ห้าม Confirm เอกสารเอง
2. LOCKED ห้ามแก้ไข
3. VOIDED ห้ามใช้คำนวณรายงาน
4. Journal ต้อง Dr = Cr
5. ปิดงวดไม่ได้ถ้ามี Critical Risk
6. รายจ่ายที่เป็นต้นทุนโครงการต้องมี projectId
7. สินค้าออกต้องตรวจ stock
8. ทุกการแก้ไขเอกสารสำคัญต้องมี Audit Log
9. Void ต้องระบุ reason
10. Accountant Pack ต้องสร้างจากงวดที่ปิดแล้ว
11. ถ้า company.vatStatus ไม่ใช่ REGISTERED ห้ามออก TAX_INVOICE
12. PDF จริงต้องเก็บ path, generatedAt, generatedBy

API ตาม PRD v2.0
ให้สร้าง Prisma schema, DTO, Controller, Service, Guard, Seed Data และ Error Handling แบบ Production-ready MVP
```

---

## 30. Final Product Definition

HJ Account AI v2.0 คือระบบบัญชีและเอกสารสำหรับ หจก. ขนาดเล็กที่มีหัวใจ 6 ข้อ

```text
1. เอกสารขายครบ: ใบเสนอราคา ใบส่งของ ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี
2. รายจ่ายครบหลักฐาน: อัปโหลดเอกสาร AI อ่าน และคนตรวจ
3. แยกต้นทุน: โครงการ สินค้า วัสดุ ทรัพย์สิน
4. ภาษีปลอดภัย: VAT/WHT เป็น Rule-based + Accountant Review
5. ปิดงวดได้: Risk Center + Month-End Checklist
6. ส่งต่อง่าย: Accountant Pack + PDF Evidence + Audit Log
```

ระบบนี้เล็กกว่า ERP แต่ครบพอสำหรับ หจก. ที่ต้องการทำงานจริง
