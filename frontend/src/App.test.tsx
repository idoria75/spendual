import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { resetCsrfToken } from "./lib/api-client";
import { apiError, json, mockFetch, shellStubs, user } from "./test/fetch-mock";

beforeEach(() => resetCsrfToken());
afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

async function fill(label: string, value: string) {
  await userEvent.type(screen.getByLabelText(label), value);
}

it("redirects to /entrar when /me returns 401", async () => {
  mockFetch(({ url }) =>
    url === "/api/auth/me" ? apiError(401, "unauthenticated") : json(404, {}),
  );
  renderAt("/");
  expect(await screen.findByRole("button", { name: "Entrar", pressed: true })).toBeInTheDocument();
  expect(screen.queryByText("Olá, Ana")).not.toBeInTheDocument();
});

it("shows the home page when /me returns the user", async () => {
  mockFetch(({ url }) => shellStubs(url) ?? json(200, user));
  renderAt("/");
  expect(await screen.findByText("Olá, Ana")).toBeInTheDocument();
});

it("login success sends the CSRF header and goes home", async () => {
  const mock = mockFetch(({ url }) => {
    if (url === "/api/auth/me") return apiError(401, "unauthenticated");
    if (url === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    if (url === "/api/auth/login") return json(200, user);
    return shellStubs(url) ?? json(404, {});
  });
  renderAt("/entrar");
  await fill("Usuário", "ana");
  await fill("Senha", "senha-bem-longa");
  await userEvent.click(screen.getAllByRole("button", { name: "Entrar" }).at(-1)!);
  expect(await screen.findByText("Olá, Ana")).toBeInTheDocument();
  const call = mock.mock.calls.find(([u]) => u === "/api/auth/login")!;
  expect(new Headers(call[1]?.headers).get("X-CSRF-Token")).toBe("tok");
  expect(JSON.parse(call[1]?.body as string)).toEqual({
    username: "ana",
    password: "senha-bem-longa",
  });
});

it("wrong credentials shows the message", async () => {
  mockFetch(({ url }) => {
    if (url === "/api/auth/me") return apiError(401, "unauthenticated");
    if (url === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    return apiError(401, "invalid_credentials");
  });
  renderAt("/entrar");
  await fill("Usuário", "ana");
  await fill("Senha", "errada");
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Usuário ou senha incorretos.");
});

it("signup shows the household_full message", async () => {
  mockFetch(({ url }) => {
    if (url === "/api/auth/me") return apiError(401, "unauthenticated");
    if (url === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    return apiError(409, "household_full");
  });
  renderAt("/entrar");
  await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await fill("Nome", "Bia");
  await fill("Usuário", "bia");
  await fill("Senha", "senha-bem-longa");
  await userEvent.keyboard("{Enter}");
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Esta casa já tem 2 contas."),
  );
});

it("blocks a short password on signup and ties the error to the field", async () => {
  const mock = mockFetch(({ url }) =>
    url === "/api/auth/me" ? apiError(401, "unauthenticated") : json(404, {}),
  );
  renderAt("/entrar");
  await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await fill("Nome", "Bia");
  await fill("Usuário", "bia");
  await fill("Senha", "abc");
  await userEvent.keyboard("{Enter}");
  const input = await screen.findByLabelText("Senha");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("A senha deve ter de 4 a 200 caracteres.");
  expect(mock.mock.calls.some(([u]) => u === "/api/auth/signup")).toBe(false);
});
