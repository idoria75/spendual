import { PrismaClient } from "@prisma/client";

/** Separate database. Never the dev database. Root is needed to create it. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "mysql://root:root@mysql:3306/spendual_test";

export function testPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
}

/** Empty every table (except Prisma's own) so a rerun starts clean. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of tables) await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${t.name}\``);
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  });
}

export async function makeUser(prisma: PrismaClient, username: string, tonePalette?: string) {
  return prisma.user.create({
    data: { username, passwordHash: "x", displayName: username, tonePalette },
  });
}
