import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExportRow, exportHref } from "./ExportRow";

describe("ExportRow", () => {
  it("builds the address from the chosen dates and blocks a backwards range", async () => {
    expect(exportHref("", "")).toBe("/api/export/transactions.csv");
    expect(exportHref("2027-01-01", "")).toBe("/api/export/transactions.csv?from=2027-01-01");
    render(<ExportRow />);
    const u = userEvent.setup();
    const link = () => screen.getByRole("link", { name: "Baixar CSV" });
    expect(link()).toHaveAttribute("href", "/api/export/transactions.csv");
    await u.type(screen.getByLabelText("De"), "2027-03-10");
    await u.type(screen.getByLabelText("Até"), "2027-03-31");
    expect(link()).toHaveAttribute(
      "href",
      "/api/export/transactions.csv?from=2027-03-10&to=2027-03-31",
    );
    await u.clear(screen.getByLabelText("Até"));
    await u.type(screen.getByLabelText("Até"), "2027-03-01");
    expect(screen.getByText("A data inicial passa da final.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Baixar CSV" })).toBeNull();
    expect(screen.getByRole("button", { name: "Baixar CSV" })).toBeDisabled();
  });
});
