-- CreateTable
CREATE TABLE `Household` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(60) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(80) NOT NULL,
    `tonePalette` VARCHAR(30) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_tonePalette_key`(`tonePalette`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `type` ENUM('bank', 'cash', 'credit_card', 'other') NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Account_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentMethod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentMethod_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurrenceRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `description` VARCHAR(200) NOT NULL,
    `expectedAmount` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `dayOfMonth` TINYINT NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `state` ENUM('active', 'paused', 'ended') NOT NULL DEFAULT 'active',
    `scope` ENUM('household', 'personal') NOT NULL,
    `ownerId` INTEGER NULL,
    `payerId` INTEGER NULL,
    `categoryId` INTEGER NULL,
    `accountId` INTEGER NULL,
    `paymentMethodId` INTEGER NULL,
    `createdById` INTEGER NOT NULL,
    `updatedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecurrenceRule_ownerId_idx`(`ownerId`),
    INDEX `RecurrenceRule_payerId_idx`(`payerId`),
    INDEX `RecurrenceRule_categoryId_idx`(`categoryId`),
    INDEX `RecurrenceRule_accountId_idx`(`accountId`),
    INDEX `RecurrenceRule_paymentMethodId_idx`(`paymentMethodId`),
    INDEX `RecurrenceRule_createdById_idx`(`createdById`),
    INDEX `RecurrenceRule_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurrenceOccurrence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ruleId` INTEGER NOT NULL,
    `periodKey` VARCHAR(7) NOT NULL,
    `dueDate` DATE NOT NULL,
    `expectedAmount` DECIMAL(12, 2) NULL,
    `status` ENUM('planned', 'confirmed', 'cancelled') NOT NULL DEFAULT 'planned',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecurrenceOccurrence_dueDate_idx`(`dueDate`),
    UNIQUE INDEX `RecurrenceOccurrence_ruleId_periodKey_key`(`ruleId`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstallmentPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `description` VARCHAR(200) NOT NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `installmentCount` INTEGER NOT NULL,
    `firstDueDate` DATE NOT NULL,
    `scope` ENUM('household', 'personal') NOT NULL,
    `ownerId` INTEGER NULL,
    `payerId` INTEGER NULL,
    `categoryId` INTEGER NULL,
    `accountId` INTEGER NULL,
    `notes` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `updatedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InstallmentPlan_ownerId_idx`(`ownerId`),
    INDEX `InstallmentPlan_payerId_idx`(`payerId`),
    INDEX `InstallmentPlan_categoryId_idx`(`categoryId`),
    INDEX `InstallmentPlan_accountId_idx`(`accountId`),
    INDEX `InstallmentPlan_createdById_idx`(`createdById`),
    INDEX `InstallmentPlan_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstallmentOccurrence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `sequenceNumber` INTEGER NOT NULL,
    `dueDate` DATE NOT NULL,
    `expectedAmount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('planned', 'confirmed', 'cancelled') NOT NULL DEFAULT 'planned',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InstallmentOccurrence_dueDate_idx`(`dueDate`),
    UNIQUE INDEX `InstallmentOccurrence_planId_sequenceNumber_key`(`planId`, `sequenceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('expense', 'income', 'other_receipt', 'refund', 'transfer') NOT NULL,
    `status` ENUM('planned', 'confirmed', 'cancelled', 'voided') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `description` VARCHAR(200) NOT NULL,
    `transactionDate` DATE NOT NULL,
    `expectedDate` DATE NULL,
    `categoryId` INTEGER NULL,
    `accountId` INTEGER NULL,
    `paymentMethodId` INTEGER NULL,
    `payerId` INTEGER NULL,
    `scope` ENUM('household', 'personal') NOT NULL,
    `ownerId` INTEGER NULL,
    `source` ENUM('manual', 'import') NOT NULL DEFAULT 'manual',
    `externalRef` VARCHAR(120) NULL,
    `relatedTransactionId` INTEGER NULL,
    `recurrenceOccurrenceId` INTEGER NULL,
    `installmentOccurrenceId` INTEGER NULL,
    `notes` VARCHAR(500) NULL,
    `voidReason` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `updatedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Transaction_recurrenceOccurrenceId_key`(`recurrenceOccurrenceId`),
    UNIQUE INDEX `Transaction_installmentOccurrenceId_key`(`installmentOccurrenceId`),
    INDEX `Transaction_transactionDate_idx`(`transactionDate`),
    INDEX `Transaction_status_idx`(`status`),
    INDEX `Transaction_categoryId_idx`(`categoryId`),
    INDEX `Transaction_accountId_idx`(`accountId`),
    INDEX `Transaction_paymentMethodId_idx`(`paymentMethodId`),
    INDEX `Transaction_payerId_idx`(`payerId`),
    INDEX `Transaction_ownerId_idx`(`ownerId`),
    INDEX `Transaction_createdById_idx`(`createdById`),
    INDEX `Transaction_updatedById_idx`(`updatedById`),
    INDEX `Transaction_relatedTransactionId_idx`(`relatedTransactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalAllowanceEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `periodKey` VARCHAR(7) NOT NULL,
    `kind` ENUM('ALLOCATION', 'ADJUSTMENT', 'CORRECTION') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `notes` VARCHAR(500) NULL,
    `actorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PersonalAllowanceEntry_ownerId_periodKey_idx`(`ownerId`, `periodKey`),
    INDEX `PersonalAllowanceEntry_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonthlyBudget` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scope` ENUM('OVERALL', 'CATEGORY') NOT NULL,
    `categoryId` INTEGER NULL,
    `categoryKey` VARCHAR(20) NOT NULL,
    `effectiveFrom` VARCHAR(7) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MonthlyBudget_categoryId_idx`(`categoryId`),
    INDEX `MonthlyBudget_updatedById_idx`(`updatedById`),
    UNIQUE INDEX `MonthlyBudget_categoryKey_effectiveFrom_key`(`categoryKey`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavingsGoal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `targetAmount` DECIMAL(12, 2) NULL,
    `targetDate` DATE NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `status` ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
    `createdById` INTEGER NOT NULL,
    `updatedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SavingsGoal_createdById_idx`(`createdById`),
    INDEX `SavingsGoal_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoalEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goalId` INTEGER NOT NULL,
    `kind` ENUM('ALLOCATION', 'WITHDRAWAL', 'CORRECTION') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `effectiveDate` DATE NOT NULL,
    `actorId` INTEGER NOT NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GoalEntry_goalId_idx`(`goalId`),
    INDEX `GoalEntry_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorId` INTEGER NOT NULL,
    `entityType` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(40) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditEvent_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_payerId_fkey` FOREIGN KEY (`payerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurrenceOccurrence` ADD CONSTRAINT `RecurrenceOccurrence_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `RecurrenceRule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_payerId_fkey` FOREIGN KEY (`payerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentOccurrence` ADD CONSTRAINT `InstallmentOccurrence_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `InstallmentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_payerId_fkey` FOREIGN KEY (`payerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_relatedTransactionId_fkey` FOREIGN KEY (`relatedTransactionId`) REFERENCES `Transaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_recurrenceOccurrenceId_fkey` FOREIGN KEY (`recurrenceOccurrenceId`) REFERENCES `RecurrenceOccurrence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_installmentOccurrenceId_fkey` FOREIGN KEY (`installmentOccurrenceId`) REFERENCES `InstallmentOccurrence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalAllowanceEntry` ADD CONSTRAINT `PersonalAllowanceEntry_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalAllowanceEntry` ADD CONSTRAINT `PersonalAllowanceEntry_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonthlyBudget` ADD CONSTRAINT `MonthlyBudget_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MonthlyBudget` ADD CONSTRAINT `MonthlyBudget_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavingsGoal` ADD CONSTRAINT `SavingsGoal_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavingsGoal` ADD CONSTRAINT `SavingsGoal_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoalEntry` ADD CONSTRAINT `GoalEntry_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `SavingsGoal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoalEntry` ADD CONSTRAINT `GoalEntry_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks Prisma cannot model. A personal record must have an owner.
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_scope_owner_check` CHECK (`scope` <> 'personal' OR `ownerId` IS NOT NULL);
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_scope_owner_check` CHECK (`scope` <> 'personal' OR `ownerId` IS NOT NULL);
ALTER TABLE `RecurrenceRule` ADD CONSTRAINT `RecurrenceRule_day_check` CHECK (`dayOfMonth` BETWEEN 1 AND 31);
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_scope_owner_check` CHECK (`scope` <> 'personal' OR `ownerId` IS NOT NULL);
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_count_check` CHECK (`installmentCount` >= 1);
ALTER TABLE `MonthlyBudget` ADD CONSTRAINT `MonthlyBudget_key_check` CHECK ((`scope` = 'OVERALL' AND `categoryId` IS NULL AND `categoryKey` = 'overall') OR (`scope` = 'CATEGORY' AND `categoryId` IS NOT NULL AND `categoryKey` = CAST(`categoryId` AS CHAR) COLLATE utf8mb4_unicode_ci));
