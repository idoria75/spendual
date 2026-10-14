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

export const user = { id: 1, username: "ana", displayName: "Ana", tonePalette: null };

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
