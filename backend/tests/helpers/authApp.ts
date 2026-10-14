import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp, type AppOptions } from "../../src/app.js";

export const PASSWORD = "correct-horse-battery";

export function makeApp(prisma: PrismaClient, opts: Partial<AppOptions> = {}) {
  return createApp({
    prisma,
    sessionSecret: "test-secret",
    // High by default so only the rate limit test hits it.
    loginLimit: { windowMs: 60_000, max: 1000 },
    ...opts,
  });
}

export type Agent = ReturnType<typeof request.agent>;

export function newAgent(app: ReturnType<typeof makeApp>): Agent {
  return request.agent(app);
}

/** Fetch the CSRF token for this agent's session. */
export async function csrfToken(agent: Agent): Promise<string> {
  const res = await agent.get("/api/auth/csrf");
  return res.body.csrfToken as string;
}

export async function signup(agent: Agent, username: string, password = PASSWORD) {
  const token = await csrfToken(agent);
  return agent
    .post("/api/auth/signup")
    .set("X-CSRF-Token", token)
    .send({ username, displayName: username.toUpperCase(), password });
}

export async function login(agent: Agent, username: string, password = PASSWORD) {
  const token = await csrfToken(agent);
  return agent.post("/api/auth/login").set("X-CSRF-Token", token).send({ username, password });
}

export async function seedHousehold(prisma: PrismaClient) {
  await prisma.household.create({ data: { id: 1, name: "Casa" } });
}
