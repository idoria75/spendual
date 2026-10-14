import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the translated title", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Spendual" })).toBeInTheDocument();
});
