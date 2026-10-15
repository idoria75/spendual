import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dateOnlyToDate, resolveDueDate } from "../src/lib/period.js";
import { generateOccurrences } from "../src/services/recurrence.js";
import { makeUser, resetDb, testPrisma } from "./helpers/testDb.js";

describe("resolveDueDate", () => {
  it.each([
    ["2026-01", 31, "2026-01-31"],
    ["2026-02", 31, "2026-02-28"],
    ["2026-02", 29, "2026-02-28"],
    ["2028-02", 29, "2028-02-29"],
    ["2028-02", 30, "2028-02-29"],
    ["2026-04", 31, "2026-04-30"],
    ["2026-04", 30, "2026-04-30"],
    ["2026-06", 29, "2026-06-29"],
    ["2026-03", 1, "2026-03-01"],
  ])("%s day %i -> %s", (period, day, expected) => {
    expect(resolveDueDate(period, day)).toBe(expected);
  });

  it("rejects bad days and periods", () => {
    expect(() => resolveDueDate("2026-01", 0)).toThrow();
    expect(() => resolveDueDate("2026-01", 32)).toThrow();
    expect(() => resolveDueDate("2026-13", 1)).toThrow();
  });
});

describe("generateOccurrences", () => {
  let prisma: PrismaClient;
  let ruleId: number;

  beforeAll(() => {
    prisma = testPrisma();
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    const u = await makeUser(prisma, "ana");
    const rule = await prisma.recurrenceRule.create({
      data: {
        description: "Internet",
        dayOfMonth: 31,
        startDate: dateOnlyToDate("2026-01-10"),
        scope: "household",
        createdById: u.id,
        updatedById: u.id,
      },
    });
    ruleId = rule.id;
  });

  it("creates 4 months with month-end days and a null amount", async () => {
    expect(await generateOccurrences(prisma, ruleId, "2026-01")).toBe(4);
    const rows = await prisma.recurrenceOccurrence.findMany({ orderBy: { periodKey: "asc" } });
    expect(rows.map((r) => r.periodKey)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(rows.map((r) => r.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(rows.every((r) => r.expectedAmount === null)).toBe(true);
  });

  it("run twice gives no duplicates", async () => {
    await generateOccurrences(prisma, ruleId, "2026-01");
    expect(await generateOccurrences(prisma, ruleId, "2026-01")).toBe(0);
    expect(await prisma.recurrenceOccurrence.count()).toBe(4);
    // an overlapping window adds only the new months
    expect(await generateOccurrences(prisma, ruleId, "2026-03")).toBe(2);
    expect(await prisma.recurrenceOccurrence.count()).toBe(6);
  });

  it("parallel runs give no duplicates and no error", async () => {
    await Promise.all(
      Array.from({ length: 6 }, () => generateOccurrences(prisma, ruleId, "2026-01")),
    );
    expect(await prisma.recurrenceOccurrence.count()).toBe(4);
  });

  it("skips months before the start date and after the end date", async () => {
    await prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: { startDate: dateOnlyToDate("2026-02-01"), endDate: dateOnlyToDate("2026-03-15") },
    });
    await generateOccurrences(prisma, ruleId, "2026-01");
    const rows = await prisma.recurrenceOccurrence.findMany({ orderBy: { periodKey: "asc" } });
    // Day 31 of March is after the end date 03-15, so March is skipped too.
    expect(rows.map((r) => r.periodKey)).toEqual(["2026-02"]);
  });

  it("skips the first month when the due day is before the start date", async () => {
    await prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: { dayOfMonth: 5, startDate: dateOnlyToDate("2026-01-10") },
    });
    await generateOccurrences(prisma, ruleId, "2026-01");
    const rows = await prisma.recurrenceOccurrence.findMany({ orderBy: { periodKey: "asc" } });
    expect(rows.map((r) => r.periodKey)).toEqual(["2026-02", "2026-03", "2026-04"]);
  });

  it("keeps the due day equal to the start date and equal to the end date", async () => {
    await prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: {
        dayOfMonth: 10,
        startDate: dateOnlyToDate("2026-01-10"),
        endDate: dateOnlyToDate("2026-03-10"),
      },
    });
    await generateOccurrences(prisma, ruleId, "2026-01");
    const rows = await prisma.recurrenceOccurrence.findMany({ orderBy: { periodKey: "asc" } });
    expect(rows.map((r) => r.periodKey)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("skips the last month when the due day is after the end date", async () => {
    await prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: { dayOfMonth: 20, endDate: dateOnlyToDate("2026-03-19") },
    });
    await generateOccurrences(prisma, ruleId, "2026-01");
    const rows = await prisma.recurrenceOccurrence.findMany({ orderBy: { periodKey: "asc" } });
    expect(rows.map((r) => r.periodKey)).toEqual(["2026-01", "2026-02"]);
  });

  it("creates nothing for a paused rule", async () => {
    await prisma.recurrenceRule.update({ where: { id: ruleId }, data: { state: "paused" } });
    expect(await generateOccurrences(prisma, ruleId, "2026-01")).toBe(0);
  });
});
