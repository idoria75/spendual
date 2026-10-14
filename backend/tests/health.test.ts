import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers/authApp.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(makeApp(new PrismaClient())).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
