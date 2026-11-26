import type { PrismaClient } from "@prisma/client";
import type { AppOptions } from "../../src/app.js";
import { csrfToken, makeApp, newAgent, seedHousehold, signup, type Agent } from "./authApp.js";

export interface Ctx {
  app: ReturnType<typeof makeApp>;
  ana: Agent;
  beto: Agent;
  anaId: number;
  betoId: number;
  categoryId: number;
  incomeCategoryId: number;
  accountId: number;
  paymentMethodId: number;
}

/** Two signed-in users plus one category, account and payment method. */
export async function setup(prisma: PrismaClient, opts: Partial<AppOptions> = {}): Promise<Ctx> {
  await seedHousehold(prisma);
  const app = makeApp(prisma, opts);
  const ana = newAgent(app);
  const beto = newAgent(app);
  const a = await signup(ana, "ana");
  const b = await signup(beto, "beto");
  const category = await prisma.category.create({ data: { name: "Mercado" } });
  const income = await prisma.category.create({ data: { name: "Salário", kind: "income" } });
  const account = await prisma.account.create({ data: { name: "Conta", type: "bank" } });
  const pm = await prisma.paymentMethod.create({ data: { name: "Pix" } });
  return {
    app,
    ana,
    beto,
    anaId: a.body.id as number,
    betoId: b.body.id as number,
    categoryId: category.id,
    incomeCategoryId: income.id,
    accountId: account.id,
    paymentMethodId: pm.id,
  };
}

/** Send a state-changing request with the CSRF token. */
export async function send(
  agent: Agent,
  method: "post" | "patch" | "put",
  url: string,
  body: unknown = {},
) {
  const token = await csrfToken(agent);
  return agent[method](url)
    .set("X-CSRF-Token", token)
    .send(body as object);
}
