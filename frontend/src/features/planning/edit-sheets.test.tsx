import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { currentMonth } from "../../lib/date";
import { json, mockFetch, shellStubs, user, type Handler } from "../../test/fetch-mock";

const month = currentMonth();
const rule = (over: Record<string, unknown> = {}) => ({
  id: 1,
  description: "Condomínio",
  expectedAmount: "780.00",
  dayOfMonth: 5,
  startDate: `${month}-01`,
  endDate: null,
  state: "active",
  scope: "household",
  ownerId: null,
  payerId: 1,
  categoryId: 1,
  accountId: null,
  paymentMethodId: null,
  ...over,
});
const plan = {
  id: 7,
  description: "Video game",
  totalAmount: "3600.00",
  installmentCount: 12,
  firstDueDate: `${month}-10`,
  paidCount: 2,
  plannedCount: 10,
  cancelledCount: 0,
  remainingAmount: "3000.00",
  nextAmount: "300.00",
  status: "active",
};
const bill = (id: number, status: string) => ({
  kind: "recurrence",
  id,
  parentId: 1,
  description: `Conta ${status}`,
  dueDate: `${month}-05`,
  expectedAmount: "50.00",
  status,
  scope: "household",
  ownerId: null,
  payerId: 1,
  categoryId: 1,
  accountId: null,
  paymentMethodId: null,
  sequenceNumber: null,
  installmentCount: null,
  transactionId: null,
});

let calls: { method: string; url: string; body: unknown }[] = [];
const handler: Handler = (req) => {
  const path = req.url.split("?")[0];
  if (path === "/api/auth/me") return json(200, user);
  if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
  if (path === "/api/bills") {
    return json(200, {
      month,
      items: [bill(1, "confirmed"), bill(2, "cancelled")],
      overdue: [],
      plannedTotal: "0.00",
      unknownCount: 0,
    });
  }
  if (path === "/api/recurrence-rules" && req.method === "GET") {
    return json(200, { items: [rule()] });
  }
  if (path === "/api/installment-plans" && req.method === "GET") {
    return json(200, { items: [plan] });
  }
  if (req.method !== "GET") {
    calls.push({ method: req.method, url: req.url, body: req.body });
    return json(200, path?.startsWith("/api/installment-plans") ? plan : rule());
  }
  return shellStubs(req.url) ?? json(404, {});
};

beforeEach(() => {
  resetCsrfToken();
  localStorage.clear();
  calls = [];
});
afterEach(() => vi.unstubAllGlobals());

function renderBills() {
  return render(
    <MemoryRouter
      initialEntries={["/a-pagar"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe("A pagar edit sheets", () => {
  it("shows paid in green and cancelled in red, always with the word", async () => {
    mockFetch(handler);
    renderBills();
    expect(await screen.findByText(/· Paga/)).toHaveClass("text-pos");
    expect(screen.getByText(/· Cancelada/)).toHaveClass("text-err");
  });

  it("edits the amount of a recurring bill, pauses it and ends it after a question", async () => {
    mockFetch(handler);
    renderBills();
    await userEvent.click(await screen.findByRole("radio", { name: "Recorrentes" }));
    await userEvent.click(await screen.findByRole("button", { name: /Condomínio/ }));
    const sheet = await screen.findByRole("dialog", { name: "Editar: Condomínio" });
    const amount = within(sheet).getByLabelText("Valor mensal");
    await userEvent.clear(amount);
    await userEvent.type(amount, "400,00");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: "/api/recurrence-rules/1",
      body: { expectedAmount: "400.00" },
    });

    // Pause is one tap; ending asks first.
    await userEvent.click(await screen.findByRole("button", { name: /Condomínio/ }));
    const again = await screen.findByRole("dialog", { name: "Editar: Condomínio" });
    await userEvent.click(within(again).getByRole("button", { name: "Pausar" }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body).toEqual({ state: "paused" });

    await userEvent.click(await screen.findByRole("button", { name: /Condomínio/ }));
    const third = await screen.findByRole("dialog", { name: "Editar: Condomínio" });
    await userEvent.click(within(third).getByRole("button", { name: "Encerrar" }));
    expect(calls).toHaveLength(2);
    const confirm = await screen.findByRole("dialog", { name: "Encerrar conta recorrente?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Encerrar" }));
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]!.body).toEqual({ state: "ended" });
  });

  it("edits the remaining installments and cancels them with a reason", async () => {
    mockFetch(handler);
    renderBills();
    await userEvent.click(await screen.findByRole("radio", { name: "Parcelas" }));
    await userEvent.click(await screen.findByRole("button", { name: /Video game/ }));
    const sheet = await screen.findByRole("dialog", { name: "Editar: Video game" });
    expect(within(sheet).getByText(/2 de 12 parcelas pagas/)).toBeInTheDocument();
    const amount = within(sheet).getByLabelText("Valor de cada parcela restante");
    await userEvent.clear(amount);
    await userEvent.type(amount, "250,00");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      url: "/api/installment-plans/7",
      body: { installmentAmount: "250.00" },
    });

    await userEvent.click(await screen.findByRole("button", { name: /Video game/ }));
    const again = await screen.findByRole("dialog", { name: "Editar: Video game" });
    await userEvent.click(
      within(again).getByRole("button", { name: "Cancelar parcelas restantes" }),
    );
    const confirm = await screen.findByRole("dialog", { name: "Cancelar as parcelas restantes?" });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Cancelar parcelas restantes" }),
    );
    expect(calls).toHaveLength(1); // a reason is required
    await userEvent.type(within(confirm).getByLabelText("Motivo"), "Devolvi");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Cancelar parcelas restantes" }),
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({
      url: "/api/installment-plans/7/cancel",
      body: { reason: "Devolvi" },
    });
  });
});
