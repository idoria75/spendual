import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const DESCRIPTION = "Internet e2e";
const AMOUNT = "123,45";
const MONEY = "R$ 123,45";
const ZERO = "R$ 0,00";

const VIEWS = [
  { name: "phone", size: { width: 390, height: 844 } },
  { name: "desktop", size: { width: 1280, height: 800 } },
] as const;
const SCHEMES = ["light", "dark"] as const;

/** Save one screenshot per viewport and color scheme under test-results/shots. */
async function shoot(page: Page, name: string) {
  const original = page.viewportSize();
  for (const view of VIEWS) {
    for (const scheme of SCHEMES) {
      await page.setViewportSize(view.size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `test-results/shots/${name}-${view.name}-${scheme}.png` });
    }
  }
  if (original) await page.setViewportSize(original);
  await page.emulateMedia({ colorScheme: "light" });
}

/** The value of one row of the "Realizado" card, by its label. */
function actualRow(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Realizado" })
    .locator("div", { has: page.getByText(label, { exact: true }) })
    .locator("dd");
}

test("recurring bill: one occurrence, confirmed once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The anonymous /auth/me call returns 401 on purpose; the browser logs it.
  page.on(
    "console",
    (m) => m.type() === "error" && !m.text().includes("status of 401") && errors.push(m.text()),
  );

  // Sign up.
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Criar conta", pressed: false }).click();
  await page.getByLabel("Nome").fill("Ana");
  await page.getByLabel("Usuário").fill("ana_e2e");
  await page.getByLabel("Senha").fill("senha-e2e-1234");
  await shoot(page, "01-signup");
  await page.getByRole("button", { name: "Criar conta" }).last().click();
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();

  // Dashboard starts with no expenses.
  await expect(actualRow(page, "Despesas da casa")).toHaveText(ZERO);

  // Create the rule in "A pagar".
  await page.goto("/a-pagar");
  await expect(page.getByRole("heading", { name: "A pagar" })).toBeVisible();
  await page.getByRole("button", { name: "Recorrente" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova conta recorrente" });
  await sheet.getByLabel("Descrição").fill(DESCRIPTION);
  await sheet.getByLabel("Valor mensal").fill(AMOUNT);
  await sheet.getByLabel("Categoria").selectOption({ label: "Moradia e contas" });
  await shoot(page, "02-create-rule");
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Conta criada", { exact: true })).toBeVisible();

  const row = page.getByRole("button", { name: new RegExp(DESCRIPTION) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(MONEY);
  await shoot(page, "03-bills-planned");

  // Reload twice: generation is idempotent.
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.getByRole("heading", { name: "A pagar" })).toBeVisible();
    await expect(row).toHaveCount(1);
  }
  const month = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const api = await page.request.get(`/api/bills?month=${month}`);
  const list = (await api.json()) as { items: { description: string }[] };
  expect(list.items.filter((b) => b.description === DESCRIPTION)).toHaveLength(1);

  // Planned bills are not spending yet.
  await page.getByRole("link", { name: "Início" }).first().click();
  await expect(actualRow(page, "Despesas da casa")).toHaveText(ZERO);
  await expect(page.getByText("Previsão · inclui planejados")).toBeVisible();
  await shoot(page, "04-dashboard-before");

  // Confirm the payment.
  await page.goto("/a-pagar");
  await row.click();
  await shoot(page, "05-bill-detail");
  await page.getByRole("button", { name: "Confirmar pagamento" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirmar pagamento" });
  await shoot(page, "06-confirm-sheet");
  await confirm.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pagamento confirmado", { exact: true })).toBeVisible();

  // The bill moved to the paid group, still one row.
  const paid = page.getByRole("heading", { name: "Pagas e canceladas" });
  await expect(paid).toBeVisible();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Paga");
  await shoot(page, "07-bills-paid");

  // Dashboard: the expense counted once.
  await page.getByRole("link", { name: "Início" }).first().click();
  await expect(actualRow(page, "Despesas da casa")).toHaveText(MONEY);
  await page.reload();
  await expect(actualRow(page, "Despesas da casa")).toHaveText(MONEY);
  await shoot(page, "08-dashboard-after");

  expect(errors).toEqual([]);
});
