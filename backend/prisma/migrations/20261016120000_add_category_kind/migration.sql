-- AlterTable
ALTER TABLE `Category` ADD COLUMN `kind` ENUM('expense', 'income') NOT NULL DEFAULT 'expense';
