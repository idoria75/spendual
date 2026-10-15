import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AmountField } from "./amount-input";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <AmountField label="Valor" value={value} onValueChange={setValue} />;
}

it("formats live as BRL while typing digits", async () => {
  render(<Harness />);
  const input = screen.getByLabelText("Valor");
  expect(input).toHaveAttribute("inputmode", "numeric");
  await userEvent.type(input, "123456");
  expect(input).toHaveValue("1.234,56");
});

it("backspace removes the last digit", async () => {
  render(<Harness initial="1.234,56" />);
  const input = screen.getByLabelText("Valor");
  await userEvent.type(input, "{Backspace}");
  expect(input).toHaveValue("123,45");
  await userEvent.type(input, "{Backspace}{Backspace}{Backspace}");
  expect(input).toHaveValue("0,12");
  await userEvent.type(input, "{Backspace}");
  expect(input).toHaveValue("0,01");
  await userEvent.type(input, "{Backspace}");
  expect(input).toHaveValue("");
});

it("ignores letters", async () => {
  render(<Harness />);
  const input = screen.getByLabelText("Valor");
  await userEvent.type(input, "a1b2");
  expect(input).toHaveValue("0,12");
});

it("pastes a typed PT-BR amount as is", async () => {
  render(<Harness />);
  const input = screen.getByLabelText("Valor");
  await userEvent.click(input);
  await userEvent.paste("1.234,5");
  expect(input).toHaveValue("1.234,50");
});

it("pastes a plain integer as whole reais", async () => {
  render(<Harness />);
  const input = screen.getByLabelText("Valor");
  await userEvent.click(input);
  await userEvent.paste("80");
  expect(input).toHaveValue("80,00");
});
