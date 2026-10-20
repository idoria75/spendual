import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const PASSWORD = "senha-e2e-1234";
const USERNAME = `bia_${Date.now()}`;
const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const CURRENT = TODAY.slice(0, 7);

/** "YYYY-MM" shifted by n months. */
function shift(month: string, n: number): string {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Save a screenshot of the current state under test-results/shots. */
async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/shots/${name}.png`, fullPage: true });
}

async function post(api: APIRequestContext, path: string, data: unknown, method = "POST") {
  const csrf = (await (await api.get("/api/auth/csrf")).json()) as { csrfToken: string };
  const res = await api.fetch(`/api${path}`, {
    method,
    data,
    headers: { "X-CSRF-Token": csrf.csrfToken },
  });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  return res;
}

// Runs after recurring.spec.ts (alphabetical), so the household is already set up.
test("Análises: bars, average line and budget line for a category", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const anonymousMe = m.location().url.endsWith("/api/auth/me") && m.text().includes("401");
    if (!anonymousMe) errors.push(m.text());
  });

  await page.goto("/entrar");
  await page.getByRole("button", { name: "Criar conta", pressed: false }).click();
  await page.getByLabel("Nome").fill("Bia");
  await page.getByLabel("Usuário").fill(USERNAME);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).last().click();
  const skip = page.getByRole("button", { name: "Pular por agora" });
  const home = page.getByRole("heading", { name: "Início" });
  await expect(skip.or(home)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(home).toBeVisible();

  // Mercado: 100, 120, 150 in the three months before this one, budget 120 then 130.
  const lookups = (await (await page.request.get("/api/lookups")).json()) as {
    users: { id: number }[];
    categories: { id: number; name: string; kind: string }[];
  };
  const mercado = lookups.categories.find((c) => c.name === "Mercado")!;
  const lazer = lookups.categories.find((c) => c.name === "Lazer e hobbies")!;
  const payerId = lookups.users[0]!.id;
  const expense = (categoryId: number, month: string, amount: string) =>
    post(page.request, "/transactions", {
      type: "expense",
      scope: "household",
      amount,
      description: "e2e",
      transactionDate: `${month}-02`,
      categoryId,
      payerId,
    });
  await expense(mercado.id, shift(CURRENT, -3), "100.00");
  await expense(mercado.id, shift(CURRENT, -2), "120.00");
  await expense(mercado.id, shift(CURRENT, -1), "150.00");
  await expense(mercado.id, CURRENT, "60.00");
  await expense(lazer.id, shift(CURRENT, -2), "80.00");
  await expense(lazer.id, shift(CURRENT, -1), "40.00");
  const budget = (period: string, amount: string) =>
    post(
      page.request,
      "/budgets",
      { categoryId: mercado.id, period, amount, mode: "going_forward" },
      "PUT",
    );
  const budgetOverall = (period: string, amount: string) =>
    post(
      page.request,
      "/budgets",
      { categoryId: null, period, amount, mode: "going_forward" },
      "PUT",
    );
  await budget(shift(CURRENT, -3), "120.00");
  await budget(shift(CURRENT, -1), "130.00");

  // The month's overall budget feeds the balance block on Início.
  await budgetOverall(CURRENT, "500.00");

  await page.goto("/");
  const balance = page.getByRole("region", { name: "Saldo atual" });
  await expect(balance).toContainText("/ R$ 500,00");
  await expect(balance.getByTestId("spending-segment").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await shoot(page, "inicio-saldo-phone-light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await shoot(page, "inicio-saldo-desktop-dark");
  await page.emulateMedia({ colorScheme: null });

  // A legend row opens Lançamentos for that category; the total matches the legend amount.
  await balance.getByRole("link", { name: "Ver lançamentos de Mercado" }).click();
  await expect(page).toHaveURL(/\/lancamentos\?categorias=\d+&escopo=household&status=confirmed/);
  await expect(page.getByText("Categorias: Mercado")).toBeVisible();
  await expect(page.getByTestId("category-total")).toHaveText("R$ 60,00");
  await shoot(page, "lancamentos-categoria");

  await page.goto("/analises");
  await expect(page.getByRole("heading", { name: "Análises", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /Gasto mensal de Todas/ })).toBeVisible();
  await expect(page.getByTestId("trend-bar")).toHaveCount(6);

  await page.getByRole("button", { name: "Mercado" }).click();
  await expect(page.getByRole("img", { name: /Gasto mensal de Mercado/ })).toBeVisible();
  // Flat lines have no height, so Playwright calls them hidden. Check that they are drawn.
  await expect(page.getByTestId("trend-average")).toBeAttached();
  await expect(page.getByTestId("trend-budget")).toBeAttached();
  // Closed months with a budget: 3. Only the one with 150 against 130 is over.
  await expect(page.getByText("1 de 3")).toBeVisible();
  const over = await page
    .getByTestId("trend-bar")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-over")));
  expect(over.filter((v) => v === "true")).toHaveLength(1);

  await page.getByRole("radio", { name: "12 meses" }).click();
  await expect(page.getByTestId("trend-bar")).toHaveCount(12);

  const views = [
    { name: "phone", size: { width: 390, height: 844 } },
    { name: "desktop", size: { width: 1280, height: 800 } },
  ];
  for (const view of views) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize(view.size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.getByRole("radio", { name: "6 meses" }).click();
      await expect(page.getByTestId("trend-bar")).toHaveCount(6);
      await shoot(page, `analises-${view.name}-${scheme}`);
    }
  }
  await page.emulateMedia({ colorScheme: null });

  expect(errors).toEqual([]);
});
