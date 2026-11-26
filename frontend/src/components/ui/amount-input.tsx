import { forwardRef, useId } from "react";
import type { ClipboardEvent, InputHTMLAttributes } from "react";
import { formatAmountInput, maskAmountInput, parsePastedAmount } from "../../lib/currency";
import { Input } from "./input";
import { Label } from "./field";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
>;

interface AmountInputProps extends NativeProps {
  /** Text shown in the field, already masked ("1.234,56") or "". */
  value: string;
  onValueChange: (value: string) => void;
}

/** BRL amount field. Digits fill from the right; numeric keypad; paste and backspace work. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onValueChange, ...props },
  ref,
) {
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const parsed = parsePastedAmount(event.clipboardData.getData("text"));
    if (parsed === null) return;
    event.preventDefault();
    onValueChange(formatAmountInput(parsed));
  };
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      {...props}
      value={value}
      onChange={(e) => onValueChange(maskAmountInput(e.target.value))}
      onPaste={onPaste}
    />
  );
});

interface AmountFieldProps extends AmountInputProps {
  label: string;
  error?: string | undefined;
}

/** Label + AmountInput + error text. */
export function AmountField({ label, error, ...inputProps }: AmountFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-[3px]">
      <Label htmlFor={id}>{label}</Label>
      <AmountInput
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-[0.75rem] text-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
