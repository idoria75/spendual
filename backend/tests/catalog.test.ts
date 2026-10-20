import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lookupsSchema } from "@spendual/shared";
import { makeApp } from "./helpers/authApp.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";
import { send, setup, type Ctx } from "./helpers/txApp.js";

let prisma: PrismaClient;
let ctx: Ctx;
beforeAll(() => {
  prisma = testPrisma();
});
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDb(prisma);
  ctx = await setup(prisma);
});

describe("catalog auth", () => {
  it("rejects anonymous requests with 401", async () => {
    const res = await request(makeApp(prisma)).get("/api/lookups");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("rejects a write without the CSRF token with 403", async () => {
    const res = await ctx.ana.post("/api/categories").send({ name: "Lazer" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("csrf_invalid");
  });

  it("rejects a write with no session before the CSRF check", async () => {
    const res = await request(makeApp(prisma)).post("/api/categories").send({ name: "Lazer" });
    expect(res.status).toBe(401);
  });
});

describe("lookups: usageCount", () => {
  it("counts confirmed records per category, voided and planned ones excluded", async () => {
    const lazer = await prisma.category.create({ data: { name: "Lazer" } });
    const make = (categoryId: number, amount: string) =>
      send(ctx.ana, "post", "/api/transactions", {
        type: "expense",
        scope: "household",
        amount,
        description: "x",
        transactionDate: "2027-03-05",
        categoryId,
      });
    await make(ctx.categoryId, "10.00");
    await make(ctx.categoryId, "20.00");
    const voided = await make(ctx.categoryId, "30.00");
    await send(ctx.ana, "post", `/api/transactions/${voided.body.id}/void`, { reason: "x" });
    await make(lazer.id, "5.00");
    await prisma.transaction.create({
      data: {
        type: "expense",
        status: "planned",
        amount: "9.00",
        description: "p",
        transactionDate: new Date("2027-03-09T00:00:00Z"),
        scope: "household",
        categoryId: lazer.id,
        payerId: ctx.anaId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    const body = lookupsSchema.parse((await ctx.ana.get("/api/lookups")).body);
    const count = (id: number) => body.categories.find((c) => c.id === id)?.usageCount;
    expect(count(ctx.categoryId)).toBe(2);
    expect(count(lazer.id)).toBe(1);
    expect(count(ctx.incomeCategoryId)).toBe(0);
  });
});

describe("lookups", () => {
  it("returns users and active plus archived catalogs", async () => {
    await prisma.category.create({ data: { name: "Velha", active: false } });
    const res = await ctx.ana.get("/api/lookups");
    expect(res.status).toBe(200);
    const body = lookupsSchema.parse(res.body);
    expect(body.users.map((u) => u.id)).toEqual([ctx.anaId, ctx.betoId]);
    expect(body.categories.map((c) => c.name)).toEqual(["Mercado", "Salário", "Velha"]);
    expect(body.categories.map((c) => c.kind)).toEqual(["expense", "income", "expense"]);
    expect(body.categories.find((c) => c.name === "Velha")?.active).toBe(false);
    expect(body.accounts).toHaveLength(1);
    expect(body.paymentMethods).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("hides inactive users", async () => {
    await prisma.user.update({ where: { id: ctx.betoId }, data: { active: false } });
    const body = lookupsSchema.parse((await ctx.ana.get("/api/lookups")).body);
    expect(body.users.map((u) => u.id)).toEqual([ctx.anaId]);
  });
});

describe.each([
  ["categories", {}],
  ["accounts", { type: "cash" }],
  ["payment-methods", {}],
])("%s", (path, extra) => {
  it("creates, renames, archives and unarchives", async () => {
    const created = await send(ctx.ana, "post", `/api/${path}`, { name: "  Novo  ", ...extra });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Novo", active: true });
    const id = created.body.id as number;

    const renamed = await send(ctx.ana, "patch", `/api/${path}/${id}`, { name: "Outro" });
    expect(renamed.body.name).toBe("Outro");

    const archived = await send(ctx.ana, "patch", `/api/${path}/${id}`, { active: false });
    expect(archived.status).toBe(200);
    expect(archived.body.active).toBe(false);
    const list = (await ctx.ana.get("/api/lookups")).body as Record<
      string,
      { id: number; active: boolean }[]
    >;
    const key = path === "payment-methods" ? "paymentMethods" : path;
    expect(list[key]?.find((x) => x.id === id)?.active).toBe(false);

    const back = await send(ctx.ana, "patch", `/api/${path}/${id}`, { active: true });
    expect(back.body.active).toBe(true);
  });

  it("rejects a duplicate name with 409 name_taken", async () => {
    await send(ctx.ana, "post", `/api/${path}`, { name: "Dup", ...extra });
    const res = await send(ctx.ana, "post", `/api/${path}`, { name: "Dup", ...extra });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("name_taken");
  });

  it("rejects a rename to an existing name with 409 name_taken", async () => {
    await send(ctx.ana, "post", `/api/${path}`, { name: "A", ...extra });
    const b = await send(ctx.ana, "post", `/api/${path}`, { name: "B", ...extra });
    const res = await send(ctx.ana, "patch", `/api/${path}/${b.body.id}`, { name: "A" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("name_taken");
  });

  it("validates body and id", async () => {
    expect((await send(ctx.ana, "post", `/api/${path}`, { name: "" })).status).toBe(400);
    expect((await send(ctx.ana, "patch", `/api/${path}/1`, {})).status).toBe(400);
    const badId = await send(ctx.ana, "patch", `/api/${path}/abc`, { name: "X" });
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe("validation_error");
    const missing = await send(ctx.ana, "patch", `/api/${path}/99999`, { name: "X" });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });
});

it("rejects an unknown account type", async () => {
  const res = await send(ctx.ana, "post", "/api/accounts", { name: "X", type: "crypto" });
  expect(res.status).toBe(400);
});

describe("category kind", () => {
  it("defaults to expense and accepts income", async () => {
    const a = await send(ctx.ana, "post", "/api/categories", { name: "Lazer" });
    expect(a.status).toBe(201);
    expect(a.body.kind).toBe("expense");
    const b = await send(ctx.ana, "post", "/api/categories", { name: "Bônus", kind: "income" });
    expect(b.body.kind).toBe("income");
  });

  it("name stays unique across kinds", async () => {
    const res = await send(ctx.ana, "post", "/api/categories", { name: "Mercado", kind: "income" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("name_taken");
  });

  it("patch never changes the kind", async () => {
    const res = await send(ctx.ana, "patch", `/api/categories/${ctx.incomeCategoryId}`, {
      name: "Pagamento",
      kind: "expense",
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Pagamento");
    expect(res.body.kind).toBe("income");
    const row = await prisma.category.findUniqueOrThrow({ where: { id: ctx.incomeCategoryId } });
    expect(row.kind).toBe("income");
  });
});
