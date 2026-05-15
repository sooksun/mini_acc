-- AlterTable
ALTER TABLE `expenserecord` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NULL,
    `name` VARCHAR(200) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `description` TEXT NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `budget` DECIMAL(18, 2) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Project_companyId_status_idx`(`companyId`, `status`),
    INDEX `Project_companyId_customerId_idx`(`companyId`, `customerId`),
    UNIQUE INDEX `Project_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `whtAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'PROMPT_PAY', 'OTHER') NOT NULL DEFAULT 'CASH',
    `reference` VARCHAR(100) NULL,
    `bankAccount` VARCHAR(100) NULL,
    `note` TEXT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'VOIDED') NOT NULL DEFAULT 'COMPLETED',
    `sourceType` VARCHAR(40) NULL,
    `sourceId` VARCHAR(191) NULL,
    `recordedBy` VARCHAR(191) NULL,
    `voidedBy` VARCHAR(191) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payment_companyId_direction_paymentDate_idx`(`companyId`, `direction`, `paymentDate`),
    INDEX `Payment_companyId_partnerId_idx`(`companyId`, `partnerId`),
    INDEX `Payment_companyId_status_idx`(`companyId`, `status`),
    INDEX `Payment_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalEntry` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `entryDate` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
    `sourceType` ENUM('SALES_DOCUMENT', 'EXPENSE_RECORD', 'PAYMENT', 'INVENTORY_MOVEMENT', 'FIXED_ASSET', 'MANUAL', 'ADJUSTMENT') NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `totalDebit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalCredit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `periodYear` INTEGER NOT NULL,
    `periodMonth` INTEGER NOT NULL,
    `postedBy` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `voidedBy` VARCHAR(191) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `JournalEntry_companyId_entryDate_idx`(`companyId`, `entryDate`),
    INDEX `JournalEntry_companyId_periodYear_periodMonth_idx`(`companyId`, `periodYear`, `periodMonth`),
    INDEX `JournalEntry_companyId_sourceType_sourceId_idx`(`companyId`, `sourceType`, `sourceId`),
    INDEX `JournalEntry_companyId_status_idx`(`companyId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalEntryLine` (
    `id` VARCHAR(191) NOT NULL,
    `journalEntryId` VARCHAR(191) NOT NULL,
    `lineNumber` INTEGER NOT NULL,
    `accountCode` VARCHAR(20) NOT NULL,
    `accountName` VARCHAR(120) NOT NULL,
    `debit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `partnerId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `description` TEXT NULL,

    INDEX `JournalEntryLine_journalEntryId_idx`(`journalEntryId`),
    INDEX `JournalEntryLine_accountCode_idx`(`accountCode`),
    INDEX `JournalEntryLine_partnerId_idx`(`partnerId`),
    INDEX `JournalEntryLine_projectId_idx`(`projectId`),
    UNIQUE INDEX `JournalEntryLine_journalEntryId_lineNumber_key`(`journalEntryId`, `lineNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountingPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` ENUM('OPEN', 'CLOSING', 'LOCKED', 'REOPENED') NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `closedBy` VARCHAR(191) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AccountingPeriod_companyId_status_idx`(`companyId`, `status`),
    UNIQUE INDEX `AccountingPeriod_companyId_year_month_key`(`companyId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VatRecord` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `recordType` ENUM('OUTPUT', 'INPUT') NOT NULL,
    `sourceType` VARCHAR(40) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `documentDate` DATETIME(3) NOT NULL,
    `documentNumber` VARCHAR(100) NULL,
    `partnerName` VARCHAR(200) NOT NULL,
    `partnerTaxId` VARCHAR(20) NULL,
    `baseAmount` DECIMAL(18, 2) NOT NULL,
    `vatRate` DECIMAL(5, 2) NOT NULL,
    `vatAmount` DECIMAL(18, 2) NOT NULL,
    `periodYear` INTEGER NOT NULL,
    `periodMonth` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VatRecord_companyId_recordType_periodYear_periodMonth_idx`(`companyId`, `recordType`, `periodYear`, `periodMonth`),
    UNIQUE INDEX `VatRecord_companyId_sourceType_sourceId_key`(`companyId`, `sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WithholdingTaxRecord` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `recordType` ENUM('PAYABLE', 'RECEIVABLE') NOT NULL,
    `paymentId` VARCHAR(191) NULL,
    `sourceType` VARCHAR(40) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `partnerName` VARCHAR(200) NOT NULL,
    `partnerTaxId` VARCHAR(20) NULL,
    `baseAmount` DECIMAL(18, 2) NOT NULL,
    `rate` DECIMAL(5, 2) NOT NULL,
    `whtAmount` DECIMAL(18, 2) NOT NULL,
    `certNumber` VARCHAR(100) NULL,
    `category` VARCHAR(100) NULL,
    `periodYear` INTEGER NOT NULL,
    `periodMonth` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WithholdingTaxRecord_paymentId_key`(`paymentId`),
    INDEX `WithholdingTaxRecord_companyId_recordType_periodYear_periodM_idx`(`companyId`, `recordType`, `periodYear`, `periodMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskItem` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('MISSING_DOCUMENT', 'DUPLICATE_DOCUMENT', 'VAT_RISK', 'WHT_RISK', 'UNMATCHED_BANK', 'LOW_PROFIT_PROJECT', 'STOCK_NEGATIVE', 'EXPENSE_WITHOUT_APPROVAL', 'EDIT_AFTER_CONFIRM', 'TAX_ID_MISSING', 'PDF_GENERATION_ERROR') NOT NULL,
    `level` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `status` ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'ACCEPTED_RISK', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    `entityType` VARCHAR(40) NULL,
    `entityId` VARCHAR(191) NULL,
    `title` VARCHAR(300) NOT NULL,
    `description` TEXT NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedBy` VARCHAR(191) NULL,
    `resolution` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RiskItem_companyId_status_level_idx`(`companyId`, `status`, `level`),
    INDEX `RiskItem_companyId_type_idx`(`companyId`, `type`),
    INDEX `RiskItem_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiSuggestion` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('DOCUMENT_EXTRACT', 'ACCOUNT_CLASSIFY', 'BANK_MATCH', 'RISK_FLAG', 'MONTHLY_SUMMARY') NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'OVERRIDDEN') NOT NULL DEFAULT 'PENDING',
    `sourceType` VARCHAR(40) NULL,
    `sourceId` VARCHAR(191) NULL,
    `attachmentId` VARCHAR(191) NULL,
    `confidence` DECIMAL(5, 4) NULL,
    `payload` JSON NOT NULL,
    `model` VARCHAR(100) NULL,
    `acceptedBy` VARCHAR(191) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiSuggestion_companyId_status_createdAt_idx`(`companyId`, `status`, `createdAt`),
    INDEX `AiSuggestion_companyId_type_status_idx`(`companyId`, `type`, `status`),
    INDEX `AiSuggestion_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryMovement` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `type` ENUM('IN', 'OUT', 'ADJUST', 'RETURN_IN', 'RETURN_OUT', 'OPENING_BALANCE') NOT NULL,
    `quantity` DECIMAL(18, 4) NOT NULL,
    `movementDate` DATETIME(3) NOT NULL,
    `unitCost` DECIMAL(18, 2) NULL,
    `totalCost` DECIMAL(18, 2) NULL,
    `referenceType` VARCHAR(40) NULL,
    `referenceId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `recordedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryMovement_companyId_productId_movementDate_idx`(`companyId`, `productId`, `movementDate`),
    INDEX `InventoryMovement_companyId_type_idx`(`companyId`, `type`),
    INDEX `InventoryMovement_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FixedAsset` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NULL,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `status` ENUM('ACTIVE', 'DISPOSED', 'WRITTEN_OFF') NOT NULL DEFAULT 'ACTIVE',
    `acquiredAt` DATETIME(3) NOT NULL,
    `cost` DECIMAL(18, 2) NOT NULL,
    `salvageValue` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `usefulLifeMonths` INTEGER NOT NULL,
    `accumulatedDepr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `bookValue` DECIMAL(18, 2) NOT NULL,
    `disposedAt` DATETIME(3) NULL,
    `disposalReason` TEXT NULL,
    `expenseRecordId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FixedAsset_expenseRecordId_key`(`expenseRecordId`),
    INDEX `FixedAsset_companyId_status_idx`(`companyId`, `status`),
    INDEX `FixedAsset_companyId_category_idx`(`companyId`, `category`),
    UNIQUE INDEX `FixedAsset_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankStatementLine` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `bankAccount` VARCHAR(100) NOT NULL,
    `postedAt` DATETIME(3) NOT NULL,
    `side` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `balance` DECIMAL(18, 2) NULL,
    `description` TEXT NOT NULL,
    `reference` VARCHAR(100) NULL,
    `matchedPaymentId` VARCHAR(191) NULL,
    `matchedAt` DATETIME(3) NULL,
    `matchConfidence` DECIMAL(5, 4) NULL,
    `importBatchId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BankStatementLine_matchedPaymentId_key`(`matchedPaymentId`),
    INDEX `BankStatementLine_companyId_bankAccount_postedAt_idx`(`companyId`, `bankAccount`, `postedAt`),
    INDEX `BankStatementLine_importBatchId_idx`(`importBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ExpenseRecord_companyId_projectId_idx` ON `ExpenseRecord`(`companyId`, `projectId`);

-- AddForeignKey
ALTER TABLE `ExpenseRecord` ADD CONSTRAINT `ExpenseRecord_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Partner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntryLine` ADD CONSTRAINT `JournalEntryLine_journalEntryId_fkey` FOREIGN KEY (`journalEntryId`) REFERENCES `JournalEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountingPeriod` ADD CONSTRAINT `AccountingPeriod_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VatRecord` ADD CONSTRAINT `VatRecord_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WithholdingTaxRecord` ADD CONSTRAINT `WithholdingTaxRecord_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WithholdingTaxRecord` ADD CONSTRAINT `WithholdingTaxRecord_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskItem` ADD CONSTRAINT `RiskItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiSuggestion` ADD CONSTRAINT `AiSuggestion_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedAsset` ADD CONSTRAINT `FixedAsset_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedAsset` ADD CONSTRAINT `FixedAsset_expenseRecordId_fkey` FOREIGN KEY (`expenseRecordId`) REFERENCES `ExpenseRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedAsset` ADD CONSTRAINT `FixedAsset_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_matchedPaymentId_fkey` FOREIGN KEY (`matchedPaymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
