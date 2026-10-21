import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { currentMonth, shiftMonth } from "../../lib/date";
import { json, mockFetch, shellStubs, user, type Handler } from "../../test/fetch-mock";

const to = currentMonth();
const months = (n: number) => Array.from({ length: n }, (_, i) => shiftMonth(to, i - (n - 1)));

const series = (categoryId: number | null, amounts: string[], budgets: (string | null)[]) => ({
  categoryId,
  points: amounts.map((amount, i) => ({
    month: months(amounts.length)[i]!,
    amount,
    budget: budgets[i] ?? null,
    partial: i === amounts.length - 1,
  })),
});

const lookups = {
  users: [user],
  categories: [
    { id: 1, name: "Mercado", kind: "expense", active: true },
    { id: 2, name: "Lazer", kind: "expense", active: true },
  ],
  accounts: [],
  paymentMethods: [],
};

// Closed months of Mercado: 100, 120, 150 (average 123,33). Budget 120 then 130.
const trends = (from: string) => ({
  from,
  to,
  overall: series(
    null,
    ["200.00", "250.00", "300.00", "50.00"],
    ["400.00", "400.00", "400.00", "400.00"],
  ),
  categories: [
    series(2, ["10.00", "20.00", "30.00", "5.00"], [null, null, null, null]),
    series(1, ["100.00", "120.00", "150.00", "60.00"], ["120.00", "120.00", "130.00", "130.00"]),
  ],
});

let queries: string[] = [];
const handler: Handler = (req) => {
  const [path, query = ""] = req.url.split("?");
  if (path === "/api/auth/me") return json(200, user);
  if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
  if (path === "/api/lookups") return json(200, lookups);
  if (path === "/api/analytics/categories") {
    queries.push(query);
    return json(200, trends(new URLSearchParams(query).get("from") ?? to));
  }
  return shellStubs(req.url) ?? json(404, {});
};

beforeEach(() => {
  resetCsrfToken();
  localStorage.clear();
  queries = [];
});
afterEach(() => vi.unstubAllGlobals());

