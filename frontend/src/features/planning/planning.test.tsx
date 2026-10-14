import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { currentMonth, formatMonth } from "../../lib/date";
import { apiError, json, mockFetch, user, type Handler } from "../../test/fetch-mock";
import { buildRule, splitPreview, type PlanningValues } from "./form-model";

const month = currentMonth();

const lookups = {
  users: [
    { id: 1, displayName: "Ana", tonePalette: "blue" },
    { id: 2, displayName: "Bia", tonePalette: "rose" },
  ],
  categories: [
    { id: 1, name: "Mercado", active: true },
    { id: 2, name: "Casa e contas", active: true },
  ],
  accounts: [{ id: 1, name: "Nubank", type: "bank", active: true }],
  paymentMethods: [{ id: 1, name: "Pix", active: true }],
};

const dashboard = {
  month,
  householdIncome: "10000.00",
  sharedExpensesNet: "5000.00",
  allowanceAllocations: "2000.00",
  savingsBeforeGoals: "3000.00",
  goalAllocationsNet: "0.00",
  unallocatedSavings: "3000.00",
  savingsRate: null,
  plannedBillsTotal: "190.00",
  plannedBillsUnknownCount: 2,
  overallBudget: { budget: "4000.00", spent: "5000.00" },
  people: [
    {
      userId: 1,
      allowanceAllocated: "1000.00",
      personalSpent: "200.00",
      personalCredits: "0.00",
      closingBalance: "800.00",
    },
    {
      userId: 2,
      allowanceAllocated: "0.00",
      personalSpent: "0.00",
      personalCredits: "0.00",
      closingBalance: "0.00",
    },
  ],
};

function bill(over: Record<string, unknown>) {
  return {
    kind: "recurrence",
    id: 5,
    parentId: 1,
    description: "Internet",
    dueDate: `${month}-20`,
    expectedAmount: "190.00",
    status: "planned",
    scope: "household",
    ownerId: null,
    payerId: 2,
    categoryId: 2,
    accountId: null,
    paymentMethodId: 1,
    sequenceNumber: null,
    installmentCount: null,
    transactionId: null,
    ...over,
  };
}

let bills: unknown[] = [];
const allowances: unknown = {
  month,
  people: [
    { ownerId: 1, allocation: "1000.00", closingBalance: "800.00" },
    { ownerId: 2, allocation: null, closingBalance: "0.00" },
  ],
};

type Extra = (req: Parameters<Handler>[0]) => Response | undefined;

function base(extra?: Extra): Handler {
  return (req) => {
    const path = new URL(req.url, "http://x").pathname;
    const early = extra?.(req);
    if (early) return early;
    if (path === "/api/auth/me") return json(200, user);
    if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    if (path === "/api/lookups") return json(200, lookups);
    if (path === "/api/dashboard") return json(200, dashboard);
    if (path === "/api/allowances" && req.method === "GET") return json(200, allowances);
    if (path === "/api/bills")
      return json(200, { month, items: bills, plannedTotal: "190.00", unknownCount: 1 });
    if (path === "/api/recurrence-rules") return json(200, { items: [] });
    if (path === "/api/budgets" && req.method === "GET")
      return json(200, {
        month,
        overall: { categoryId: null, amount: "4000.00", spent: "1000.00" },
        categories: [
          { categoryId: 1, amount: "800.00", spent: "872.00" },
          { categoryId: 2, amount: null, spent: "50.00" },
        ],
      });
    return json(404, {});
  };
}

beforeEach(() => {
  resetCsrfToken();
  localStorage.clear();
  bills = [];
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
  mock.mock.calls.filter(([u, init]) => String(u).startsWith(url) && init?.method === method);

describe("Início", () => {
  it("shows server numbers, a dash for no savings rate, and valor ? count", async () => {
    mockFetch(base());
    renderAt("/");
    const actual = await screen.findByRole("region", { name: "Realizado" });
    expect(within(actual).getByText("R$ 10.000,00")).toBeInTheDocument();
    expect(within(actual).getAllByText("R$ 3.000,00")).toHaveLength(2);
    expect(within(actual).getByText("—")).toBeInTheDocument();
    const planned = screen.getByRole("region", { name: /Previsão/ });
    expect(within(planned).getByText("R$ 190,00")).toBeInTheDocument();
    expect(within(planned).getByText(/mais 2 contas sem valor \(valor \?\)/)).toBeInTheDocument();
    const people = screen.getByRole("region", { name: "Pessoas" });
    expect(within(people).getByText("R$ 800,00")).toBeInTheDocument();
    expect(screen.getByText("▲ R$ 1.000,00 acima")).toBeInTheDocument();
  });

  it("shows the allocation error when the month already has one", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/allowances"
          ? apiError(409, "allocation_exists")
          : undefined,
      ),
    );
    renderAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Definir mesada de Bia" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Valor da mesada"), "1.500,00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar mesada" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Já existe uma mesada deste mês para esta pessoa.",
    );
    const body = JSON.parse(callsTo(mock, "/api/allowances", "POST")[0]![1]!.body as string);
    expect(body).toEqual({ ownerId: 2, month, amount: "1500.00" });
  });
});

