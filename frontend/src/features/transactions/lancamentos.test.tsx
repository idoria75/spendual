import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { apiError, json, mockFetch, user, type Handler } from "../../test/fetch-mock";

const lookups = {
  users: [
    { id: 1, displayName: "Ana", tonePalette: "blue" },
    { id: 2, displayName: "Bia", tonePalette: "rose" },
  ],
  categories: [
    { id: 1, name: "Mercado", kind: "expense", active: true },
    { id: 2, name: "Transporte", kind: "expense", active: true },
    { id: 3, name: "Saúde", kind: "expense", active: true },
    { id: 4, name: "Lazer", kind: "expense", active: true },
    { id: 5, name: "Viagem", kind: "expense", active: true },
    { id: 6, name: "Antiga", kind: "expense", active: false },
    { id: 9, name: "Casa e suprimentos", kind: "expense", active: true },
    { id: 7, name: "Salário", kind: "income", active: true },
    { id: 8, name: "Presente", kind: "income", active: true },
  ],
  accounts: [
    { id: 1, name: "Nubank", type: "bank", active: true },
    { id: 2, name: "Visa", type: "credit_card", active: true },
  ],
  paymentMethods: [
    { id: 1, name: "Pix", active: true },
    { id: 2, name: "Cartão de crédito", active: true },
  ],
};

function tx(over: Record<string, unknown>) {
  return {
    id: 10,
    type: "expense",
    status: "confirmed",
    amount: "64.50",
    currency: "BRL",
    description: "iFood",
    transactionDate: "2026-10-02",
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
    ...over,
  };
}

let list: unknown[] = [];
/** usageCount per category id, as the server would send it. */
let usage: Record<number, number> = {};

type Extra = (req: Parameters<Handler>[0]) => Response | undefined;

function base(extra?: Extra): Handler {
  return (req) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/api/auth/me") return json(200, user);
    if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    if (path === "/api/lookups")
      return json(200, {
        ...lookups,
        categories: lookups.categories.map((c) => ({ ...c, usageCount: usage[c.id] ?? 0 })),
      });
    if (path === "/api/backup/status")
      return json(200, { configured: false, lastBackupAt: null, lastBackupBytes: null });
    if (path === "/api/transactions" && req.method === "GET") return json(200, { items: list });
    return extra?.(req) ?? json(404, {});
  };
}

beforeEach(() => {
  resetCsrfToken();
  list = [];
  usage = {};
  localStorage.clear();
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

async function openForm() {
  await userEvent.click((await screen.findAllByRole("button", { name: "Novo lançamento" }))[0]!);
  return screen.findByRole("dialog", { name: "Novo lançamento" });
}

const posts = (mock: ReturnType<typeof mockFetch>) =>
  mock.mock.calls.filter(([u, init]) => u === "/api/transactions" && init?.method === "POST");

describe("Novo lançamento fields", () => {
  it("shows fields by type and scope", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await within(dialog).findByRole("button", { name: /Mercado/ });
    // Expense, household: category yes, owner no, account (main) no, related no.
    expect(within(dialog).getByText("Categoria")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("De quem")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Despesa reembolsada")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor")).toHaveAttribute("inputmode", "numeric");
    expect(within(dialog).getByLabelText("Valor")).toHaveFocus();

    await userEvent.click(within(dialog).getByRole("radio", { name: "Pessoal" }));
    expect(within(dialog).getByLabelText("De quem")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Transferência" }));
    expect(within(dialog).queryByText("Categoria")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Conta")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Método")).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Reembolso" }));
    expect(within(dialog).getByLabelText("Despesa reembolsada")).toBeInTheDocument();
    expect(within(dialog).queryByText("Categoria")).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Receita" }));
    expect(within(dialog).getByText("Categoria")).toBeInTheDocument();
  });

  it("shows 4 categories and all on request, without archived ones", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await within(dialog).findByRole("button", { name: /Mercado/ });
    expect(within(dialog).queryByRole("button", { name: /Viagem/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "todas ›" }));
    expect(within(dialog).getByRole("button", { name: /Viagem/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Antiga/ })).not.toBeInTheDocument();
  });
});

