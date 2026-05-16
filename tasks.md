# Tasks — HJ Account AI v2.0 vs PRD Audit

**ตรวจสอบ:** 2026-05-16  
**Branch:** `claude/objective-jones-88d23c`  
**อ้างอิง:** `PRD-HJ-Account-AI-v2.md` 30 ส่วน

> สรุปภาพรวม: **โครงสร้าง Phase 0 + บางส่วนของ Phase 1 (Sales + PDF + Expense Receipts) + Phase 2 Schema Foundation** เสร็จแล้ว. โมดูลใหญ่ที่กำหนดใน PRD §14 จาก 18 โมดูล — ทำเสร็จ 5, ทำบางส่วน 3, ยังไม่เริ่ม 10. Schema สำหรับ Phase 2 ครบ — Sprint ต่อไปไม่ต้อง migration ใหม่ ✅  
> Phase 1 ship target ตาม CLAUDE.md (replace customer's Word/Excel quotation+receipt workflow) ✅ ใกล้พร้อม. ส่วนที่เหลือคือ AI / Risk / Closing / Bank ที่ explicitly deferred.

---

## Priority-ordered Action Plan (รอบนี้ทำ P1 แล้ว)

| Pri | Group Task | Status | จะปลด block อะไร |
|---|---|---|---|
| **P0** | **Phase 1 ship blockers** — PDF template pixel-match `Invoice-PP-003-2569.pdf` + ตัด tech debt (H3, M2, M4, M8) + แก้ pre-existing test failures (numbering race + quotations counter) | ⏳ todo | ship Phase 1 จริง (replace Word/Excel workflow ของลูกค้า) |
| **P1** | **Phase 2 Schema Foundation** — 12 new schemas + 13 new enums + migration + shared-types + truncate order | ✅ **done (2026-05-16)** | Sprint 5–8 ทั้งหมด เริ่ม implement service ได้ทันที |
| **P2** | **UI Foundation Components** — DataTable, StatCard, RiskBadge, AiConfidenceBadge, AiExtractedField + User management UI + Numbering rules settings page + Document template settings page | ⏳ todo | ทุก list/dashboard page + Risk/AI screen |
| **P3** | **Money Flow Implementation** — JournalEntry posting service (Dr=Cr enforced) + Payment module CRUD + WHT flow on receive/pay + Project linkage on ExpenseRecord | ⏳ todo | Tax dashboard, Closing checks, Reports |
| **P4** | **Tax + Risk + Closing** — VAT/WHT records + TaxModule API + Risk rules engine + AccountingPeriod close guards (PRD §17.4 hard blocks) | ⏳ todo | Accountant Pack |
| **P5** | **Inventory + Fixed Assets** — InventoryMovement service + stock-on-hand calc + Fixed asset depreciation | ⏳ todo | Reports ที่ใช้สินค้า/ทรัพย์สิน |
| **P6** | **Accountant Pack Export** — ZIP 13 ไฟล์ + AI monthly summary | ⏳ todo | Phase 2 ship |
| **P7** | **AI Inbox** — OpenRouter integration + Document reader + Account classifier + Bank matcher | ⏳ todo | Phase 2 ship |
| **P8** | **Bank Reconciliation** — Statement import + matching (BankStatementLine ↔ Payment) | ⏳ todo | Accountant Pack ครบ |

### รายละเอียดที่ทำในรอบ P1

**Schemas เพิ่ม 12 ตาราง:** `Project`, `Payment`, `JournalEntry`, `JournalEntryLine`, `AccountingPeriod`, `VatRecord`, `WithholdingTaxRecord`, `RiskItem`, `AiSuggestion`, `InventoryMovement`, `FixedAsset`, `BankStatementLine`  
**Enums เพิ่ม 13 ตัว:** `PaymentDirection`, `PaymentMethod`, `PaymentStatus`, `AccountingPeriodStatus`, `JournalSourceType`, `JournalEntryStatus`, `VatRecordType`, `WhtRecordType`, `RiskItemType`, `RiskItemStatus`, `AiSuggestionType`, `InventoryMovementType`, `FixedAssetStatus`, `BankStatementSide`, `ProjectStatus` (+ `RiskLevel` ย้ายจาก shared-types เข้า Prisma)  
**Existing model ที่แก้:** `Company` เพิ่ม 11 reverse relations · `Partner` เพิ่ม `payments` + `asCustomerProjects` · `Product` เพิ่ม `inventoryMovements` · `ExpenseRecord` เพิ่ม `projectId` + `fixedAsset`  
**Migration:** `20260515224247_phase2_schema_foundation` — 12 CREATE TABLE + 1 ALTER + 16 FK constraints — ผ่าน test DB แล้ว  
**Tests:** `test:unit` 66/66 pass · expense-receipts integration 14/14 pass · typecheck (api + web) clean

---

## 1. ขอบเขต (PRD §4.1 In Scope — 22 ข้อ)

| # | รายการ | สถานะ | หมายเหตุ |
|---|---|---|---|
| 1 | ตั้งค่าข้อมูล หจก. | ✅ done | `CompaniesModule` + `/api/company` + `/settings/company` page |
| 2 | ผู้ใช้และสิทธิ์ | ⚠️ partial | seed 2 users, RolesGuard ทำงาน. ❌ ยังไม่มี UI จัดการผู้ใช้ |
| 3 | ลูกค้า / ผู้ขาย / คู่ค้า | ✅ done | `PartnersModule`, type CUSTOMER/VENDOR/BOTH + UI |
| 4 | AI Document Inbox | ❌ not started | ไม่มี `AiInboxModule`, ไม่มี `AiSuggestion` table |
| 5 | ใบเสนอราคา | ✅ done | `QuotationsService` + UI 3 หน้า (list/new/[id]) |
| 6 | ใบส่งของ | ✅ done | `DeliveryNotesService` + UI 3 หน้า |
| 7 | ใบแจ้งหนี้ | ✅ done | `InvoicesService` + UI 3 หน้า |
| 8 | ใบเสร็จรับเงิน | ✅ done | `ReceiptsService` + UI 3 หน้า |
| 9 | ใบเสร็จรับเงิน/ใบกำกับภาษี | ✅ done | `ReceiptTaxInvoicesService` + UI 3 หน้า |
| 10 | รายจ่าย / เอกสารซื้อ | ⚠️ partial | `ExpenseReceiptsModule` ครอบคลุม upload+approve+ลงรายจ่าย แต่❌ยังไม่มี `PurchaseDocument` ตาม PRD §19 |
| 11 | รับเงิน / จ่ายเงิน | ❌ not started | ไม่มี `PaymentsModule`, ไม่มี `Payment` table |
| 12 | โครงการและต้นทุนงาน | ❌ not started | ไม่มี `ProjectsModule`, ไม่มี `Project` table |
| 13 | สินค้า / วัสดุ / คลังเบื้องต้น | ⚠️ partial | `Product` schema + ProductsService + UI list/form. ❌ ไม่มี `InventoryMovement`, ไม่มี stock-out check |
| 14 | ทรัพย์สินถาวรเบื้องต้น | ❌ not started | ไม่มี `FixedAsset` table, ไม่มีโมดูล |
| 15 | VAT / WHT Dashboard | ❌ not started | ไม่มี `TaxModule`, ไม่มี `VatRecord`/`WithholdingTaxRecord` |
| 16 | Journal Entry อัตโนมัติแบบย่อ | ❌ not started | ไม่มี `JournalModule`, `JournalEntry`/`JournalEntryLine` schema |
| 17 | Bank Statement Import + Matching | ❌ not started | ไม่มี `BankStatement` handling |
| 18 | AI Risk Center | ❌ not started | ไม่มี `RiskItem`, ไม่มี `RisksModule` |
| 19 | Month-End Closing | ❌ not started | ไม่มี `ClosingModule`, ไม่มี `AccountingPeriod` |
| 20 | Accountant Pack Export | ❌ not started | ไม่มี `AccountantPackModule`, ไม่มี `ExportBatch` |
| 21 | PDF Template ตามต้นแบบ | ⚠️ partial | `PdfModule` มี Playwright renderer + preview/queue ทำงาน. ❌ HTML templates ยัง basic — ยังไม่ pixel-match Invoice-PP-003-2569.pdf |
| 22 | วันที่ไทย / พ.ศ. / Bangkok TZ | ✅ done | `formatThaiDate*` + `numberToThaiBahtText` ใน [format.ts](apps/web/src/lib/format.ts) |

**สรุป In Scope: 8 done / 4 partial / 10 not started** (สำเร็จ ~50% รายข้อ)

---

## 2. โมดูล (PRD §14 — 18 Core Modules)

| # | โมดูล | Backend | Frontend | สถานะรวม |
|---|---|---|---|---|
| 1 | Auth | ✅ `AuthModule` + JWT + argon2 | ✅ `/login` page | ✅ done |
| 2 | Company Settings | ✅ `CompaniesModule` | ✅ `/settings/company` | ✅ done |
| 3 | Users & Roles | ⚠️ `UsersService` (no controller) | ❌ no UI | ⚠️ partial |
| 4 | Partners | ✅ `PartnersModule` | ✅ `/customers`, `/vendors` | ✅ done |
| 5 | Document Upload & Attachments | ⚠️ `Attachment` model + ใช้ใน expense-receipts | ❌ no generic upload UI | ⚠️ partial |
| 6 | AI Document Inbox | ❌ | ❌ | ❌ not started |
| 7 | Sales Documents | ✅ 6 doc types ครบ | ✅ 6 pages × 3 routes | ✅ done |
| 8 | Purchase / Expense | ⚠️ ExpenseReceipts only | ⚠️ `/expenses/receipts` only | ⚠️ partial |
| 9 | Payments | ❌ | ❌ | ❌ not started |
| 10 | Projects | ❌ | ❌ | ❌ not started |
| 11 | Inventory | ⚠️ Product catalog only | ⚠️ `/products` only | ⚠️ partial |
| 12 | Fixed Assets | ❌ | ❌ | ❌ not started |
| 13 | VAT / WHT | ❌ (มีแค่ rate ใน SalesDocument) | ❌ | ❌ not started |
| 14 | Journal | ❌ | ❌ | ❌ not started |
| 15 | Bank Reconciliation | ❌ | ❌ | ❌ not started |
| 16 | AI Risk Center | ❌ | ❌ | ❌ not started |
| 17 | Month-End Closing | ❌ | ❌ | ❌ not started |
| 18 | Accountant Pack | ❌ | ❌ | ❌ not started |

**สรุปโมดูล: 5 done / 4 partial / 9 not started**

---

## 3. Data Model (PRD §19 — Core Entities)

มีใน schema 15 / ต้องการ ~25 (ตาม PRD §19.1)

| Entity | สถานะ |
|---|---|
| Company | ✅ |
| CompanySetting | ⚠️ (รวมใน Company table, ยังไม่แยก) |
| User | ✅ |
| Role | ✅ (enum) |
| Partner | ✅ |
| **Document (generic)** | ❌ — มีเฉพาะ `SalesDocument` |
| Attachment | ✅ |
| **AiSuggestion** | ❌ |
| SalesDocument | ✅ |
| SalesDocumentItem | ✅ |
| **PurchaseDocument** | ❌ — มี `ExpenseReceipt` แทนแบบจำกัด |
| **PurchaseDocumentItem** | ❌ |
| **Payment** | ❌ |
| **Project** | ❌ |
| Product | ✅ |
| **InventoryMovement** | ❌ |
| **FixedAsset** | ❌ |
| **VatRecord** | ❌ |
| **WithholdingTaxRecord** | ❌ |
| **JournalEntry** | ❌ |
| **JournalEntryLine** | ❌ |
| **AccountingPeriod** | ❌ |
| **RiskItem** | ❌ |
| AuditLog | ✅ |
| **ExportBatch** | ❌ |
| **DocumentTemplate** | ❌ (เคยมี แล้วถูก drop ใน migration `20260511005124_drop_document_template`) |
| DocumentNumberingRule | ✅ |
| GeneratedPdf | ✅ |
| **ExpenseReceipt** | ✅ (เพิ่มจาก PRD — รองรับ workflow เฉพาะ) |
| **ExpenseRecord** | ✅ (เพิ่มจาก PRD) |

**สรุป schema: 11 ตรง PRD / 2 เพิ่มจาก PRD / 14 ยังขาด** (~44% coverage)

---

## 4. API Endpoints (PRD §20)

| หมวด | PRD ระบุ | ระบบมี | สถานะ |
|---|---|---|---|
| Auth | login/logout/me | ทั้ง 3 | ✅ |
| Company | GET/PATCH /company + settings | GET/PATCH + vat-history + vat-status | ✅ (settings เก็บใน Company) |
| Partners | list/create/get/patch | ครบ + deactivate | ✅ |
| Documents (generic upload) | upload/list/get/review/confirm/void | ❌ | ❌ |
| PDF | preview/generate/download + templates | preview/generate/status/download (no templates UI) | ⚠️ |
| Sales: Quotations | list/post/convert-to-invoice | list/post/confirm/void (❌ convert) | ⚠️ |
| Sales: Invoices | list/post/confirm | list/post/confirm/void | ✅ |
| Sales: Delivery Notes | list/post | list/post/confirm/void | ✅ |
| Sales: Receipts | list/post | list/post/confirm/void | ✅ |
| Sales: Tax Invoices | (implicit) | list/post/confirm/void | ✅ |
| Sales: Receipt+Tax | (implicit) | list/post/confirm/void | ✅ |
| Expenses | list/post/get/confirm | expense-receipts: list/get/upload/link-vendor/approve-vendor/account/reject/file | ✅ (กว้างกว่า PRD) |
| Payments | list/post/match | ❌ | ❌ |
| Projects | list/post/get/profit | ❌ | ❌ |
| Inventory | products + movements | products เท่านั้น | ⚠️ |
| Tax | dashboard/vat-report/wht-report/risks | ❌ | ❌ |
| Closing | get/check/close | ❌ | ❌ |
| Accountant Pack | export/download | ❌ | ❌ |
| Audit Log | list | list (read-only) | ✅ |
| **Lifecycle** (extra) | — | transitions/available | ➕ extra |
| **Numbering** (extra) | — | rules/peek | ➕ extra |

**สรุป API: 11 done / 3 partial / 8 not started** (~58% coverage)

---

## 5. Frontend — Pages (PRD §21.2)

| Path | สถานะ | หมายเหตุ |
|---|---|---|
| `/login` | ✅ | `apps/web/src/app/login/` |
| `/dashboard` | ✅ | `(app)/dashboard` (basic placeholder) |
| `/ai-inbox` | ❌ | ไม่มี |
| `/documents/upload` | ❌ | ไม่มี (มีเฉพาะ upload ใน expense-receipts) |
| `/documents/[id]/review` | ❌ | |
| `/documents/[id]/pdf-preview` | ⚠️ | implicit ผ่าน `/sales/.../[id]` ที่มีปุ่ม preview |
| `/customers` | ✅ | |
| `/vendors` | ✅ | |
| `/sales/quotations` | ✅ | list + new + [id] |
| `/sales/invoices` | ✅ | list + new + [id] |
| `/sales/delivery-notes` | ✅ | list + new + [id] |
| `/sales/receipts` | ✅ | list + new + [id] |
| **`/sales/tax-invoices`** | ✅ | (เพิ่มเติม) |
| **`/sales/receipt-tax-invoices`** | ✅ | (เพิ่มเติม) |
| `/expenses` | ⚠️ | มีแค่ `/expenses/receipts` |
| `/projects` | ❌ | |
| `/inventory` | ❌ | |
| `/tax` | ❌ | |
| `/risks` | ❌ | |
| `/closing` | ❌ | |
| `/accountant-pack` | ❌ | |
| `/settings/company` | ✅ | |
| `/settings/document-template` | ❌ | |
| `/settings/document-numbering` | ❌ | |
| **`/settings/audit-log`** | ✅ | (เพิ่มเติม) |
| `/products` | ➕ | (extra — รองรับ #13 ของ PRD) |

**สรุปหน้า: 11 done + 3 extra / 1 partial / 10 not started** (~50%)

---

## 6. Frontend Components (PRD §21.3)

| Component | สถานะ |
|---|---|
| AppSidebar | ✅ |
| AppTopbar | ✅ |
| StatCard | ❌ |
| StatusBadge | ✅ |
| RiskBadge | ❌ |
| ThaiDate | ⚠️ (มีในรูป util function ใน format.ts; ไม่ใช่ component) |
| DataTable | ❌ (ตอนนี้ใช้ HTML `<table>` ดิบ) |
| DocumentUpload | ⚠️ (มีเฉพาะใน ExpenseReceiptsPage modal) |
| AiConfidenceBadge | ❌ |
| AiExtractedField | ❌ |
| ReviewPanel | ❌ |
| MoneyDisplay | ✅ (`Money.tsx`) |
| EmptyState | ✅ (`Empty.tsx`) |
| ConfirmDialog | ✅ |
| MonthEndChecklist | ❌ |
| AccountantPackExportPanel | ❌ |
| DocumentA4Page | ⚠️ (server-side template HTML ใน `pdf-templates/`) |
| CompanyHeader | ⚠️ (server-side) |
| DocumentTitleBox | ⚠️ (server-side) |
| CustomerInfoSection | ⚠️ (server-side) |
| DocumentMetaSection | ⚠️ (server-side) |
| DocumentItemsTable | ⚠️ (server-side) |
| AmountInWordsBox | ⚠️ (server-side) |
| AmountSummaryBox | ⚠️ (server-side) |
| DocumentNotes | ⚠️ (server-side) |
| SignatureSection | ⚠️ (server-side) |
| PdfPreviewToolbar | ❌ |
| **(extra)** PartnerPicker | ➕ |
| **(extra)** ProductPicker | ➕ |
| **(extra)** PartnerTypeBadge | ➕ |
| **(extra)** ProductTypeBadge | ➕ |
| **(extra)** Modal | ➕ |
| **(extra)** Spinner | ➕ |
| **(extra)** Toast | ➕ |
| **(extra)** ThemeToggle | ➕ |

**สรุป component: 5 done / 11 partial (server-side only) / 11 not started + 8 extras** (~40% direct coverage)

---

## 7. Frontend Utilities (PRD §21.4)

| Util | สถานะ |
|---|---|
| formatThaiDate | ✅ |
| formatThaiDateShort | ✅ |
| formatThaiDateTime | ✅ |
| formatThaiCurrency | ✅ |
| numberToThaiBahtText | ✅ |
| getDocumentTheme | ⚠️ (มีใน `pdf-templates/meta.ts` ฝั่ง backend; frontend ไม่ใช้โดยตรง) |
| getSignatureLabelsByDocumentType | ⚠️ (มีฝั่ง backend ผ่าน `pdf-templates`) |
| getStatusColor | ⚠️ (inline ใน StatusBadge component) |
| getRiskColor | ❌ (no Risk feature yet) |

**สรุป utility: 5 done / 3 partial / 1 not started** (~67%)

---

## 8. Backend Modules (PRD §22.2)

| Module | สถานะ |
|---|---|
| AuthModule | ✅ |
| UsersModule | ⚠️ (no controller) |
| CompaniesModule | ✅ |
| PartnersModule | ✅ |
| DocumentsModule | ❌ (generic doc upload not done) |
| AttachmentsModule | ⚠️ (model only, no module) |
| AiInboxModule | ❌ |
| SalesModule | ✅ |
| ExpensesModule | ⚠️ (เป็น ExpenseReceiptsModule แทน) |
| PaymentsModule | ❌ |
| ProjectsModule | ❌ |
| InventoryModule | ⚠️ (เฉพาะ ProductsModule) |
| TaxModule | ❌ |
| JournalModule | ❌ |
| RisksModule | ❌ |
| ClosingModule | ❌ |
| AccountantPackModule | ❌ |
| AuditLogModule | ✅ |
| DocumentTemplatesModule | ❌ (เคยมีและ drop ออก) |
| DocumentNumberingModule | ✅ (อยู่ใน `NumberingModule`) |
| PdfGenerationModule | ✅ (อยู่ใน `PdfModule`) |
| **(extra) LifecycleModule** | ➕ |

**สรุป backend module: 8 done / 4 partial / 9 not started** (~40%)

---

## 9. Acceptance Criteria (PRD §25 — 25 ข้อ)

| # | Criterion | สถานะ |
|---|---|---|
| 1 | ตั้งค่าข้อมูล หจก. ได้ | ✅ |
| 2 | จัดการผู้ใช้และสิทธิ์ได้ | ⚠️ (RBAC ทำงาน, UI ขาด) |
| 3 | จัดการลูกค้าและผู้ขายได้ | ✅ |
| 4 | อัปโหลดเอกสารได้ | ⚠️ (เฉพาะ expense receipts) |
| 5 | AI Inbox รับข้อมูลเอกสารรอตรวจได้ | ❌ |
| 6 | ผู้ใช้ตรวจและยืนยันข้อมูลจาก AI ได้ | ❌ |
| 7 | ออกใบเสนอราคา PDF ได้ตามต้นแบบ | ⚠️ (PDF generate ได้, template ยังไม่ pixel-match) |
| 8 | ออกใบส่งของ PDF ได้ตามต้นแบบ | ⚠️ |
| 9 | ออกใบแจ้งหนี้ได้ | ✅ (PDF partial) |
| 10 | ออกใบเสร็จรับเงิน PDF ได้ตามต้นแบบ | ⚠️ |
| 11 | ออกใบเสร็จ/ใบกำกับภาษีตามสถานะ VAT | ✅ (`assertVatEligible` enforced) |
| 12 | บันทึกรายจ่ายพร้อมเอกสารแนบได้ | ✅ |
| 13 | บันทึกรับเงินและจ่ายเงินได้ | ❌ |
| 14 | แยกต้นทุนโครงการได้ | ❌ |
| 15 | จัดการสินค้า/วัสดุเบื้องต้นได้ | ⚠️ (catalog only) |
| 16 | บันทึกทรัพย์สินถาวรได้ | ❌ |
| 17 | ตรวจ VAT/WHT เบื้องต้นได้ | ❌ |
| 18 | สร้าง Journal อัตโนมัติได้ | ❌ |
| 19 | มี Risk Center | ❌ |
| 20 | มี Audit Log | ✅ |
| 21 | ปิดงวดรายเดือนได้ | ❌ |
| 22 | Export Accountant Pack ได้ | ❌ |
| 23 | วันที่ทั้งหมดแสดงเป็นภาษาไทย/พ.ศ. | ✅ |
| 24 | PDF ใช้วันที่ไทย/จำนวนเงินตัวอักษรไทย | ✅ |
| 25 | AI ไม่มีสิทธิ์ทำ action สำคัญแทนมนุษย์ | ✅ (เชิงสถาปัตยกรรม — มี `AI_AGENT` role + `validateTransition` กั้น แล้ว แต่ยังไม่มี AI feature จริง) |

**สรุป Acceptance Criteria: 8 done / 6 partial / 11 not started** (~32% pass)

---

## 10. Tasks ที่เหลือเรียงตาม Sprint (PRD §26)

### Sprint 4 (กำลังทำ — Sales + PDF)
- [ ] **PDF template pixel-match** ตาม Invoice-PP-003-2569.pdf (`pdf-templates/layout.ts`)
- [ ] Quotation → Invoice convert flow (`POST /sales/quotations/:id/convert-to-invoice`)
- [ ] PDF preview UI toolbar
- [ ] DocumentTemplate settings page (`/settings/document-template`) + table (เคยถูก drop)
- [ ] Numbering rules settings page (`/settings/document-numbering`)
- [ ] User management UI (Sprint 2 leftover)
- [ ] Generic document upload page (`/documents/upload`)
- [ ] Generic attachment module + listing component

### Sprint 5 (Expenses & Payments)
- [ ] `PurchaseDocument` + `PurchaseDocumentItem` schema (PRD §19)
- [ ] `Payment` schema + `PaymentsModule` (in/out + match)
- [ ] `JournalEntry`/`JournalEntryLine` schema (Dr = Cr enforced)
- [ ] `/payments` UI
- [ ] Expense-receipt → Journal posting (เมื่อ ACCOUNTED ให้สร้าง JE)
- [ ] WHT field flow when receiving payment

### Sprint 6 (Tax & Risk)
- [ ] `VatRecord` + `WithholdingTaxRecord` schema
- [ ] `TaxModule` + `/api/tax/*` endpoints (dashboard, vat-report, wht-report, risks)
- [ ] `/tax` page
- [ ] `RiskItem` schema + `RisksModule`
- [ ] `/risks` page + RiskBadge component
- [ ] AI Risk rules engine (rule-based, configurable per PRD §7.4)

### Sprint 7 (Project & Inventory)
- [ ] `Project` schema + `ProjectsModule` + `/projects` page
- [ ] Project profit calculation (`GET /projects/:id/profit`)
- [ ] `InventoryMovement` schema + stock-out validation
- [ ] Stock-on-hand calculation per product
- [ ] `FixedAsset` schema + `FixedAssetsModule` + page

### Sprint 8 (Closing & Accountant Pack)
- [ ] `AccountingPeriod` schema + `ClosingModule`
- [ ] Period close checks (PRD §17.4 hard blocks)
- [ ] Month-end checklist UI + `MonthEndChecklist` component
- [ ] `/closing` page
- [ ] `ExportBatch` schema + `AccountantPackModule`
- [ ] ZIP export (13 files per PRD §18) + `AccountantPackExportPanel` component
- [ ] Bank statement import + matching (`BankReconciliationModule`)
- [ ] `/accountant-pack` page

### Sprint AI (PRD §16 — explicitly deferred but listed)
- [ ] `AiSuggestion` schema + `AiInboxModule`
- [ ] OpenRouter integration (env vars already in `.env.example`)
- [ ] AI Document Reader (extract from PDF/image)
- [ ] AI Account Classifier
- [ ] AI Bank Matcher
- [ ] AI Monthly Summary
- [ ] `/ai-inbox` page + `AiConfidenceBadge` + `AiExtractedField` + `ReviewPanel` components

---

## 11. Tech debt & cleanup (จาก code review รอบที่ผ่านมา)

ที่ยังเหลือหลังรอบ critical/high fix:

- [ ] **H3**: consistency check `subtotal + vat - wht ≈ grandTotal` ใน `account()`
- [ ] **M2**: ย้าย `storedPath` ใน DB ให้เป็น relative path (ไม่ใช่ absolute)
- [ ] **M4**: vendor name match แบบ case-insensitive + normalize whitespace
- [ ] **M8**: catch Prisma `P2002` ใน `approveVendor` → 409 (ตอนนี้ throw 500)
- [ ] **A1**: pre-existing test failures
  - `numbering.service.integration.spec.ts` — Prisma `upsert` ไม่ race-safe จริง บน MySQL
  - `quotations.lifecycle.integration.spec.ts:163` — test reset counter แต่ไม่ลบ existing SalesDocuments
- [ ] **A3**: refactor เป็น 6 bounded contexts ตาม CLAUDE.md (Identity → MasterData → Documents → Money → Compliance → Period)

---

## 12. สถานะการ ship Phase 1

ตาม CLAUDE.md ระบุ **Phase 1 ship target = replace customer's Word/Excel quotation+receipt workflow**.

| Component | สถานะ Phase 1 ship |
|---|---|
| Sales documents lifecycle | ✅ พร้อม |
| Sales documents numbering | ✅ พร้อม |
| VAT eligibility enforcement | ✅ พร้อม |
| PDF preview/generate | ⚠️ ทำงานได้ แต่ template ยังไม่ pixel-match — **block ship จริง** |
| Frontend polish | ⚠️ พื้นฐานครบ ปรับ UX เพิ่ม |
| Audit log integrity | ✅ พร้อม (หลัง C1/C2 fix) |
| Expense receipts | ✅ พร้อม (รวมในรอบนี้) |

**ประเมิน:** **Phase 1 อยู่ที่ ~85% พร้อม ship** — งานที่เหลือเฉพาะ PDF template polishing + UX polish + tech debt cleanup. ของ Phase 2+ (AI, Risk, Closing, Bank, Project, Inventory, Asset, Journal) ทั้งหมดถือเป็น **deferred** ตามที่ CLAUDE.md อนุญาตให้รั้งไว้.
