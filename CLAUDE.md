# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

pnpm workspace with three packages: `apps/api` (NestJS), `apps/web` (Next.js 15 App Router), `packages/shared-types`.

Phase 0 (Foundation) and Phase 1 (Sales + PDF) are done. The API has all six sales document types (`QUOTATION / DELIVERY_NOTE / INVOICE / RECEIPT / TAX_INVOICE / RECEIPT_TAX_INVOICE`) wired through `SalesDocumentService → NumberingService → lifecycle`, plus `PdfGenerationService` (preview synchronous, generate via BullMQ). The web app has login + `(app)` group with sidebar covering sales, expenses, payments, bank, tax, projects, inventory, assets, risks, closing, accountant-pack, and settings.

Built since Phase 1 (commit `d3a71dd`, 2026-05-21): **sales documents post to the Journal at `confirm()` and the P&L report reads from the Journal** (see "Sales & ledger" below); month-end closing locks documents + enforces the §17.4 hard-blocks; Projects module (`/projects` + `/projects/:id/profit`); risk detectors `DUPLICATE_DOCUMENT` + `STOCK_NEGATIVE`; Accountant Pack persisted as `ExportBatch` (re-downloadable); bank statement CSV import; quotation→invoice convert button + project picker on the sales form; PND.54 (ภ.ง.ด.54) DTA rate table + auto-suggest + foreign WHT certificate.

**Git repo initialized.** Remote: `https://github.com/sooksun/mini_acc.git`. Production is live at `https://accounting.cnppai.com`.

Source-of-truth specs (Thai):

- `PRD-HJ-Account-AI-v2.md` — 30 sections covering scope, business rules, data model, API surface, modules, acceptance criteria. Treat this as the contract.
- `Invoice-PP-003-2569.pdf` — visual reference for the 3 base sales templates (ใบเสนอราคา / ใบส่งของ / ใบเสร็จรับเงิน).
- `mini-acc-handoff/project/` — static HTML+CSS+React-via-Babel prototype from claude.ai/design. **Visual reference only.** Don't lift its code structure.

## Stack

Built and in use:

- **Frontend**: Next.js 15 (App Router, `experimental.typedRoutes`) + TypeScript + Tailwind 3 — `apps/web`. Theme via CSS variables in `apps/web/src/app/globals.css`, mapped to Tailwind tokens in `apps/web/tailwind.config.ts`.
- **Backend**: NestJS 10 + Prisma 5 + Laragon's MySQL (port 3306, user `root`, no password) + JWT (Passport) + RBAC — `apps/api`. Global validation pipe (`whitelist + forbidNonWhitelisted`), helmet, CORS limited to `WEB_ORIGIN`. Routes prefixed with `/api`. Production deploy target is MariaDB 11 (see `docker-compose.yml`, kept for that purpose); dev uses Laragon to avoid running Docker on Windows.
- **Queue**: BullMQ + Redis (PDF only so far). Worker runs same-process inside the Nest app — see Architecture decisions. **Redis source for dev is TBD** — `docker-compose.yml` ships one but isn't being used; if you need to test PDF `generate` (not `preview`), install Laragon's Redis quick-add or Memurai.
- **PDF**: Playwright (Chromium) — `PdfRendererService` keeps a single shared browser instance.
- **Shared types**: `@hj/shared-types` (`Role`, `DocumentType`, `DocumentStatus`, `RiskLevel`, `AuditAction`, `AuthUser`, etc.) — used by both API and Web. Built to `dist/` before API/Web typecheck.

Planned (per PRD §21–22, not scaffolded yet):

- **AI gateway**: OpenRouter (env vars `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_EXTRACT=anthropic/claude-sonnet-4`, `OPENROUTER_MODEL_CLASSIFY=anthropic/claude-haiku-4` already in `.env.example`).
- **Hosting**: self-host Ubuntu via docker compose, nginx/caddy + TLS, local file storage `/var/lib/hj-account/attachments`, daily mariadb-dump backup.

## Common commands

All commands run from the repo root unless noted. Required: `pnpm@9.12+`, `node@20.11+`, Laragon (MySQL + optionally Redis). Docker is **not** required for local dev — `docker-compose.yml` is reserved for production deploy.