describe("Categories sorted by use", () => {
  const chipNames = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((name) => lookups.categories.some((c) => name.includes(c.name)));

  it("shows the 4 most used first, ties by name, and keeps that order under 'todas'", async () => {
    usage = { 5: 20, 9: 7, 3: 7, 4: 1, 1: 0 };
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await within(dialog).findByRole("button", { name: /Viagem/ });
    expect(chipNames(dialog)).toEqual(["Viagem", "Casa e suprimentos", "Saúde", "Lazer"]);
    await userEvent.click(within(dialog).getByRole("button", { name: "todas ›" }));
    expect(chipNames(dialog)).toEqual([
      "Viagem",
      "Casa e suprimentos",
      "Saúde",
      "Lazer",
      "Mercado",
      "Transporte",
    ]);
  });

  it("loads the counts again after a record is saved", async () => {
    const mock = mockFetch(base((req) => (req.method === "POST" ? json(201, tx({})) : undefined)));
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText("Valor"), "10");
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Feira");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Mercado/ }));
    const lookupCalls = () => mock.mock.calls.filter(([u]) => u === "/api/lookups").length;
    const before = lookupCalls();
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(lookupCalls()).toBe(before + 1));
  });
});

describe("Novo lançamento submit", () => {
  async function fillValid(dialog: HTMLElement, amount: string) {
    await userEvent.type(within(dialog).getByLabelText("Valor"), amount);
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Feira");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Mercado/ }));
  }

  it("sends the PT-BR amount as an API string", async () => {
    const mock = mockFetch(
      base((req) => (req.method === "POST" ? json(201, tx({ amount: "1234.56" })) : undefined)),
    );
    renderAt("/lancamentos");
    const dialog = await openForm();
    await fillValid(dialog, "1.234,56");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(posts(mock)).toHaveLength(1));
    const body = JSON.parse(posts(mock)[0]![1]!.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: "expense",
      amount: "1234.56",
      description: "Feira",
      scope: "household",
      ownerId: null,
      categoryId: 1,
      payerId: 1,
    });
    expect(await screen.findByText("Lançamento salvo")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Novo lançamento" })).not.toBeInTheDocument();
  });

  it("does not submit twice while the request runs", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const mock = mockFetch(base());
    const inner = mock.getMockImplementation()!;
    mock.mockImplementation(async (input, init) => {
      if (init?.method === "POST" && String(input) === "/api/transactions") await gate;
      return inner(input, init);
    });
    renderAt("/lancamentos");
    const dialog = await openForm();
    await fillValid(dialog, "10");
    const save = within(dialog).getByRole("button", { name: "Salvar" });
    await userEvent.dblClick(save);
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Salvando…" })).toBeDisabled(),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvando…" }));
    release();
    await waitFor(() => expect(mock.mock.calls.length).toBeGreaterThan(0));
    expect(posts(mock)).toHaveLength(1);
  });

  it("blocks an invalid amount and sends nothing", async () => {
    const mock = mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await fillValid(dialog, "0");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText(/Informe um valor maior que zero/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor")).toHaveAttribute("aria-invalid", "true");
    expect(posts(mock)).toHaveLength(0);
  });

  it("keeps the inputs and shows an inline error when the save fails", async () => {
    mockFetch(
      base((req) => (req.method === "POST" ? apiError(400, "validation_error") : undefined)),
    );
    renderAt("/lancamentos");
    const dialog = await openForm();
    await fillValid(dialog, "25,90");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Confira os campos e tente de novo.",
    );
    expect(within(dialog).getByLabelText("Valor")).toHaveValue("25,90");
    expect(within(dialog).getByLabelText("Descrição")).toHaveValue("Feira");
    expect(within(dialog).getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
});

describe("Lançamentos category drill-down", () => {
  const listCalls = (mock: ReturnType<typeof mockFetch>) =>
    mock.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.startsWith("/api/transactions?"))
      .map((u) => new URLSearchParams(u.split("?")[1]));

  it("reads the filters from the link, asks for those categories, and shows the net total", async () => {
    list = [
      tx({ id: 1, amount: "100.00", description: "Feira" }),
      tx({
        id: 2,
        type: "refund",
        amount: "30.00",
        description: "Estorno",
        relatedTransactionId: 1,
      }),
      tx({ id: 3, status: "voided", amount: "999.00", description: "Duplicado" }),
    ];
    const mock = mockFetch(base());
    renderAt("/lancamentos?categorias=1,none&escopo=household&status=confirmed");
    expect(await screen.findByText("Feira")).toBeInTheDocument();
    const call = listCalls(mock)[0]!;
    expect(call.get("categories")).toBe("1,none");
    expect(call.get("scope")).toBe("household");
    expect(call.get("status")).toBe("confirmed");
    expect(call.get("categoryId")).toBeNull();
    expect(screen.getByText("Categorias: Mercado, Sem categoria")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Casa" })).toHaveAttribute("aria-pressed", "true");
    // 100 expense - 30 refund; the voided row does not count.
    expect(screen.getByTestId("category-total")).toHaveTextContent("R$ 70,00");
  });

  it("removes the category filter and drops the total", async () => {
    list = [tx({})];
    const mock = mockFetch(base());
    renderAt("/lancamentos?categorias=1");
    await screen.findByText("iFood");
    expect(screen.getByTestId("category-total")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remover filtro" }));
    await waitFor(() => expect(screen.queryByTestId("category-total")).not.toBeInTheDocument());
    expect(screen.queryByText(/^Categorias:/)).not.toBeInTheDocument();
    const calls = listCalls(mock);
    expect(calls[calls.length - 1]!.get("categories")).toBeNull();
  });

  it("shows the total for the category dropdown too, and no total without a filter", async () => {
    list = [tx({})];
    mockFetch(base());
    renderAt("/lancamentos");
    await screen.findByText("iFood");
    expect(screen.queryByTestId("category-total")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "1");
    expect(await screen.findByTestId("category-total")).toHaveTextContent("R$ 64,50");
    expect(screen.getByText("Categorias: Mercado")).toBeInTheDocument();
  });

  it("falls back to the defaults on bad parameters", async () => {
    list = [tx({})];
    const mock = mockFetch(base());
    renderAt("/lancamentos?categorias=abc&escopo=x&status=y&categoria=z");
    await screen.findByText("iFood");
    const call = listCalls(mock)[0]!;
    expect([...call.keys()]).toEqual(["month"]);
    expect(screen.queryByTestId("category-total")).not.toBeInTheDocument();
  });
});

describe("Lançamentos list", () => {
  it("renders voided rows struck through with the reason, and transfers as neutral", async () => {
    list = [
      tx({ id: 1, status: "voided", voidReason: "lançado em dobro", description: "Cinema" }),
      tx({
        id: 2,
        type: "transfer",
        amount: "500.00",
        description: "Para poupança",
        categoryId: null,
      }),
      tx({ id: 3, type: "income", amount: "7100.00", description: "Salário", categoryId: null }),
    ];
    mockFetch(base());
    renderAt("/lancamentos");
    const voided = await screen.findByText("Cinema");
    expect(voided).toHaveClass("line-through");
    expect(screen.getByText(/Anulado · lançado em dobro/)).toBeInTheDocument();
    expect(screen.getByText(/⇄/)).toBeInTheDocument();
    expect(screen.getByText(/não conta como gasto/)).toBeInTheDocument();
    expect(screen.getAllByText("+R$ 7.100,00")[1]).toHaveClass("text-pos");
    // Day total ignores the voided expense and the transfer.
    expect(screen.getByText("Sex, 02/10").nextElementSibling).toHaveTextContent("+R$ 7.100,00");
  });

  it("shows the empty state", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    expect(await screen.findByText("Os lançamentos do mês aparecem aqui.")).toBeInTheDocument();
  });

  it("requires a reason to void, then voids", async () => {
    list = [tx({})];
    const mock = mockFetch(
      base((req) =>
        req.url.endsWith("/void")
          ? json(200, tx({ status: "voided", voidReason: "erro" }))
          : undefined,
      ),
    );
    renderAt("/lancamentos");
    await userEvent.click(await screen.findByText("iFood"));
    await userEvent.click(await screen.findByRole("button", { name: /Anular/ }));
    const confirm = await screen.findByRole("dialog", { name: "Anular lançamento?" });
    expect(within(confirm).getByText(/iFood · .*64,50 · 02\/10/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: /Anular lançamento/ }));
    expect(await within(confirm).findByText("Informe o motivo.")).toBeInTheDocument();
    expect(mock.mock.calls.some(([u]) => String(u).endsWith("/void"))).toBe(false);

    await userEvent.type(within(confirm).getByLabelText("Motivo"), "erro");
    await userEvent.click(within(confirm).getByRole("button", { name: /Anular lançamento/ }));
    await waitFor(() => {
      const call = mock.mock.calls.find(([u]) => String(u) === "/api/transactions/10/void");
      expect(JSON.parse(call![1]!.body as string)).toEqual({ reason: "erro" });
    });
  });

  it("edits with PATCH-able fields only, sending only what changed", async () => {
    list = [tx({})];
    const mock = mockFetch(
      base((req) => (req.method === "PATCH" ? json(200, tx({ amount: "70.00" })) : undefined)),
    );
    renderAt("/lancamentos");
    await userEvent.click(await screen.findByText("iFood"));
    await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(within(dialog).queryByRole("button", { name: "Despesa" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "Pessoal" })).not.toBeInTheDocument();
    const amount = within(dialog).getByLabelText("Valor");
    expect(amount).toHaveValue("64,50");
    await userEvent.clear(amount);
    await userEvent.type(amount, "7000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const call = mock.mock.calls.find(
        ([u, i]) => u === "/api/transactions/10" && i?.method === "PATCH",
      );
      expect(JSON.parse(call![1]!.body as string)).toEqual({ amount: "70.00" });
    });
  });
});

