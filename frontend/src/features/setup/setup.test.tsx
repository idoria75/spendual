import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { currentMonth } from "../../lib/date";
import { apiError, json, mockFetch, shellStubs, user, type Handler } from "../../test/fetch-mock";

const lookups = {
  users: [user, { id: 2, displayName: "Bia", tonePalette: "rose" }],
  categories: [
    { id: 1, name: "Casa e suprimentos", kind: "expense", active: true },
    { id: 2, name: "Transporte", kind: "expense", active: true },
    { id: 3, name: "Salário", kind: "income", active: true },
  ],
  accounts: [],
  paymentMethods: [],
};

let completed = false;

function handler(extra?: (req: Parameters<Handler>[0]) => Response | undefined): Handler {
  return (req) => {
    const early = extra?.(req);
    if (early) return early;
    const path = req.url.split("?")[0];
    if (path === "/api/auth/me") return json(200, user);
    if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    if (path === "/api/lookups") return json(200, lookups);
    if (path === "/api/setup") return json(200, { completed });
    if (path === "/api/setup/complete") {
      completed = true;
      return json(200, { completed: true });
    }
    if (path === "/api/budgets")
      return json(200, {
        month: currentMonth(),
        overall: { categoryId: null, amount: "0.00", spent: "0.00" },
        categories: [],
      });
    if (path === "/api/allowances") return json(200, { month: currentMonth(), people: [] });
    return shellStubs(req.url) ?? json(404, {});
  };
}

beforeEach(() => {
  resetCsrfToken();
  completed = false;
});
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

const callsTo = (mock: ReturnType<typeof mockFetch>, url: string, method: string) =>
  mock.mock.calls.filter(([u, init]) => u === url && init?.method === method);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string) as unknown;

it("redirects to the setup page while setup is not completed", async () => {
  mockFetch(handler());
  renderAt("/lancamentos");
  expect(await screen.findByRole("heading", { name: "Configuração inicial" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Abas" })).not.toBeInTheDocument();
});

it("skips the setup page once it is completed", async () => {
  completed = true;
  mockFetch(handler());
  renderAt("/configuracao");
  expect(await screen.findByText("Olá, Ana")).toBeInTheDocument();
});

it("saves budgets and allowances, then completes and opens Início", async () => {
  const mock = mockFetch(handler());
  renderAt("/");
  await screen.findByRole("heading", { name: "Configuração inicial" });
  await userEvent.type(await screen.findByLabelText("Orçamento mensal da casa"), "800000");
  expect(screen.getByLabelText("Orçamento mensal da casa")).toHaveValue("8.000,00");
  await userEvent.type(screen.getByLabelText("Casa e suprimentos"), "150000");
  await userEvent.type(screen.getByLabelText("Mesada de Bia"), "50000");
  // Income categories are not budgeted.
  expect(screen.queryByLabelText("Salário")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Concluir" }));

  expect(await screen.findByText("Olá, Ana")).toBeInTheDocument();
  const period = currentMonth();
  expect(callsTo(mock, "/api/budgets", "PUT").map(bodyOf)).toEqual([
    { categoryId: null, period, amount: "8000.00", mode: "going_forward" },
    { categoryId: 1, period, amount: "1500.00", mode: "going_forward" },
  ]);
  expect(callsTo(mock, "/api/allowances", "POST").map(bodyOf)).toEqual([
    { ownerId: 2, month: period, amount: "500.00" },
  ]);
  expect(callsTo(mock, "/api/setup/complete", "POST")).toHaveLength(1);
});

it("completes without saving anything on Pular por agora", async () => {
  const mock = mockFetch(handler());
  renderAt("/");
  await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
  expect(await screen.findByText("Olá, Ana")).toBeInTheDocument();
  expect(callsTo(mock, "/api/setup/complete", "POST")).toHaveLength(1);
  expect(callsTo(mock, "/api/budgets", "PUT")).toHaveLength(0);
  expect(callsTo(mock, "/api/allowances", "POST")).toHaveLength(0);
});

it("keeps the typed values and shows an error when saving fails, without repeating done steps", async () => {
  let failComplete = true;
  const mock = mockFetch(
    handler((req) =>
      req.url === "/api/setup/complete" && failComplete
        ? apiError(500, "internal_error")
        : undefined,
    ),
  );
  renderAt("/");
  await userEvent.type(await screen.findByLabelText("Orçamento mensal da casa"), "800000");
  await userEvent.click(screen.getByRole("button", { name: "Concluir" }));
  const dialog = await screen.findByRole("alert");
  expect(within(dialog.parentElement!).getByLabelText("Orçamento mensal da casa")).toHaveValue(
    "8.000,00",
  );
  expect(dialog).toHaveTextContent("Algo deu errado");
  failComplete = false;
  await userEvent.click(screen.getByRole("button", { name: "Concluir" }));
  expect(await screen.findByText("Olá, Ana")).toBeInTheDocument();
  expect(callsTo(mock, "/api/budgets", "PUT")).toHaveLength(1);
  await waitFor(() => expect(callsTo(mock, "/api/setup/complete", "POST")).toHaveLength(2));
});
