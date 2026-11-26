import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-[44px] w-full whitespace-nowrap rounded-input border border-line bg-surface px-[10px] text-[0.88rem] text-fg",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "aria-[invalid=true]:border-err",
          className,
        )}
        {...props}
      />
    );
  },
);
