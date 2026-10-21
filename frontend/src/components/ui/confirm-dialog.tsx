import * as Dialog from "@radix-ui/react-dialog";
import { TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "./button";
import { Field } from "./field";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** First line: the record, for example "iFood · −R$ 64,50 · 02/10". */
  record: string;
  body: string;
  confirmLabel: string;
  /** Void and cancel need a reason (ui-guidelines §6.8). */
  reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

/** Confirmation: safe action on the left, action on the right, reason field when required. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  record,
  body,
  confirmLabel,
  reasonRequired = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [error, setError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // React events bubble through portals: without this, a confirm inside a form submits that form too.
    event.stopPropagation();
    if (locked.current) return;
    const trimmed = reason.trim();
    if (reasonRequired && trimmed === "") {
      setReasonError(true);
      return;
    }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(messageKeyFor(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setReason("");
      setReasonError(false);
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/[0.38]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface p-4 text-fg"
        >
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
            <Dialog.Title className="text-[17px] font-bold">{title}</Dialog.Title>
            <p className="text-[0.92rem] font-semibold">{record}</p>
            <p className="text-[0.88rem] text-muted">{body}</p>
            {reasonRequired ? (
              <Field
                label={t("confirm.reason")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                error={reasonError ? t("confirm.reasonRequired") : undefined}
                maxLength={500}
                autoComplete="off"
              />
            ) : null}
            {error ? (
              <p role="alert" className="text-[0.85rem] text-err">
                {t(error)}
              </p>
            ) : null}
            <div className="flex justify-between gap-3">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
                {t("confirm.back")}
              </Button>
              <Button type="submit" disabled={busy} className="bg-fg text-bg">
                <TriangleAlert size={16} aria-hidden className="mr-1 inline" />
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
