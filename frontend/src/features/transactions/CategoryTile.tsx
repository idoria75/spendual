import { Tag } from "lucide-react";

/** Tinted tile in the category color (ui-guidelines §6.1). Color cycles over 12 tokens. */
export function CategoryTile({ id, size = 28 }: { id: number | null; size?: 28 | 40 }) {
  const color = `var(--cat-${id === null ? 11 : id % 12})`;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-tile"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <Tag size={16} strokeWidth={2} />
    </span>
  );
}
