import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { resetCsrfToken } from "../../lib/api-client";
import { apiError, json, mockFetch, shellStubs, user } from "../../test/fetch-mock";

const lookups = {
  users: [
    { id: 1, displayName: "Ana", tonePalette: "blue" },
    { id: 2, displayName: "Bia", tonePalette: "rose" },
  ],
  categories: [],
  accounts: [],
  paymentMethods: [],
};

type Backup = { configured: boolean; lastBackupAt: string | null; lastBackupBytes: number | null };

function setup(opts: { backup?: Backup; patch?: (body: unknown) => Response } = {}) {
  return mockFetch((req) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/api/auth/me") return json(200, { ...user, tonePalette: "blue" });
    if (path === "/api/auth/csrf") return json(200, { csrfToken: "tok" });
    if (path === "/api/lookups") return json(200, lookups);
    if (path === "/api/backup/status")
      return json(
        200,
        opts.backup ?? { configured: false, lastBackupAt: null, lastBackupBytes: null },
      );
    if (path === "/api/me" && req.method === "PATCH")
      return opts.patch ? opts.patch(req.body) : json(200, { ...user, ...(req.body as object) });
    return shellStubs(req.url) ?? json(404, {});
  });
}

function renderAjustes() {
  return render(
    <MemoryRouter
      initialEntries={["/ajustes"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

function patchCalls(mock: ReturnType<typeof setup>) {
  return mock.mock.calls
    .filter(([u, i]) => u === "/api/me" && i?.method === "PATCH")
    .map(([, i]) => JSON.parse(i!.body as string) as unknown);
}

beforeEach(() => {
  resetCsrfToken();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => vi.unstubAllGlobals());

describe("Ajustes profile", () => {
  it("edits the display name with PATCH /me", async () => {
    const mock = setup();
    renderAjustes();
    const input = await screen.findByLabelText("Seu nome");
    await userEvent.clear(input);
    await userEvent.type(input, "Ana Maria");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(patchCalls(mock)).toEqual([{ displayName: "Ana Maria" }]));
    expect(await screen.findByDisplayValue("Ana Maria")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("shows tone_taken inline and disables the other user's tone", async () => {
    setup({ patch: () => apiError(409, "tone_taken") });
    renderAjustes();
    expect(await screen.findByRole("button", { name: "Rosa" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Sálvia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esse tom já é da outra pessoa.");
  });

  it("sends the tone key", async () => {
    const mock = setup();
    renderAjustes();
    await userEvent.click(await screen.findByRole("button", { name: "Areia" }));
    await waitFor(() => expect(patchCalls(mock)).toEqual([{ tonePalette: "sand" }]));
  });

  it("clears the tone when the selected one is pressed again", async () => {
    const mock = setup();
    renderAjustes();
    const blue = await screen.findByRole("button", { name: "Azul" });
    expect(blue).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(blue);
    await waitFor(() => expect(patchCalls(mock)).toEqual([{ tonePalette: null }]));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Azul" })).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("reloads lookups on open and after a saved change", async () => {
    const mock = setup();
    const lookupCalls = () => mock.mock.calls.filter(([u]) => u === "/api/lookups").length;
    renderAjustes();
    const sand = await screen.findByRole("button", { name: "Areia" });
    await waitFor(() => expect(lookupCalls()).toBeGreaterThanOrEqual(2));
    const beforeSave = lookupCalls();
    await userEvent.click(sand);
    await waitFor(() => expect(lookupCalls()).toBeGreaterThan(beforeSave));
    expect(patchCalls(mock)).toHaveLength(1);
  });

  it("disables the controls while a PATCH is pending", async () => {
    const mock = setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/me" && init?.method === "PATCH") await gate;
      return inner(input, init);
    });
    renderAjustes();
    await userEvent.click(await screen.findByRole("button", { name: "Areia" }));
    expect(screen.getByRole("button", { name: "Sálvia" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Escuro" })).toBeDisabled();
    expect(screen.getByLabelText("Seu nome")).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sálvia" })).toBeEnabled());
    expect(patchCalls(mock)).toEqual([{ tonePalette: "sand" }]);
  });

  it("shows the stored trimmed name after a save", async () => {
    setup();
    renderAjustes();
    const input = await screen.findByLabelText("Seu nome");
    await userEvent.clear(input);
    await userEvent.type(input, "  Ana Maria  ");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByLabelText("Seu nome")).toHaveValue("Ana Maria"));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("allows a retry after a failed name save", async () => {
    const mock = setup({ patch: () => apiError(500, "internal_error") });
    renderAjustes();
    const input = await screen.findByLabelText("Seu nome");
    await userEvent.clear(input);
    await userEvent.type(input, "Ana Maria");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(patchCalls(mock)).toHaveLength(1));
    await waitFor(() => expect(screen.getByLabelText("Seu nome")).toBeEnabled());
    expect(screen.getByLabelText("Seu nome")).toHaveValue("Ana Maria");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    await userEvent.clear(screen.getByLabelText("Seu nome"));
    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("theme sets data-theme on html and sends PATCH; system removes it", async () => {
    const mock = setup();
    renderAjustes();
    await userEvent.click(await screen.findByRole("radio", { name: "Escuro" }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(patchCalls(mock)).toEqual([{ theme: "dark" }]);
    await userEvent.click(screen.getByRole("radio", { name: "Sistema" }));
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute("data-theme"));
  });

  it("applies the saved theme on load", async () => {
    mockFetch((req) => {
      if (req.url === "/api/auth/me") return json(200, { ...user, theme: "light" });
      return shellStubs(req.url) ?? json(404, {});
    });
    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Olá, Ana");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});

describe("Ajustes backup status", () => {
  it("not configured", async () => {
    setup();
    renderAjustes();
    expect(await screen.findByText("Backup não configurado")).toBeInTheDocument();
  });

  it("no backup yet", async () => {
    setup({ backup: { configured: true, lastBackupAt: null, lastBackupBytes: null } });
    renderAjustes();
    expect(await screen.findByText("Nenhum backup ainda")).toBeInTheDocument();
  });

  it("last backup with date and size", async () => {
    setup({
      backup: {
        configured: true,
        lastBackupAt: "2026-10-14T15:30:00.000Z",
        lastBackupBytes: 1_258_291,
      },
    });
    renderAjustes();
    expect(await screen.findByText("Último backup: 14/10/2026 12:30 · 1,3 MB")).toBeInTheDocument();
  });

  it("unknown size", async () => {
    setup({
      backup: { configured: true, lastBackupAt: "2026-10-14T15:30:00.000Z", lastBackupBytes: null },
    });
    renderAjustes();
    expect(
      await screen.findByText("Último backup: 14/10/2026 12:30 · tamanho desconhecido"),
    ).toBeInTheDocument();
  });

  it("a failed read shows a specific message and logs nothing", async () => {
    const inner = setup();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === "/api/backup/status"
        ? Promise.resolve(apiError(500, "internal_error"))
        : inner(input, init),
    );
    renderAjustes();
    expect(await screen.findByText("Não foi possível ler o backup")).toBeInTheDocument();
  });
});
