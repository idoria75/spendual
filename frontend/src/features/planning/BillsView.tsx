import type { Bill, RecurrenceRule } from "@spendual/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Segmented } from "../../components/ui/segmented";
import { Sheet } from "../../components/ui/sheet";
import { useToast } from "../../components/ui/toast";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { addDays, currentMonth, formatDate, formatDayMonth, today } from "../../lib/date";
import { CategoryTile } from "../transactions/CategoryTile";
import { toneColor } from "../transactions/display";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { cancelBill, fetchBills, fetchRules } from "./api";
import { CreateSheet, type CreateKind } from "./CreateSheet";
import { MoneyOrUnknown } from "./display";
import { useLoad } from "./use-load";

type Tab = "upcoming" | "recurring" | "installments";

function BillRow({ bill, onOpen, late }: { bill: Bill; onOpen: () => void; late: boolean }) {
  const { t } = useTranslation();
  const { data } = useLookups();
  const person = data?.users.find(
    (u) => u.id === (bill.scope === "personal" ? bill.ownerId : bill.payerId),
  );
  const done = bill.status !== "planned";
  const seq =
    bill.sequenceNumber !== null && bill.installmentCount !== null
      ? ` · ${bill.sequenceNumber}/${bill.installmentCount}`
      : "";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        style={{ borderLeftColor: toneColor(person?.tonePalette) }}
        className={cn(
          "grid min-h-[56px] w-full grid-cols-[28px_1fr_auto] items-center gap-3 rounded-input border-l-[3px] border-y border-r border-y-line border-r-line bg-transparent px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          // Planned is dashed (not yet real). Paid or cancelled is solid.
          !done && "border-dashed",
        )}
      >
        <CategoryTile id={bill.categoryId} />
        <span className="min-w-0">
          <span className={cn("block truncate text-[15px] font-semibold", done && "text-muted")}>
            {bill.description}
            {seq}
          </span>
          <span className={cn("block truncate text-[12px] text-muted", late && "text-warn")}>
            {t("bills.due", { date: formatDayMonth(bill.dueDate) })}
            {late ? ` · ${t("bills.late")}` : ""}
            {done ? ` · ${t(`bills.status.${bill.status}`)}` : ""}
          </span>
        </span>
        <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
          <MoneyOrUnknown value={bill.expectedAmount} />
        </span>
      </button>
    </li>
  );
}

function Group({
  title,
  bills,
  late = false,
  onOpen,
}: {
  title: string;
  bills: Bill[];
  late?: boolean;
  onOpen: (b: Bill) => void;
}) {
  if (bills.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{title}</h2>
      <ul className="flex flex-col gap-2">
        {bills.map((b) => (
          <BillRow key={`${b.kind}-${b.id}`} bill={b} late={late} onOpen={() => onOpen(b)} />
        ))}
      </ul>
    </section>
  );
}

function Upcoming({
  bills,
  overdue,
  grouped,
  emptyKey,
  onOpen,
}: {
  bills: Bill[];
  /** Planned bills of earlier months (from the API). Shown in every month view. */
  overdue: Bill[];
  /** Group by today only in the current month. Other months: plain list by due date. */
  grouped: boolean;
  emptyKey: "bills.empty" | "bills.emptyInstallments";
  onOpen: (b: Bill) => void;
}) {
  const { t } = useTranslation();
  const now = today();
  const weekEnd = addDays(now, 6);
  const planned = bills.filter((b) => b.status === "planned");
  const sorted = (list: Bill[]) => [...list].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const done = sorted(bills.filter((b) => b.status !== "planned"));
  if (bills.length === 0 && overdue.length === 0)
    return <p className="text-muted">{t(emptyKey)}</p>;
  return (
    <div className="flex flex-col gap-4">
      {grouped ? null : (
        <Group title={t("bills.groups.late")} bills={overdue} late onOpen={onOpen} />
      )}
      {grouped ? (
        <>
          <Group
            title={t("bills.groups.late")}
            bills={[...overdue, ...sorted(planned.filter((b) => b.dueDate < now))]}
            late
            onOpen={onOpen}
          />
          <Group
            title={t("bills.groups.week")}
            bills={sorted(planned.filter((b) => b.dueDate >= now && b.dueDate <= weekEnd))}
            onOpen={onOpen}
          />
          <Group
            title={t("bills.groups.later")}
            bills={sorted(planned.filter((b) => b.dueDate > weekEnd))}
            onOpen={onOpen}
          />
        </>
      ) : (
        <Group title={t("bills.groups.planned")} bills={sorted(planned)} onOpen={onOpen} />
      )}
      <Group title={t("bills.groups.done")} bills={done} onOpen={onOpen} />
    </div>
  );
}

