import { cn } from "../../lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Two or three exclusive options (ui-guidelines §6.6). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-flow-col auto-cols-fr rounded-input bg-surface-2 p-[3px] text-[0.8rem]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-[44px] whitespace-nowrap rounded-[8px] px-2 disabled:cursor-not-allowed disabled:opacity-60",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            value === o.value ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
