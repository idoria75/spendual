import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { apiErrorSchema, authUserSchema } from "@spendual/shared";
import {
  PASSWORD,
  csrfToken,
  login,
  makeApp,
  newAgent,
  seedHousehold,
  signup,
} from "./helpers/authApp.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = testPrisma();
});
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDb(prisma);
  await seedHousehold(prisma);
});

/** Raw session id from a Set-Cookie header ("s:<sid>.<signature>", URL-encoded). */
const sid = (res: request.Response): string => {
  const raw = (res.headers["set-cookie"] as unknown as string[])[0] ?? "";
  const value = decodeURIComponent(/spendual\.sid=([^;]+)/.exec(raw)?.[1] ?? "");
  return value.slice(2, value.lastIndexOf("."));
};

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe("signup", () => {
  it("succeeds twice, rejects the third with household_full", async () => {
    const app = makeApp(prisma);
    const a = await signup(newAgent(app), "ana");
    expect(a.status).toBe(201);
    expect(authUserSchema.parse(a.body).username).toBe("ana");
    expect((await signup(newAgent(app), "beto")).status).toBe(201);
    const c = await signup(newAgent(app), "caio");
    expect(c.status).toBe(409);
    expect(errorCode(c.body)).toBe("household_full");
    expect(await prisma.user.count()).toBe(2);
  });

  it("rejects a duplicate username with username_taken", async () => {
    const app = makeApp(prisma);
    await signup(newAgent(app), "ana");
    const res = await signup(newAgent(app), "ana");
    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe("username_taken");
  });

  it("5 concurrent signups give exactly 2 users and clean household_full for the rest", async () => {
    const app = makeApp(prisma);
    const agents = Array.from({ length: 5 }, () => newAgent(app));
    const tokens = await Promise.all(agents.map(csrfToken));
    const results = await Promise.all(
      agents.map((agent, i) =>
        agent
          .post("/api/auth/signup")
          .set("X-CSRF-Token", tokens[i] as string)
          .send({ username: `user${i}`, displayName: `User ${i}`, password: PASSWORD }),
      ),
    );
    expect(results.map((r) => r.status).filter((s) => s === 500)).toEqual([]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const rejected = results.filter((r) => r.status !== 201);
    expect(rejected).toHaveLength(3);
    for (const r of rejected) {
      expect(r.status).toBe(409);
      expect(errorCode(r.body)).toBe("household_full");
    }
    expect(await prisma.user.count()).toBe(2);
  });

  it("returns validation_error with fields", async () => {
    const agent = newAgent(makeApp(prisma));
    const token = await csrfToken(agent);
    const res = await agent
      .post("/api/auth/signup")
      .set("X-CSRF-Token", token)
      .send({ username: "a", displayName: "", password: "short" });
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe("validation_error");
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      "displayName",
      "password",
      "username",
    ]);
  });

  it("stores an argon2 hash, not the password", async () => {
    await signup(newAgent(makeApp(prisma)), "ana");
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ana" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });
});

describe("login and logout", () => {
  it("logs in with the right password and reaches /me", async () => {
    const app = makeApp(prisma);
    await signup(newAgent(app), "ana");
    const agent = newAgent(app);
    const res = await login(agent, "ana");
    expect(res.status).toBe(200);
    expect(authUserSchema.parse(res.body).username).toBe("ana");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.username).toBe("ana");
  });

  it("gives the same invalid_credentials for unknown user and wrong password", async () => {
    const app = makeApp(prisma);
    await signup(newAgent(app), "ana");
    const wrong = await login(newAgent(app), "ana", "wrong-password-1");
    const unknown = await login(newAgent(app), "nobody", "wrong-password-1");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(errorCode(wrong.body)).toBe("invalid_credentials");
  });

  it("changes the session id on login", async () => {
    const app = makeApp(prisma);
    await signup(newAgent(app), "ana");
    const agent = newAgent(app);
    const first = await agent.get("/api/auth/csrf");
    const token = first.body.csrfToken as string;
    const before = sid(first);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", token)
      .send({ username: "ana", password: PASSWORD });
    const after = sid(res);
    expect(after).not.toBe(before);
    expect(await prisma.session.findFirst({ where: { sid: before } })).toBeNull();
    expect(await prisma.session.findFirst({ where: { sid: after } })).not.toBeNull();
  });

  it("revokes the session on the server after logout", async () => {
    const app = makeApp(prisma);
    await signup(newAgent(app), "ana");
    const agent = newAgent(app);
    const loggedIn = await login(agent, "ana");
    const cookie = (loggedIn.headers["set-cookie"] as unknown as string[])[0]?.split(";")[0] ?? "";
    expect(cookie).toContain("spendual.sid=");
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    const token = await csrfToken(agent);
    const out = await agent.post("/api/auth/logout").set("X-CSRF-Token", token);
    expect(out.status).toBe(204);
    expect(out.headers["set-cookie"]?.[0]).toMatch(/spendual\.sid=;/);
    expect(await prisma.session.findFirst({ where: { sid: sid(loggedIn) } })).toBeNull();
    // Replay the old cookie by hand.
    const replay = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(replay.status).toBe(401);
    expect(errorCode(replay.body)).toBe("unauthenticated");
  });

  it("logout without a login is 401", async () => {
    const agent = newAgent(makeApp(prisma));
    const token = await csrfToken(agent);
    const res = await agent.post("/api/auth/logout").set("X-CSRF-Token", token);
    expect(res.status).toBe(401);
  });
});

