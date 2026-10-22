-- AlterTable
ALTER TABLE `SavingsGoal` ADD COLUMN `ownerId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `SavingsGoal_ownerId_idx` ON `SavingsGoal`(`ownerId`);

-- AddForeignKey
ALTER TABLE `SavingsGoal` ADD CONSTRAINT `SavingsGoal_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
