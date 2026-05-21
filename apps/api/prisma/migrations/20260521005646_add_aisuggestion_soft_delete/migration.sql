-- AlterTable
ALTER TABLE `AiSuggestion` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedBy` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `AiSuggestion_companyId_deletedAt_idx` ON `AiSuggestion`(`companyId`, `deletedAt`);
