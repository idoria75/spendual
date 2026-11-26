import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryPicker } from "./CategoryPicker";

const categories = ["Mercado", "Lazer", "Saúde", "Casa", "Viagem", "Outros"].map((name, i) => ({
  id: i + 1,
  name,
}));
const tile = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

describe("CategoryPicker", () => {
  it("shows the 4 first tiles, then all of them on request", async () => {
    render(<CategoryPicker categories={categories} selected={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Viagem/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "todas ›" }));
    expect(tile("Viagem")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "‹ menos" }));
    expect(screen.queryByRole("button", { name: /Viagem/ })).not.toBeInTheDocument();
  });

  it("keeps every highlighted tile visible, even past the 4 slots", () => {
    render(<CategoryPicker categories={categories} selected={[5, 6]} onSelect={vi.fn()} />);
    expect(tile("Viagem")).toHaveAttribute("aria-pressed", "true");
    expect(tile("Outros")).toHaveAttribute("aria-pressed", "true");
    expect(tile("Mercado")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the tapped id, and adds a 'Sem categoria' tile on request", async () => {
    const onSelect = vi.fn();
    render(
      <CategoryPicker categories={categories} selected={[null]} onSelect={onSelect} showNone />,
    );
    expect(tile("Sem categoria")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(tile("Lazer"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
