import {
  formatAmountInput,
  formatMoney,
  fromCents,
  maskAmountInput,
  parseAmountInput,
  toCents,
} from "./currency";

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
    ["10.000,00", "10000.00"],
    ["1.250,5", "1250.50"],
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
    ["1,234.56"],
    ["R$"],
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

describe("amount field mask", () => {
  it("fills digits from the right", () => {
    expect(maskAmountInput("1")).toBe("0,01");
    expect(maskAmountInput("12")).toBe("0,12");
    expect(maskAmountInput("123")).toBe("1,23");
    expect(maskAmountInput("123456")).toBe("1.234,56");
    expect(maskAmountInput("123456789")).toBe("1.234.567,89");
  });

  it("handles backspace, leading zeros and junk", () => {
    expect(maskAmountInput("1.234,5")).toBe("123,45");
    expect(maskAmountInput("0,0")).toBe("");
    expect(maskAmountInput("")).toBe("");
    expect(maskAmountInput("R$ 12ab3")).toBe("1,23");
  });

  it("caps the length", () => {
    expect(maskAmountInput("1".repeat(20))).toBe("1.111.111.111,11");
  });

  it("round-trips with parseAmountInput", () => {
    expect(parseAmountInput(maskAmountInput("123456"))).toBe("1234.56");
    expect(parseAmountInput(formatAmountInput("1234.50"))).toBe("1234.50");
    expect(formatAmountInput("0.05")).toBe("0,05");
    expect(formatAmountInput("0.00")).toBe("");
  });
});
