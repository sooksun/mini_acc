-- CreateTable
CREATE TABLE `ExportBatch` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `fileName` VARCHAR(200) NOT NULL,
    `storedPath` VARCHAR(500) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `fileCount` INTEGER NOT NULL DEFAULT 0,
    `generatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExportBatch_companyId_year_month_idx`(`companyId`, `year`, `month`),
    INDEX `ExportBatch_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExportBatch` ADD CONSTRAINT `ExportBatch_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
