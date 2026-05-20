-- AlterTable
ALTER TABLE `expensereceipt` ADD COLUMN `billedToName` VARCHAR(200) NULL,
    ADD COLUMN `billingNameMismatch` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `intangibleUsefulLifeMonths` INTEGER NULL,
    ADD COLUMN `serviceEnd` DATETIME(3) NULL,
    ADD COLUMN `serviceStart` DATETIME(3) NULL,
    ADD COLUMN `treatAsIntangible` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `expenserecord` ADD COLUMN `serviceEnd` DATETIME(3) NULL,
    ADD COLUMN `serviceStart` DATETIME(3) NULL,
    ADD COLUMN `treatAsIntangible` BOOLEAN NOT NULL DEFAULT false;
