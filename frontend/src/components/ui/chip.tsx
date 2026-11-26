import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/** Filter or type chip. Active chip has the accent fill (ui-guidelines §6.6). */
export function Chip({ active = false, onClick, disabled, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-[44px] whitespace-nowrap rounded-chip px-4 text-[0.82rem] disabled:opacity-60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active ? "bg-accent font-semibold text-accent-fg" : "border border-line bg-surface text-fg",
      )}
    >
      {children}
    </button>
  );
}
