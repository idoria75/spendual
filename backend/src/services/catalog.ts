import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AccountInput,
  AccountPatch,
  CategoryInput,
  CategoryPatch,
  Lookups,
  PaymentMethodInput,
  PaymentMethodPatch,
} from "@spendual/shared";
import { AppError } from "../auth/errors.js";

const categorySelect = { id: true, name: true, kind: true, active: true } as const;
const nameSelect = { id: true, name: true, active: true } as const;
const accountSelect = { id: true, name: true, type: true, active: true } as const;

/** Map unique-name and missing-row errors to clean API errors. */
async function mapCatalogErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") throw new AppError(409, "name_taken", "Name already in use");
      if (err.code === "P2025") throw new AppError(404, "not_found", "Not found");
    }
    throw err;
  }
}

export async function getLookups(prisma: PrismaClient): Promise<Lookups> {
  const [users, categories, usage, accounts, paymentMethods] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, displayName: true, tonePalette: true },
      orderBy: { id: "asc" },
    }),
    prisma.category.findMany({ select: categorySelect, orderBy: { name: "asc" } }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
      where: { status: "confirmed", categoryId: { not: null } },
    }),
    prisma.account.findMany({ select: accountSelect, orderBy: { name: "asc" } }),
    prisma.paymentMethod.findMany({ select: nameSelect, orderBy: { name: "asc" } }),
  ]);
  const used = new Map(usage.map((u) => [u.categoryId, u._count._all]));
  return {
    users,
    categories: categories.map((c) => ({ ...c, usageCount: used.get(c.id) ?? 0 })),
    accounts,
    paymentMethods,
  };
}

export const createCategory = (prisma: PrismaClient, data: CategoryInput) =>
  mapCatalogErrors(() => prisma.category.create({ data, select: categorySelect }));

export const updateCategory = (prisma: PrismaClient, id: number, data: CategoryPatch) =>
  mapCatalogErrors(() => prisma.category.update({ where: { id }, data, select: categorySelect }));

export const createAccount = (prisma: PrismaClient, data: AccountInput) =>
  mapCatalogErrors(() => prisma.account.create({ data, select: accountSelect }));

export const updateAccount = (prisma: PrismaClient, id: number, data: AccountPatch) =>
  mapCatalogErrors(() => prisma.account.update({ where: { id }, data, select: accountSelect }));

export const createPaymentMethod = (prisma: PrismaClient, data: PaymentMethodInput) =>
  mapCatalogErrors(() => prisma.paymentMethod.create({ data, select: nameSelect }));

export const updatePaymentMethod = (prisma: PrismaClient, id: number, data: PaymentMethodPatch) =>
  mapCatalogErrors(() => prisma.paymentMethod.update({ where: { id }, data, select: nameSelect }));
