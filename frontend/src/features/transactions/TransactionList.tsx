import type { Transaction } from "@spendual/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useToast } from "../../components/ui/toast";
import { formatMoney } from "../../lib/currency";
import { formatDayHeader, formatDayMonth } from "../../lib/date";
import { cancelTransaction, voidTransaction } from "./api";
import { dayTotal, formatTxAmount, groupByDay } from "./display";
import { useEntry } from "./entry";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionRow } from "./TransactionRow";

/**
 * Records grouped by day. Tap a row for the detail, then edit, void or cancel it.
 * Shared by Lançamentos and Pessoal.
 */
export function TransactionList({ items }: { items: Transaction[] }) {
  const { t } = useTranslation();
  const entry = useEntry();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [voiding, setVoiding] = useState<Transaction | null>(null);
  const groups = groupByDay(items);

  const confirmVoid = async (reason: string) => {
    if (!voiding) return;
    const target = voiding;
    if (target.status === "planned") await cancelTransaction(target.id, reason);
    else await voidTransaction(target.id, reason);
    setVoiding(null);
    setSelected(null);
    showToast(t(target.status === "planned" ? "list.cancelledToast" : "list.voidedToast"));
    entry.notifySaved();
  };

  return (
    <>
      {groups.map((g) => (
        <section key={g.date} aria-label={formatDayMonth(g.date)} className="flex flex-col gap-2">
          <header className="flex items-baseline justify-between text-[12px] font-semibold text-muted">
            <h2>{formatDayHeader(g.date)}</h2>
            <span>
              {(() => {
                const total = dayTotal(g.items);
                return formatMoney(
                  total,
                  total.startsWith("-") || total === "0.00" ? "none" : "plus",
                );
              })()}
            </span>
          </header>
          <ul className="flex flex-col gap-2">
            {g.items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onOpen={() => setSelected(tx)} />
            ))}
          </ul>
        </section>
      ))}

      <TransactionDetail
        tx={voiding ? null : selected}
        onClose={() => setSelected(null)}
        onEdit={(tx) => {
          setSelected(null);
          entry.openEdit(tx);
        }}
        onVoid={(tx) => setVoiding(tx)}
      />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
        title={t(voiding?.status === "planned" ? "confirm.cancelTitle" : "confirm.voidTitle")}
        record={
          voiding
            ? `${voiding.description} · ${formatTxAmount(voiding)} · ${formatDayMonth(voiding.transactionDate)}`
            : ""
        }
        body={t(voiding?.status === "planned" ? "confirm.cancelBody" : "confirm.voidBody")}
        confirmLabel={t(
          voiding?.status === "planned" ? "confirm.cancelAction" : "confirm.voidAction",
        )}
        reasonRequired
        onConfirm={confirmVoid}
      />
    </>
  );
}