```powershell
# one-time bootstrap (first checkout)
pnpm install
copy .env.example .env    # then fill in JWT_SECRET, OPENROUTER_API_KEY, etc.
                          # DATABASE_URL=mysql://root:@localhost:3306/hjacc (Laragon default)
# Make sure Laragon's MySQL is running, then:
$env:DATABASE_URL = "mysql://root:@localhost:3306/hjacc"
pnpm --filter @hj/api exec prisma migrate dev    # apply migrations + autoruns seed
                                                  # seeds: Solutions Nextgen LP + owner/admin users + 6 numbering rules

# day-to-day dev (parallel: api on :4000, web on :3000)
pnpm dev                  # runs predev (build:types + prisma:generate) then dev for all packages

# focused dev
pnpm api:dev              # nest start --watch
pnpm web:dev              # next dev -p 3000

# checks
pnpm typecheck            # all workspaces
pnpm lint
pnpm build                # build:types → prisma:generate → api build → web build

# prisma helpers (proxy to apps/api scripts; loads ../../.env)
pnpm db:migrate
pnpm db:studio
pnpm prisma:generate
```

After seeding, log in with `owner@solutionsnextgen.co.th / owner123!` (OWNER) or `admin@solutionsnextgen.co.th / admin123!` (ADMIN).

## Workspace layout

```
apps/api/src/              27 feature folders — grouped below by the 6 bounded contexts they'll regroup into
  app.module.ts             root module (registers AuditLogInterceptor globally)
  main.ts                   bootstrap (helmet, validation pipe, /api prefix)
  # Identity & infra
  auth/                     JWT login, JwtAuthGuard, JwtStrategy → /api/auth
  common/                   @CurrentUser, @Roles, RolesGuard
  audit-log/                AuditLogInterceptor + @AuditAction decorator (controller-level only) → /api/audit-logs
  companies/                company settings → /api/company
  users/                    user CRUD + OWNER-protection guard → /api/users
  health/                   liveness probe → /api/health
  prisma/                   PrismaService + module
  # Master data
  partners/                 customers + vendors (PartnerType discriminator) → /api/partners
  products/                 catalog → /api/products
  numbering/                NumberingService (allocate inside tx, peek without) → /api/numbering
  lifecycle/                TRANSITIONS registry + validateTransition helper → /api/lifecycle
  # Documents
  sales/                    6 doc-type controllers (sales/{quotations,delivery-notes,invoices,receipts,tax-invoices,receipt-tax-invoices}), each a thin per-type service
    _shared/sales-document.service.ts   shared CRUD + confirm/void + totals + VAT-eligibility + postRevenueJournal
    from-receipts/          build a quotation/invoice from an expense receipt → /api/sales/from-receipts
  pdf/                      PdfRendererService (Playwright), PdfGenerationService (preview + enqueue), PdfJobProcessor → /api/sales-pdf/:type
  ai/                       AI Inbox — AiSuggestion lifecycle → /api/ai-inbox
  expense-receipts/         purchase/expense receipts + PP.36/PND.54 foreign tax + prepaid → /api/expense-receipts
  # Money
  journal/                  JournalService.postWithTx + accounts.ts (ACCOUNTS chart of accounts) → /api/journal
  payments/                 receipts settle invoices, clear AR → /api/payments
  reports/                  P&L read from the journal → /api/reports
  projects/                 project CRUD + profit → /api/projects
  inventory/                stock movements → /api/inventory
  fixed-assets/             assets + depreciation → /api/fixed-assets
  bank/                     bank statement import + reconciliation → /api/bank
  # Compliance & period
  tax/                      VAT/WHT dashboards + ภ.ง.ด.3/53/54 + 50-ทวิ → /api/tax
  risks/                    AI Risk Center detectors → /api/risks
  closing/                  ClosingService — month-end lock + §17.4 hard-blocks → /api/closing
  accountant-pack/          ExportBatch ZIP (re-downloadable) → /api/accountant-pack
  system/                   OWNER maintenance (backfill-sales-journals) → /api/system

apps/api/prisma/
  schema.prisma             31 models + 34 enums (see PRD §19)
  seed.ts                   company + 2 users + 6 numbering rules + sample partner/product + ForeignWhtRate DTA table

apps/web/src/
  app/
    layout.tsx              root (lang="th", ambient bg)
    login/                  /login
    (app)/                  authed group — checks token, redirects to /login if missing
      layout.tsx            sidebar + main, ToastProvider
      dashboard/  sales/{quotations,delivery-notes,invoices,receipts,tax-invoices,receipt-tax-invoices}/
      customers/  vendors/  products/  expenses/  payments/  bank/  inventory/  assets/
      projects/  tax/  wht-certificates/  risks/  closing/  accountant-pack/  profit-loss/  ai-inbox/  settings/
  components/
    AppSidebar.tsx, AppTopbar.tsx, ThemeToggle.tsx
    ui/                     Modal, ConfirmDialog, StatusBadge, Money, Pickers, Toast, Spinner, Empty, ThaiDatePicker
  features/
    sales/                  SalesDocumentForm, SalesDocumentDetail, SalesDocumentsList, doc-type-meta
    partners/  products/  expenses/
  lib/
    api.ts                  fetch wrapper — reads NEXT_PUBLIC_API_URL, attaches Bearer, throws ApiError
    auth.ts                 token + user in localStorage
    format.ts               formatThaiDate / formatThaiDateShort / formatThaiDateTime / numberToThaiBahtText
    quotation-totals.ts     client-side mirror of sales/_shared/totals.ts

packages/shared-types/src/index.ts   enums as `as const` + AuthUser, LoginResponse, CompanyDto

apps/api/test/setup-integration.ts   bootstrapTestEnv() / truncateAll() / seedMinimum() helpers
```

