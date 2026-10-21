// Dev tool: replaces the records of the DEV database with 6 months of demo data.
// Run with `make demo-data CONFIRM=yes` (takes a backup first). Users, catalog and sessions stay.
// All writes go through the real services, so every rule (locks, audit, balance checks) applies.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/passwords.js";
import { centsToMoney } from "../src/services/installments.js";
import {
  addPeriods,
  currentDate,
  currentPeriod,
  daysInMonth,
  parsePeriod,
} from "../src/lib/period.js";
import { createPrisma } from "../src/lib/prisma.js";
import { createAllocation } from "../src/services/allowance.js";
import * as bills from "../src/services/bills.js";
import { editBudget } from "../src/services/budget.js";
import { unallocatedForMonth } from "../src/services/dashboard.js";
import * as goals from "../src/services/goals.js";
import { generateForRules } from "../src/services/recurrence.js";
import { createTransaction, voidTransaction } from "../src/services/transactions.js";
import { seedBase } from "../src/seed/seedData.js";

const dbName = new URL(process.env.DATABASE_URL ?? "mysql://x/none").pathname.slice(1);
if (process.env.DEMO_CONFIRM !== "yes" || dbName.includes("prod")) {
  console.error(
    `Refusing to wipe "${dbName}". Use: make demo-data CONFIRM=yes (dev database only).`,
  );
  process.exit(1);
}

const prisma = createPrisma();
const money = (cents: number): string => centsToMoney(BigInt(cents));

// Repeatable pseudo-random numbers (mulberry32), so every run gives the same data.
let seed = 20261021;
function rnd(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)] as T;

/** `n` integer amounts (cents) that add up to exactly `total`. */
function split(total: number, n: number): number[] {
  const weights = Array.from({ length: n }, () => 50 + Math.floor(rnd() * 100));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  out[n - 1] = (out[n - 1] ?? 0) + (total - out.reduce((a, b) => a + b, 0));
  return out;
}

const now = new Date();
const cur = currentPeriod(now);
const today = currentDate(now);
const MONTHS = Array.from({ length: 6 }, (_, i) => addPeriods(cur, i - 5));

/** A date inside month `i`. The current month never gets a date after today. */
function dateOf(i: number, day: number): string {
  const key = MONTHS[i] as string;
  const { year, month } = parsePeriod(key);
  let d = Math.min(day, daysInMonth(year, month));
  if (key === cur) d = Math.min(d, Number(today.slice(8, 10)));
  return `${key}-${String(d).padStart(2, "0")}`;
}

async function wipe(db: PrismaClient): Promise<void> {
  await db.auditEvent.deleteMany();
  await db.goalEntry.deleteMany();
  await db.savingsGoal.deleteMany();
  await db.transaction.deleteMany({ where: { type: "refund" } });
  await db.transaction.deleteMany();
  await db.recurrenceOccurrence.deleteMany();
  await db.recurrenceRule.deleteMany();
  await db.installmentOccurrence.deleteMany();
  await db.installmentPlan.deleteMany();
  await db.personalAllowanceEntry.deleteMany();
  await db.monthlyBudget.deleteMany();
}

