import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupStatusSchema } from "@spendual/shared";
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

describe("setup", () => {
  it("needs a session", async () => {
    const res = await request(makeApp(prisma)).get("/api/setup");
    expect(res.status).toBe(401);
  });

  it("starts not completed, either user completes it, and it is shared", async () => {
    expect(setupStatusSchema.parse((await ctx.ana.get("/api/setup")).body)).toEqual({
      completed: false,
    });
    const res = await send(ctx.beto, "post", "/api/setup/complete");
    expect(res.status).toBe(200);
    expect(setupStatusSchema.parse(res.body)).toEqual({ completed: true });
    expect((await ctx.ana.get("/api/setup")).body).toEqual({ completed: true });
  });

  it("complete is idempotent and keeps the first time", async () => {
    await send(ctx.ana, "post", "/api/setup/complete");
    const first = (await prisma.household.findUniqueOrThrow({ where: { id: 1 } })).setupCompletedAt;
    expect(first).not.toBeNull();
    const again = await send(ctx.beto, "post", "/api/setup/complete");
    expect(again.body).toEqual({ completed: true });
    const second = (await prisma.household.findUniqueOrThrow({ where: { id: 1 } }))
      .setupCompletedAt;
    expect(second).toEqual(first);
  });

  it("POST needs the CSRF token", async () => {
    const res = await ctx.ana.post("/api/setup/complete");
    expect(res.status).toBe(403);
    expect((await ctx.ana.get("/api/setup")).body).toEqual({ completed: false });
  });

  it("fails clearly when the household row is missing", async () => {
    await prisma.household.deleteMany();
    const res = await send(ctx.ana, "post", "/api/setup/complete");
    expect(res.status).toBe(500);
    expect((await ctx.ana.get("/api/setup")).body).toEqual({ completed: false });
  });
});
