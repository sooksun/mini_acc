-- AlterTable
ALTER TABLE `journalentry` MODIFY `sourceType` ENUM('SALES_DOCUMENT', 'EXPENSE_RECORD', 'PAYMENT', 'INVENTORY_MOVEMENT', 'FIXED_ASSET', 'MANUAL', 'ADJUSTMENT', 'CLOSING') NOT NULL;

-- CreateTable
CREATE TABLE `ChartAccount` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    `normalBalance` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChartAccount_companyId_type_idx`(`companyId`, `type`),
    UNIQUE INDEX `ChartAccount_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChartAccount` ADD CONSTRAINT `ChartAccount_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
