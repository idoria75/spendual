import { vi } from "vitest";

export type Handler = (req: {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}) => Response;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiError(status: number, code: string, message = "msg"): Response {
  return json(status, { error: { code, message } });
}

export const user = {
  id: 1,
  username: "ana",
  displayName: "Ana",
  tonePalette: null,
  theme: "system",
};

/** Replace global fetch with a handler. Returns the mock to inspect calls. */
export function mockFetch(handler: Handler) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof init?.body === "string" ? init.body : undefined;
    return Promise.resolve(
      handler({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: raw ? (JSON.parse(raw) as unknown) : undefined,
      }),
    );
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Empty but valid answers for the endpoints the signed-in shell and Início call. */
export function shellStubs(url: string): Response | null {
  const path = url.split("?")[0];
  if (path === "/api/lookups")
    return json(200, { users: [user], categories: [], accounts: [], paymentMethods: [] });
  if (path === "/api/dashboard") {
    const zero = "0.00";
    return json(200, {
      month: "2026-10",
      householdIncome: zero,
      sharedExpensesNet: zero,
      allowanceAllocations: zero,
      savingsBeforeGoals: zero,
      goalAllocationsNet: zero,
      unallocatedSavings: zero,
      savingsRate: null,
      plannedBillsTotal: zero,
      plannedBillsUnknownCount: 0,
      overallBudget: { budget: null, spent: zero },
      people: [],
    });
  }
  if (path === "/api/bills")
    return json(200, {
      month: "2026-10",
      items: [],
      overdue: [],
      plannedTotal: "0.00",
      unknownCount: 0,
    });
  return null;
}
