import { cn } from "../../lib/cn";
import { toneColor } from "./display";

interface UserPickerProps {
  users: { id: number; displayName: string; tonePalette: string | null }[];
  selected: number | null;
  /** The caller decides what a tap on the selected tile means (keep it, or clear it). */
  onSelect: (id: number) => void;
  legend: string;
  error?: string | undefined;
}

/** Person picker (ui-guidelines §6.1b): one full-width row of tiles in the users' colors. */
export function UserPicker({ users, selected, onSelect, legend, error }: UserPickerProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[0.72rem] font-semibold text-muted">{legend}</legend>
      <div className="grid grid-flow-col auto-cols-fr gap-2">
        {users.map((u) => {
          const on = u.id === selected;
          const color = toneColor(u.tonePalette);
          return (
            <button
              key={u.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(u.id)}
              style={{
                background: on ? color : `color-mix(in srgb, ${color} 25%, transparent)`,
              }}
              className={cn(
                "min-h-[44px] rounded-input border px-2 text-center text-[0.85rem]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                on ? "border-2 border-accent font-semibold text-on-tone" : "border-line text-fg",
              )}
            >
              <span className="[overflow-wrap:anywhere]">{u.displayName}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-[0.75rem] text-err">{error}</p> : null}
    </fieldset>
  );
}
