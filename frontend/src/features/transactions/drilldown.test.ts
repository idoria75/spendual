import { describe, expect, it } from "vitest";
import { categoryIdsOf, readDrilldown, spendingLink } from "./drilldown";
import { netSpent } from "./display";

describe("drilldown", () => {
  it("builds and reads back the link", () => {
    const link = spendingLink([3, null, 7]);
    expect(link).toBe("/lancamentos?categorias=3,none,7&escopo=household&status=confirmed");
    const parsed = readDrilldown(new URL(link, "http://x").searchParams);
    expect(parsed).toEqual({
      scope: "household",
      status: "confirmed",
      categoryId: "",
      categories: "3,none,7",
    });
    expect(categoryIdsOf("3,none,7")).toEqual([3, null, 7]);
  });

  it("ignores bad values", () => {
    const long = Array.from({ length: 51 }, (_, i) => i + 1).join(",");
    for (const bad of ["", "abc", "3,,4", "3,x", long]) {
      expect(readDrilldown(new URLSearchParams({ categorias: bad })).categories).toBeNull();
    }
    expect(
      readDrilldown(new URLSearchParams({ escopo: "x", status: "y", categoria: "z" })),
    ).toEqual({
      scope: "all",
      status: "all",
      categoryId: "",
      categories: null,
    });
  });
});

describe("netSpent", () => {
  const row = (type: string, status: string, amount: string) =>
    ({ type, status, amount }) as Parameters<typeof netSpent>[0][number];

  it("subtracts refunds and skips voided and other types", () => {
    expect(
      netSpent([
        row("expense", "confirmed", "100.10"),
        row("refund", "confirmed", "30.05"),
        row("expense", "voided", "999.00"),
        row("income", "confirmed", "500.00"),
      ]),
    ).toBe("70.05");
    expect(netSpent([])).toBe("0.00");
  });
});