describe("Ajustes", () => {
  it("archives a category with PATCH, never deletes", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "PATCH"
          ? json(200, { id: 1, name: "Mercado", kind: "expense", active: false })
          : undefined,
      ),
    );
    renderAt("/ajustes");
    await userEvent.click(await screen.findByRole("button", { name: "Arquivar: Mercado" }));
    await waitFor(() => {
      const call = mock.mock.calls.find(([u]) => u === "/api/categories/1");
      expect(call![1]!.method).toBe("PATCH");
      expect(JSON.parse(call![1]!.body as string)).toEqual({ active: false });
    });
    expect(mock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);
  });

  it("shows the name_taken message on a duplicate", async () => {
    mockFetch(base((req) => (req.method === "POST" ? apiError(409, "name_taken") : undefined)));
    renderAt("/ajustes");
    await userEvent.type(await screen.findByLabelText("Nova categoria"), "Mercado");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um item com este nome.");
  });
});

describe("Categories by kind", () => {
  it("shows income categories for income and expense ones for expenses", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await within(dialog).findByRole("button", { name: /Mercado/ });
    expect(within(dialog).getByText("Pago por")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Mercado/ }));

    await userEvent.click(within(dialog).getByRole("button", { name: "Receita" }));
    expect(within(dialog).getByRole("button", { name: /Salário/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Mercado/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Recebido por")).toBeInTheDocument();
    expect(within(dialog).queryByText("Pago por")).not.toBeInTheDocument();
    // The expense category was dropped when the type changed.
    expect(within(dialog).getByRole("button", { name: /Salário/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Outro recebimento" }));
    expect(within(dialog).getByText("Recebido por")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Despesa" }));
    expect(within(dialog).queryByRole("button", { name: /Salário/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Pago por")).toBeInTheDocument();
  });

  it("lets an income have no category and sends the income category when chosen", async () => {
    const mock = mockFetch(
      base((req) => (req.method === "POST" ? json(201, tx({ type: "income" })) : undefined)),
    );
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole("button", { name: "Receita" }));
    await userEvent.type(within(dialog).getByLabelText("Valor"), "500000");
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Pagamento");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Salário/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(posts(mock)).toHaveLength(1));
    expect(JSON.parse(posts(mock)[0]![1]!.body as string)).toMatchObject({
      type: "income",
      amount: "5000.00",
      categoryId: 7,
    });
  });

  it("filters the list by a category grouped under its kind", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const select = await screen.findByLabelText("Categoria");
    expect(within(select).getByRole("group", { name: "Receitas" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Despesas" })).toBeInTheDocument();
  });

  it("wraps a long category name in the tile instead of cutting it", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.click(await within(dialog).findByRole("button", { name: "todas ›" }));
    const label = within(dialog).getByText("Casa e suprimentos");
    expect(label).not.toHaveClass("truncate");
    expect(label.className).not.toMatch(/ellipsis|truncate/);
  });

  it("adds a category with a kind in Ajustes and groups the list", async () => {
    const mock = mockFetch(
      base((req) =>
        req.method === "POST"
          ? json(201, { id: 20, name: "Freelance", kind: "income", active: true })
          : undefined,
      ),
    );
    renderAt("/ajustes");
    await userEvent.type(await screen.findByLabelText("Nova categoria"), "Freelance");
    await userEvent.selectOptions(screen.getByLabelText("Tipo de categoria"), "income");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => {
      const call = mock.mock.calls.find(
        ([u, i]) => u === "/api/categories" && i?.method === "POST",
      );
      expect(JSON.parse(call![1]!.body as string)).toEqual({ name: "Freelance", kind: "income" });
    });
    expect(screen.getByRole("heading", { name: "Receitas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Despesas" })).toBeInTheDocument();
  });
});

describe("Parcelado in the entry form", () => {
  const plans = (mock: ReturnType<typeof mockFetch>) =>
    mock.mock.calls.filter(([u, i]) => u === "/api/installment-plans" && i?.method === "POST");

  it("shows only for a credit card method", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    expect(within(dialog).queryByRole("radiogroup", { name: "Parcelado" })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Método"), "1");
    expect(within(dialog).queryByRole("radiogroup", { name: "Parcelado" })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Método"), "2");
    expect(within(dialog).getByRole("radiogroup", { name: "Parcelado" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Receita" }));
    expect(within(dialog).queryByRole("radiogroup", { name: "Parcelado" })).not.toBeInTheDocument();
  });

  it("previews the split and saves a plan instead of a transaction", async () => {
    const mock = mockFetch(
      base((req) =>
        req.url === "/api/installment-plans"
          ? json(201, {
              id: 1,
              description: "TV",
              totalAmount: "1000.00",
              installmentCount: 12,
              firstDueDate: "2026-10-14",
              items: [],
            })
          : undefined,
      ),
    );
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText("Valor"), "100000");
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "TV");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Mercado/ }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Método"), "2");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Sim" }));
    const count = within(dialog).getByLabelText("Parcelas");
    await userEvent.clear(count);
    await userEvent.type(count, "12");
    expect(within(dialog).getByText("12x de R$ 83,33 (última R$ 83,37)")).toBeInTheDocument();
    expect(within(dialog).getByText("1ª parcela")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(plans(mock)).toHaveLength(1));
    expect(JSON.parse(plans(mock)[0]![1]!.body as string)).toMatchObject({
      description: "TV",
      totalAmount: "1000.00",
      installmentCount: 12,
      scope: "household",
      ownerId: null,
      payerId: 1,
      categoryId: 1,
    });
    expect(posts(mock)).toHaveLength(0);
    expect(await screen.findByText(/Compra parcelada criada/)).toBeInTheDocument();
  });

  it("needs the owner for a personal plan and a count from 2 to 60", async () => {
    const mock = mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText("Valor"), "100000");
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "TV");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Mercado/ }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Método"), "2");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Pessoal" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "Sim" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("De quem"), "");
    const count = within(dialog).getByLabelText("Parcelas");
    await userEvent.clear(count);
    await userEvent.type(count, "1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText("Escolha de quem é o lançamento.")).toBeInTheDocument();
    expect(within(dialog).getByText("Informe de 2 a 60 parcelas.")).toBeInTheDocument();
    expect(plans(mock)).toHaveLength(0);
  });
});

describe("Review fixes", () => {
  it("offers Parcelado when the account is a credit card", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    expect(within(dialog).queryByRole("radiogroup", { name: "Parcelado" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Mais detalhes" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Conta"), "2");
    expect(within(dialog).getByRole("radiogroup", { name: "Parcelado" })).toBeInTheDocument();
  });

  it("blocks a plan without a category and never sends categoryId 0", async () => {
    const mock = mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText("Valor"), "100000");
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "TV");
    await userEvent.selectOptions(within(dialog).getByLabelText("Método"), "2");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Sim" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText("Escolha a categoria.")).toBeInTheDocument();
    expect(
      mock.mock.calls.filter(([u, i]) => u === "/api/installment-plans" && i?.method === "POST"),
    ).toHaveLength(0);
  });

  it("brings the category back when the type returns to its kind", async () => {
    mockFetch(base());
    renderAt("/lancamentos");
    const dialog = await openForm();
    await userEvent.click(await within(dialog).findByRole("button", { name: /Mercado/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Receita" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Despesa" }));
    expect(within(dialog).getByRole("button", { name: /Mercado/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the selected category visible when editing, even with another kind", async () => {
    list = [tx({ categoryId: 7 })];
    mockFetch(base());
    renderAt("/lancamentos");
    await userEvent.click(await screen.findByText("iFood"));
    await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(within(dialog).getByRole("button", { name: /Salário/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not render an empty category group in the filter", async () => {
    const inner = base();
    mockFetch((req) =>
      req.url === "/api/lookups"
        ? json(200, {
            ...lookups,
            categories: lookups.categories.filter((c) => c.kind === "expense"),
          })
        : inner(req),
    );
    renderAt("/lancamentos");
    const select = await screen.findByLabelText("Categoria");
    await within(select).findByRole("group", { name: "Despesas" });
    expect(within(select).queryByRole("group", { name: "Receitas" })).not.toBeInTheDocument();
  });
});
