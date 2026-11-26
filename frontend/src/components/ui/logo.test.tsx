import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./logo";

describe("Logo", () => {
  it("is decorative when the name is written next to it", () => {
    const { container } = render(<Logo size={28} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/logo.svg");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "28");
  });

  it("has the app name as its text alternative when it stands alone", () => {
    render(<Logo size={28} label="Spendual" />);
    expect(screen.getByRole("img", { name: "Spendual" })).toBeInTheDocument();
  });
});
