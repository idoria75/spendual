import { formatMoney, fromCents, parseAmountInput, toCents } from "./currency";

describe("parseAmountInput", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["0,5", "0.50"],
    ["1234", "1234.00"],
    ["1.234", "1234.00"],
    ["12,3", "12.30"],
    ["12,", "12.00"],
    [",5", "0.50"],
    ["007,10", "7.10"],
    [" R$ 9,99 ", "9.99"],
    ["0", "0.00"],
  ])("parses %s", (input, expected) => expect(parseAmountInput(input)).toBe(expected));

  it.each([
    [""],
    ["   "],
    [","],
    ["1,234"],
    ["12,345,6"],
    ["abc"],
    ["12.5"],
    ["1.23.4"],
    ["-5"],
    ["12345678901"],
  ])("rejects %j", (input) => expect(parseAmountInput(input)).toBeNull());
});

describe("formatMoney", () => {
  it("formats an expense with the real minus", () => {
    expect(formatMoney("312.40", "minus")).toBe("−R$ 312,40");
  });
  it("formats income with plus and thousands", () => {
    expect(formatMoney("7100.00", "plus")).toBe("+R$ 7.100,00");
  });
  it("keeps cents and a negative sign", () => {
    expect(formatMoney("-1.05")).toBe("−R$ 1,05");
    expect(formatMoney("0.50")).toBe("R$ 0,50");
  });
});

describe("cents helpers", () => {
  it("round-trips", () => {
    expect(toCents("12.34")).toBe(1234n);
    expect(fromCents(1234n)).toBe("12.34");
    expect(fromCents(-5n)).toBe("-0.05");
  });
});
