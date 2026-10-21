import type { TrendPoint } from "@spendual/shared";
import { describe, expect, it } from "vitest";
import {
  averageCents,
  averagedPoints,
  axisScale,
  cumulativeNet,
  customWindow,
  formatRange,
  isOver,
  monthOptions,
  monthsAbove,
  periodNet,
  shortMonth,
  trendWindow,
  wholeReais,
} from "./trend";

const point = (over: Partial<TrendPoint>): TrendPoint => ({
  month: "2026-10",
  amount: "0.00",
  budget: null,
  partial: false,
  ...over,
});

describe("trendWindow", () => {
  it("ends at the selected month and goes back N-1 months", () => {
    expect(trendWindow("2026-10", "2026-10", 6)).toEqual({ from: "2026-05", to: "2026-10" });
    expect(trendWindow("2026-03", "2026-10", 12)).toEqual({ from: "2025-04", to: "2026-03" });
  });
  it("clamps a future month to the current month", () => {
    expect(trendWindow("2027-01", "2026-10", 6)).toEqual({ from: "2026-05", to: "2026-10" });
  });
});

describe("averageCents", () => {
  it("averages closed months and skips the month in progress", () => {
    const pts = [
      point({ amount: "100.00" }),
      point({ amount: "120.00" }),
      point({ amount: "150.00" }),
      point({ amount: "9999.00", partial: true }),
    ];
    expect(averageCents(pts)).toBe(12333n); // 123,33
  });
  it("starts at the first month with spending", () => {
    const pts = [
      point({ amount: "0.00" }),
      point({ amount: "0.00" }),
      point({ amount: "100.00" }),
      point({ amount: "0.00" }),
      point({ amount: "50.00", partial: true }),
    ];
    expect(averagedPoints(pts)).toHaveLength(2);
    expect(averageCents(pts)).toBe(5000n); // 100 and 0 after it, the empty start is left out
    expect(averageCents([point({ amount: "0.00" }), point({ amount: "0.00" })])).toBeNull();
  });
  it("rounds half up and is null without a closed month", () => {
    expect(averageCents([point({ amount: "0.01" }), point({ amount: "0.02" })])).toBe(2n);
    expect(averageCents([point({ amount: "5.00", partial: true })])).toBeNull();
    expect(averageCents([])).toBeNull();
  });
});

describe("budget comparison", () => {
  it("is over only when spent is above the budget of that month", () => {
    expect(isOver(point({ amount: "130.01", budget: "130.00" }))).toBe(true);
    expect(isOver(point({ amount: "130.00", budget: "130.00" }))).toBe(false);
    expect(isOver(point({ amount: "999.00", budget: null }))).toBe(false);
  });
  it("counts closed months over budget out of closed months with a budget", () => {
    const pts = [
      point({ amount: "100.00", budget: "120.00" }),
      point({ amount: "150.00", budget: "130.00" }),
      point({ amount: "10.00", budget: null }),
      point({ amount: "900.00", budget: "130.00", partial: true }),
    ];
    expect(monthsAbove(pts)).toEqual({ above: 1, withBudget: 2 });
  });
});

describe("axisScale", () => {
  it("rounds the top up to a tick step with at most 5 steps", () => {
    expect(axisScale(15000n)).toEqual({ max: 200, step: 50 });
    expect(axisScale(189000n)).toEqual({ max: 2500, step: 500 });
    expect(axisScale(0n)).toEqual({ max: 10, step: 10 });
  });
});

describe("wholeReais", () => {
  it("rounds half away from zero", () => {
    expect(wholeReais(12349n)).toBe(123n);
    expect(wholeReais(12350n)).toBe(124n);
    expect(wholeReais(-12350n)).toBe(-124n);
  });
});

describe("month labels", () => {
  it("shortens the month name", () => {
    expect(shortMonth("2026-05")).toBe("Mai");
    expect(shortMonth("2026-10")).toBe("Out");
  });
  it("shows the year once, or on both ends when they differ", () => {
    expect(formatRange("2026-05", "2026-10")).toBe("Mai – Out 2026");
    expect(formatRange("2025-11", "2026-04")).toBe("Nov 2025 – Abr 2026");
  });
});

describe("cumulative net (budget minus spent)", () => {
  const pts = [
    point({ month: "2026-04", amount: "0.00", budget: "100.00" }), // before the first spending
    point({ month: "2026-05", amount: "80.00", budget: "100.00" }), // +20
    point({ month: "2026-06", amount: "130.00", budget: "100.00" }), // -30
    point({ month: "2026-07", amount: "50.00", budget: null }), // no budget: 0
    point({ month: "2026-08", amount: "60.00", budget: "100.00", partial: true }), // in progress
  ];
  it("adds up from the first month with spending and skips the month in progress", () => {
    const net = cumulativeNet(pts);
    expect([...net.entries()]).toEqual([
      ["2026-05", 2000n],
      ["2026-06", -1000n],
      ["2026-07", -1000n],
    ]);
  });
  it("gives the period total and how many months had a budget", () => {
    expect(periodNet(pts)).toEqual({ total: -1000n, months: 2 });
    expect(periodNet([point({ partial: true })])).toBeNull();
  });
});

describe("custom range", () => {
  it("lists the current month first, 60 months back", () => {
    const list = monthOptions("2026-10");
    expect(list[0]).toBe("2026-10");
    expect(list[1]).toBe("2026-09");
    expect(list).toHaveLength(61);
    expect(list.at(-1)).toBe("2021-10");
  });
  it("accepts from <= to <= current and refuses the rest", () => {
    expect(customWindow("2026-01", "2026-10", "2026-10")).toEqual({
      from: "2026-01",
      to: "2026-10",
    });
    expect(customWindow("2026-10", "2026-10", "2026-10")).not.toBeNull();
    expect(customWindow("2026-10", "2026-09", "2026-10")).toBeNull();
    expect(customWindow("2026-01", "2026-11", "2026-10")).toBeNull();
  });
});
