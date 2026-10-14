import type { Bill, Transaction } from "@spendual/shared";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface EntryValue {
  /** Open the new record sheet. */
  openNew: () => void;
  openEdit: (tx: Transaction) => void;
  /** Open the sheet to confirm a planned bill ("Confirmar pagamento"). */
  openConfirm: (bill: Bill) => void;
  close: () => void;
  /** The record being edited, or null for a new record. */
  editing: Transaction | null;
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
  const [version, setVersion] = useState(0);

  const openNew = useCallback(() => {
    setEditing(null);
    setBill(null);
    setOpen(true);
  }, []);
  const openEdit = useCallback((tx: Transaction) => {
    setEditing(tx);
    setBill(null);
    setOpen(true);
  }, []);
  const openConfirm = useCallback((b: Bill) => {
    setEditing(null);
    setBill(b);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const notifySaved = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ openNew, openEdit, openConfirm, close, editing, bill, isOpen, version, notifySaved }),
    [openNew, openEdit, openConfirm, close, editing, bill, isOpen, version, notifySaved],
  );
  return <EntryContext.Provider value={value}>{children}</EntryContext.Provider>;
}

export function useEntry(): EntryValue {
  const ctx = useContext(EntryContext);
  if (!ctx) throw new Error("useEntry must be used inside EntryProvider");
  return ctx;
}