describe("protected routes", () => {
  it("/me rejects an unauthenticated request", async () => {
    const res = await request(makeApp(prisma)).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(errorCode(res.body)).toBe("unauthenticated");
  });

  it("rejects a session whose user was deactivated", async () => {
    const app = makeApp(prisma);
    const agent = newAgent(app);
    await signup(agent, "ana");
    await prisma.user.update({ where: { username: "ana" }, data: { active: false } });
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("session expiry", () => {
  it("expires after the max age", async () => {
    const app = makeApp(prisma, { sessionMaxAgeMs: 1500 });
    const agent = newAgent(app);
    await signup(agent, "ana");
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    await new Promise((r) => setTimeout(r, 2200));
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("rolls: activity extends the session", async () => {
    const app = makeApp(prisma, { sessionMaxAgeMs: 4000 });
    const agent = newAgent(app);
    await signup(agent, "ana");
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      expect((await agent.get("/api/auth/me")).status).toBe(200);
    }
  });

  it("sets the cookie flags", async () => {
    const res = await request(makeApp(prisma)).get("/api/auth/csrf");
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    const expires = new Date(/Expires=([^;]+)/.exec(cookie)?.[1] ?? "").getTime();
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expires - Date.now() - week)).toBeLessThan(60_000);
  });
});

describe("csrf", () => {
  it("returns a token that stays the same in one session", async () => {
    const agent = newAgent(makeApp(prisma));
    const t1 = await csrfToken(agent);
    expect(t1.length).toBeGreaterThan(20);
    expect(await csrfToken(agent)).toBe(t1);
  });

  it("rejects state-changing requests with a missing or wrong token", async () => {
    const app = makeApp(prisma);
    const agent = newAgent(app);
    await csrfToken(agent);
    const body = { username: "ana", displayName: "Ana", password: PASSWORD };
    for (const path of ["/api/auth/signup", "/api/auth/login", "/api/auth/logout"]) {
      const missing = await agent.post(path).send(body);
      expect(missing.status).toBe(403);
      expect(errorCode(missing.body)).toBe("csrf_invalid");
      const wrong = await agent.post(path).set("X-CSRF-Token", "nope").send(body);
      expect(wrong.status).toBe(403);
      expect(errorCode(wrong.body)).toBe("csrf_invalid");
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects a request with no session at all", async () => {
    const res = await request(makeApp(prisma))
      .post("/api/auth/login")
      .set("X-CSRF-Token", "x")
      .send({ username: "a", password: "b" });
    expect(res.status).toBe(403);
  });

  it("rejects a token from another session", async () => {
    const app = makeApp(prisma);
    const other = await csrfToken(newAgent(app));
    const agent = newAgent(app);
    await csrfToken(agent);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", other)
      .send({ username: "a", password: "b" });
    expect(res.status).toBe(403);
  });
});

describe("secrets never leak", () => {
  it("no response contains the password or a hash", async () => {
    const app = makeApp(prisma);
    const responses = [];
    const agent = newAgent(app);
    responses.push(await agent.get("/api/auth/csrf"));
    responses.push(await signup(agent, "ana"));
    responses.push(await agent.get("/api/auth/me"));
    const token = await csrfToken(agent);
    responses.push(await agent.post("/api/auth/logout").set("X-CSRF-Token", token));
    responses.push(await login(agent, "ana"));
    responses.push(await login(newAgent(app), "ana", "wrong-password-1"));
    responses.push(await signup(newAgent(app), "ana"));
    responses.push(await signup(newAgent(app), "beto"));
    responses.push(await signup(newAgent(app), "caio"));
    for (const r of responses) {
      const text = JSON.stringify(r.body) + JSON.stringify(r.headers);
      expect(text).not.toMatch(/argon2|passwordHash/i);
      expect(text).not.toContain(PASSWORD);
    }
  });
});

describe("login rate limit", () => {
  it("returns 429 rate_limited after too many failed logins", async () => {
    const app = makeApp(prisma, { loginLimit: { windowMs: 60_000, max: 3 } });
    const agent = newAgent(app);
    const token = await csrfToken(agent);
    const attempt = () =>
      agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", token)
        .send({ username: "ana", password: "wrong-password-1" });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked.body)).toBe("rate_limited");
  });
});

describe("errors", () => {
  it("returns validation_error for broken JSON", async () => {
    const agent = newAgent(makeApp(prisma));
    const token = await csrfToken(agent);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", token)
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe("validation_error");
  });
});
