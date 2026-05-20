-- AlterTable
ALTER TABLE `expensereceipt` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'THB',
    ADD COLUMN `dtaCountry` VARCHAR(2) NULL,
    ADD COLUMN `expenseNature` ENUM('GOODS', 'SERVICE') NULL,
    ADD COLUMN `foreignSubtotal` DECIMAL(18, 2) NULL,
    ADD COLUMN `fxRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    ADD COLUMN `isForeign` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reverseChargeVat` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reverseChargeVatRate` DECIMAL(5, 2) NOT NULL DEFAULT 7,
    ADD COLUMN `usedInThailand` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `expenserecord` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'THB',
    ADD COLUMN `expenseNature` ENUM('GOODS', 'SERVICE') NULL,
    ADD COLUMN `foreignSubtotal` DECIMAL(18, 2) NULL,
    ADD COLUMN `fxRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    ADD COLUMN `isForeign` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ForeignTaxObligation` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `expenseRecordId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PP36_VAT', 'PND54_WHT') NOT NULL,
    `status` ENUM('PENDING', 'FILED', 'CREDITED') NOT NULL DEFAULT 'PENDING',
    `baseAmount` DECIMAL(18, 2) NOT NULL,
    `rate` DECIMAL(5, 2) NOT NULL,
    `taxAmount` DECIMAL(18, 2) NOT NULL,
    `expensePeriodYear` INTEGER NOT NULL,
    `expensePeriodMonth` INTEGER NOT NULL,
    `filePeriodYear` INTEGER NOT NULL,
    `filePeriodMonth` INTEGER NOT NULL,
    `filedAt` DATETIME(3) NULL,
    `filedBy` VARCHAR(191) NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ForeignTaxObligation_companyId_kind_status_idx`(`companyId`, `kind`, `status`),
    INDEX `ForeignTaxObligation_companyId_filePeriodYear_filePeriodMont_idx`(`companyId`, `filePeriodYear`, `filePeriodMonth`),
    INDEX `ForeignTaxObligation_expenseRecordId_idx`(`expenseRecordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ForeignTaxObligation` ADD CONSTRAINT `ForeignTaxObligation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForeignTaxObligation` ADD CONSTRAINT `ForeignTaxObligation_expenseRecordId_fkey` FOREIGN KEY (`expenseRecordId`) REFERENCES `ExpenseRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