describe("A pagar", () => {
  it("renders an unknown amount as valor ? and never as R$ 0,00", async () => {
    bills = [bill({ expectedAmount: null, description: "Luz" })];
    mockFetch(base());
    renderAt("/a-pagar");
    const row = (await screen.findByText("Luz")).closest("button")!;
    expect(within(row).getByText("valor ?")).toBeInTheDocument();
    expect(within(row).queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
  });

  it("confirms with the form pre-filled from the bill, and submits only once", async () => {
    bills = [bill({})];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/bills/recurrence/5/confirm"
          ? json(200, bill({ status: "confirmed", transactionId: 99 }))
          : undefined,
      ),
    );
    const inner = mock.getMockImplementation()!;
    mock.mockImplementation(async (input, init) => {
      if (init?.method === "POST" && String(input).endsWith("/confirm")) await gate;
      return inner(input, init);
    });
    renderAt("/a-pagar");
    await userEvent.click((await screen.findByText("Internet")).closest("button")!);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar pagamento" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirmar pagamento" });
    expect(within(dialog).getByLabelText("Valor")).toHaveValue("190,00");
    expect(within(dialog).getByText("Internet")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Pago por")).toHaveValue("2");
    expect(within(dialog).getByLabelText("Método")).toHaveValue("1");
    expect(within(dialog).queryByLabelText("Descrição")).not.toBeInTheDocument();

    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Salvando…" })).toBeDisabled(),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvando…" }));
    release();
    expect(await screen.findByText("Pagamento confirmado")).toBeInTheDocument();
    const posts = callsTo(mock, "/api/bills/recurrence/5/confirm", "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]![1]!.body as string)).toMatchObject({
      amount: "190.00",
      payerId: 2,
      paymentMethodId: 1,
    });
  });

  it("asks for the amount when it is unknown and sends nothing without it", async () => {
    bills = [bill({ expectedAmount: null })];
    const mock = mockFetch(base());
    renderAt("/a-pagar");
    await userEvent.click((await screen.findByText("Internet")).closest("button")!);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar pagamento" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirmar pagamento" });
    expect(within(dialog).getByLabelText("Valor")).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect(await within(dialog).findByText(/Informe um valor maior que zero/)).toBeInTheDocument();
    expect(callsTo(mock, "/api/bills", "POST")).toHaveLength(0);
  });

  it("cancels a bill with a required reason", async () => {
    bills = [bill({})];
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/bills/recurrence/5/cancel"
          ? json(200, bill({ status: "cancelled" }))
          : undefined,
      ),
    );
    renderAt("/a-pagar");
    await userEvent.click((await screen.findByText("Internet")).closest("button")!);
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar conta" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar conta?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    expect(await within(dialog).findByText("Informe o motivo.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Motivo"), "Mudou de plano");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    await waitFor(() =>
      expect(callsTo(mock, "/api/bills/recurrence/5/cancel", "POST")).toHaveLength(1),
    );
    expect(
      JSON.parse(callsTo(mock, "/api/bills/recurrence/5/cancel", "POST")[0]![1]!.body as string),
    ).toEqual({ reason: "Mudou de plano" });
  });

  it("creates a recurring rule with an unknown amount as null", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/recurrence-rules"
          ? json(201, { month, items: [], plannedTotal: "0.00", unknownCount: 0 })
          : undefined,
      ),
    );
    renderAt("/a-pagar");
    await userEvent.click(await screen.findByRole("button", { name: "Recorrente" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova conta recorrente" });
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Luz");
    await userEvent.click(within(dialog).getByLabelText("Ainda não sei o valor"));
    await userEvent.selectOptions(within(dialog).getByLabelText("Categoria"), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(callsTo(mock, "/api/recurrence-rules", "POST")).toHaveLength(1));
    const body = JSON.parse(callsTo(mock, "/api/recurrence-rules", "POST")[0]![1]!.body as string);
    expect(body).toMatchObject({ description: "Luz", expectedAmount: null, categoryId: 2 });
  });

  it("creates an installment plan and shows the live split", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/installment-plans"
          ? json(201, {
              id: 1,
              description: "TV",
              totalAmount: "100.00",
              installmentCount: 3,
              firstDueDate: `${month}-10`,
              items: [],
            })
          : undefined,
      ),
    );
    renderAt("/a-pagar");
    await userEvent.click(await screen.findByRole("button", { name: "Parcelado" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova compra parcelada" });
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "TV");
    await userEvent.type(within(dialog).getByLabelText("Valor total"), "100");
    await userEvent.type(within(dialog).getByLabelText("Parcelas"), "3");
    expect(
      within(dialog).getByText(/2x R\$ 33,33 \+ última R\$ 33,34 · soma R\$ 100,00/),
    ).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Categoria"), "1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(callsTo(mock, "/api/installment-plans", "POST")).toHaveLength(1));
    const body = JSON.parse(callsTo(mock, "/api/installment-plans", "POST")[0]![1]!.body as string);
    expect(body).toMatchObject({ totalAmount: "100.00", installmentCount: 3, categoryId: 1 });
  });
});

