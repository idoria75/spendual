import * as LabelPrimitive from "@radix-ui/react-label";
import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { Input } from "./input";

export function Label({ className = "", ...props }: LabelPrimitive.LabelProps) {
  return (
    <LabelPrimitive.Root
      className={`text-[0.72rem] font-semibold text-muted ${className}`}
      {...props}
    />
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Label + input + error text, linked with aria-describedby. */
export function Field({ label, error, hint, ...inputProps }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-[3px]">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {hint && !error ? <p className="text-[0.75rem] text-muted">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="text-[0.75rem] text-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
