import type { AuditLog, AuditLogItem } from "@spendual/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Sheet } from "../../components/ui/sheet";
import { formatDateTime } from "../../lib/date";
import { useLoad } from "../planning/use-load";
import { useLookups } from "../transactions/lookups";
import { fetchAuditLog } from "./api";
import { changedFields, entitySummary, showValue } from "./history";

/** Filter chips: the label key and the entity types behind it (null = all). */
const FILTERS = [
  { key: "all", type: null },
  { key: "transactions", type: "Transaction" },
  { key: "rules", type: "RecurrenceRule" },
  { key: "plans", type: "InstallmentPlan" },
  { key: "goals", type: "SavingsGoal" },
] as const;

function useActorName() {
  const { data } = useLookups();
  return (id: number) => data?.users.find((u) => u.id === id)?.displayName ?? String(id);
}

function Detail({ item, onClose }: { item: AuditLogItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const actor = useActorName();
  const changes = item ? changedFields(item) : [];
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={item ? entitySummary(item) : ""}
    >
      {item ? (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[0.85rem] text-muted">
            {[
              t(`history.action.${item.action}`, { defaultValue: item.action }),
              actor(item.actorId),
              formatDateTime(item.createdAt),
            ].join(" · ")}
          </p>
          {item.reason ? (
            <p className="text-[0.88rem]">
              <span className="font-semibold">{t("history.reason")}</span> {item.reason}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {changes.map((c) => (
              <li key={c.field} className="rounded-input bg-bg px-3 py-2 text-[0.85rem]">
                <span className="block font-semibold">
                  {t(`history.field.${c.field}`, { defaultValue: c.field })}
                </span>
                {item.before === null ? null : (
                  <span className="block text-muted line-through">{showValue(c.before)}</span>
                )}
                <span className="block tabular-nums">{showValue(c.after)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Change history, newest first (guide: append-only audit viewer). */
export function HistoryView() {
  const { t } = useTranslation();
  const actor = useActorName();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(FILTERS[0]);
  const [more, setMore] = useState<AuditLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<AuditLogItem | null>(null);
  const first = useLoad(() => fetchAuditLog(filter.type, null), [filter.key]);

  const pages = first.data ? [first.data, ...more] : [];
  const items = pages.flatMap((p) => p.items);
  const next = pages.length ? (pages[pages.length - 1]?.nextBefore ?? null) : null;

  const pick = (f: (typeof FILTERS)[number]) => {
    setMore([]);
    setFilter(f);
  };
  const loadMore = async () => {
    if (next === null) return;
    setBusy(true);
    try {
      const page = await fetchAuditLog(filter.type, next);
      setMore((m) => [...m, page]);
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("history.title")}</h1>
      <div role="group" aria-label={t("history.filter")} className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Chip key={f.key} active={f.key === filter.key} onClick={() => pick(f)}>
            {t(`history.filters.${f.key}`)}
          </Chip>
        ))}
      </div>
      {first.failed ? (
        <p role="alert" className="text-err">
          {t("history.failed")}
        </p>
      ) : first.data === null ? (
        <p role="status" className="text-muted">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted">{t("history.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpen(e)}
                className="flex min-h-[56px] w-full flex-col justify-center rounded-input bg-surface px-3 py-2 text-left"
              >
                <span className="font-semibold">{entitySummary(e)}</span>
                <span className="text-[0.8rem] text-muted">
                  {[
                    t(`history.action.${e.action}`, { defaultValue: e.action }),
                    actor(e.actorId),
                    formatDateTime(e.createdAt),
                  ].join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {next !== null ? (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void loadMore()}>
          {t("history.more")}
        </Button>
      ) : null}
      <Detail item={open} onClose={() => setOpen(null)} />
    </section>
  );
}
