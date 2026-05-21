-- AlterTable
ALTER TABLE `ExpenseReceipt` ADD COLUMN `treatAsPrepaid` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `ExpenseRecord` ADD COLUMN `treatAsPrepaid` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `PrepaidScheduleEntry` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `expenseRecordId` VARCHAR(191) NOT NULL,
    `periodYear` INTEGER NOT NULL,
    `periodMonth` INTEGER NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `status` ENUM('PENDING', 'RECOGNIZED') NOT NULL DEFAULT 'PENDING',
    `journalEntryId` VARCHAR(191) NULL,
    `recognizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PrepaidScheduleEntry_companyId_status_periodYear_periodMonth_idx`(`companyId`, `status`, `periodYear`, `periodMonth`),
    INDEX `PrepaidScheduleEntry_expenseRecordId_idx`(`expenseRecordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PrepaidScheduleEntry` ADD CONSTRAINT `PrepaidScheduleEntry_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrepaidScheduleEntry` ADD CONSTRAINT `PrepaidScheduleEntry_expenseRecordId_fkey` FOREIGN KEY (`expenseRecordId`) REFERENCES `ExpenseRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
