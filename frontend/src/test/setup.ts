import "@testing-library/jest-dom/vitest";
import "../i18n";
import { afterEach, beforeEach, vi } from "vitest";

// An unexpected console.error means an unmocked endpoint or a real bug. Fail the test.
// A test that expects one calls `expectConsoleError()`.
let errorSpy: ReturnType<typeof vi.spyOn>;
let allowed = false;

export function expectConsoleError() {
  allowed = true;
}

beforeEach(() => {
  allowed = false;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  const calls = errorSpy.mock.calls.length;
  errorSpy.mockRestore();
  if (calls > 0 && !allowed) {
    throw new Error(`Unexpected console.error (${calls} call(s)). Mock the endpoint or fix the bug.`);
  }
});