describe("Orçamentos", () => {
  async function openEdit(name: string) {
    await userEvent.click(await screen.findByRole("button", { name: `Editar orçamento: ${name}` }));
    return screen.findByRole("dialog", { name });
  }

  it("shows over budget in the warn style and sem orçamento without a bar", async () => {
    mockFetch(base());
    renderAt("/orcamentos");
    expect(await screen.findByText("▲ R$ 72,00 acima")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: "Editar orçamento: Casa e contas" });
    expect(within(row).getByText("sem orçamento")).toBeInTheDocument();
    expect(within(row).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("defaults to going forward and sends the PT-BR amount", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "PUT"
          ? json(200, {
              month,
              overall: { categoryId: null, amount: null, spent: "0.00" },
              categories: [],
            })
          : undefined,
      ),
    );
    renderAt("/orcamentos");
    const dialog = await openEdit("Mercado");
    expect(within(dialog).getByLabelText("Valor do orçamento")).toHaveValue("800,00");
    expect(
      within(dialog).getByRole("radio", { name: `De ${formatMonth(month)} em diante` }),
    ).toBeChecked();
    const field = within(dialog).getByLabelText("Valor do orçamento");
    await userEvent.clear(field);
    await userEvent.type(field, "1.250,5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(callsTo(mock, "/api/budgets", "PUT")).toHaveLength(1));
    expect(JSON.parse(callsTo(mock, "/api/budgets", "PUT")[0]![1]!.body as string)).toEqual({
      categoryId: 1,
      period: month,
      amount: "1250.50",
      mode: "going_forward",
    });
  });

  it("sends this_period_only for the only-this-month choice", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "PUT"
          ? json(200, {
              month,
              overall: { categoryId: null, amount: null, spent: "0.00" },
              categories: [],
            })
          : undefined,
      ),
    );
    renderAt("/orcamentos");
    const dialog = await openEdit("Orçamento geral");
    await userEvent.click(within(dialog).getByRole("radio", { name: `Só ${formatMonth(month)}` }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(callsTo(mock, "/api/budgets", "PUT")).toHaveLength(1));
    expect(JSON.parse(callsTo(mock, "/api/budgets", "PUT")[0]![1]!.body as string)).toEqual({
      categoryId: null,
      period: month,
      amount: "4000.00",
      mode: "this_period_only",
    });
  });

  it("rejects an invalid amount without a request", async () => {
    const mock = mockFetch(base());
    renderAt("/orcamentos");
    const dialog = await openEdit("Mercado");
    const field = within(dialog).getByLabelText("Valor do orçamento");
    await userEvent.clear(field);
    await userEvent.type(field, "1,234");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText(/Informe um valor de zero ou mais/)).toBeInTheDocument();
    expect(callsTo(mock, "/api/budgets", "PUT")).toHaveLength(0);
  });
});

describe("planning form model", () => {
  const values: PlanningValues = {
    description: "Luz",
    amount: "",
    unknown: true,
    count: "",
    day: "31",
    startDate: "2026-10-31",
    endDate: "",
    scope: "household",
    ownerId: 1,
    payerId: 1,
    categoryId: 2,
    accountId: null,
    paymentMethodId: null,
  };

  it("sends null, not zero, for an unknown rule amount", () => {
    const built = buildRule(values);
    expect(built.ok && built.body.expectedAmount).toBeNull();
  });

  it("rejects a zero amount for a known rule", () => {
    const built = buildRule({ ...values, unknown: false, amount: "0,00" });
    expect(built.ok).toBe(false);
  });

  it("gives the remainder cents to the last installment", () => {
    expect(splitPreview("4.100,00", "10")).toEqual({
      n: 10,
      each: "410.00",
      last: "410.00",
      total: "4100.00",
    });
    expect(splitPreview("100", "3")).toMatchObject({ each: "33.33", last: "33.34" });
    expect(splitPreview("100", "1")).toBeNull();
  });
});
