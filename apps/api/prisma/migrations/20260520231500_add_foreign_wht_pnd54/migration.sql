-- AlterTable
ALTER TABLE `expensereceipt` ADD COLUMN `foreignWhtBorneBy` ENUM('WITHHELD', 'RECOVERABLE', 'GROSSED_UP') NULL,
    ADD COLUMN `foreignWhtRate` DECIMAL(5, 2) NULL,
    ADD COLUMN `foreignWhtType` ENUM('ROYALTY', 'SERVICE', 'OTHER') NULL;

-- AlterTable
ALTER TABLE `expenserecord` ADD COLUMN `foreignWhtBorneBy` ENUM('WITHHELD', 'RECOVERABLE', 'GROSSED_UP') NULL,
    ADD COLUMN `foreignWhtRate` DECIMAL(5, 2) NULL,
    ADD COLUMN `foreignWhtType` ENUM('ROYALTY', 'SERVICE', 'OTHER') NULL;

-- CreateTable
CREATE TABLE `ForeignWhtRate` (
    `id` VARCHAR(191) NOT NULL,
    `country` VARCHAR(2) NOT NULL,
    `incomeType` ENUM('ROYALTY', 'SERVICE', 'OTHER') NOT NULL,
    `rate` DECIMAL(5, 2) NOT NULL,
    `note` VARCHAR(200) NULL,

    UNIQUE INDEX `ForeignWhtRate_country_incomeType_key`(`country`, `incomeType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed DTA reference rates (suggestions only — the accountant confirms the final rate).
INSERT INTO `ForeignWhtRate` (`id`, `country`, `incomeType`, `rate`, `note`) VALUES
  ('fwr_def_roy', '*', 'ROYALTY', 15.00, 'มาตรา 70 กรณีไม่มีอนุสัญญา — ตรวจกับนักบัญชี'),
  ('fwr_def_svc', '*', 'SERVICE', 15.00, 'ค่าบริการ/กำไรธุรกิจ — ตรวจ PE และอนุสัญญา'),
  ('fwr_def_oth', '*', 'OTHER', 15.00, 'อื่น ๆ — ตรวจกับนักบัญชี'),
  ('fwr_us_roy', 'US', 'ROYALTY', 5.00, 'อนุสัญญาไทย-สหรัฐฯ ค่าสิทธิซอฟต์แวร์'),
  ('fwr_us_svc', 'US', 'SERVICE', 0.00, 'กำไรธุรกิจ ไม่มี PE ในไทย — ตรวจเงื่อนไข');