async function main(): Promise<void> {
  await seedBase(prisma);
  const ivan = await prisma.user.findFirstOrThrow({ orderBy: { id: "asc" } });

  // Second person, with a new random password each run.
  const password = randomBytes(9).toString("base64url");
  const thai = await prisma.user.upsert({
    where: { username: "thai" },
    update: { passwordHash: await hashPassword(password), active: true },
    create: {
      username: "thai",
      displayName: "Thai",
      tonePalette: "rose",
      passwordHash: await hashPassword(password),
    },
  });
  const passwordFile = process.env.DEMO_PASSWORD_FILE ?? "backups/thai-demo-password.txt";
  writeFileSync(passwordFile, `username: thai\npassword: ${password}\n`, { mode: 0o600 });

  await wipe(prisma);
  await prisma.household.update({ where: { id: 1 }, data: { setupCompletedAt: new Date() } });

  const byName = async <T extends { id: number; name: string }>(rows: Promise<T[]>) =>
    Object.fromEntries((await rows).map((r) => [r.name, r.id])) as Record<string, number>;
  const cat = await byName(prisma.category.findMany());
  const acc = await byName(prisma.account.findMany());
  const pm = await byName(prisma.paymentMethod.findMany());
  const id = (map: Record<string, number>, name: string): number => {
    const v = map[name];
    if (v === undefined) throw new Error(`Missing catalog row: ${name}`);
    return v;
  };

  // --- Budgets -------------------------------------------------------------------------------
  const budget = (categoryName: string | null, period: string, cents: number) =>
    editBudget(prisma, {
      categoryId: categoryName === null ? null : id(cat, categoryName),
      period,
      amount: money(cents),
      mode: "going_forward",
      actorId: ivan.id,
    });
  await budget(null, MONTHS[0] as string, 700000);
  await budget(null, MONTHS[3] as string, 750000);
  await budget("Mercado", MONTHS[0] as string, 180000);
  await budget("Mercado", MONTHS[3] as string, 200000);
  await budget("Restaurantes e delivery", MONTHS[0] as string, 60000);
  await budget("Transporte", MONTHS[0] as string, 50000);
  await budget("Lazer e hobbies", MONTHS[0] as string, 40000);

  // --- Transactions --------------------------------------------------------------------------
  const people = [ivan, thai];
  type Person = (typeof people)[number];
  interface Spend {
    by: Person;
    category: string;
    cents: number;
    date: string;
    description: string;
    method?: string;
    account?: string;
    personal?: boolean;
    notes?: string;
  }
  const spend = (s: Spend) =>
    createTransaction(prisma, s.by.id, {
      type: "expense",
      amount: money(s.cents),
      description: s.description,
      transactionDate: s.date,
      scope: s.personal ? "personal" : "household",
      ownerId: s.personal ? s.by.id : null,
      payerId: s.by.id,
      categoryId: id(cat, s.category),
      accountId: id(acc, s.account ?? "Conta corrente"),
      paymentMethodId: id(pm, s.method ?? "PIX"),
      notes: s.notes ?? null,
    });
  const income = (
    by: Person,
    category: string,
    cents: number,
    date: string,
    description: string,
    opts: { type?: "income" | "other_receipt"; personal?: boolean } = {},
  ) =>
    createTransaction(prisma, by.id, {
      type: opts.type ?? "income",
      amount: money(cents),
      description,
      transactionDate: date,
      scope: opts.personal ? "personal" : "household",
      ownerId: opts.personal ? by.id : null,
      payerId: by.id,
      categoryId: id(cat, category),
      accountId: id(acc, "Conta corrente"),
      paymentMethodId: id(pm, "Transferência bancária"),
    });

  // Monthly totals per category (cents). Over-budget months are on purpose.
  const plan: Record<string, { totals: number[]; shops: string[]; method: string[] }> = {
    Mercado: {
      totals: [165000, 172000, 189000, 215000, 178000, 195000],
      shops: ["Supermercado Extra", "Feira", "Atacadão", "Açougue", "Hortifruti"],
      method: ["Cartão de débito", "Cartão de crédito", "PIX"],
    },
    "Restaurantes e delivery": {
      totals: [52000, 64000, 48000, 71000, 56000, 59000],
      shops: ["iFood", "Pizzaria", "Almoço fora", "Padaria", "Hamburgueria"],
      method: ["Cartão de crédito", "PIX"],
    },
    Transporte: {
      totals: [38000, 42000, 45000, 61000, 43000, 47000],
      shops: ["Combustível", "Uber", "Estacionamento", "Pedágio"],
      method: ["Cartão de débito", "PIX"],
    },
    "Casa e suprimentos": {
      totals: [24000, 31000, 18000, 45000, 27000, 22000],
      shops: ["Material de limpeza", "Leroy Merlin", "Farmácia da casa"],
      method: ["Cartão de crédito", "PIX"],
    },
    "Saúde e cuidados pessoais": {
      totals: [18000, 9500, 32000, 15000, 21000, 12000],
      shops: ["Farmácia", "Consulta", "Dentista"],
      method: ["PIX", "Cartão de débito"],
    },
    "Lazer e hobbies": {
      totals: [30000, 28000, 41000, 36000, 25000, 33000],
      shops: ["Cinema", "Show", "Livraria", "Jogo de tabuleiro"],
      method: ["Cartão de crédito", "PIX"],
    },
    Diversos: {
      totals: [8000, 12000, 6000, 15000, 9000, 11000],
      shops: ["Lavanderia", "Chaveiro", "Correios"],
      method: ["Dinheiro", "PIX"],
    },
  };

  const longNote =
    "Compra grande do mês: inclui itens para a festa de aniversário, produtos de limpeza em " +
    "promoção e vários itens de despensa. Guardar a nota fiscal porque parte pode ser trocada. " +
    "Conferir se o desconto do cartão foi aplicado na fatura do mês seguinte e se o cashback entrou.";

  let mercadoExpenseId = 0;
  let eletroExpenseId = 0;
  for (let i = 0; i < MONTHS.length; i++) {
    // Income
    await income(ivan, "Salário", 880000, dateOf(i, 5), "Salário Ivan");
    await income(thai, "Salário", 600000, dateOf(i, 7), "Salário Thai");
    if (i === 1) await income(ivan, "Venda", 120000, dateOf(i, 18), "Freelance de design");
    if (i === 3) await income(thai, "Rendimentos", 34000, dateOf(i, 10), "Rendimento da poupança");
    if (i === 2) {
      await income(ivan, "Reembolso", 18000, dateOf(i, 14), "Reembolso do plano de saúde", {
        type: "other_receipt",
      });
    }

    // Allowances
    await createAllocation(prisma, {
      ownerId: ivan.id,
      periodKey: MONTHS[i] as string,
      amount: money(150000),
      actorId: ivan.id,
    });
    await createAllocation(prisma, {
      ownerId: thai.id,
      periodKey: MONTHS[i] as string,
      amount: money(120000),
      actorId: thai.id,
    });

    // Household spending by category
    for (const [category, p] of Object.entries(plan)) {
      const total = p.totals[i] as number;
      const n = category === "Mercado" ? 5 : 3;
      const parts = split(total, n);
      for (let k = 0; k < n; k++) {
        const by = pick(people);
        const tx = await spend({
          by,
          category,
          cents: parts[k] as number,
          date: dateOf(i, 2 + Math.floor(((k + 0.5) * 26) / n)),
          description: pick(p.shops),
          method: pick(p.method),
          account: "Conta corrente",
          ...(category === "Mercado" && i === 3 && k === 0 ? { notes: longNote } : {}),
          ...(category === "Mercado" && i === 1 && k === 1
            ? { description: "Mercado do mês" }
            : {}),
        });
        if (category === "Mercado" && i === 1 && k === 1) mercadoExpenseId = tx.id;
      }
    }

    // Personal spending: each person, around their allowance
    for (const [who, allowance] of [
      [ivan, 150000],
      [thai, 120000],
    ] as const) {
      const total = Math.round((allowance * (80 + Math.floor(rnd() * 40))) / 100);
      const parts = split(total, 4);
      const kinds = [
        "Lazer e hobbies",
        "Restaurantes e delivery",
        "Saúde e cuidados pessoais",
        "Diversos",
      ];
      for (let k = 0; k < 4; k++) {
        await spend({
          by: who,
          category: kinds[k] as string,
          cents: parts[k] as number,
          date: dateOf(i, 4 + k * 6),
          description: `Pessoal: ${(kinds[k] as string).split(" ")[0]}`,
          method: "Cartão de débito",
          personal: true,
        });
      }
    }
  }

  // Special cases
  await spend({
    by: ivan,
    category: "Viagens",
    cents: 45000,
    date: dateOf(2, 12),
    description: "Fim de semana em Campos do Jordão",
    method: "Cartão de crédito",
    account: "Cartão de crédito",
  });
  await spend({
    by: thai,
    category: "Presentes",
    cents: 18000,
    date: dateOf(1, 12),
    description: "Presente de Dia dos Namorados",
    method: "Cartão de crédito",
    account: "Cartão de crédito",
  });
  await spend({
    by: ivan,
    category: "Presentes",
    cents: 12000,
    date: dateOf(5, 8),
    description: "Aniversário da sogra",
    method: "PIX",
  });
  const eletro = await spend({
    by: thai,
    category: "Eletrodomésticos e móveis",
    cents: 28990,
    date: dateOf(3, 9),
    description: "Liquidificador",
    method: "Cartão de crédito",
    account: "Cartão de crédito",
  });
  eletroExpenseId = eletro.id;
  await spend({
    by: ivan,
    category: "Transporte",
    cents: 250000,
    date: dateOf(3, 18),
    description: "Conserto do carro (freios e suspensão)",
    method: "Cartão de débito",
  });
  await spend({
    by: thai,
    category: "Presentes",
    cents: 200000,
    date: dateOf(2, 12),
    description: "Presente de casamento da Carol",
    method: "PIX",
  });

  // Personal income and credits
  await income(ivan, "Venda", 60000, dateOf(4, 16), "Venda da bicicleta", { personal: true });
  await income(thai, "Presente recebido", 25000, dateOf(2, 20), "Presente da avó", {
    type: "other_receipt",
    personal: true,
  });

  // Refunds: one partial, one full
  const refund = (
    by: Person,
    relatedId: number,
    category: string,
    cents: number,
    date: string,
    d: string,
  ) =>
    createTransaction(prisma, by.id, {
      type: "refund",
      amount: money(cents),
      description: d,
      transactionDate: date,
      scope: "household",
      ownerId: null,
      payerId: by.id,
      categoryId: id(cat, category),
      relatedTransactionId: relatedId,
    });
  await refund(ivan, mercadoExpenseId, "Mercado", 8500, dateOf(1, 22), "Estorno de itens vencidos");
  await refund(
    thai,
    eletroExpenseId,
    "Eletrodomésticos e móveis",
    28990,
    dateOf(3, 20),
    "Devolução do liquidificador",
  );

  // Transfers between accounts
  for (const [i, day, cents, d] of [
    [0, 9, 50000, "Saque para despesas em dinheiro"],
    [4, 11, 80000, "Transferência para a conta do cartão"],
  ] as const) {
    await createTransaction(prisma, ivan.id, {
      type: "transfer",
      amount: money(cents),
      description: d,
      transactionDate: dateOf(i, day),
      scope: "household",
      payerId: ivan.id,
      accountId: id(acc, "Conta corrente"),
    });
  }

  // A voided expense
  const dup = await spend({
    by: ivan,
    category: "Restaurantes e delivery",
    cents: 12990,
    date: dateOf(4, 14),
    description: "iFood (lançado duas vezes)",
    method: "Cartão de crédito",
  });
  await voidTransaction(prisma, ivan.id, dup.id, "Lançamento duplicado");

  // --- Recurring bills -----------------------------------------------------------------------
  interface RuleSpec {
    description: string;
    amount: number | null;
    day: number;
    category: string;
    method: string;
    /** Amount actually paid in month i. Default: the expected amount. */
    paid?: (i: number) => number;
    /** Months (index) left unpaid on purpose. */
    unpaid?: number[];
    endDate?: string;
    after?: "paused" | "ended";
    lastMonth?: number;
  }
  const rules: RuleSpec[] = [
    {
      description: "Condomínio",
      amount: 78000,
      day: 5,
      category: "Moradia e contas",
      method: "Boleto",
    },
    {
      description: "Internet",
      amount: 11990,
      day: 10,
      category: "Moradia e contas",
      method: "Boleto",
    },
    {
      description: "Gás",
      amount: 9500,
      day: 15,
      category: "Moradia e contas",
      method: "PIX",
      paid: (i) => 8800 + ((i * 1370) % 1900),
      unpaid: [5],
    },
    {
      description: "Eletricidade",
      amount: 24000,
      day: 20,
      category: "Moradia e contas",
      method: "Boleto",
      paid: (i) => 21000 + ((i * 3170) % 9000),
      unpaid: [5],
    },
    {
      description: "Netflix",
      amount: 5590,
      day: 12,
      category: "Assinaturas",
      method: "Cartão de crédito",
    },
    {
      description: "Spotify família",
      amount: 3490,
      day: 12,
      category: "Assinaturas",
      method: "Cartão de crédito",
    },
    {
      description: "Conta de água",
      amount: null,
      day: 18,
      category: "Moradia e contas",
      method: "Boleto",
      paid: (i) => 7400 + ((i * 910) % 3100),
      unpaid: [4, 5],
    },
    {
      description: "Academia",
      amount: 12900,
      day: 8,
      category: "Saúde e cuidados pessoais",
      method: "Cartão de crédito",
      lastMonth: 2,
      after: "paused",
    },
    {
      description: "Plano de celular antigo",
      amount: 8900,
      day: 22,
      category: "Moradia e contas",
      method: "Boleto",
      lastMonth: 2,
      endDate: `${MONTHS[2]}-28`,
      after: "ended",
    },
  ];
  for (const r of rules) {
    await bills.createRule(
      prisma,
      ivan.id,
      {
        description: r.description,
        expectedAmount: r.amount === null ? null : money(r.amount),
        dayOfMonth: r.day,
        startDate: `${MONTHS[0]}-01`,
        ...(r.endDate ? { endDate: r.endDate } : {}),
        scope: "household",
        payerId: ivan.id,
        categoryId: id(cat, r.category),
        accountId: id(
          acc,
          r.method === "Cartão de crédito" ? "Cartão de crédito" : "Conta corrente",
        ),
        paymentMethodId: id(pm, r.method),
      },
      now,
    );
    const rule = await prisma.recurrenceRule.findFirstOrThrow({
      where: { description: r.description },
    });
    await generateForRules(prisma, [rule], MONTHS[0] as string, 6);
    const rows = await prisma.recurrenceOccurrence.findMany({
      where: { ruleId: rule.id },
      orderBy: { periodKey: "asc" },
    });
    for (const occ of rows) {
      const i = MONTHS.indexOf(occ.periodKey);
      if (i < 0 || (r.lastMonth !== undefined && i > r.lastMonth)) continue;
      const due = occ.dueDate.toISOString().slice(0, 10);
      if (due > today || r.unpaid?.includes(i)) continue;
      // The current month's bills due in the future stay planned.
      const cents = r.paid ? r.paid(i) : (r.amount as number);
      await bills.confirmBill(prisma, i % 2 === 0 ? ivan.id : thai.id, "recurrence", occ.id, {
        amount: money(cents),
        transactionDate: due,
      });
    }
    if (r.after) {
      await bills.patchRule(prisma, ivan.id, rule.id, {
        state: r.after,
        ...(r.after === "ended" ? { endDate: r.endDate as string } : {}),
      });
    }
  }

  // --- Installments (compras parceladas) -----------------------------------------------------
  const plans = [
    {
      description: "Video game (PS5)",
      total: 360000,
      count: 12,
      month: 1,
      day: 10,
      category: "Lazer e hobbies",
      by: ivan,
    },
    {
      description: "Geladeira",
      total: 420000,
      count: 10,
      month: 0,
      day: 15,
      category: "Eletrodomésticos e móveis",
      by: thai,
    },
    {
      description: "Notebook",
      total: 600000,
      count: 6,
      month: 0,
      day: 20,
      category: "Diversos",
      by: ivan,
    },
  ];
  for (const p of plans) {
    const detail = await bills.createInstallmentPlan(prisma, p.by.id, {
      description: p.description,
      totalAmount: money(p.total),
      installmentCount: p.count,
      firstDueDate: dateOf(p.month, p.day),
      scope: "household",
      payerId: p.by.id,
      categoryId: id(cat, p.category),
      accountId: id(acc, "Cartão de crédito"),
    });
    for (const item of detail.items) {
      if (item.dueDate > today) continue;
      await bills.confirmBill(prisma, p.by.id, "installment", item.id, {
        paymentMethodId: id(pm, "Cartão de crédito"),
      });
    }
  }

  // The trip itself is a normal expense, counted once when it happens.
  await spend({
    by: ivan,
    category: "Viagens",
    cents: 520000,
    date: dateOf(5, 2),
    description: "Passagens aéreas para Tóquio",
    method: "Cartão de crédito",
    account: "Cartão de crédito",
  });
  await spend({
    by: thai,
    category: "Viagens",
    cents: 380000,
    date: dateOf(5, 3),
    description: "Hospedagem em Tóquio e Kyoto",
    method: "Cartão de crédito",
    account: "Cartão de crédito",
  });

  // --- Savings goals -------------------------------------------------------------------------
  const goalBy = (i: number) => (i % 2 === 0 ? ivan : thai);
  const japan = await goals.createGoal(prisma, ivan.id, {
    name: "Viagem ao Japão",
    description: "Dez dias em outubro",
    targetAmount: "9000.00",
    targetDate: `${cur}-30`,
  });
  const car = await goals.createGoal(prisma, thai.id, {
    name: "Carro novo",
    description: "Entrada do financiamento",
    targetAmount: "30000.00",
  });
  const reserve = await goals.createGoal(prisma, ivan.id, {
    name: "Reserva de emergência",
    description: null,
  });
  const wedding = await goals.createGoal(prisma, thai.id, {
    name: "Presente de casamento",
    targetAmount: "2000.00",
    targetDate: `${MONTHS[2]}-10`,
  });

  /** Deposit, but never more than the month's unallocated savings (the service refuses it). */
  async function deposit(g: { id: number }, i: number, wanted: number, note: string) {
    const free = Number(await unallocatedForMonth(prisma, MONTHS[i] as string));
    const cents = Math.min(wanted, free);
    if (cents < wanted) console.warn(`Deposit ${note} ${MONTHS[i]}: ${wanted} cut to ${cents}`);
    if (cents <= 0) return;
    await goals.allocate(prisma, goalBy(i).id, g.id, {
      amount: money(cents),
      effectiveDate: dateOf(i, 6),
      notes: note,
    });
  }
  const take = (g: { id: number }, i: number, cents: number, day: number, note: string) =>
    goals.withdraw(prisma, goalBy(i).id, g.id, {
      amount: money(cents),
      effectiveDate: dateOf(i, day),
      notes: note,
    });

  // Withdrawals first in each month: they give money back before the deposits need it.
  for (let i = 0; i < MONTHS.length; i++) {
    if (i === 2) {
      await take(wedding, i, 200000, 10, "Compra do presente");
      await goals.transition(prisma, thai.id, wedding.id, "archive");
    }
    if (i === 3) await take(car, i, 250000, 18, "Conserto do carro");
    if (i === 5) {
      await take(japan, i, 900000, 1, "Pagar passagens e hospedagem");
      await goals.transition(prisma, ivan.id, japan.id, "complete");
    }
    if (i < 5) await deposit(japan, i, 180000, "Poupança mensal da viagem");
    await deposit(
      car,
      i,
      [150000, 170000, 170000, 180000, 180000, 170000][i] as number,
      "Entrada do carro",
    );
    if (i === 0) await deposit(reserve, i, 100000, "Início da reserva");
    if (i === 0) await deposit(wedding, i, 60000, "Presente");
    if (i === 1) await deposit(wedding, i, 140000, "Presente");
  }
  // --- Summary -------------------------------------------------------------------------------
  const counts = {
    transactions: await prisma.transaction.count(),
    rules: await prisma.recurrenceRule.count(),
    occurrences: await prisma.recurrenceOccurrence.count(),
    installmentPlans: await prisma.installmentPlan.count(),
    installmentRows: await prisma.installmentOccurrence.count(),
    allowances: await prisma.personalAllowanceEntry.count(),
    budgets: await prisma.monthlyBudget.count(),
    goalEntries: await prisma.goalEntry.count(),
    auditEvents: await prisma.auditEvent.count(),
  };
  console.log("Counts:", counts);
  for (const g of await goals.listGoals(prisma)) {
    console.log(`Goal ${g.name}: ${g.balance} (${g.status})`);
  }
  let bad = false;
  for (const m of MONTHS) {
    const free = await unallocatedForMonth(prisma, m);
    console.log(`Unallocated ${m}: ${centsToMoney(free)}`);
    if (free < 0n) bad = true;
  }
  console.log(`Thai login: see ${passwordFile}`);
  if (bad) console.warn("Some month has negative unallocated savings (shown in warn color).");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
