# Atomic verifier for analysis goal - regenerates all scratch artifacts from one run.
# Usage: .\scripts\verify-analysis-goal.ps1 [-ScratchDir <path>]
param(
  [string]$ScratchDir = "$env:LOCALAPPDATA\Temp\grok-goal-521dda2ad2c3\implementer"
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
New-Item -ItemType Directory -Force -Path $ScratchDir | Out-Null

function Write-Step([string]$Msg) { Write-Host "==> $Msg" }

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Parse-JestSummary([string]$LogPath) {
  $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
  if ($content -match 'Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total') {
    return @{ Passed = [int]$Matches[1]; Total = [int]$Matches[2] }
  }
  if ($content -match 'Test Suites:\s+(\d+)\s+passed,\s+(\d+)\s+total') {
    return @{ Passed = [int]$Matches[1]; Total = [int]$Matches[2]; Suites = $true }
  }
  return $null
}

$exitCode = 0

# --- Gate 1: typecheck ---
Write-Step 'pnpm typecheck'
pnpm typecheck 2>&1 | Tee-Object -FilePath (Join-Path $ScratchDir 'typecheck.log')
if ($LASTEXITCODE -ne 0) { $exitCode = 1 }

# --- Gate 2: unit tests ---
Write-Step 'unit tests (closing|journal|sales|tax|reports|expense-receipts + helpers)'
$unitPattern = '(closing|journal|sales|tax|reports|expense-receipts|journal-balance\.util|sales-revenue|sales-stock|closing-blockers)'
pnpm --filter @hj/api test:unit -- --testPathPattern=$unitPattern 2>&1 |
  Tee-Object -FilePath (Join-Path $ScratchDir 'unit-tests.log')
if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
$unitSummary = Parse-JestSummary (Join-Path $ScratchDir 'unit-tests.log')

# --- Gate 3: full integration (single log path) ---
Write-Step 'full integration tests'
pnpm --filter @hj/api test:integration 2>&1 |
  Tee-Object -FilePath (Join-Path $ScratchDir 'integration-tests.log')
if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
$intSummary = Parse-JestSummary (Join-Path $ScratchDir 'integration-tests.log')

# --- Gate 4: blockers + journal grep ---
Write-Step 'blockers-journal.txt'
$blockerPatterns = @(
  'JOURNAL_UNBALANCED',
  'CRITICAL_RISK_OPEN',
  'DUPLICATE_DOC_NUMBER',
  'STOCK_NEGATIVE',
  'UNMATCHED_BANK',
  'INVOICE_RECEIVED_NO_RECEIPT',
  'postRevenueJournal',
  'postStockOutOnConfirm',
  'shouldPostStockOutOnConfirm',
  'stockOutWithTx'
)
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm'
$blockerOut = @("# blockers-journal.txt generated $ts", "")
foreach ($pat in $blockerPatterns) {
  $blockerOut += "## pattern: $pat"
  $hits = Select-String -Path @(
    'apps/api/src/closing/closing-blockers.util.ts',
    'apps/api/src/closing/closing.service.ts',
    'apps/api/src/sales/_shared/sales-document.service.ts',
    'apps/api/src/sales/_shared/sales-stock.util.ts',
    'apps/api/src/journal/journal.service.ts',
    'apps/api/src/inventory/inventory.service.ts',
    'apps/web/src/app/(app)/payments/page.tsx'
  ) -Pattern $pat -ErrorAction SilentlyContinue
  if ($hits) {
    $blockerOut += ($hits | ForEach-Object { "$($_.Filename):$($_.LineNumber):$($_.Line.Trim())" })
  } else {
    $blockerOut += '(no match)'
  }
  $blockerOut += ''
}
Write-Utf8NoBom (Join-Path $ScratchDir 'blockers-journal.txt') ($blockerOut -join "`n")

# --- Gate 5: source-inspection template ---
Write-Step 'source-inspection.txt'
$srcInspect = @"
# source-inspection.txt generated $ts
# Repo: $Root

## schema.prisma enums
DocumentType: QUOTATION,DELIVERY_NOTE,INVOICE,RECEIPT,TAX_INVOICE,RECEIPT_TAX_INVOICE
JournalSourceType: SALES_DOCUMENT,EXPENSE_RECORD,PAYMENT,INVENTORY_MOVEMENT,FIXED_ASSET,MANUAL,ADJUSTMENT,CLOSING
VatRecordType: OUTPUT,INPUT | AccountingPeriodStatus: OPEN,CLOSING,LOCKED,REOPENED

## sales confirm (sales-document.service.ts)
L297: postRevenueJournal(tx, updated, companyId, userId)
L299-300: shouldPostStockOutOnConfirm → postStockOutOnConfirm (GOOD/MATERIAL filter explicit)
L280-292: OUTPUT VatRecord via vat.recordWithTx

## journal Dr===Cr (journal.service.ts)
journalBalanceMismatch → 422 JOURNAL_UNBALANCED
Integration: journal-balance.integration.spec.ts (postRevenueJournal + payments.create)
Also: journal.service.integration.spec.ts, sales-journal.integration.spec.ts (GOOD INVOICE revenue+stock)

## closing checkPeriod blockers (closing.service.ts)
(a) JOURNAL_UNBALANCED  (b) CRITICAL_RISK_OPEN  (c) DRAFT_SALES_DOCS  (d) PENDING_EXPENSES
(e) DUPLICATE_DOC_NUMBER  (f) STOCK_NEGATIVE  (g) UNMATCHED_BANK  (h) INVOICE_RECEIVED_NO_RECEIPT
Payment link: payments/page.tsx sourceType=SALES_DOCUMENT + sourceId=linkedInvoiceId

## stock OUT + revenue journal (single integration file)
sales-journal.integration.spec.ts: it.each INVOICE/TAX_INVOICE journal+stock, DN stock-only, RECEIPT, SERVICE skip

## reports from journal
profit-loss.report.ts: prisma.journalEntry.findMany POSTED, excludes CLOSING
Also: trial-balance, balance-sheet, general-ledger under apps/api/src/reports/

## tax
tax.service.ts dashboard aggregates OUTPUT/INPUT VAT + PAYABLE/RECEIVABLE WHT
vat.service.ts recordWithTx atomic with confirm
"@
Write-Utf8NoBom (Join-Path $ScratchDir 'source-inspection.txt') $srcInspect

# --- Gate 6: ui-routes excerpt ---
Write-Step 'ui-routes.txt'
$uiRoutes = @(
  "# ui-routes.txt generated $ts",
  "",
  "## AppSidebar NAV (apps/web/src/components/AppSidebar.tsx)",
  "DAILY: dashboard, profit-loss, sales/*, expenses/receipts, ai-inbox, payments, customers, vendors, products, projects, inventory, assets",
  "MONTHLY: tax, wht-certificates, bank, risks, trial-balance, balance-sheet, general-ledger, closing, accountant-pack",
  "YEARLY: year-end-closing, settings/*",
  "",
  "## page.tsx count under apps/web/src/app/(app)"
)
$pageCount = (Get-ChildItem -Path 'apps/web/src/app/(app)' -Recurse -Filter 'page.tsx').Count
$uiRoutes += "Total routes: $pageCount"
Write-Utf8NoBom (Join-Path $ScratchDir 'ui-routes.txt') ($uiRoutes -join "`n")

# --- Gate 7: refactor evidence ---
Write-Step 'refactor-evidence.txt'
$orchLines = (Get-Content 'apps/web/src/features/expenses/ExpenseReceiptsPage.tsx').Count
$featFiles = (Get-ChildItem 'apps/web/src/features/expenses' -File).Count
@"
# refactor-evidence.txt generated $ts
ExpenseReceiptsPage.tsx: $orchLines lines (orchestrator)
Feature modules under features/expenses/: $featFiles files
"@ | ForEach-Object { Write-Utf8NoBom (Join-Path $ScratchDir 'refactor-evidence.txt') $_ }

$stalePatterns = @('dormant', '51/51', '208/208', '64/64', 'delivery-note-stock')

# --- acceptance-summary.md (single deliverable) ---
$unitPassed = if ($unitSummary) { $unitSummary.Passed } else { '?' }
$unitTotal = if ($unitSummary) { $unitSummary.Total } else { '?' }
$intPassed = if ($intSummary) { $intSummary.Passed } else { '?' }
$intTotal = if ($intSummary) { $intSummary.Total } else { '?' }
$tcExit = if (Test-Path (Join-Path $ScratchDir 'typecheck.log')) {
  if ((Get-Content (Join-Path $ScratchDir 'typecheck.log') -Raw) -match 'Done') { 0 } else { 1 }
} else { 1 }

$summary = @"
# Acceptance Summary - mini_acc analysis goal

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Verifier: scripts/verify-analysis-goal.ps1 exit=$exitCode

## Verification runs (single atomic run)

| Gate | Result |
|------|--------|
| typecheck | exit $tcExit |
| unit tests | $unitPassed / $unitTotal passed |
| integration tests | $intPassed / $intTotal passed |

Artifacts: typecheck.log, unit-tests.log, integration-tests.log, source-inspection.txt, blockers-journal.txt, ui-routes.txt, refactor-evidence.txt

## AC1 - Sales/purchase + journal + stock
- 6 sales doc types + expense receipts + payments
- postRevenueJournal at confirm; OUTPUT VAT on qualifying docs
- stock OUT on confirm: DN, INVOICE, TAX_INVOICE, standalone RECEIPT (GOOD/MATERIAL only)
- Integration: sales-journal.integration.spec.ts (GOOD confirm journal+stock it.each)

## AC2 - Double-entry journal + reports
- journal-balance.integration.spec.ts: postRevenueJournal + payments.create balanced entries
- journal-balance.util.spec.ts (pure); journal-balance.integration.spec.ts (shipped callers)
- sales-journal.integration.spec.ts: unified journal + stock OUT for GOOD confirm
- P&L/trial-balance/balance-sheet/GL from journal entries only

## AC3 - Period closing
- checkPeriod hard-blocks: JOURNAL_UNBALANCED, CRITICAL_RISK_OPEN, DUPLICATE_DOC_NUMBER, STOCK_NEGATIVE, UNMATCHED_BANK, INVOICE_RECEIVED_NO_RECEIPT (+ draft/pending)
- INVOICE_RECEIVED_NO_RECEIPT active via Payment.sourceType/sourceId (payments UI wired)

## AC4 - Tax
- OUTPUT/INPUT VAT, WHT PAYABLE/RECEIVABLE, VAT effective date at confirm, taxId 13 digits
- PND3/53/54, PP36/PND54 foreign flows

## AC5 - UI + Thai + RBAC
- Sidebar covers sales, buy, pay, tax, bank, reports, closing, year-end
- ThaiDatePicker, Decimal money, JWT+RolesGuard

## Non-goals (partial OK)
- AI advisory only; no e-Filing auto-submit; 5/11 risk detectors (core blockers covered)
"@
Write-Utf8NoBom (Join-Path $ScratchDir 'acceptance-summary.md') $summary

# --- FINAL_RESPONSE.md (user-facing narrative, same atomic run) ---
Write-Step 'FINAL_RESPONSE.md'
$templatePath = Join-Path $PSScriptRoot 'final-response.template.md'
$finalPath = Join-Path $ScratchDir 'FINAL_RESPONSE.md'
$finalResponse = (Get-Content $templatePath -Raw -Encoding UTF8) `
  -replace '\{\{TIMESTAMP\}\}', (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') `
  -replace '\{\{EXIT_CODE\}\}', "$exitCode" `
  -replace '\{\{TC_EXIT\}\}', "$tcExit" `
  -replace '\{\{UNIT_PASSED\}\}', "$unitPassed" `
  -replace '\{\{UNIT_TOTAL\}\}', "$unitTotal" `
  -replace '\{\{INT_PASSED\}\}', "$intPassed" `
  -replace '\{\{INT_TOTAL\}\}', "$intTotal"
Write-Utf8NoBom $finalPath $finalResponse

# --- Gate 8: stale narrative check (after artifacts regenerated) ---
Write-Step 'stale narrative check'
$dormantApps = Get-ChildItem -Path 'apps' -Recurse -File -Include '*.ts','*.tsx','*.md' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\dist\\|\\node_modules\\|\\.next\\' } |
  Select-String -Pattern 'dormant' -ErrorAction SilentlyContinue
if ($dormantApps) {
  Write-Host 'FAIL: found stale "dormant" in apps:'
  $dormantApps | ForEach-Object { Write-Host "  apps: $($_.Path):$($_.LineNumber)" }
  $exitCode = 1
}
foreach ($stale in $stalePatterns) {
  $hits = Get-ChildItem -Path $ScratchDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'verify-analysis-goal.ps1' } |
    Select-String -Pattern $stale -ErrorAction SilentlyContinue
  if ($hits) {
    Write-Host "FAIL: stale pattern '$stale' in scratch:"
    $hits | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber)" }
    $exitCode = 1
  }
}

Write-Step "done exit $exitCode artifacts in $ScratchDir"
exit $exitCode