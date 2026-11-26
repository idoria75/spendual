import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../src/lib/csv.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";
import { send, setup, type Ctx } from "./helpers/txApp.js";

describe("csv helpers", () => {
  it("quotes, escapes and guards formulas", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [["x", null]])).toBe("﻿a,b\r\nx,\r\n");
  });
});

let prisma: PrismaClient;
let ctx: Ctx;
beforeAll(() => {
  prisma = testPrisma();
});
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDb(prisma);
  ctx = await setup(prisma, { now: () => new Date("2027-03-15T12:00:00Z") });
});

describe("transactions export", () => {
  it("exports names, filters by date and refuses a bad range", async () => {
    const tx = (date: string, description: string, extra: Record<string, unknown> = {}) =>
      send(ctx.ana, "post", "/api/transactions", {
        type: "expense",
        amount: "12.50",
        scope: "household",
        categoryId: ctx.categoryId,
        transactionDate: date,
        description,
        ...extra,
      });
    expect((await tx("2027-03-05", "Pão, queijo")).status).toBe(201);
    const second = await tx("2027-03-20", "=cmd");
    expect(second.status).toBe(201);
    expect((await tx("2027-02-01", "Antigo")).status).toBe(201);
    expect(
      (await send(ctx.ana, "post", `/api/transactions/${second.body.id}/void`, { reason: "erro" }))
        .status,
    ).toBe(200);

    const all = await ctx.ana.get("/api/export/transactions.csv");
    expect(all.status).toBe(200);
    expect(all.headers["content-type"]).toContain("text/csv");
    expect(all.headers["content-disposition"]).toBe(
      'attachment; filename="spendual-lancamentos-2027-03-15.csv"',
    );
    const lines = all.text.split("\r\n");
    expect(lines[0]).toBe(
      "﻿id,date,type,status,amount,description,scope,owner,payer,category,account,payment_method,related_id,notes,void_reason",
    );
    expect(lines.filter(Boolean)).toHaveLength(4);
    expect(lines[1]).toContain(",2027-02-01,expense,confirmed,12.50,Antigo,household,");
    expect(lines[2]).toContain('"Pão, queijo"');
    expect(lines[3]).toContain(",voided,12.50,'=cmd,");
    expect(lines[3]).toContain(",erro");

    const march = await ctx.ana.get("/api/export/transactions.csv?from=2027-03-01&to=2027-03-10");
    expect(march.text.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(
      (await ctx.ana.get("/api/export/transactions.csv?from=2027-03-10&to=2027-03-01")).status,
    ).toBe(400);
  }, 60_000);
});