function Rules({ rules }: { rules: RecurrenceRule[] }) {
  const { t } = useTranslation();
  if (rules.length === 0) return <p className="text-muted">{t("bills.noRules")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rules.map((r) => {
        const meta = [
          t("bills.everyDay", { day: r.dayOfMonth }),
          t(`bills.ruleState.${r.state}`),
        ].join(" · ");
        return (
          <li
            key={r.id}
            className="grid min-h-[56px] grid-cols-[1fr_auto] items-center gap-3 rounded-input bg-surface px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{r.description}</span>
              <span className="block truncate text-[12px] text-muted">{meta}</span>
            </span>
            <span className="whitespace-nowrap font-semibold tabular-nums">
              <MoneyOrUnknown value={r.expectedAmount} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BillDetail({
  bill,
  onClose,
  onConfirm,
  onCancel,
}: {
  bill: Bill | null;
  onClose: () => void;
  onConfirm: (b: Bill) => void;
  onCancel: (b: Bill) => void;
}) {
  const { t } = useTranslation();
  const { data } = useLookups();
  const rows: [string, string | null | undefined][] = bill
    ? [
        [t("bills.dueLabel"), formatDate(bill.dueDate)],
        [t("form.scopeLabel"), t(`form.scope.${bill.scope}`)],
        [t("form.category"), data?.categories.find((c) => c.id === bill.categoryId)?.name],
        [t("form.payer"), data?.users.find((u) => u.id === bill.payerId)?.displayName],
        [t("form.owner"), data?.users.find((u) => u.id === bill.ownerId)?.displayName],
        [t("form.method"), data?.paymentMethods.find((m) => m.id === bill.paymentMethodId)?.name],
        [t("form.account"), data?.accounts.find((a) => a.id === bill.accountId)?.name],
      ]
    : [];
  return (
    <Sheet
      open={bill !== null}
      onOpenChange={(open) => !open && onClose()}
      title={bill?.description ?? ""}
    >
      {bill ? (
        <div className="flex flex-col gap-3">
          <p className="text-[27px] font-bold tabular-nums">
            <MoneyOrUnknown value={bill.expectedAmount} />
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.88rem]">
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {bill.status === "planned" ? (
            <div className="grid grid-cols-[1fr_1.7fr] gap-3">
              <Button variant="ghost" onClick={() => onCancel(bill)}>
                {t("bills.cancel")}
              </Button>
              <Button onClick={() => onConfirm(bill)}>{t("bills.confirm")}</Button>
            </div>
          ) : (
            <p className="text-muted">{t(`bills.status.${bill.status}`)}</p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

/** A pagar: planned bills. Never confirmed by date; the person confirms. */
export function BillsView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { version, openConfirm, notifySaved } = useEntry();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [selected, setSelected] = useState<Bill | null>(null);
  const [cancelling, setCancelling] = useState<Bill | null>(null);
  const [creating, setCreating] = useState<CreateKind | null>(null);
  const bills = useLoad(() => fetchBills(month), [month, version]);
  const rules = useLoad(() => fetchRules(), [version]);

  const failed = tab === "recurring" ? rules.failed : bills.failed;
  const retry = tab === "recurring" ? rules.reload : bills.reload;
  const list = bills.data;
  const shown =
    list === null
      ? []
      : tab === "installments"
        ? list.items.filter((b) => b.kind === "installment")
        : list.items;
  const overdue =
    list === null
      ? []
      : tab === "installments"
        ? list.overdue.filter((b) => b.kind === "installment")
        : list.overdue;
  const planned = shown.filter((b) => b.status === "planned");
  const knownTotal = fromCents(
    planned.reduce(
      (sum, b) => (b.expectedAmount === null ? sum : sum + toCents(b.expectedAmount)),
      0n,
    ),
  );
  const unknownCount = planned.filter((b) => b.expectedAmount === null).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[17px] font-bold">{t("nav.aPagar")}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setCreating("rule")}>
            <Plus size={14} aria-hidden className="mr-1 inline" />
            {t("bills.create.rule.button")}
          </Button>
          <Button variant="ghost" onClick={() => setCreating("plan")}>
            <Plus size={14} aria-hidden className="mr-1 inline" />
            {t("bills.create.plan.button")}
          </Button>
        </div>
      </div>
      <Segmented
        label={t("bills.tabsLabel")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: t("bills.tabs.upcoming") },
          { value: "recurring", label: t("bills.tabs.recurring") },
          { value: "installments", label: t("bills.tabs.installments") },
        ]}
      />
      {tab !== "recurring" && list ? (
        <p className="text-[0.85rem] text-muted tabular-nums">
          {t("bills.plannedTotal", { amount: formatMoney(knownTotal) })}
          {unknownCount > 0 ? ` · ${t("bills.unknownCount", { count: unknownCount })}` : ""}
        </p>
      ) : null}
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("bills.failed")}</p>
          <Button variant="ghost" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      ) : tab === "recurring" ? (
        rules.data === null ? (
          <p role="status" className="py-6 text-muted">
            {t("common.loading")}
          </p>
        ) : (
          <Rules rules={rules.data.items} />
        )
      ) : list === null ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : tab === "upcoming" ? (
        <Upcoming
          bills={shown}
          overdue={overdue}
          grouped={month === currentMonth()}
          emptyKey="bills.empty"
          onOpen={setSelected}
        />
      ) : (
        <Upcoming
          bills={shown}
          overdue={overdue}
          grouped={month === currentMonth()}
          emptyKey="bills.emptyInstallments"
          onOpen={setSelected}
        />
      )}

      <BillDetail
        bill={selected}
        onClose={() => setSelected(null)}
        onConfirm={(b) => {
          setSelected(null);
          openConfirm(b);
        }}
        onCancel={(b) => {
          setSelected(null);
          setCancelling(b);
        }}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={t("bills.cancelTitle")}
        record={
          cancelling
            ? `${cancelling.description} · ${cancelling.expectedAmount === null ? t("bills.unknown") : formatMoney(cancelling.expectedAmount)} · ${formatDayMonth(cancelling.dueDate)}`
            : ""
        }
        body={t("bills.cancelBody")}
        confirmLabel={t("bills.cancelAction")}
        reasonRequired
        onConfirm={async (reason) => {
          if (!cancelling) return;
          await cancelBill(cancelling.kind, cancelling.id, reason);
          setCancelling(null);
          showToast(t("bills.cancelled"));
          notifySaved();
        }}
      />
      <CreateSheet
        kind={creating}
        onClose={() => setCreating(null)}
        onSaved={() => {
          setCreating(null);
          showToast(t("bills.created"));
          notifySaved();
        }}
      />
    </section>
  );
}
