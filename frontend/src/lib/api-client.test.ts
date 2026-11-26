import { z } from "zod";
import { ApiError, api, resetCsrfToken } from "./api-client";
import { apiError, json, mockFetch } from "../test/fetch-mock";

beforeEach(() => resetCsrfToken());
afterEach(() => vi.unstubAllGlobals());

const okSchema = z.object({ ok: z.boolean() });

it("sends the CSRF header on POST and caches the token", async () => {
  const mock = mockFetch(({ url }) =>
    url === "/api/auth/csrf" ? json(200, { csrfToken: "tok1" }) : json(200, { ok: true }),
  );
  await api.post("/x", { a: 1 }, okSchema);
  await api.post("/x", { a: 2 }, okSchema);
  const posts = mock.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(2);
  for (const [, init] of posts) {
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("tok1");
    expect(init?.credentials).toBe("include");
  }
  expect(mock.mock.calls.filter(([u]) => u === "/api/auth/csrf")).toHaveLength(1);
});

it("does not fetch a token for GET", async () => {
  const mock = mockFetch(() => json(200, { ok: true }));
  await api.get("/x", okSchema);
  expect(mock).toHaveBeenCalledTimes(1);
});

it("refetches the token once on csrf_invalid and retries", async () => {
  let tokens = 0;
  let posts = 0;
  const mock = mockFetch(({ url, headers }) => {
    if (url === "/api/auth/csrf") return json(200, { csrfToken: `tok${++tokens}` });
    posts++;
    return headers.get("X-CSRF-Token") === "tok2"
      ? json(200, { ok: true })
      : apiError(403, "csrf_invalid");
  });
  await expect(api.post("/x", {}, okSchema)).resolves.toEqual({ ok: true });
  expect(tokens).toBe(2);
  expect(posts).toBe(2);
  expect(mock).toHaveBeenCalledTimes(4);
});

it("gives up after one retry and throws a typed ApiError", async () => {
  let posts = 0;
  mockFetch(({ url }) => {
    if (url === "/api/auth/csrf") return json(200, { csrfToken: "t" });
    posts++;
    return apiError(403, "csrf_invalid");
  });
  const error = await api.post("/x", {}).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("csrf_invalid");
  expect(posts).toBe(2);
});

it("handles 204", async () => {
  mockFetch(({ url }) =>
    url === "/api/auth/csrf" ? json(200, { csrfToken: "t" }) : new Response(null, { status: 204 }),
  );
  await expect(api.post("/auth/logout")).resolves.toBeUndefined();
});
