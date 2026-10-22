import type { Bill, Transaction } from "@spendual/shared";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface EntryValue {
  /** Open the new record sheet. */
  openNew: () => void;
  openEdit: (tx: Transaction) => void;
  /** New record pre-filled from another one (date = today). */
  openDuplicate: (tx: Transaction) => void;
  /** Void `tx` and enter the right record in one step. */
  openCorrect: (tx: Transaction) => void;
  /** Open the sheet to confirm a planned bill ("Confirmar pagamento"). */
  openConfirm: (bill: Bill) => void;
  close: () => void;
  /** The record being edited, or null for a new record. */
  editing: Transaction | null;
  /** The record to copy into a new one, or null. */
  duplicating: Transaction | null;
  /** The record being corrected, or null. */
  correcting: Transaction | null;
  /** The planned bill being confirmed, or null. */
  bill: Bill | null;
  isOpen: boolean;
  /** Goes up after each saved change, so lists reload. */
  version: number;
  notifySaved: () => void;
}

const EntryContext = createContext<EntryValue | null>(null);

export function EntryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [duplicating, setDuplicating] = useState<Transaction | null>(null);
  const [correcting, setCorrecting] = useState<Transaction | null>(null);
  const [version, setVersion] = useState(0);

  // One mode at a time: set the one asked for, clear the others.
  const open = useCallback(
    (mode: {
      editing?: Transaction;
      bill?: Bill;
      duplicating?: Transaction;
      correcting?: Transaction;
    }) => {
      setEditing(mode.editing ?? null);
      setBill(mode.bill ?? null);
      setDuplicating(mode.duplicating ?? null);
      setCorrecting(mode.correcting ?? null);
      setOpen(true);
    },
    [],
  );
  const openNew = useCallback(() => open({}), [open]);
  const openEdit = useCallback((tx: Transaction) => open({ editing: tx }), [open]);
  const openDuplicate = useCallback((tx: Transaction) => open({ duplicating: tx }), [open]);
  const openCorrect = useCallback((tx: Transaction) => open({ correcting: tx }), [open]);
  const openConfirm = useCallback((b: Bill) => open({ bill: b }), [open]);
  const close = useCallback(() => setOpen(false), []);
  const notifySaved = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({
      openNew,
      openEdit,
      openDuplicate,
      openCorrect,
      openConfirm,
      close,
      editing,
      bill,
      duplicating,
      correcting,
      isOpen,
      version,
      notifySaved,
    }),
    [
      openNew,
      openEdit,
      openDuplicate,
      openCorrect,
      openConfirm,
      close,
      editing,
      bill,
      duplicating,
      correcting,
      isOpen,
      version,
      notifySaved,
    ],
  );
  return <EntryContext.Provider value={value}>{children}</EntryContext.Provider>;
}

export function useEntry(): EntryValue {
  const ctx = useContext(EntryContext);
  if (!ctx) throw new Error("useEntry must be used inside EntryProvider");
  return ctx;
}
