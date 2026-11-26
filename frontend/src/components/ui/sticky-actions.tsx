import type { ReactNode } from "react";

/**
 * Save bar at the bottom of a sheet. The border and the fade above it show that the form
 * scrolls under the bar (ui-guidelines §6.7).
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="relative sticky bottom-0 -mx-4 -mb-4 mt-auto border-t border-line bg-surface px-4 pb-5 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gradient-to-t before:from-surface before:to-transparent">
      {children}
    </div>
  );
}
