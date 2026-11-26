import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { json, mockFetch, shellStubs, user, type Handler } from "../../test/fetch-mock";
import { changedFields, entitySummary } from "./history";

const event = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  actorId: 1,
  entityType: "Transaction",
  entityId: "5",
  action: "transaction.update",
  before: { description: "Pão", amount: "10.00", updatedAt: "a" },
  after: { description: "Pão francês", amount: "10.00", updatedAt: "b" },
  reason: null,
  createdAt: "2027-03-15T15:00:00.000Z",
  ...over,
});

describe("history helpers", () => {
  it("names the entity and lists only the fields that changed", () => {
    const e = event(1);
    expect(entitySummary(e)).toBe("Pão francês");
    expect(entitySummary(event(2, { before: null, after: {}, entityType: "SavingsGoal" }))).toBe(
      "SavingsGoal #5",
    );
    expect(changedFields(e)).toEqual([
      { field: "description", before: "Pão", after: "Pão francês" },
    ]);
  });
});

let urls: string[] = [];
const handler: Handler = (req) => {
  const path = req.url.split("?")[0];
  if (path === "/api/auth/me") return json(200, user);
  if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
  if (path === "/api/audit") {
    urls.push(req.url);
    const older = req.url.includes("before=");
    return json(
      200,
      older
        ? {
            items: [
              event(1, {
                action: "transaction.create",
                before: null,
                after: { description: "Pão" },
              }),
            ],
            nextBefore: null,
          }
        : { items: [event(2, { reason: "Erro de digitação" })], nextBefore: 2 },
    );
  }
  return shellStubs(req.url) ?? json(404, {});
};

describe("Histórico", () => {
  it("lists events, filters, pages and opens the changes", async () => {
    urls = [];
    resetCsrfToken();
    mockFetch(handler);
    const u = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/historico"]}>
        <App />
      </MemoryRouter>,
    );
    const row = await screen.findByRole("button", { name: /Pão francês/ });
    expect(row).toHaveTextContent("Lançamento alterado");

    await u.click(screen.getByRole("button", { name: "Ver mais antigos" }));
    expect(await screen.findByText(/Lançamento criado/)).toBeInTheDocument();
    expect(urls[1]).toContain("before=2");
    expect(screen.queryByRole("button", { name: "Ver mais antigos" })).toBeNull();

    await u.click(screen.getByRole("button", { name: "Metas" }));
    await screen.findByRole("button", { name: /Pão francês/ });
    expect(urls[urls.length - 1]).toContain("entityType=SavingsGoal");

    await u.click(screen.getByRole("button", { name: /Pão francês/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Erro de digitação")).toBeInTheDocument();
    expect(within(sheet).getByText("Descrição")).toBeInTheDocument();
    expect(within(sheet).queryByText("Valor")).toBeNull();
  });
});
