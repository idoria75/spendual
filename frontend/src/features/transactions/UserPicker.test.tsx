import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserPicker } from "./UserPicker";

const users = [
  { id: 1, displayName: "Ana", tonePalette: "blue" },
  { id: 2, displayName: "Bia", tonePalette: "rose" },
];

describe("UserPicker", () => {
  it("shows one tile per user in a single row, the chosen one solid in its color", () => {
    render(<UserPicker users={users} selected={2} onSelect={vi.fn()} legend="Pago por" />);
    const group = screen.getByRole("group", { name: "Pago por" });
    expect(group.querySelector("div")).toHaveClass("grid-flow-col", "auto-cols-fr");
    const ana = screen.getByRole("button", { name: "Ana" });
    const bia = screen.getByRole("button", { name: "Bia" });
    expect(bia).toHaveAttribute("aria-pressed", "true");
    expect(bia.style.background).toBe("var(--tone-rose)");
    expect(ana).toHaveAttribute("aria-pressed", "false");
    expect(ana.style.background).toContain("color-mix");
    expect(ana.style.background).toContain("var(--tone-blue)");
  });

  it("reports the tapped id and shows an error", async () => {
    const onSelect = vi.fn();
    render(
      <UserPicker
        users={users}
        selected={null}
        onSelect={onSelect}
        legend="De quem"
        error="Escolha"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ana" }));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.getByText("Escolha")).toBeInTheDocument();
  });
});
