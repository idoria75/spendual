import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Tall sheet on phones (entry form). */
  tall?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
}

/** Bottom sheet on phones, centered dialog from 768px (ui-guidelines §6.7). No motion. */
export function Sheet({ open, onOpenChange, title, children, tall, onOpenAutoFocus }: SheetProps) {
  const { t } = useTranslation();
  // No Dialog.Trigger here (the sheet is opened from several places), so Radix cannot
  // restore focus alone. Remember the opener before Radix moves focus into the sheet.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/[0.38]" />
        <Dialog.Content
          aria-describedby={undefined}
          {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-sheet bg-surface text-fg",
            tall ? "h-[92dvh]" : "max-h-[92dvh]",
            "md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[min(90dvh,820px)] md:w-full md:max-w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card",
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-chip bg-line md:hidden" />
          <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
            <Dialog.Title className="text-[17px] font-bold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={t("common.close")}
              className="flex h-11 w-11 items-center justify-center rounded-input text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={20} aria-hidden />
            </Dialog.Close>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-width:thin]">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
