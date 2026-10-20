import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { currentMonth, formatMonth, shiftMonth } from "../../lib/date";
import { apiError, json, mockFetch, user, type Handler } from "../../test/fetch-mock";
import { buildRule, splitPreview, type PlanningValues } from "./form-model";

const month = currentMonth();

const lookups = {
  users: [
    { id: 1, displayName: "Ana", tonePalette: "blue" },
    { id: 2, displayName: "Bia", tonePalette: "rose" },
  ],
  categories: [
    { id: 1, name: "Mercado", kind: "expense", active: true },
    { id: 2, name: "Casa e contas", kind: "expense", active: true },
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
  categorySpending: [
    { categoryId: 2, amount: "3400.00" },
    { categoryId: 1, amount: "1600.00" },
  ],
  upcoming: [],
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
let overdue: unknown[] = [];
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
      return json(200, { month, items: bills, overdue, plannedTotal: "190.00", unknownCount: 1 });
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
  overdue = [];
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
    expect(screen.queryByRole("region", { name: "Pessoas" })).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 800,00")).not.toBeInTheDocument();
    expect(screen.getByText("▲ R$ 1.000,00 acima")).toBeInTheDocument();
  });

  it("shows negative savings in the warn color with the minus sign", async () => {
    mockFetch(
      base((req) =>
        req.url.startsWith("/api/dashboard")
          ? json(200, {
              ...dashboard,
              savingsBeforeGoals: "-500.00",
              unallocatedSavings: "-500.00",
            })
          : undefined,
      ),
    );
    renderAt("/");
    const actual = await screen.findByRole("region", { name: "Realizado" });
    const values = await within(actual).findAllByText(/500,00/);
    expect(values).toHaveLength(2);
    for (const el of values) {
      expect(el).toHaveClass("text-warn");
      expect(el.textContent).toMatch(/^[-\u2212]/);
    }
    expect(within(actual).getByText("R$ 10.000,00")).not.toHaveClass("text-warn");
  });

  it("shows the balance of each person on Pessoal", async () => {
    mockFetch(base());
    renderAt("/pessoal");
    const people = await screen.findByRole("region", { name: "Pessoas" });
    expect(within(people).getByText("R$ 800,00")).toBeInTheDocument();
    expect(within(people).getByText("Ana")).toBeInTheDocument();
  });

  it("links Pessoal from Mais", async () => {
    mockFetch(base());
    renderAt("/mais");
    expect(
      await within(await screen.findByRole("main")).findByRole("link", { name: /Pessoal/ }),
    ).toHaveAttribute("href", "/pessoal");
  });

  it("shows the allocation error when the month already has one", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/allowances"
          ? apiError(409, "allocation_exists")
          : undefined,
      ),
    );
    renderAt("/pessoal");
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

  it("draws planned bills dashed and paid bills solid", async () => {
    bills = [
      bill({ id: 5, description: "Luz" }),
      bill({ id: 6, description: "Gás", status: "confirmed" }),
    ];
    mockFetch(base());
    renderAt("/a-pagar");
    expect((await screen.findByText("Luz")).closest("button")).toHaveClass("border-dashed");
    expect(screen.getByText("Gás").closest("button")).not.toHaveClass("border-dashed");
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
    expect(within(dialog).getByLabelText("Data")).toHaveValue(`${month}-20`);
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
          ? json(201, { month, items: [], overdue: [], plannedTotal: "0.00", unknownCount: 0 })
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
    await userEvent.type(within(dialog).getByLabelText("Valor total"), "10000");
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
    await userEvent.type(field, "125050");
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
    await userEvent.type(field, "0");
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

const savedTx = {
  id: 10,
  type: "expense",
  status: "confirmed",
  amount: "10.00",
  currency: "BRL",
  description: "Feira",
  transactionDate: `${month}-02`,
  scope: "household",
  ownerId: null,
  payerId: 1,
  categoryId: 1,
  accountId: null,
  paymentMethodId: null,
  relatedTransactionId: null,
  notes: null,
  voidReason: null,
  createdById: 1,
  updatedById: 1,
  createdAt: "2026-10-02T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
};

describe("review fixes", () => {
  it("does not keep a row of the old month while the next month loads", async () => {
    bills = [bill({})];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const mock = mockFetch(base());
    const inner = mock.getMockImplementation()!;
    mock.mockImplementation(async (input, init) => {
      if (String(input).startsWith(`/api/bills?month=${shiftMonth(month, 1)}`)) await gate;
      return inner(input, init);
    });
    renderAt("/a-pagar");
    expect(await screen.findByText("Internet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    await waitFor(() => expect(screen.queryByText("Internet")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Carregando…");
    release();
    expect(await screen.findByText("Internet")).toBeInTheDocument();
  });

  it("computes the Parcelas totals and empty message from the filtered list", async () => {
    bills = [bill({ expectedAmount: "190.00" })];
    mockFetch(base());
    renderAt("/a-pagar");
    expect(await screen.findByText("Previsto: R$ 190,00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Parcelas" }));
    expect(await screen.findByText("As parcelas do mês aparecem aqui.")).toBeInTheDocument();
    expect(screen.getByText("Previsto: R$ 0,00")).toBeInTheDocument();
    expect(screen.queryByText("Internet")).not.toBeInTheDocument();
  });

  it("counts only installment bills without value in the Parcelas tab", async () => {
    bills = [
      bill({}),
      bill({
        kind: "installment",
        id: 7,
        description: "TV",
        expectedAmount: "50.00",
        sequenceNumber: 1,
        installmentCount: 3,
      }),
      bill({
        kind: "installment",
        id: 8,
        description: "Sofá",
        expectedAmount: null,
        sequenceNumber: 1,
        installmentCount: 2,
      }),
    ];
    mockFetch(base());
    renderAt("/a-pagar");
    await userEvent.click(await screen.findByRole("radio", { name: "Parcelas" }));
    expect(await screen.findByText("Previsto: R$ 50,00 · 1 sem valor")).toBeInTheDocument();
    expect(screen.queryByText("Internet")).not.toBeInTheDocument();
  });

  it("does not remember the method or category after confirming a bill", async () => {
    bills = [bill({})];
    mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/bills/recurrence/5/confirm"
          ? json(200, bill({ status: "confirmed" }))
          : undefined,
      ),
    );
    renderAt("/a-pagar");
    await userEvent.click((await screen.findByText("Internet")).closest("button")!);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar pagamento" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirmar pagamento" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect(await screen.findByText("Pagamento confirmado")).toBeInTheDocument();
    expect(localStorage.getItem("spendual.recentCategories")).toBeNull();
    expect(localStorage.getItem("spendual.lastMethod")).toBeNull();
  });

  it("reloads the budgets after an entry is saved", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/transactions" ? json(201, savedTx) : undefined,
      ),
    );
    renderAt("/orcamentos");
    await screen.findByText("▲ R$ 72,00 acima");
    const budgetGets = () =>
      mock.mock.calls.filter(([u]) => String(u).startsWith("/api/budgets")).length;
    expect(budgetGets()).toBe(1);
    await userEvent.click((await screen.findAllByRole("button", { name: "Novo lançamento" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Novo lançamento" });
    await userEvent.type(within(dialog).getByLabelText("Valor"), "10");
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Feira");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Mercado/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(budgetGets()).toBe(2));
  });

  it("hints that short months use the last day when the day is above 28", async () => {
    mockFetch(base());
    renderAt("/a-pagar");
    await userEvent.click(await screen.findByRole("button", { name: "Recorrente" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova conta recorrente" });
    const day = within(dialog).getByLabelText("Dia do mês");
    await userEvent.clear(day);
    await userEvent.type(day, "31");
    expect(
      within(dialog).getByText("Em meses curtos, vale o último dia do mês."),
    ).toBeInTheDocument();
    await userEvent.clear(day);
    await userEvent.type(day, "10");
    expect(within(dialog).queryByText(/meses curtos/)).not.toBeInTheDocument();
  });
});

describe("overdue bills", () => {
  const old = () =>
    bill({ id: 3, description: "Aluguel", dueDate: "2000-01-10", status: "planned" });

  it("shows overdue bills of earlier months in Vencidas and confirms from there", async () => {
    overdue = [old()];
    const mock = mockFetch(
      base((req) =>
        req.method === "POST" && req.url === "/api/bills/recurrence/3/confirm"
          ? json(200, bill({ id: 3, status: "confirmed" }))
          : undefined,
      ),
    );
    renderAt("/a-pagar");
    await userEvent.click(await screen.findByRole("button", { name: "Próximo mês" }));
    const row = (await screen.findByText("Aluguel")).closest("button")!;
    expect(screen.getByText("Vencidas")).toBeInTheDocument();
    await userEvent.click(row);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar pagamento" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirmar pagamento" });
    expect(within(dialog).getByLabelText("Data")).toHaveValue("2000-01-10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    await waitFor(() =>
      expect(callsTo(mock, "/api/bills/recurrence/3/confirm", "POST")).toHaveLength(1),
    );
  });

  it("shows the overdue count on Início", async () => {
    overdue = [old()];
    mockFetch(base());
    renderAt("/");
    expect(await screen.findByText("1 conta vencida")).toBeInTheDocument();
  });
});

describe("money left in green", () => {
  it("shows positive savings in green on Início and zero balance neutral", async () => {
    mockFetch(
      base((req) =>
        req.url.startsWith("/api/dashboard")
          ? json(200, { ...dashboard, overallBudget: { budget: "500.00", spent: "500.00" } })
          : undefined,
      ),
    );
    renderAt("/");
    const actual = await screen.findByRole("region", { name: "Realizado" });
    for (const el of within(actual).getAllByText("R$ 3.000,00")) expect(el).toHaveClass("text-pos");
    const block = await screen.findByRole("region", { name: "Saldo atual" });
    const zero = within(block).getByText("R$ 0,00");
    expect(zero).not.toHaveClass("text-pos");
    expect(zero).not.toHaveClass("text-warn");
  });

  it("shows what is left under a category budget, and nothing when over or equal", async () => {
    mockFetch(base());
    renderAt("/orcamentos");
    // Mock: Mercado 872 of 800 (over), Casa e contas without a budget, overall 1.000 of 4.000.
    expect(await screen.findByText("▲ R$ 72,00 acima")).toBeInTheDocument();
    const left = await screen.findByText("R$ 3.000,00 restam");
    expect(left).toHaveClass("text-pos");
    expect(screen.getAllByText(/restam$/)).toHaveLength(1);
  });
});

describe("Início chart and upcoming bills", () => {
  const serve = (over: Record<string, unknown>) =>
    mockFetch(
      base((req) =>
        req.url.startsWith("/api/dashboard") ? json(200, { ...dashboard, ...over }) : undefined,
      ),
    );

  it("draws one stacked bar, biggest first, with a legend of names, amounts and percents", async () => {
    serve({});
    renderAt("/");
    const chart = await screen.findByRole("region", { name: "Gastos por categoria" });
    expect(within(chart).getAllByTestId("spending-segment")).toHaveLength(2);
    const items = within(chart).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Casa e contas");
    expect(items[0]).toHaveTextContent("R$ 3.400,00");
    // Percents are of the month's budget (4.000), not of the spending.
    expect(items[0]).toHaveTextContent("85%");
    expect(items[1]).toHaveTextContent("Mercado");
    expect(items[1]).toHaveTextContent("40%");
  });

  it("links each legend row to the household spending of those categories", async () => {
    serve({
      categorySpending: [
        { categoryId: 1, amount: "500.00" },
        { categoryId: 2, amount: "400.00" },
        { categoryId: 3, amount: "300.00" },
        { categoryId: 4, amount: "200.00" },
        { categoryId: 5, amount: "60.00" },
        { categoryId: null, amount: "40.00" },
      ],
    });
    renderAt("/");
    const chart = await screen.findByRole("region", { name: "Gastos por categoria" });
    const links = within(chart).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/lancamentos?categorias=1&escopo=household&status=confirmed",
      "/lancamentos?categorias=2&escopo=household&status=confirmed",
      "/lancamentos?categorias=3&escopo=household&status=confirmed",
      "/lancamentos?categorias=4&escopo=household&status=confirmed",
      "/lancamentos?categorias=5,none&escopo=household&status=confirmed",
    ]);
    expect(links[0]).toHaveAccessibleName("Ver lançamentos de Mercado");
    expect(links[4]).toHaveAccessibleName("Ver lançamentos das outras categorias");
  });

  it("links the no-category row alone", async () => {
    serve({ categorySpending: [{ categoryId: null, amount: "40.00" }] });
    renderAt("/");
    const chart = await screen.findByRole("region", { name: "Gastos por categoria" });
    expect(within(chart).getByRole("link")).toHaveAttribute(
      "href",
      "/lancamentos?categorias=none&escopo=household&status=confirmed",
    );
  });

  it("groups categories after the fourth into Outras (n)", async () => {
    serve({
      categorySpending: [
        { categoryId: 1, amount: "500.00" },
        { categoryId: 2, amount: "400.00" },
        { categoryId: 3, amount: "300.00" },
        { categoryId: 4, amount: "200.00" },
        { categoryId: 5, amount: "60.00" },
        { categoryId: null, amount: "40.00" },
      ],
    });
    renderAt("/");
    const chart = await screen.findByRole("region", { name: "Gastos por categoria" });
    expect(within(chart).getAllByTestId("spending-segment")).toHaveLength(6);
    const items = within(chart).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[4]).toHaveTextContent("Outras (2)");
    expect(items[4]).toHaveTextContent("R$ 100,00");
    expect(items[4]).toHaveTextContent("3%");
  });

  it("puts the balance first, then spent / total", async () => {
    serve({ overallBudget: { budget: "8000.00", spent: "7400.00" } });
    renderAt("/");
    const block = await screen.findByRole("region", { name: "Saldo atual" });
    expect(within(block).getByText("R$ 600,00")).toHaveClass("text-pos");
    expect(within(block).getByText("R$ 600,00")).not.toHaveClass("text-warn");
    expect(within(block).getByText("Gasto/Total")).toBeInTheDocument();
    expect(within(block).getByText("R$ 7.400,00")).toBeInTheDocument();
    expect(within(block).getByText(/\/\s*R\$ 8\.000,00/)).toBeInTheDocument();
  });

  it("sizes the bar against the budget: two halves of 50 % take 25 % each and the rest stays empty", async () => {
    serve({
      overallBudget: { budget: "8000.00", spent: "4000.00" },
      categorySpending: [
        { categoryId: 1, amount: "2000.00" },
        { categoryId: 2, amount: "2000.00" },
      ],
    });
    renderAt("/");
    const chart = await screen.findByRole("region", { name: "Gastos por categoria" });
    const segments = within(chart).getAllByTestId("spending-segment");
    expect(segments.map((s) => s.getAttribute("data-percent"))).toEqual(["25.00", "25.00"]);
    expect(segments[0]).toHaveStyle({ width: "25%" });
    const items = within(chart).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("25%");
    expect(items[1]).toHaveTextContent("25%");
  });

  it("shows a negative balance in warn and fills the bar to the spending when over budget", async () => {
    serve({
      overallBudget: { budget: "1000.00", spent: "1500.00" },
      categorySpending: [
        { categoryId: 1, amount: "1000.00" },
        { categoryId: 2, amount: "500.00" },
      ],
    });
    renderAt("/");
    const block = await screen.findByRole("region", { name: "Saldo atual" });
    const balance = within(block).getByText(/500,00$/, { selector: "p.text-warn" });
    expect(balance.textContent).toMatch(/^[-\u2212]/);
    expect(within(block).getByText("▲ R$ 500,00 acima")).toBeInTheDocument();
    const segments = within(block).getAllByTestId("spending-segment");
    expect(segments.map((s) => s.getAttribute("data-percent"))).toEqual(["66.66", "33.33"]);
  });

  it("without a budget: no balance, a link to set one, and the bar scales to the spending", async () => {
    serve({ overallBudget: { budget: null, spent: "1600.00" } });
    renderAt("/");
    const block = await screen.findByRole("region", { name: "Saldo atual" });
    expect(within(block).getByRole("link", { name: "Definir orçamento" })).toHaveAttribute(
      "href",
      "/orcamentos",
    );
    const segments = within(block).getAllByTestId("spending-segment");
    // 3.400 + 1.600 are the whole bar, so the shares are 68 % and 32 %.
    expect(segments.map((s) => s.getAttribute("data-percent"))).toEqual(["68.00", "32.00"]);
  });

  it("shows empty states for no spending and no upcoming bills", async () => {
    serve({ categorySpending: [], upcoming: [] });
    renderAt("/");
    expect(
      await screen.findByText(/gastos do mês por categoria aparecem aqui/),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma conta prevista para os próximos dias.")).toBeInTheDocument();
  });

  it("lists upcoming bills and opens the confirm sheet on tap", async () => {
    serve({ upcoming: [bill({})] });
    renderAt("/");
    const block = await screen.findByRole("region", { name: "Próximas contas" });
    await userEvent.click(within(block).getByText("Internet").closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: "Confirmar pagamento" });
    expect(within(dialog).getByText("Internet")).toBeInTheDocument();
  });
});
