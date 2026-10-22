-- AlterTable
ALTER TABLE `MonthlyBudget` MODIFY `scope` ENUM('OVERALL', 'CATEGORY', 'SAVINGS') NOT NULL;
