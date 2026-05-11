-- CreateTable
CREATE TABLE `ExpenseReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `status` ENUM('UPLOADED', 'PENDING_VENDOR_APPROVAL', 'READY_TO_ACCOUNT', 'ACCOUNTED', 'REJECTED') NOT NULL DEFAULT 'UPLOADED',
    `vendorId` VARCHAR(191) NULL,
    `proposedVendorName` VARCHAR(200) NULL,
    `proposedVendorTaxId` VARCHAR(20) NULL,
    `proposedVendorBranch` VARCHAR(50) NULL,
    `proposedVendorAddress` TEXT NULL,
    `documentNumber` VARCHAR(100) NULL,
    `documentDate` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `category` VARCHAR(100) NULL,
    `note` TEXT NULL,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `vatAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `withholdingTaxAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `originalFileName` VARCHAR(300) NOT NULL,
    `storedPath` VARCHAR(500) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(64) NULL,
    `uploadedBy` VARCHAR(191) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `accountedBy` VARCHAR(191) NULL,
    `accountedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseReceipt_companyId_status_createdAt_idx`(`companyId`, `status`, `createdAt`),
    INDEX `ExpenseReceipt_companyId_vendorId_idx`(`companyId`, `vendorId`),
    INDEX `ExpenseReceipt_companyId_proposedVendorTaxId_idx`(`companyId`, `proposedVendorTaxId`),
    INDEX `ExpenseReceipt_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseRecord` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `status` ENUM('RECORDED', 'VOIDED') NOT NULL DEFAULT 'RECORDED',
    `expenseDate` DATETIME(3) NOT NULL,
    `documentNumber` VARCHAR(100) NULL,
    `category` VARCHAR(100) NULL,
    `note` TEXT NULL,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `vatAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `withholdingTaxAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `recordedBy` VARCHAR(191) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ExpenseRecord_receiptId_key`(`receiptId`),
    INDEX `ExpenseRecord_companyId_vendorId_expenseDate_idx`(`companyId`, `vendorId`, `expenseDate`),
    INDEX `ExpenseRecord_companyId_status_expenseDate_idx`(`companyId`, `status`, `expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExpenseReceipt` ADD CONSTRAINT `ExpenseReceipt_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseReceipt` ADD CONSTRAINT `ExpenseReceipt_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Partner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRecord` ADD CONSTRAINT `ExpenseRecord_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRecord` ADD CONSTRAINT `ExpenseRecord_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `ExpenseReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRecord` ADD CONSTRAINT `ExpenseRecord_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Partner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
