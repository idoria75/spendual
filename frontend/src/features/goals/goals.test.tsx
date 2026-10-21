import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { apiError, json, mockFetch, shellStubs, user, type Handler } from "../../test/fetch-mock";

const goal = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Viagem",
  description: null,
  targetAmount: "5000.00",
  targetDate: null,
  currency: "BRL",
  status: "active",
  balance: "1000.00",
  createdById: 1,
  updatedById: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

let calls: { method: string; url: string; body: unknown }[] = [];
let failWithdraw = false;
const handler: Handler = (req) => {
  const path = req.url.split("?")[0];
  if (path === "/api/auth/me") return json(200, user);
  if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
  if (path === "/api/goals" && req.method === "GET") {
    return json(200, {
      items: [goal(), goal({ id: 2, name: "Casa", targetAmount: null, balance: "0.00" })],
    });
  }
  if (req.method !== "GET") {
    calls.push({ method: req.method, url: req.url, body: req.body });
    if (path === "/api/goals/1/withdrawals" && failWithdraw) {
      return apiError(409, "insufficient_balance");
    }
    return json(path?.endsWith("s") ? 201 : 200, goal());
  }
  return shellStubs(req.url) ?? json(404, {});
};

beforeEach(() => {
  resetCsrfToken();
  localStorage.clear();
  calls = [];
  failWithdraw = false;
});
afterEach(() => vi.unstubAllGlobals());

function renderMetas() {
  return render(
    <MemoryRouter
      initialEntries={["/metas"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe("Metas", () => {
  it("lists goals, with progress only when there is a target", async () => {
    mockFetch(handler);
    renderMetas();
    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeInTheDocument();
    expect(screen.getByText("Poupança sem destino")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByText(/de R\$ 5\.000,00 \(20%\)/)).toBeInTheDocument();
  });

  it("allocates without a question and asks before a withdrawal", async () => {
    mockFetch(handler);
    renderMetas();
    await screen.findByRole("heading", { name: "Viagem" });
    const card = screen.getByRole("heading", { name: "Viagem" }).closest("li")!;

    await userEvent.click(within(card).getByRole("button", { name: "Alocar" }));
    await userEvent.type(screen.getByLabelText("Valor"), "250,00");
    await userEvent.click(screen.getByRole("button", { name: "Alocar valor" }));
    expect(calls.map((c) => c.url)).toEqual(["/api/goals/1/allocations"]);
    expect(calls[0]!.body).toMatchObject({ amount: "250.00" });

    // The list reloads after a save, so the old card is gone.
    const fresh = (await screen.findByRole("heading", { name: "Viagem" })).closest("li")!;
    await userEvent.click(within(fresh).getByRole("button", { name: "Retirar" }));
    await userEvent.type(screen.getByLabelText("Valor"), "100,00");
    await userEvent.click(screen.getByRole("button", { name: "Retirar valor" }));
    expect(calls).toHaveLength(1); // not sent yet
    const dialog = await screen.findByRole("dialog", { name: "Retirar da meta?" });
    failWithdraw = true;
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar da meta" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("maior que o saldo");
    failWithdraw = false;
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar da meta" }));
    expect(calls.at(-1)!.url).toBe("/api/goals/1/withdrawals");
  });

  it("closing with money left withdraws everything first", async () => {
    mockFetch(handler);
    renderMetas();
    const card = (await screen.findByRole("heading", { name: "Viagem" })).closest("li")!;
    await userEvent.click(within(card).getByRole("button", { name: "Concluir" }));
    const dialog = await screen.findByRole("dialog", { name: "Concluir meta?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar tudo e concluir" }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.url)).toEqual(["/api/goals/1/withdrawals", "/api/goals/1/complete"]);
    expect(calls[0]!.body).toMatchObject({ amount: "1000.00" });
  });
});
