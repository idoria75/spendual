import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/ui/sheet";
import { useEntry } from "./entry";
import { TransactionForm } from "./TransactionForm";

/** The Novo lançamento sheet (phone) or dialog (desktop). Also used to edit. */
export function EntrySheet() {
  const { t } = useTranslation();
  const { isOpen, close, editing, notifySaved } = useEntry();
  const amountRef = useRef<HTMLInputElement>(null);
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      title={t(editing ? "form.titleEdit" : "form.titleNew")}
      tall
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        amountRef.current?.focus();
      }}
    >
      <TransactionForm
        editing={editing}
        amountRef={amountRef}
        onSaved={() => {
          notifySaved();
          close();
        }}
      />
    </Sheet>
  );
}
