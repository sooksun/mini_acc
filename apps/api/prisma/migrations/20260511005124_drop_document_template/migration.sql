-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `nameTh` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `taxId` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `brandShort` VARCHAR(191) NULL,
    `tagline` VARCHAR(191) NULL,
    `registeredAt` DATETIME(3) NOT NULL,
    `vatEffectiveDate` DATETIME(3) NULL,
    `capital` DECIMAL(18, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Company_taxId_key`(`taxId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyVatStatus` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_REGISTERED', 'REGISTERED', 'CANCELLED') NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL,
    `effectiveTo` DATETIME(3) NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CompanyVatStatus_companyId_effectiveFrom_idx`(`companyId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `initial` VARCHAR(191) NULL,
    `role` ENUM('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER', 'AI_AGENT') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentNumberingRule` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('QUOTATION', 'DELIVERY_NOTE', 'INVOICE', 'RECEIPT', 'TAX_INVOICE', 'RECEIPT_TAX_INVOICE', 'PURCHASE', 'EXPENSE', 'WHT_CERTIFICATE', 'BANK_STATEMENT') NOT NULL,
    `prefix` VARCHAR(8) NOT NULL,
    `padding` INTEGER NOT NULL DEFAULT 4,
    `resetPolicy` ENUM('YEARLY', 'NEVER') NOT NULL DEFAULT 'YEARLY',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DocumentNumberingRule_companyId_type_key`(`companyId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentNumberingCounter` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('QUOTATION', 'DELIVERY_NOTE', 'INVOICE', 'RECEIPT', 'TAX_INVOICE', 'RECEIPT_TAX_INVOICE', 'PURCHASE', 'EXPENSE', 'WHT_CERTIFICATE', 'BANK_STATEMENT') NOT NULL,
    `beYear` INTEGER NOT NULL,
    `currentValue` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DocumentNumberingCounter_companyId_type_beYear_idx`(`companyId`, `type`, `beYear`),
    UNIQUE INDEX `DocumentNumberingCounter_companyId_type_beYear_key`(`companyId`, `type`, `beYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Partner` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('CUSTOMER', 'VENDOR', 'BOTH') NOT NULL DEFAULT 'CUSTOMER',
    `code` VARCHAR(32) NULL,
    `nameTh` VARCHAR(200) NOT NULL,
    `nameEn` VARCHAR(200) NULL,
    `taxId` VARCHAR(20) NULL,
    `branch` VARCHAR(50) NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(120) NULL,
    `website` VARCHAR(200) NULL,
    `note` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Partner_companyId_type_isActive_idx`(`companyId`, `type`, `isActive`),
    INDEX `Partner_companyId_taxId_idx`(`companyId`, `taxId`),
    UNIQUE INDEX `Partner_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerContact` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `position` VARCHAR(100) NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(120) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerContact_partnerId_idx`(`partnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('GOOD', 'SERVICE', 'MATERIAL', 'ASSET') NOT NULL DEFAULT 'SERVICE',
    `code` VARCHAR(32) NULL,
    `nameTh` VARCHAR(200) NOT NULL,
    `nameEn` VARCHAR(200) NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `unitPrice` DECIMAL(18, 2) NOT NULL,
    `vatable` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_companyId_type_isActive_idx`(`companyId`, `type`, `isActive`),
    UNIQUE INDEX `Product_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesDocument` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('QUOTATION', 'DELIVERY_NOTE', 'INVOICE', 'RECEIPT', 'TAX_INVOICE', 'RECEIPT_TAX_INVOICE', 'PURCHASE', 'EXPENSE', 'WHT_CERTIFICATE', 'BANK_STATEMENT') NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `beYear` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'AI_EXTRACTED', 'PENDING_REVIEW', 'USER_CONFIRMED', 'ACCOUNTED', 'PENDING_ACCOUNTANT', 'ACCOUNTANT_APPROVED', 'LOCKED', 'VOIDED') NOT NULL DEFAULT 'DRAFT',
    `customerId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `parentDocumentId` VARCHAR(191) NULL,
    `documentDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `reference` VARCHAR(100) NULL,
    `note` TEXT NULL,
    `customerSnapshotName` VARCHAR(200) NOT NULL,
    `customerSnapshotAddress` TEXT NULL,
    `customerSnapshotTaxId` VARCHAR(20) NULL,
    `customerSnapshotBranch` VARCHAR(50) NULL,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 7,
    `vatAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalAfterVat` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `whtRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `whtAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `netReceived` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `confirmedAt` DATETIME(3) NULL,
    `confirmedBy` VARCHAR(191) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidedBy` VARCHAR(191) NULL,
    `voidReason` TEXT NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,
    `pdfPath` VARCHAR(500) NULL,
    `pdfGeneratedAt` DATETIME(3) NULL,
    `pdfGeneratedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `SalesDocument_companyId_type_status_documentDate_idx`(`companyId`, `type`, `status`, `documentDate`),
    INDEX `SalesDocument_companyId_customerId_idx`(`companyId`, `customerId`),
    INDEX `SalesDocument_companyId_status_idx`(`companyId`, `status`),
    INDEX `SalesDocument_beYear_type_idx`(`beYear`, `type`),
    UNIQUE INDEX `SalesDocument_companyId_type_number_key`(`companyId`, `type`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesDocumentItem` (
    `id` VARCHAR(191) NOT NULL,
    `salesDocumentId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `lineNumber` INTEGER NOT NULL,
    `productCode` VARCHAR(32) NULL,
    `description` TEXT NOT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `quantity` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 2) NOT NULL,
    `discount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `lineTotal` DECIMAL(18, 2) NOT NULL,
    `vatable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SalesDocumentItem_salesDocumentId_idx`(`salesDocumentId`),
    UNIQUE INDEX `SalesDocumentItem_salesDocumentId_lineNumber_key`(`salesDocumentId`, `lineNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `targetType` ENUM('SALES_DOCUMENT', 'PURCHASE_DOCUMENT', 'PAYMENT', 'EXPENSE', 'OTHER') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(300) NOT NULL,
    `storedPath` VARCHAR(500) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(64) NULL,
    `uploadedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_companyId_targetType_targetId_idx`(`companyId`, `targetType`, `targetId`),
    INDEX `Attachment_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratedPdf` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `documentType` ENUM('QUOTATION', 'DELIVERY_NOTE', 'INVOICE', 'RECEIPT', 'TAX_INVOICE', 'RECEIPT_TAX_INVOICE', 'PURCHASE', 'EXPENSE', 'WHT_CERTIFICATE', 'BANK_STATEMENT') NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `storedPath` VARCHAR(500) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `isPreview` BOOLEAN NOT NULL DEFAULT false,
    `dataVersion` INTEGER NOT NULL DEFAULT 1,
    `generatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GeneratedPdf_companyId_documentType_documentId_idx`(`companyId`, `documentType`, `documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CompanyVatStatus` ADD CONSTRAINT `CompanyVatStatus_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentNumberingRule` ADD CONSTRAINT `DocumentNumberingRule_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentNumberingCounter` ADD CONSTRAINT `DocumentNumberingCounter_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Partner` ADD CONSTRAINT `Partner_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerContact` ADD CONSTRAINT `PartnerContact_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesDocument` ADD CONSTRAINT `SalesDocument_parentDocumentId_fkey` FOREIGN KEY (`parentDocumentId`) REFERENCES `SalesDocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesDocument` ADD CONSTRAINT `SalesDocument_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesDocument` ADD CONSTRAINT `SalesDocument_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Partner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesDocumentItem` ADD CONSTRAINT `SalesDocumentItem_salesDocumentId_fkey` FOREIGN KEY (`salesDocumentId`) REFERENCES `SalesDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesDocumentItem` ADD CONSTRAINT `SalesDocumentItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratedPdf` ADD CONSTRAINT `GeneratedPdf_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
