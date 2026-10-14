import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authUserSchema, backupStatusSchema } from "@spendual/shared";
import {
  csrfToken,
  login,
  makeApp,
  newAgent,
  seedHousehold,
  signup,
  type Agent,
} from "./helpers/authApp.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";

let prisma: PrismaClient;
let ana: Agent;
let bia: Agent;
let anaToken: string;
let biaToken: string;
let dir: string;

beforeAll(() => {
  prisma = testPrisma();
});
afterAll(() => prisma.$disconnect());

async function setup(backupDir?: string) {
  await resetDb(prisma);
  await seedHousehold(prisma);
  const app = makeApp(prisma, { backupDir });
  ana = newAgent(app);
  bia = newAgent(app);
  await signup(ana, "ana");
  await signup(bia, "bia");
  anaToken = await csrfToken(ana);
  biaToken = await csrfToken(bia);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "spendual-bk-"));
  await setup(dir);
  return async () => rm(dir, { recursive: true, force: true });
});

const patch = (a: Agent, token: string, body: unknown) =>
  a
    .patch("/api/me")
    .set("X-CSRF-Token", token)
    .send(body as object);

describe("signup defaults", () => {
  it("gives the first account blue and the second rose, theme system", async () => {
    const a = authUserSchema.parse((await ana.get("/api/auth/me")).body);
    const b = authUserSchema.parse((await bia.get("/api/auth/me")).body);
    expect([a.tonePalette, b.tonePalette]).toEqual(["blue", "rose"]);
    expect(a.theme).toBe("system");
  });
});

describe("PATCH /me", () => {
  it("trims the name and returns the user", async () => {
    const res = await patch(ana, anaToken, { displayName: "  Ana Maria  " });
    expect(res.status).toBe(200);
    expect(authUserSchema.parse(res.body).displayName).toBe("Ana Maria");
  });

  it("rejects an empty patch, a blank name and a bad tone with 400", async () => {
    for (const body of [{}, { displayName: "   " }, { tonePalette: "green" }, { theme: "neon" }]) {
      const res = await patch(ana, anaToken, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });

  it("needs the CSRF token and a session", async () => {
    expect((await ana.patch("/api/me").send({ theme: "dark" })).status).toBe(403);
    const anon = newAgent(makeApp(prisma));
    expect((await anon.patch("/api/me").send({ theme: "dark" })).status).toBe(401);
  });

  it("persists the theme and /auth/me returns it, also after login", async () => {
    expect((await patch(ana, anaToken, { theme: "dark" })).body.theme).toBe("dark");
    expect((await ana.get("/api/auth/me")).body.theme).toBe("dark");
    const again = newAgent(makeApp(prisma));
    expect((await login(again, "ana")).body.theme).toBe("dark");
  });

  it("clears the tone with null and lets the other user take it", async () => {
    expect((await patch(ana, anaToken, { tonePalette: null })).body.tonePalette).toBeNull();
    expect((await patch(bia, biaToken, { tonePalette: "blue" })).status).toBe(200);
  });

  it("returns 409 tone_taken for the other user's tone", async () => {
    const res = await patch(ana, anaToken, { tonePalette: "rose" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("tone_taken");
  });

  it("keeps my own tone when I send it again", async () => {
    expect((await patch(ana, anaToken, { tonePalette: "blue" })).status).toBe(200);
  });

  it("two users pick the same tone in parallel: one 200, one 409", async () => {
    const [a, b] = await Promise.all([
      patch(ana, anaToken, { tonePalette: "sage" }),
      patch(bia, biaToken, { tonePalette: "sage" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.user.count({ where: { tonePalette: "sage" } })).toBe(1);
  });

  it("lookups still show the new tone", async () => {
    await patch(ana, anaToken, { tonePalette: "slate" });
    const res = await ana.get("/api/lookups");
    expect(res.body.users[0].tonePalette).toBe("slate");
  });
});

describe("GET /backup/status", () => {
  it("is configured with nulls for an empty dir", async () => {
    const res = await ana.get("/api/backup/status");
    expect(backupStatusSchema.parse(res.body)).toEqual({
      configured: true,
      lastBackupAt: null,
      lastBackupBytes: null,
    });
  });

  it("reports the newest regular file and ignores sub-directories", async () => {
    await writeFile(join(dir, "old.sql.gz"), "aa");
    await writeFile(join(dir, "new.sql.gz"), "bbbbb");
    await utimes(
      join(dir, "old.sql.gz"),
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    );
    await utimes(
      join(dir, "new.sql.gz"),
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
    );
    const res = await ana.get("/api/backup/status");
    expect(res.body).toEqual({
      configured: true,
      lastBackupAt: "2026-02-01T00:00:00.000Z",
      lastBackupBytes: 5,
    });
    expect(JSON.stringify(res.body)).not.toContain(dir);
  });

  it("is not configured when the dir is unset or missing", async () => {
    for (const backupDir of [undefined, join(dir, "nope")]) {
      await setup(backupDir);
      const res = await ana.get("/api/backup/status");
      expect(res.body).toEqual({ configured: false, lastBackupAt: null, lastBackupBytes: null });
    }
  });

  it("needs a session", async () => {
    expect((await newAgent(makeApp(prisma)).get("/api/backup/status")).status).toBe(401);
  });
});
