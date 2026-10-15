import type { Scope, Transaction, TransactionListQuery } from "@spendual/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Select } from "../../components/ui/select";
import { useToast } from "../../components/ui/toast";
import { formatMoney } from "../../lib/currency";
import { formatDayHeader, formatDayMonth } from "../../lib/date";
import { cancelTransaction, listTransactions, voidTransaction } from "./api";
import { dayTotal, formatTxAmount, groupByDay } from "./display";
import { useEntry } from "./entry";
import { useLookups } from "./lookups";
import { useMonth } from "./month";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionRow } from "./TransactionRow";

type StatusFilter = "all" | "confirmed" | "voided";
type ScopeFilter = "all" | Scope;

export function LancamentosView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { data: lookups } = useLookups();
  const entry = useEntry();
  const { showToast } = useToast();

  const [scope, setScope] = useState<ScopeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [personId, setPersonId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [voiding, setVoiding] = useState<Transaction | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const query: TransactionListQuery = { month };
    if (scope !== "all") query.scope = scope;
    if (status !== "all") query.status = status;
    if (personId) query.personId = Number(personId);
    if (categoryId) query.categoryId = Number(categoryId);
    const id = ++requestId.current;
    setError(null);
    try {
      const result = await listTransactions(query);
      if (id === requestId.current) setItems(result);
    } catch (e) {
      if (id === requestId.current) {
        setError(messageKeyFor(e));
        setItems([]);
      }
    }
  }, [month, scope, status, personId, categoryId]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load, entry.version]);

  const groups = items ? groupByDay(items) : [];

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
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("nav.lancamentos")}</h1>

      <div className="flex flex-col gap-2" aria-label={t("list.filters")} role="group">
        <div className="flex flex-wrap gap-2">
          {(["all", "household", "personal"] as const).map((s) => (
            <Chip key={s} active={scope === s} onClick={() => setScope(s)}>
              {t(`list.scope.${s}`)}
            </Chip>
          ))}
          {(["all", "confirmed", "voided"] as const).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {t(`list.status.${s}`)}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            label={t("list.person")}
            hideLabel
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="">{t("list.allPeople")}</option>
            {lookups?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </Select>
          <Select
            label={t("list.category")}
            hideLabel
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t("list.allCategories")}</option>
            {(["expense", "income"] as const).map((kind) => {
              const group = lookups?.categories.filter((c) => c.kind === kind) ?? [];
              if (group.length === 0) return null;
              return (
                <optgroup key={kind} label={t(`settings.categoryKinds.${kind}`)}>
                  {group.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t(error)}</p>
          <Button variant="ghost" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      {items === null ? (
        <ul aria-busy="true" aria-label={t("common.loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} data-testid="skeleton" className="h-14 rounded-input bg-surface-2" />
          ))}
        </ul>
      ) : null}

      {items !== null && items.length === 0 && !error ? (
        <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-4">
          <p className="text-muted">{t("list.empty")}</p>
          <Button onClick={entry.openNew}>{t("list.emptyAction")}</Button>
        </div>
      ) : null}

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
    </section>
  );
}
