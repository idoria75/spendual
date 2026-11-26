import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const PASSWORD = "senha-e2e-1234";
// Same user as recurring.spec.ts (alphabetical order: this file runs after it). The household
// holds two accounts, so this file signs in and does not sign up.
const USERNAME = `ana_${process.env.E2E_RUN_ID}`;
const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const MONTH = TODAY.slice(0, 7);

/** 123456 -> "R$ 1.234,56". Whole reais are enough here. */
const brl = (cents: number) =>
  `${cents < 0 ? "−" : ""}R$ ${Math.floor(Math.abs(cents) / 100).toLocaleString("pt-BR")},${String(Math.abs(cents) % 100).padStart(2, "0")}`;

/** Save a screenshot of the current state under test-results/shots. */
async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/shots/${name}.png`, fullPage: true });
}

test("Metas: create, allocate, see it on Início, withdraw, close", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const anonymousMe = m.location().url.endsWith("/api/auth/me") && m.text().includes("401");
    if (!anonymousMe && !m.text().startsWith("TypeError: Failed to fetch")) errors.push(m.text());
  });

  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(USERNAME);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).last().click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Baseline from the API, so the test does not depend on what other specs created.
  const dash = async () =>
    (await (await page.request.get(`/api/dashboard?month=${MONTH}`)).json()) as {
      unallocatedSavings: string;
    };
  // Income first: a deposit cannot be above the unallocated savings.
  const lookups = (await (await page.request.get("/api/lookups")).json()) as {
    users: { id: number }[];
    categories: { id: number; kind: string }[];
  };
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  const income = await page.request.post("/api/transactions", {
    headers: { "X-CSRF-Token": csrf.csrfToken },
    data: {
      type: "income",
      scope: "household",
      amount: "5000.00",
      description: "e2e metas",
      transactionDate: TODAY,
      categoryId: lookups.categories.find((c) => c.kind === "income")!.id,
      payerId: lookups.users[0]!.id,
    },
  });
  expect(income.ok(), await income.text()).toBe(true);
  const free0 = Math.round(Number((await dash()).unallocatedSavings) * 100);

  await page.goto("/metas");
  await expect(page.getByRole("heading", { name: "Metas" })).toBeVisible();
  await page.getByRole("button", { name: "Nova meta" }).click();
  const form = page.getByRole("dialog", { name: "Nova meta" });
  await form.getByLabel("Nome da meta").fill("Viagem e2e");
  await form.getByLabel("Valor alvo (opcional)").fill("5000,00");
  await form.getByRole("button", { name: "Salvar meta" }).click();
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Viagem e2e" }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole("progressbar")).toBeVisible();

  await card.getByRole("button", { name: "Depositar" }).click();
  await page.getByRole("dialog").getByLabel("Valor").fill("1000,00");
  await page.getByRole("dialog").getByRole("button", { name: "Depositar valor" }).click();
  await expect(card.getByText(brl(100000), { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Poupança sem destino" })).toContainText(
    brl(free0 - 100000),
  );
  await shoot(page, "metas-allocated");

  // Início shows both lines once goals hold money this month.
  await page.goto("/");
  await page.getByText("Detalhes").click();
  const row = (label: string) =>
    page
      .getByRole("region", { name: "Saldo atual" })
      .locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`);
  await expect(row("Em metas")).toHaveText(brl(100000));
  await expect(row("Poupança sem destino")).toHaveText(brl(free0 - 100000));

  // Withdraw asks first.
  await page.goto("/metas");
  await card.getByRole("button", { name: "Retirar" }).click();
  await page.getByRole("dialog").getByLabel("Valor").fill("1000,00");
  await page.getByRole("dialog").getByRole("button", { name: "Retirar valor" }).click();
  await page
    .getByRole("dialog", { name: "Retirar da meta?" })
    .getByRole("button", { name: "Retirar da meta" })
    .click();
  await expect(card.getByText(brl(0), { exact: true })).toBeVisible();

  // History has both movements, then the goal closes.
  await card.getByText("Histórico").click();
  await expect(card.getByText("Depósito")).toBeVisible();
  await expect(card.getByText("Retirada")).toBeVisible();
  await card.getByRole("button", { name: "Concluir" }).click();
  await expect(card.getByText("Concluída")).toBeVisible();
  await expect(card.getByRole("button", { name: "Reabrir" })).toBeVisible();
  await shoot(page, "metas-closed");

  expect(errors).toEqual([]);
});