Both apps extend `tsconfig.base.json` (strict, `noUncheckedIndexedAccess: true`) — but `apps/api/tsconfig.json` overrides `noUncheckedIndexedAccess: false` because Nest decorators don't play well with it. Keep that override unless you're prepared to refactor.

## Testing

- **Frontend**: Vitest. `pnpm --filter @hj/web test`. Tests live as `*.test.ts` next to source (e.g. `apps/web/src/lib/format.test.ts`).
- **Backend**: Jest. `pnpm --filter @hj/api test:unit` (no DB) or `pnpm --filter @hj/api test:integration` (needs `hjacc_test` database in Laragon's MySQL). Tests live as `*.spec.ts` next to source. Integration files end in `.integration.spec.ts`.
- Both Jest scripts use `dotenv -e .env.test`. The shared-types alias `@hj/shared-types` is mapped to source via `apps/api/jest.config.js` so tests don't need a build step.

**Bootstrap test DB once:**
```powershell
mysql -u root -e "CREATE DATABASE IF NOT EXISTS hjacc_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
copy apps\api\.env.test.example apps\api\.env.test
pnpm --filter @hj/api run test:db:setup    # apply Prisma schema to test DB
```

- Integration tests bypass HTTP (call services directly via `bootstrapTestEnv()` from `apps/api/test/setup-integration.ts`) so the `AuditLogInterceptor` doesn't fire — test it separately when needed.
- Race-safety tests use `Promise.all` over `prisma.$transaction(allocate)` to assert numbering uniqueness — see `numbering.service.integration.spec.ts`.
- `truncateAll()` deletes in FK-dependent order with `SET FOREIGN_KEY_CHECKS=0` — when adding a new model, prepend it to the `TABLES_FK_DEPENDENT_ORDER` array.

## Non-negotiable rules

These are repeated across PRD §6.5, §7, §17.4, §22.3 — violating any one of them breaks the product's premise.

### AI is advisory, never authoritative
The `AI_AGENT` role can read, extract, suggest, and flag risks. It **cannot** confirm documents, void documents, lock periods, or write to the journal. Every AI suggestion needs explicit user (or Accountant) confirmation before it affects ledgers or reports. The mantra in §1: `AI ช่วยอ่าน / AI ช่วยแนะนำ / AI ช่วยตรวจ / ผู้ใช้ยืนยัน / นักบัญชีตรวจ / ระบบล็อกข้อมูลและเก็บประวัติ`.

### Document state machine
`DRAFT → AI_EXTRACTED → PENDING_REVIEW → USER_CONFIRMED → ACCOUNTED → PENDING_ACCOUNTANT → ACCOUNTANT_APPROVED → LOCKED`. Void path: `USER_CONFIRMED|ACCOUNTED|LOCKED → VOIDED`. Encoded as the `TRANSITIONS` registry in `apps/api/src/lifecycle/transitions.ts` (with allowed roles + `requireReason` flags); validated via `validateTransition()` which throws `InvalidTransitionError` (422 / `INVALID_TRANSITION`) or `ForbiddenException` (403 / `ROLE_NOT_ALLOWED`). Rules:
- `LOCKED` is immutable — corrections happen via new adjustment documents.
- `VOIDED` documents must keep their original document number and are excluded from report calculations but retained.
- Every state transition writes to `AuditLog` with reason where applicable (`VOID` requires a reason).

### Money & accounting integrity
- Journal entries must satisfy `Dr === Cr` server-side; reject otherwise (`JournalService.postWithTx`).
- Period close (`ClosingService`) is blocked by the PRD §17.4 hard-blocks — all computed directly (NOT via dismissable risks): journal unbalanced, open `CRITICAL` risk, duplicate sales doc numbers (`DUPLICATE_DOC_NUMBER`), negative stock (`STOCK_NEGATIVE`), unmatched bank lines in period (`UNMATCHED_BANK`), invoice received-but-no-receipt (`INVOICE_RECEIVED_NO_RECEIPT`, when payments link to invoices via `sourceType`/`sourceId`). `close()` also bulk-locks the period's sales docs to `LOCKED` in one tx (the one sanctioned place that sets status without `validateTransition` — period authority, §15.4).
- Project-cost expenses must carry a `projectId`. Stock-out movements must validate available stock.

### Sales & ledger (Journal is the source of truth — PRD §7.2)
- **Sales documents post to the Journal at `confirm()`** via `SalesDocumentService.postRevenueJournal` (sourceType `SALES_DOCUMENT`). Only revenue-recognition docs post — `INVOICE`/`TAX_INVOICE` always; `RECEIPT`/`RECEIPT_TAX_INVOICE` only when standalone (`parentDocumentId === null`, i.e. cash sale). QT/DN and receipts that close an invoice post nothing (cash collection is the Payments module's job, clearing AR).
- Posting: AR docs → `Dr ลูกหนี้ (1130)`; cash docs → `Dr เงินสด (1110)` + `Dr ภาษีถูกหัก ณ ที่จ่าย (1152)`; both → `Cr รายได้ (4110 service / 4120 sale, by item product type)` + `Cr ภาษีขาย (2151)` when VAT. `void()` voids the linked journal entry too.
- **`reports.service` (P&L) reads from the Journal**, not document tables: revenue = credits to `4xxx`, expense = debits to `5xxx`, gross adds VAT (`2151`/`1151`). Never revert it to read `salesDocument`/`expenseRecord` directly — that breaks the §7.2 traceability and silently drops depreciation/prepaid amortization.
- Chart of accounts lives in `apps/api/src/journal/accounts.ts` (`ACCOUNTS`). Expenses/payments already posted to the journal before this; sales were the missing half.
- **One-time backfill** for docs confirmed before journal wiring existed: `POST /api/system/backfill-sales-journals` (OWNER, idempotent). Must run once on prod after deploying the journal change, or historical sales revenue won't appear in journal-based reports.

### Tax safety
- `TAX_INVOICE` may only be issued when the document date is on/after `Company.vatEffectiveDate`. Enforced in `SalesDocumentService.assertVatEligible()` — throws 422 `VAT_NOT_EFFECTIVE`.
- `TAX_INVOICE` and `RECEIPT_TAX_INVOICE` require `customer.taxId` — must be exactly **13 digits** (`/^\d{13}$/`). Throws 400 `CUSTOMER_TAX_ID_REQUIRED` (missing) or `CUSTOMER_TAX_ID_INVALID` (wrong format).
- **Validation timing**: taxId presence + format check fires at both `create()` (per-type preValidate, early UX feedback) and `confirm()` (hard gate). `assertVatEligible()` fires **only at `confirm()`** — NOT at `create()`. Creating a DRAFT with any date must always succeed; the date is validated when the document is confirmed. Never move `assertVatEligible` back into `create()`.
- VAT/WHT logic is **rule-based and configurable**, never hard-coded constants. Uncertain rows go to `PENDING_ACCOUNTANT`, not auto-decided.

### PDF as evidence
Generated PDFs (not previews) record `path`, `generatedAt`, `generatedBy`, and the data version on `SalesDocument` plus an immutable row in `GeneratedPdf`. Preview mode shows a `DRAFT` watermark and does not lock the document number; Generate mode locks the number and persists the file. Generation runs in a BullMQ job (`PDF_QUEUE` / `PDF_GENERATE_JOB`) — controllers enqueue and return `{jobId}`, then poll `/api/.../pdf/job/:jobId`.

## Locale: Thai-first, Buddhist calendar

Product-defining, not cosmetic (PRD §9):

- **Storage**: UTC ISO datetime in DB, ISO strings on the API.
- **Display**: every user-visible date renders in `th-TH-u-ca-buddhist` with `timeZone: 'Asia/Bangkok'`. Example: stored `2026-05-10T03:30:00Z` → shown `10 พฤษภาคม 2569`.
- **Never** surface raw ISO dates in the UI or PDFs. The reference implementations of `formatThaiDate / formatThaiDateShort / formatThaiDateTime / numberToThaiBahtText` already live in `apps/web/src/lib/format.ts` — use them everywhere; the PDF service uses an equivalent server-side copy.
- **Default date values**: always use `localDateString()` from `apps/web/src/lib/format.ts` — never `new Date().toISOString().slice(0,10)`. `.toISOString()` converts to UTC which causes an off-by-one bug before 07:00 Bangkok time (UTC+7).
- Money in PDFs needs `numberToThaiBahtText` (e.g. `93,457.94 → เก้าหมื่นสามพันสี่ร้อยห้าสิบเจ็ดบาทเก้าสิบสี่สตางค์`, PRD §12.3).

## Document numbering

Format: `{PREFIX}-{BUDDHIST_YEAR}-{RUNNING}` (e.g. `INV-2569-0124`). Seeded prefixes: `QT / DN / INV / RC / TAX / RT`. Reset policy is `YEARLY` or `NEVER`, configurable per type (`DocumentNumberingRule`).

Drafts get a placeholder number `DRAFT-{8 hex chars}` set in `SalesDocumentService.create()`. The real number is allocated atomically inside `confirm()` via `NumberingService.allocate(companyId, type, documentDate, tx)`, which `upsert`s `DocumentNumberingCounter` with `currentValue: { increment: 1 }` — the unique key `(companyId, type, beYear)` is what makes concurrent allocations safe. **Always pass the surrounding transaction client to `allocate()`** — calling it outside a tx defeats race-safety. `peek()` is read-only and used for previewing the next number; never persist `peek()` output.

`getBuddhistYear()` lives at `apps/api/src/numbering/be-year.ts`. Use it instead of hand-rolling `+ 543`.

## Company facts (seed + VAT-effective)

`หจก. โซลูชั่น เนกซ์เจน` (Solutions Nextgen LP), tax ID `0573567001472`, registered Chiang Rai.

- **Registered**: 2024-05-09 (พ.ศ. 9 พ.ค. 2567)
- **VAT effective**: **2024-07-08** (พ.ศ. 8 กรกฎาคม 2567) — user-confirmed

This means: **TAX_INVOICE and RECEIPT_TAX_INVOICE may only be issued for `documentDate >= 2024-07-08`**. Documents dated 2024-05-09 to 2024-07-07 (the ~2-month pre-VAT window) must use `INVOICE` / `RECEIPT` only.

Modeled in schema as `Company.vatEffectiveDate: DateTime?` plus `CompanyVatStatus { effectiveFrom, effectiveTo, status }` history table so VAT cancellation/re-registration is representable.

## PDF master template

`Invoice-PP-003-2569.pdf` lives at the repo root. 3 pages: ใบเสนอราคา / ใบส่งของ / ใบเสร็จรับเงิน. Per-type theme colors and titles are seeded in `prisma/seed.ts → templates`.

**Known mismatches between the PDF master and the PRD** — resolved by user (2026-05-10):

| # | PRD says | PDF master actually does | Resolution |
|---|---|---|---|
| M1 | Numbering `{TYPE}-{BE_YEAR}-{RUNNING}`, e.g. `INV-2569-0124` | Real docs use `SNG-003` — single company-prefix counter | Follow PRD: per-type `{PREFIX}-{BE}-{####}`. Drop legacy `SNG-003`. |
| M2 | Summary box separates VAT row and WHT row (§12.2) | Label `หักภาษี ณ ที่จ่าย VAT 7%` collapses both — semantically wrong | Render 5 rows: `รวมเงิน / TOTAL` → `ภาษีมูลค่าเพิ่ม / VAT` → `รวมเงินรวมภาษี / TOTAL AFTER VAT` → `หักภาษี ณ ที่จ่าย / WHT` → `ยอดเงินสุทธิ / NET RECEIVED`. |
| M3 | Customer fields: name, address, taxId, branch | PDF adds a `ปี 2568-2569` field in customer block, not in PRD | Keep `ปี 2568-2569` as an optional cosmetic field for parity; not modeled in schema. |
| M5 | TAX_INVOICE & RECEIPT_TAX_INVOICE are distinct doc types | PDF master has no separate layout for these | Design new pages in same visual style (pixel-match header/table/signature/fonts). Add VAT-specific fields per PRD §10. Theme color `#1F5F8B`. |

When implementing, default to **PRD** semantics unless the user overrides — but make the visual style of headers/tables/signatures pixel-match the PDF master.

## Architecture decisions (user-confirmed 2026-05-10)

- **Worker = same-process as API**. BullMQ `@Processor()` classes registered inside the NestJS app. One Docker image, one `node dist/main.js`. Per-queue concurrency: PDF=2, AI=1. Don't create `apps/worker/` as a separate package.
- **PDF rendering**: Playwright on Ubuntu — install `fonts-thai-tlwg` in the Dockerfile. CSS chain: `'IBM Plex Sans Thai', 'Sarabun', sans-serif`. `PdfRendererService` keeps a single shared browser via lazy `browserPromise`; `onModuleDestroy` closes it. Use `await page.setContent(html, { waitUntil: 'networkidle' })` then `page.pdf({ format: 'A4', preferCSSPageSize: true, margin: 0 })`.
- **Partner model = single table** with `type: CUSTOMER | VENDOR | BOTH` discriminator. Same legal entity can be both.
- **Document items = separate table** (`SalesDocumentItem`), not JSON embed. Reason: report aggregation must scan items across documents.
- **Customer snapshot fields on `SalesDocument`** (`customerSnapshotName/Address/TaxId/Branch`) are denormalized at create time so VOID/LOCKED docs survive customer renames.

## Bounded contexts (Phase 2 refactor)

`apps/api/src/` now has **27 top-level feature folders** — well past the PRD threshold (>10). **The flat layout is still intentional** — regroup into the 6 contexts (**Identity → MasterData → Documents → Money → Compliance → Period**, plus cross-cutting `ai/` and `jobs/`) as a one-time half-day task when someone can do it cleanly, not piecemeal during feature work. The Workspace-layout tree above already annotates each folder with its target context.

Dependency rule when refactoring: A → B → C → D → E → F (no cycles, no skip-level cross-context imports).

## API conventions

- Path: `/api/{plural-resource}`; state transitions are `POST /api/{resource}/:id/{action}` (e.g. `/api/sales/quotations/:id/confirm`, `/api/sales/quotations/:id/void`).
- `PATCH` is for field updates only — never to trigger workflow.
- Money fields: `Decimal(18,2)` in DB, `string` in DTOs (no JS float for money). The `toDto()` helper on `SalesDocumentService` does the `.toString()` conversion.
- Naming: `customer` (not `client`), `taxInvoice` (not `vatInvoice`), `documentDate` (not `date`/`docDate`).
- AI never writes to `Document` / `JournalEntry` / `AccountingPeriod` — only to `AiSuggestion(status=PENDING)`. User action materializes suggestion → real document.
- All status transitions go through `validateTransition()` from `lifecycle/`. **Never** `prisma.update({ status })` directly in feature services.
- All document numbers allocated in the same transaction as the document insert via `NumberingService.allocate(..., tx)` — the `upsert` on the unique counter row is what makes it race-safe.
- Per-type sales services (e.g. `TaxInvoicesService`) are thin facades that pass type-specific `preValidate` hooks into the shared `SalesDocumentService.create()`. Add a new sales doc type by mirroring this pattern, **not** by copying the shared service.
- Controllers carry `@AuditAction(...)` decorators; the global `AuditLogInterceptor` records on success only. Provide `getEntityId` / `getReason` / `getMetadata` callbacks to extract fields from `req` or the response.
- All authed routes use `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` + `@CurrentUser() user: AuthUser`. `companyId` always comes from `user.companyId` — never trust a `companyId` from the request body.
- **RBAC — OWNER protection**: `ADMIN` cannot create or edit `OWNER` accounts. Guard lives in `UsersService.create()` and `UsersService.update()` — both accept `currentUserRole: Role` and throw `ForbiddenException` if a non-OWNER tries to touch an OWNER row. Never relax this server-side; frontend hides the button/option as UX only.

## MVP scope

- **Phase 0** (Foundation): scaffold, design tokens, auth + users + company settings + audit log, Thai date + Baht text utilities. **Done.**
- **Phase 1** (Sales + PDF): customers, products, document numbering, QT → INV → DN → RC/RT state machine + numbering + immutability, Playwright HTML→PDF for all 6 doc types with theme + signature blocks (per-type metadata is hardcoded in `pdf-templates/meta.ts`; per-company `DocumentTemplate` table was removed pending Settings UI), basic dashboard. **Done** — plus sales→journal posting, P&L from journal, and the post-Phase-1 modules listed in Project status.

**Ship target**: replace the customer's Word/Excel quotation+receipt workflow. AI Inbox / Expense / Bank / Risk / Closing are explicitly deferred to later phases.

Document type → Thai title (PRD §10.2):
```
QUOTATION → ใบเสนอราคา        | DELIVERY_NOTE → ใบส่งของ
INVOICE → ใบแจ้งหนี้           | RECEIPT → ใบเสร็จรับเงิน
TAX_INVOICE → ใบกำกับภาษี      | RECEIPT_TAX_INVOICE → ใบเสร็จรับเงิน/ใบกำกับภาษี
```

## Prototype reference (`mini-acc-handoff/project/`)

Read these to understand the intended UI before recreating it in Next.js:

- `HJ Account AI.html` — shell; loads React 18 + Babel standalone from unpkg. Don't run it through a build; static reference only.
- `styles.css` — design system. Brand gradient `#7c5cff → #5b8cff → #38bdf8`, IBM Plex Sans Thai + IBM Plex Mono, light/dark themes via `[data-theme]`, CSS variables for surfaces/borders/text/status colors. Already ported to Tailwind theme in `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css`.
- `app.jsx` — sidebar + topbar + content layout, theme toggle persisted to `localStorage('hj-theme')`.
- `pages.jsx` — 11 page mocks (Dashboard, AIInbox, Sales, PDFPreview, RiskCenter, Closing, Expenses, Projects, Tax, Settings).
- `data.js` — mock data **and** the real company seed: matches `prisma/seed.ts`. Defines `NAV` and the `STATS / RECENT_DOCS / INBOX / RISKS / PROJECTS` shapes that hint at the real entity fields.
- `icons.jsx` — small inline SVG icon set; replace with lucide-react in the real app, but keep the names so screens stay recognizable.
- `uploads/` — sample documents used as AI Inbox fixtures.

## Modules to build (PRD §14)

Eighteen modules total. Listed here so you can sequence work without re-reading the PRD: Auth, Company Settings, Users & Roles, Partners, Document Upload & Attachments, AI Document Inbox, Sales Documents, Purchase/Expense, Payments, Projects, Inventory, Fixed Assets, VAT/WHT, Journal, Bank Reconciliation, AI Risk Center, Month-End Closing, Accountant Pack. Sprint sequencing is in PRD §26.

Done so far: Auth, Company Settings (read-only), Users & Roles, Partners (CUSTOMER/VENDOR), Sales Documents (all 6 types, lifecycle + numbering + journal posting, PDF preview/queue), AI Inbox, Expenses/Receipts (incl. PP.36 + PND.54 foreign tax + prepaid), Payments, Inventory, Assets, **Projects (CRUD + profit)**, Bank Reconciliation (JSON + CSV import + match), Risk Center (5/11 detectors: TAX_ID_MISSING, MISSING_DOCUMENT, journal-imbalance, DUPLICATE_DOCUMENT, STOCK_NEGATIVE), Closing (locks docs + §17.4 hard-blocks), Accountant Pack (ZIP + ExportBatch history/re-download), Journal (auto from sales/expense/payment), Reports (P&L from journal), Tax (VAT/WHT dashboards + ภ.ง.ด.3/53/54 summaries + 50-ทวิ/foreign certificate).

Remaining risk detectors (6/11): VAT_RISK, WHT_RISK, UNMATCHED_BANK, LOW_PROFIT_PROJECT, EXPENSE_WITHOUT_APPROVAL, EDIT_AFTER_CONFIRM. No CRUD UI yet for the `ForeignWhtRate` (DTA) table — edit via seed/DB.

## Working in this directory

- Path is `D:/laragon/www/mini_acc` under Laragon — runs on Node, **not** under Laragon's PHP/Apache. Backend NestJS on `:4000`, frontend Next.js on `:3000`, DB is **Laragon's MySQL on `:3306`** (user `root`, no password — default Laragon). Do **not** run `pnpm db:up`; it would start the dockerized MariaDB on the same port and collide.
- **Git repo initialized.** Remote `https://github.com/sooksun/mini_acc.git`, main branch `master`.
- The user works in Thai by default — replies, commit messages, and UI strings should be Thai unless asked otherwise.

## Production deploy

- **URL**: `https://accounting.cnppai.com`
- **Server**: Ubuntu (CasaOS), deploy path `/DATA/AppData/www/mini_acc`
- **Compose file**: `docker-compose.prod.yml` — services: `api` (:9931), `web` (:9930), `redis`, `backup`
- **External DB**: MariaDB 11 on host via `host.docker.internal:3306`; password in `.env.production` (never commit)
- **Reverse proxy**: Nginx Proxy Manager — `/api/` proxied to port 9931, `/` to port 9930

Deploy commands after git push:
```bash
cd /DATA/AppData/www/mini_acc
git pull origin master
docker compose -f docker-compose.prod.yml --env-file .env.production build api web
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate --no-deps api web
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=50 api web
```

**Post-deploy checklist (do NOT skip):**
1. **Commit + push first.** If `git pull` on prod fetches nothing new, the Docker build is fully `CACHED` (incl. `COPY . .`) → the running container keeps the OLD code and you won't notice. A 100%-CACHED build = the change was never pushed.
2. **Run pending migrations** — the api entrypoint runs `seed` on start but NOT necessarily `migrate deploy`. After deploying any schema change, run it explicitly (idempotent): `docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx prisma migrate deploy`.
3. **Seed** runs automatically on api start (idempotent upserts — won't touch existing users/company). Re-run manually with `... exec api npx prisma db seed` if needed (e.g. to refresh the `ForeignWhtRate` DTA table).
4. **Backfill sales journals once** after the journal change: `curl -X POST https://accounting.cnppai.com/api/system/backfill-sales-journals -H "Authorization: Bearer <OWNER_TOKEN>"` — else historical sales revenue is missing from journal-based reports.
5. The Accountant Pack ZIP is written under `ATTACHMENT_DIR` — keep it on a persisted docker volume (same as attachments/PDFs) or re-downloads vanish on container recreate.

## UI patterns (confirmed)

- **File viewer popup**: open `window.open('about:blank', '_blank', 'noopener,noreferrer')` synchronously, then fetch blob and set `popup.location.href`. If `window.open` returns `null` (popup blocked), fall back to `a.download` — never show a "browser blocked" error to the user. See `ExpenseReceiptsPage.tsx` and `ai-inbox/page.tsx` for reference implementation.
- **Date picker**: all date inputs use `ThaiDatePicker` component (`apps/web/src/components/ui/ThaiDatePicker.tsx`) — antd DatePicker + dayjs buddhistEra plugin. Accepts/returns ISO `YYYY-MM-DD`. Never use `<input type="date">` for user-facing date fields.
- **Partner tax ID validation**: `PartnerPicker` blocks selection when `requireTaxId=true` and the partner's taxId is missing or not `/^\d{13}$/`. Shows distinct messages for missing vs. bad format.
- **Product type badge**: `ProductTypeBadge` maps `GOOD → 'สินค้า'`, `SERVICE → 'บริการ'`, `MATERIAL → 'วัสดุ'`. Line items in `SalesDocumentForm` store `productType` in `ItemRow` and pass it as `value.type` to the badge.
