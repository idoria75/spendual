import { formatBytes } from "./bytes";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1000, "1 KB"],
    [1_258_291, "1,3 MB"],
    [999_949, "999,9 KB"],
    [999_950, "1 MB"],
    [999_950_000, "1 GB"],
  ])("%i -> %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
