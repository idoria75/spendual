import type { Scope, Transaction, TransactionListQuery } from "@spendual/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Select } from "../../components/ui/select";
import { useToast } from "../../components/ui/toast";
import { formatMoney } from "../../lib/currency";
import { formatDayHeader, formatDayMonth } from "../../lib/date";
import { cancelTransaction, listTransactions, voidTransaction } from "./api";
import { dayTotal, formatTxAmount, groupByDay, netSpent } from "./display";
import { categoryIdsOf, readDrilldown } from "./drilldown";
import { useEntry } from "./entry";
import { byUsage, useLookups } from "./lookups";
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

  // Links from Início set the filters once; the UI does not write them back to the URL.
  const [params] = useSearchParams();
  const [initial] = useState(() => readDrilldown(params));
  const [scope, setScope] = useState<ScopeFilter>(initial.scope);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [personId, setPersonId] = useState("");
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [categories, setCategories] = useState<string | null>(initial.categories);

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
    if (categories) query.categories = categories;
    else if (categoryId) query.categoryId = Number(categoryId);
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
  }, [month, scope, status, personId, categoryId, categories]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load, entry.version]);

  const groups = items ? groupByDay(items) : [];
  const filterList = categories ?? (categoryId ? categoryId : null);
  const categoryNames = filterList
    ? categoryIdsOf(filterList).map(
        (id) =>
          (id === null ? null : lookups?.categories.find((c) => c.id === id)?.name) ??
          t("list.noCategory"),
      )
    : [];

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
            value={categories !== null && /^\d+$/.test(categories) ? categories : categoryId}
            onChange={(e) => {
              // Expense categories use the drill-down filter (same rows and total as Início).
              const id = e.target.value;
              const isExpense = lookups?.categories.some(
                (c) => c.id === Number(id) && c.kind === "expense",
              );
              setCategories(isExpense ? id : null);
              setCategoryId(isExpense ? "" : id);
            }}
          >
            <option value="">{t("list.allCategories")}</option>
            {(["expense", "income"] as const).map((kind) => {
              const group = lookups?.categories.filter((c) => c.kind === kind).sort(byUsage) ?? [];
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

      {filterList ? (
        <div className="flex items-center gap-2 self-start rounded-chip bg-surface-2 py-1 pl-3 pr-1 text-[0.85rem]">
          <span>
            {t("list.categoriesFilter", {
              names:
                categoryNames.length > 3
                  ? t("list.categoriesMany", { count: categoryNames.length })
                  : categoryNames.join(", "),
            })}
          </span>
          <button
            type="button"
            aria-label={t("list.removeFilter")}
            onClick={() => {
              setCategories(null);
              setCategoryId("");
            }}
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-chip"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : null}

      {categories !== null && items !== null && items.length > 0 ? (
        <p className="flex items-baseline justify-between rounded-card bg-surface px-4 py-3">
          <span className="text-[12px] font-semibold text-muted">{t("list.categoryTotal")}</span>
          <span data-testid="category-total" className="font-bold tabular-nums">
            {formatMoney(netSpent(items))}
          </span>
        </p>
      ) : null}

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
