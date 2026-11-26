import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { CategoryTile } from "./CategoryTile";

const SLOTS = 4;

interface CategoryPickerProps {
  /** Already filtered, most used first (`byUsage`). */
  categories: { id: number; name: string }[];
  /** Highlighted tiles; null stands for "no category". */
  selected: (number | null)[];
  /** The caller decides what a tap means (pick, clear, replace). */
  onSelect: (id: number | null) => void;
  error?: string | undefined;
  /** Adds a `Sem categoria` tile after the others. */
  showNone?: boolean;
}

/** The one category picker of the app (ui-guidelines §6.1): icon tiles, 4 most used + `todas ›`. */
export function CategoryPicker({
  categories,
  selected,
  onSelect,
  error,
  showNone,
}: CategoryPickerProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  // Chosen tiles stay visible, then the most used ones fill the 4 slots.
  const visible = showAll
    ? categories
    : (() => {
        const picked = categories.filter((c) => selected.includes(c.id));
        for (const c of categories)
          if (picked.length < SLOTS && !picked.includes(c)) picked.push(c);
        return picked;
      })();
  const tiles: { id: number | null; name: string }[] = [
    ...visible,
    ...(showNone ? [{ id: null, name: t("list.noCategory") }] : []),
  ];

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[0.72rem] font-semibold text-muted">{t("form.category")}</legend>
      <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
        {tiles.map((c) => (
          <button
            key={c.id ?? "none"}
            type="button"
            aria-pressed={selected.includes(c.id)}
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-input border px-1 py-1 text-center text-[0.72rem] leading-tight",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected.includes(c.id) ? "border-accent bg-surface-2 font-semibold" : "border-line",
            )}
          >
            <CategoryTile id={c.id} size={40} />
            <span className="max-w-full [overflow-wrap:anywhere]">{c.name}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setShowAll((s) => !s)}
        className="min-h-[44px] self-start text-[0.82rem] font-semibold text-accent"
      >
        {showAll ? t("form.categoryFewer") : t("form.categoryAll")}
      </button>
      {error ? <p className="text-[0.75rem] text-err">{error}</p> : null}
    </fieldset>
  );
}
