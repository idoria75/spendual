import { ChevronDown } from "lucide-react";
import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { Label } from "./field";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  error?: string | undefined;
  /** Hide the visible label (still read by screen readers), for filter chips. */
  hideLabel?: boolean;
  children: ReactNode;
}

/** Native select: best picker on phones and fully accessible. */
export function Select({ label, error, hideLabel, className, children, ...props }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-[3px]">
      <Label htmlFor={id} className={hideLabel ? "sr-only" : ""}>
        {label}
      </Label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "min-h-[44px] w-full appearance-none rounded-input border border-line bg-surface py-0 pl-[10px] pr-8 text-[0.88rem] text-fg",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            "aria-[invalid=true]:border-err",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
      {error ? (
        <p id={errorId} className="text-[0.75rem] text-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
