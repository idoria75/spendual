import type { AccountType, PrismaClient } from "@prisma/client";

export const DEFAULT_CATEGORIES = [
  "Mercado",
  "Restaurantes e delivery",
  "Casa e suprimentos",
  "Eletrodomésticos e móveis",
  "Moradia e contas",
  "Transporte",
  "Saúde e cuidados pessoais",
  "Lazer e hobbies",
  "Viagens",
  "Assinaturas",
  "Presentes",
  "Diversos",
];

export const DEFAULT_INCOME_CATEGORIES = [
  "Salário",
  "Reembolso",
  "Rendimentos",
  "Presente recebido",
  "Venda",
  "Outras receitas",
];

export const DEFAULT_ACCOUNTS: { name: string; type: AccountType }[] = [
  { name: "Conta corrente", type: "bank" },
  { name: "Dinheiro", type: "cash" },
  { name: "Cartão de crédito", type: "credit_card" },
];

export const DEFAULT_PAYMENT_METHODS = [
  "PIX",
  "Cartão de débito",
  "Cartão de crédito",
  "Dinheiro",
  "Transferência bancária",
  "Boleto",
  "Outro",
];

/** Idempotent. Safe to run many times. Never overwrites rows that users edited. */
export async function seedBase(prisma: PrismaClient): Promise<void> {
  await prisma.household.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: "Casa" } });
  for (const name of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  // Name is unique across kinds. A user row with the same name is left as it is.
  for (const name of DEFAULT_INCOME_CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name, kind: "income" } });
  }
  for (const a of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({ where: { name: a.name }, update: {}, create: a });
  }
  for (const name of DEFAULT_PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({ where: { name }, update: {}, create: { name } });
  }
}
