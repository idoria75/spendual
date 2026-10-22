import type { Scope, Transaction, TransactionListQuery } from "@spendual/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { formatMoney } from "../../lib/currency";
import { listTransactions } from "./api";
import { netSpent } from "./display";
import { CategoryPicker } from "./CategoryPicker";
import { categoryIdsOf, readDrilldown } from "./drilldown";
import { useEntry } from "./entry";
import { byUsage, useLookups, useSingleUser } from "./lookups";
import { UserPicker } from "./UserPicker";
import { useMonth } from "./month";
import { TransactionList } from "./TransactionList";

type StatusFilter = "all" | "confirmed" | "voided";
type ScopeFilter = "all" | Scope;

export function LancamentosView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { data: lookups } = useLookups();
  const singleUser = useSingleUser();
  const entry = useEntry();

  // Links from Início set the filters once; the UI does not write them back to the URL.
  const [params] = useSearchParams();
  const [initial] = useState(() => readDrilldown(params));
  const [scope, setScope] = useState<ScopeFilter>(initial.scope);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [personId, setPersonId] = useState("");
  // Highlighted category tiles; null is "no category". Empty means no category filter.
  const [picked, setPicked] = useState<(number | null)[]>(() =>
    initial.categories
      ? categoryIdsOf(initial.categories)
      : initial.categoryId
        ? [Number(initial.categoryId)]
        : [],
  );
  // Only a lone income category uses the plain filter; expense ones use the drill-down rules.
  const incomeId =
    picked.length === 1 && picked[0] !== null && lookups
      ? (lookups.categories.find((c) => c.id === picked[0] && c.kind === "income")?.id ?? null)
      : null;
  const categories =
    picked.length > 0 && incomeId === null ? picked.map((id) => id ?? "none").join(",") : null;

  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const query: TransactionListQuery = { month };
    if (scope !== "all") query.scope = scope;
    if (status !== "all") query.status = status;
    if (personId) query.personId = Number(personId);
    if (categories) query.categories = categories;
    else if (incomeId !== null) query.categoryId = incomeId;
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
  }, [month, scope, status, personId, incomeId, categories]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load, entry.version]);

  const pickable = useMemo(
    () =>
      (lookups?.categories ?? [])
        .filter((c) => c.active || picked.includes(c.id))
        .sort(
          (a, b) => Number(b.kind === "expense") - Number(a.kind === "expense") || byUsage(a, b),
        ),
    [lookups, picked],
  );
  const pick = (id: number | null) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [id]));

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
        <div className="flex flex-col gap-2">
          {singleUser ? null : (
            <UserPicker
              users={lookups?.users ?? []}
              selected={personId === "" ? null : Number(personId)}
              onSelect={(id) => setPersonId((cur) => (cur === String(id) ? "" : String(id)))}
              legend={t("list.person")}
            />
          )}
          <CategoryPicker
            categories={pickable}
            selected={picked}
            onSelect={pick}
            showNone={picked.includes(null)}
          />
        </div>
      </div>

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

      {items !== null ? <TransactionList items={items} /> : null}
    </section>
  );
}
