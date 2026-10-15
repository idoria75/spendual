import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp, newAgent, seedHousehold, signup } from "./helpers/authApp.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";

describe("static frontend", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "spendual-static-"));
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>spendual</title>");
    writeFileSync(path.join(dir, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(path.join(dir, "favicon.svg"), "<svg/>");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const app = () => makeApp(new PrismaClient(), { staticDir: dir });

  it("serves index.html at /", async () => {
    const res = await request(app()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>spendual</title>");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("falls back to index.html for client routes", async () => {
    const res = await request(app()).get("/entrar");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>spendual</title>");
  });

  it("serves hashed assets with long cache", async () => {
    const res = await request(app()).get("/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("serves other files", async () => {
    const res = await request(app()).get("/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe("<svg/>");
  });

  it("does not fall back for a missing asset", async () => {
    const res = await request(app()).get("/assets/missing.js");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<title>");
  });

  it("does not fall back for paths with a file extension", async () => {
    for (const p of ["/favicon.ico", "/robots.txt"]) {
      const res = await request(app()).get(p);
      expect(res.status).toBe(404);
      expect(res.text).not.toContain("<title>spendual</title>");
    }
  });

  it("keeps /health and /api as they are", async () => {
    const a = app();
    expect((await request(a).get("/health")).body).toEqual({ status: "ok" });
    const csrf = await request(a).get("/api/auth/csrf");
    expect(csrf.status).toBe(200);
    // Signed out, a protected path may answer 401. It is still JSON, never the page.
    const out = await request(a).get("/api/nope");
    expect(out.headers["content-type"]).toContain("application/json");
    expect(out.text).not.toContain("<title>");
  });

  it("returns a JSON 404 for an unknown /api path when signed in", async () => {
    const prisma = testPrisma();
    try {
      await resetDb(prisma);
      await seedHousehold(prisma);
      const agent = newAgent(makeApp(prisma, { staticDir: dir }));
      expect((await signup(agent, "ana")).status).toBe(201);
      const res = await agent.get("/api/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "not_found", message: "Not found" } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("serves no frontend when staticDir is unset", async () => {
    const res = await request(makeApp(new PrismaClient())).get("/");
    expect(res.status).toBe(404);
  });
});
