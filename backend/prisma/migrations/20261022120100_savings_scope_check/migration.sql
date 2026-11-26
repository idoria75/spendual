-- AlterTable
ALTER TABLE `MonthlyBudget` DROP CHECK `MonthlyBudget_key_check`;
ALTER TABLE `MonthlyBudget` ADD CONSTRAINT `MonthlyBudget_key_check` CHECK ((`scope` = 'OVERALL' AND `categoryId` IS NULL AND `categoryKey` = 'overall') OR (`scope` = 'SAVINGS' AND `categoryId` IS NULL AND `categoryKey` = 'savings') OR (`scope` = 'CATEGORY' AND `categoryId` IS NOT NULL AND `categoryKey` = CAST(`categoryId` AS CHAR) COLLATE utf8mb4_unicode_ci));
