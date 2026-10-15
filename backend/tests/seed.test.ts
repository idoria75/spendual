import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  seedBase,
} from "../src/seed/seedData.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";

describe("seedBase", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = testPrisma();
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  it("creates the base rows and is safe to run twice", async () => {
    await seedBase(prisma);
    await seedBase(prisma);
    expect(await prisma.household.count()).toBe(1);
    expect(await prisma.category.count()).toBe(
      DEFAULT_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
    );
    expect(await prisma.category.count({ where: { kind: "income" } })).toBe(
      DEFAULT_INCOME_CATEGORIES.length,
    );
    expect(await prisma.account.count()).toBe(DEFAULT_ACCOUNTS.length);
    expect(await prisma.paymentMethod.count()).toBe(DEFAULT_PAYMENT_METHODS.length);
  });

  it("does not undo an archived category", async () => {
    await seedBase(prisma);
    await prisma.category.update({ where: { name: "Viagens" }, data: { active: false } });
    await seedBase(prisma);
    expect((await prisma.category.findUniqueOrThrow({ where: { name: "Viagens" } })).active).toBe(
      false,
    );
  });

  it("keeps a user category with an income name as it is", async () => {
    await prisma.category.create({ data: { name: "Venda", kind: "expense", active: false } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await seedBase(prisma);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Venda");
    warn.mockRestore();
    const c = await prisma.category.findUniqueOrThrow({ where: { name: "Venda" } });
    expect(c.kind).toBe("expense");
    expect(c.active).toBe(false);
  });
});