function renderAnalises() {
  return render(
    <MemoryRouter
      initialEntries={["/analises"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe("Análises", () => {
  it("asks for the last 6 months and shows the household total first", async () => {
    mockFetch(handler);
    renderAnalises();
    expect(await screen.findByRole("img", { name: /Gasto mensal de Todas/ })).toBeInTheDocument();
    expect(queries[0]).toBe(`from=${shiftMonth(to, -5)}&to=${to}`);
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
    // The category tiles stay hidden until asked for.
    expect(screen.queryByRole("button", { name: "Mercado" })).not.toBeInTheDocument();
    // 4 bars, the last one is the month in progress.
    const bars = screen.getAllByTestId("trend-bar");
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.getAttribute("data-partial"))).toEqual([
      "false",
      "false",
      "false",
      "true",
    ]);
    expect(screen.getByTestId("trend-average")).toBeInTheDocument();
    expect(screen.getByTestId("trend-budget")).toBeInTheDocument();
  });

  it("shows average, current budget and months above for a category", async () => {
    mockFetch(handler);
    renderAnalises();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar categorias ›" }));
    await userEvent.click(screen.getByRole("button", { name: "Mercado" }));
    const chart = await screen.findByRole("img", { name: /Gasto mensal de Mercado/ });
    expect(chart).toBeInTheDocument();
    expect(screen.getByText("R$ 123,33")).toBeInTheDocument();
    expect(screen.getByText("média, 3 meses")).toBeInTheDocument();
    expect(screen.getByText("orçamento atual")).toBeInTheDocument();
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    // The bar of the month with 150 against a budget of 130 is over; the others are not.
    const over = screen.getAllByTestId("trend-bar").map((b) => b.getAttribute("data-over"));
    expect(over).toEqual(["false", "false", "true", "false"]);
    const list = screen.getByRole("region", { name: "Mês a mês" });
    expect(within(list).getByText("▲ R$ 20,00 acima")).toBeInTheDocument();
    // Saved money is green in a closed month; the month in progress stays neutral.
    expect(within(list).getByText("▼ R$ 20,00 abaixo")).toHaveClass("text-pos");
    expect(within(list).getByText("▼ R$ 70,00 abaixo")).not.toHaveClass("text-pos");
  });

  it("says 'sem orçamento' and draws no budget line when the category has none", async () => {
    mockFetch(handler);
    renderAnalises();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar categorias ›" }));
    await userEvent.click(screen.getByRole("button", { name: "Lazer" }));
    await screen.findByRole("img", { name: /Gasto mensal de Lazer/ });
    expect(screen.queryByTestId("trend-budget")).not.toBeInTheDocument();
    expect(screen.getAllByText("sem orçamento").length).toBeGreaterThan(0);
    expect(screen.queryByText("Orçamento")).not.toBeInTheDocument();
  });

  it("goes back to Todas when the chosen tile is tapped again", async () => {
    mockFetch(handler);
    renderAnalises();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar categorias ›" }));
    await userEvent.click(screen.getByRole("button", { name: "Mercado" }));
    await screen.findByRole("img", { name: /Gasto mensal de Mercado/ });
    await userEvent.click(screen.getByRole("button", { name: "Mercado", pressed: true }));
    expect(await screen.findByRole("img", { name: /Gasto mensal de Todas/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "‹ Ocultar categorias" }));
    expect(screen.queryByRole("button", { name: "Mercado" })).not.toBeInTheDocument();
  });

  it("adds up budget minus spent in the month list and in a tile", async () => {
    mockFetch(handler);
    renderAnalises();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar categorias ›" }));
    await userEvent.click(screen.getByRole("button", { name: "Mercado" }));
    const list = await screen.findByRole("region", { name: "Mês a mês" });
    // Closed months: +20, 0, -20, so the running sum is +20, +20, 0. The month in progress has none.
    expect(
      within(list)
        .getAllByText(/acumulado/)
        .map((e) => e.textContent?.replace(/\s/g, " ")),
    ).toEqual(["acumulado +R$ 0,00", "acumulado +R$ 20,00", "acumulado +R$ 20,00"]);
    expect(screen.getByText("acumulado no período, 3 meses com orçamento")).toBeInTheDocument();
  });

  it("takes a custom period and keeps From before Until", async () => {
    mockFetch((req) => {
      const [path, query = ""] = req.url.split("?");
      if (path !== "/api/analytics/categories") return handler(req);
      queries.push(query);
      const q = new URLSearchParams(query);
      const from = q.get("from") ?? to;
      const end = q.get("to") ?? to;
      const list: string[] = [];
      for (let m = from; m <= end; m = shiftMonth(m, 1)) list.push(m);
      return json(200, {
        from,
        to: end,
        overall: {
          categoryId: null,
          points: list.map((month) => ({
            month,
            amount: "100.00",
            budget: "120.00",
            partial: month === to,
          })),
        },
        categories: [],
      });
    });
    renderAnalises();
    await screen.findByRole("img", { name: /Gasto mensal/ });
    // 6 months fit the phone; no sideways scroll.
    expect(screen.getByTestId("trend-scroll")).toHaveAttribute("data-scrolls", "false");

    await userEvent.click(screen.getByRole("radio", { name: "Personalizado" }));
    expect(queries.at(-1)).toBe(`from=${shiftMonth(to, -5)}&to=${to}`);
    const fromBox = screen.getByLabelText("De");
    const untilBox = screen.getByLabelText("Até");
    expect(fromBox).toHaveValue(shiftMonth(to, -5));
    expect(untilBox).toHaveValue(to);

    await userEvent.selectOptions(fromBox, shiftMonth(to, -17));
    await screen.findAllByTestId("trend-bar");
    await vi.waitFor(() => expect(queries.at(-1)).toBe(`from=${shiftMonth(to, -17)}&to=${to}`));
    expect(await screen.findAllByTestId("trend-bar")).toHaveLength(18);
    // 18 months do not fit: the chart scrolls and says so.
    expect(screen.getByTestId("trend-scroll")).toHaveAttribute("data-scrolls", "true");
    expect(screen.getByText(/Arraste o gráfico/)).toBeInTheDocument();

    // Until before From moves From back, so the pair is always valid.
    await userEvent.selectOptions(untilBox, shiftMonth(to, -20));
    await vi.waitFor(() =>
      expect(queries.at(-1)).toBe(`from=${shiftMonth(to, -20)}&to=${shiftMonth(to, -20)}`),
    );
    expect(fromBox).toHaveValue(shiftMonth(to, -20));
  });

  it("asks for 12 months when chosen", async () => {
    mockFetch(handler);
    renderAnalises();
    await screen.findByRole("img", { name: /Gasto mensal/ });
    await userEvent.click(screen.getByRole("radio", { name: "12 meses" }));
    await screen.findByRole("img", { name: /Gasto mensal/ });
    expect(queries.at(-1)).toBe(`from=${shiftMonth(to, -11)}&to=${to}`);
  });

  it("shows an empty text when the household has no spending", async () => {
    mockFetch((req) =>
      req.url.startsWith("/api/analytics/categories")
        ? json(200, {
            from: shiftMonth(to, -5),
            to,
            overall: series(null, ["0.00", "0.00"], [null, null]),
            categories: [],
          })
        : handler(req),
    );
    renderAnalises();
    expect(await screen.findByText(/aparecem aqui, mês a mês/)).toBeInTheDocument();
    expect(screen.queryByTestId("trend-chart")).not.toBeInTheDocument();
  });

  it("is linked from Mais", async () => {
    mockFetch(handler);
    render(
      <MemoryRouter
        initialEntries={["/mais"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>,
    );
    expect(
      await within(await screen.findByRole("main")).findByRole("link", { name: /Análises/ }),
    ).toHaveAttribute("href", "/analises");
  });
});
