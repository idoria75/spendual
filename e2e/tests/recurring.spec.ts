import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const DESCRIPTION = "Internet e2e";
const AMOUNT = "123,45";
const MONEY = "R$ 123,45";
const ZERO = "R$ 0,00";
const PASSWORD = "senha-e2e-1234";
// Unique per run, so a leftover database cannot break signup.
const USERNAME = `ana_${Date.now()}`;
// The rule starts today and runs on today's day, so its first bill is in the current month.
const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const MONTH = TODAY.slice(0, 7);
const DAY = String(Number(TODAY.slice(8, 10)));

// One shared user and database: the tests run in order.
test.describe.configure({ mode: "serial" });

/** The value of one row in the folded month result of the "Saldo atual" card: the dd right after its dt. */
function actualRow(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Saldo atual" })
    .locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`);
}

/** Save a screenshot of the current state under test-results/shots. */
async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/shots/${name}.png` });
}

test("recurring bill: one occurrence, confirmed once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The anonymous GET /auth/me returns 401 on purpose and the browser logs it. Nothing else.
  // A navigation aborts requests in flight; the browser then logs "Failed to fetch". That is not a bug.
  let aborted = 0;
  let failedFetches = 0;
  page.on("requestfailed", (r) => {
    if (r.failure()?.errorText === "net::ERR_ABORTED") aborted++;
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const anonymousMe = m.location().url.endsWith("/api/auth/me") && m.text().includes("401");
    if (anonymousMe) return;
    if (m.text().startsWith("TypeError: Failed to fetch")) failedFetches++;
    else errors.push(m.text());
  });

  // Sign up.
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Criar conta", pressed: false }).click();
  await page.getByLabel("Nome").fill("Ana");
  await page.getByLabel("Usuário").fill(USERNAME);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).last().click();
  // First run: the setup page comes first. Skip it.
  await expect(page.getByRole("heading", { name: "Configuração inicial" })).toBeVisible();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();

  // Dashboard starts with no expenses.
  await expect(actualRow(page, "Despesas da casa")).toHaveText(ZERO);

  // A full navigation aborts requests still in flight; the browser logs those as errors.
  await page.waitForLoadState("networkidle");
  // Create the rule in "A pagar".
  await page.goto("/a-pagar");
  await expect(page.getByRole("heading", { name: "A pagar" })).toBeVisible();
  await page.getByRole("button", { name: "Recorrente" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova conta recorrente" });
  await sheet.getByLabel("Descrição").fill(DESCRIPTION);
  await sheet.getByLabel("Valor mensal").fill(AMOUNT);
  await sheet.getByLabel("Dia do mês").fill(DAY);
  await sheet.getByLabel("Começa em").fill(TODAY);
  await sheet.getByRole("button", { name: "todas ›" }).click();
  await sheet.getByRole("button", { name: /Moradia e contas/ }).click();
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Conta criada", { exact: true })).toBeVisible();

  const row = page.getByRole("button", { name: new RegExp(DESCRIPTION) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(MONEY);

  // Reload twice: generation is idempotent.
  for (let i = 0; i < 2; i++) {
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.getByRole("heading", { name: "A pagar" })).toBeVisible();
    await expect(row).toHaveCount(1);
  }
  const api = await page.request.get(`/api/bills?month=${MONTH}`);
  const list = (await api.json()) as { items: { description: string }[] };
  expect(list.items.filter((b) => b.description === DESCRIPTION)).toHaveLength(1);

  // Planned bills are not spending yet.
  await page.getByRole("link", { name: "Início" }).first().click();
  await expect(actualRow(page, "Despesas da casa")).toHaveText(ZERO);
  await expect(page.getByText("Previsão · inclui planejados")).toBeVisible();

  // Confirm the payment.
  await page.waitForLoadState("networkidle");
  await page.goto("/a-pagar");
  await row.click();
  await page.getByRole("button", { name: "Confirmar pagamento" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirmar pagamento" });
  await confirm.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pagamento confirmado", { exact: true })).toBeVisible();

  // The bill moved to the paid group, still one row.
  await expect(page.getByRole("heading", { name: "Pagas e canceladas" })).toBeVisible();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Paga");

  // Dashboard: the expense counted once.
  await page.getByRole("link", { name: "Início" }).first().click();
  await expect(actualRow(page, "Despesas da casa")).toHaveText(MONEY);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(actualRow(page, "Despesas da casa")).toHaveText(MONEY);

  expect(failedFetches).toBeLessThanOrEqual(aborted);
  expect(errors).toEqual([]);
});

// Optional: SCREENSHOTS=1 make e2e. Runs after the first test, so the data exists.
test("@screenshots phone and desktop, light and dark", async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take screenshots");
  const views = [
    { name: "phone", size: { width: 390, height: 844 } },
    { name: "desktop", size: { width: 1280, height: 800 } },
  ];
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(USERNAME);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).last().click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();

  for (const view of views) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize(view.size);
      await page.emulateMedia({ colorScheme: scheme });
      const tag = `${view.name}-${scheme}`;
      await page.goto("/");
      await expect(actualRow(page, "Despesas da casa")).toHaveText(MONEY);
      await shoot(page, `dashboard-${tag}`);
      await page.goto("/a-pagar");
      await expect(page.getByRole("button", { name: new RegExp(DESCRIPTION) })).toHaveCount(1);
      await shoot(page, `bills-${tag}`);
      await page.getByRole("button", { name: "Recorrente" }).click();
      await expect(page.getByRole("dialog", { name: "Nova conta recorrente" })).toBeVisible();
      await shoot(page, `create-rule-${tag}`);
      await page.keyboard.press("Escape");
    }
  }
  await page.emulateMedia({ colorScheme: null });
});
