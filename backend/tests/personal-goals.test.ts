import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  dashboardSchema,
  goalListSchema,
  goalSchema,
  personalHistorySchema,
} from "@spendual/shared";
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
  ctx = await setup(prisma, { now: () => new Date("2027-03-15T12:00:00Z") });
});

describe("personal goals", () => {
  it("are paid from the owner's own balance and only the owner can change them", async () => {
    const ok = async (res: Promise<{ status: number; body: unknown }>, status = 201) => {
      const r = await res;
      expect(r.status).toBe(status);
      return r.body;
    };
    await ok(
      send(ctx.ana, "post", "/api/allowances", {
        ownerId: ctx.anaId,
        month: "2027-03",
        amount: "500.00",
      }),
    );
    const goal = goalSchema.parse(
      await ok(send(ctx.ana, "post", "/api/goals", { name: "Celular novo", personal: true })),
    );
    expect(goal.ownerId).toBe(ctx.anaId);

    // Both people can read it; only Ana can change it.
    const seen = goalListSchema.parse((await ctx.beto.get("/api/goals")).body);
    expect(seen.items.map((g) => [g.name, g.ownerId])).toEqual([["Celular novo", ctx.anaId]]);
    const url = `/api/goals/${goal.id}`;
    for (const [method, path, body] of [
      ["post", `${url}/allocations`, { amount: "10.00" }],
      ["patch", url, { name: "x" }],
      ["post", `${url}/archive`, {}],
    ] as const) {
      const r = await send(ctx.beto, method, path, body);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("forbidden");
    }

    // A deposit is limited by the personal balance (500), not by the household savings.
    const over = await send(ctx.ana, "post", `${url}/allocations`, { amount: "600.00" });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("insufficient_personal");
    await ok(send(ctx.ana, "post", `${url}/allocations`, { amount: "300.00" }));

    const dash = async () =>
      dashboardSchema.parse((await ctx.ana.get("/api/dashboard?month=2027-03")).body);
    const ana = () => dash().then((d) => d.people.find((p) => p.userId === ctx.anaId)!);
    expect(await ana()).toMatchObject({ closingBalance: "200.00", goalNet: "300.00" });
    // The household's savings and goals are untouched.
    const house = await dash();
    expect(house.goalAllocationsNet).toBe("0.00");
    expect(house.unallocatedSavings).toBe(house.savingsBeforeGoals);

    const history = personalHistorySchema.parse(
      (await ctx.ana.get(`/api/personal/history?userId=${ctx.anaId}&from=2027-03&to=2027-03`)).body,
    );
    expect(history.points[0]).toMatchObject({
      opening: "0.00",
      goals: "300.00",
      closing: "200.00",
    });

    // Withdrawing goes back to the personal balance; closing needs an empty goal.
    await ok(send(ctx.ana, "post", `${url}/withdrawals`, { amount: "100.00" }));
    expect((await ana()).closingBalance).toBe("300.00");
    expect((await send(ctx.ana, "post", `${url}/complete`)).body.error.code).toBe(
      "goal_has_balance",
    );
    await ok(send(ctx.ana, "post", `${url}/withdrawals`, { amount: "200.00" }), 201);
    await ok(send(ctx.ana, "post", `${url}/complete`), 200);
    expect(await ana()).toMatchObject({ closingBalance: "500.00", goalNet: "0.00" });
  }, 120_000);
});
