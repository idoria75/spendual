import type { Goal } from "@spendual/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useToast } from "../../components/ui/toast";
import { formatMoney, toCents } from "../../lib/currency";
import { currentMonth, formatDate, today } from "../../lib/date";
import { fetchDashboard } from "../planning/api";
import { Bar, percentOf } from "../planning/display";
import { useLoad } from "../planning/use-load";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { completeGoal, fetchGoalEntries, fetchGoals, goalAction, withdrawGoal } from "./api";
import { GoalFormSheet, MoveSheet } from "./GoalSheets";

type Closing = { goal: Goal; name: "complete" | "archive" };

function History({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const [open, setOpen] = useState(false);
  const { version } = useEntry();
  const entries = useLoad(
    () => (open ? fetchGoalEntries(goal.id) : Promise.resolve(null)),
    [open, goal.id, goal.balance, version],
  );
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} className="border-t border-line pt-1">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-[0.85rem] font-semibold text-accent">
        {t("goals.history")}
      </summary>
      {entries.data === null ? (
        open ? (
          <p role="status" className="py-2 text-[0.85rem] text-muted">
            {t("common.loading")}
          </p>
        ) : null
      ) : entries.data.items.length === 0 ? (
        <p className="py-2 text-[0.85rem] text-muted">{t("goals.noHistory")}</p>
      ) : (
        <ul className="flex flex-col gap-2 pb-1">
          {entries.data.items.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 text-[0.85rem]">
              <span className="min-w-0">
                <span className="block font-semibold">{t(`goals.kind.${e.kind}`)}</span>
                <span className="block text-muted">
                  {[
                    formatDate(e.effectiveDate),
                    lookups?.users.find((u) => u.id === e.actorId)?.displayName ?? e.actorId,
                    e.notes,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums">
                {e.kind === "WITHDRAWAL" ? "−" : e.kind === "ALLOCATION" ? "+" : ""}
                {formatMoney(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function GoalCard({
  goal,
  onAllocate,
  onWithdraw,
  onEdit,
  onClose,
  onReopen,
  canAct,
}: {
  goal: Goal;
  /** false: the goal belongs to someone else, so it is only shown. */
  canAct: boolean;
  onAllocate: () => void;
  onWithdraw: () => void;
  onEdit: () => void;
  onClose: (name: Closing["name"]) => void;
  onReopen: () => void;
}) {
  const { t } = useTranslation();
  const balance = toCents(goal.balance);
  const target = goal.targetAmount === null ? null : toCents(goal.targetAmount);
  const active = goal.status === "active";
  const archived = goal.status === "archived";
  const completed = goal.status === "completed";
  // A completed goal shows what it reached, struck through: green when it met the target,
  // faded yellow when it fell short. The balance is 0 once the money went back.
  const reached = toCents(goal.finalAmount ?? "0.00");
  const met = target === null || reached >= target;
  return (
    <li className="flex flex-col gap-2 rounded-card bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate font-semibold">{goal.name}</h3>
        {goal.status !== "active" ? (
          <span className="text-[0.75rem] font-semibold text-muted">
            {t(`goals.status.${goal.status}`)}
          </span>
        ) : null}
      </div>
      {goal.description ? <p className="text-[0.85rem] text-muted">{goal.description}</p> : null}
      {completed ? (
        <p
          className="text-[1.7rem] font-bold tabular-nums line-through"
          style={{
            color: met ? "var(--pos)" : "color-mix(in srgb, var(--warn) 60%, transparent)",
          }}
        >
          <span className="sr-only">{t("goals.reached")} </span>
          {formatMoney(goal.finalAmount ?? "0.00")}
        </p>
      ) : (
        <p className="text-[1.7rem] font-bold tabular-nums">{formatMoney(goal.balance)}</p>
      )}
      {completed ? null : target !== null ? (
        <>
          <Bar label={goal.name} percent={percentOf(balance, target)} over={false} />
          <p className="text-[0.8rem] text-muted tabular-nums">
            {t("goals.ofTarget", {
              amount: formatMoney(goal.targetAmount ?? "0.00"),
              percent: Math.round(percentOf(balance, target)),
            })}
            {goal.targetDate ? ` · ${t("goals.until", { date: formatDate(goal.targetDate) })}` : ""}
          </p>
        </>
      ) : goal.targetDate ? (
        <p className="text-[0.8rem] text-muted">
          {t("goals.until", { date: formatDate(goal.targetDate) })}
        </p>
      ) : null}
      {active && canAct ? (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onAllocate}>
            {t("goals.allocate")}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onWithdraw} disabled={balance <= 0n}>
            {t("goals.withdraw")}
          </Button>
        </div>
      ) : null}
      {!archived && canAct ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onEdit}>
            {t("goals.edit")}
          </Button>
          {active ? (
            <Button variant="ghost" onClick={() => onClose("complete")}>
              {t("goals.complete")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onReopen}>
              {t("goals.reopen")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onClose("archive")}>
            {t("goals.archive")}
          </Button>
        </div>
      ) : null}
      <History goal={goal} />
    </li>
  );
}

interface PanelProps {
  /** null = the household's shared goals; a user id = that person's personal goals. */
  ownerId: number | null;
  /** Money a deposit can use (household unallocated savings, or the person's own balance). */
  free: string | null;
  /** false: the goals are only shown (someone else's personal goals). */
  canAct: boolean;
  heading: ReactNode;
  /** Shown between the heading and the goals. */
  intro?: ReactNode;
  /** Called after any change, so the page can reload what depends on it. */
  onChanged: () => void;
}

/** Goal cards with their sheets. Used by Metas (shared) and Pessoal (personal). */
export function GoalsPanel({ ownerId, free, canAct, heading, intro, onChanged }: PanelProps) {
  const { t } = useTranslation();
  const personal = ownerId !== null;
  const { notifySaved } = useEntry();
  const { showToast } = useToast();
  const goals = useLoad(fetchGoals, []);
  const [moving, setMoving] = useState<{ goal: Goal; kind: "allocate" | "withdraw" } | null>(null);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof messageKeyFor> | null>(null);

  const saved = (message: string) => {
    showToast(message);
    // Reload in place: a new key would blank the list. notifySaved refreshes the open histories.
    goals.reload();
    onChanged();
    notifySaved();
  };
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setActionError(null);
    try {
      await fn();
      saved(message);
    } catch (e) {
      setActionError(messageKeyFor(e));
    }
  };
  const close = (goal: Goal, name: Closing["name"]) => {
    // Complete with nothing left needs no question. Archive is final, so it always asks.
    if (name === "complete" && toCents(goal.balance) === 0n) {
      void run(() => completeGoal(goal.id, false), t("goals.completed"));
    } else setClosing({ goal, name });
  };

  const items = (goals.data?.items ?? []).filter((g) => g.ownerId === ownerId);
  const live = items.filter((g) => g.status !== "archived");
  const archived = items.filter((g) => g.status === "archived");
  const hasBalance = closing !== null && toCents(closing.goal.balance) > 0n;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {heading}
        {canAct ? (
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden className="mr-1 inline" />
            {t(personal ? "goals.newPersonal" : "goals.new")}
          </Button>
        ) : null}
      </div>
      {intro}

      {actionError ? (
        <p role="alert" className="text-[0.85rem] text-err">
          {t(actionError)}
        </p>
      ) : null}

      {goals.failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("goals.failed")}</p>
          <Button variant="ghost" onClick={goals.reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : goals.data === null ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : live.length === 0 ? (
        <p className="text-muted">{t(personal ? "goals.emptyPersonal" : "goals.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {live.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              canAct={canAct}
              onAllocate={() => setMoving({ goal: g, kind: "allocate" })}
              onWithdraw={() => setMoving({ goal: g, kind: "withdraw" })}
              onEdit={() => setEditing(g)}
              onClose={(name) => close(g, name)}
              onReopen={() => void run(() => goalAction(g.id, "reopen"), t("goals.reopened"))}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-[0.85rem] font-semibold text-accent">
            {t("goals.archivedList", { count: archived.length })}
          </summary>
          <ul className="flex flex-col gap-3">
            {archived.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                canAct={false}
                onAllocate={() => undefined}
                onWithdraw={() => undefined}
                onEdit={() => undefined}
                onClose={() => undefined}
                onReopen={() => undefined}
              />
            ))}
          </ul>
        </details>
      ) : null}

      <MoveSheet
        goal={moving?.goal ?? null}
        kind={moving?.kind ?? "allocate"}
        free={free}
        personal={personal}
        onClose={() => setMoving(null)}
        onSaved={() => {
          setMoving(null);
          saved(t(moving?.kind === "withdraw" ? "goals.withdrawn" : "goals.allocated"));
        }}
      />
      <GoalFormSheet
        goal={editing}
        personal={personal}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          saved(t("goals.saved"));
        }}
      />
      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => !open && setClosing(null)}
        title={t(closing?.name === "archive" ? "goals.archiveTitle" : "goals.completeTitle")}
        record={
          closing
            ? `${closing.goal.name} · ${formatMoney(closing.goal.balance)} · ${formatDate(today())}`
            : ""
        }
        body={t(
          hasBalance
            ? closing?.name === "archive"
              ? "goals.archiveBodyBalance"
              : "goals.completeBodyBalance"
            : "goals.archiveBody",
        )}
        confirmLabel={t(
          hasBalance
            ? "goals.withdrawAndClose"
            : closing?.name === "archive"
              ? "goals.archive"
              : "goals.complete",
        )}
        onConfirm={async () => {
          if (!closing) return;
          const { goal, name } = closing;
          if (name === "complete") {
            // One step on the server: the money goes back and the amount reached is kept.
            await completeGoal(goal.id, true);
          } else {
            if (toCents(goal.balance) > 0n) {
              await withdrawGoal(goal.id, { amount: goal.balance, effectiveDate: today() });
            }
            await goalAction(goal.id, name);
          }
          setClosing(null);
          saved(t(name === "archive" ? "goals.archived" : "goals.completed"));
        }}
      />
    </section>
  );
}

/** Metas: unallocated savings of the month, then one card per shared goal. */
export function GoalsView() {
  const { t } = useTranslation();
  // Deposits are dated today, so the pool is the current month, whatever month the bar shows.
  const month = currentMonth();
  const dashboard = useLoad(() => fetchDashboard(month), [month]);
  return (
    <GoalsPanel
      ownerId={null}
      free={dashboard.data?.unallocatedSavings ?? null}
      canAct
      heading={<h1 className="text-[17px] font-bold">{t("nav.metas")}</h1>}
      intro={
        <section aria-labelledby="goals-free" className="rounded-card bg-surface p-4">
          <h2
            id="goals-free"
            className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted"
          >
            {t("dashboard.unallocated")}
          </h2>
          <p className="text-[1.7rem] font-bold tabular-nums">
            {dashboard.data ? formatMoney(dashboard.data.unallocatedSavings) : "…"}
          </p>
          <p className="text-[0.8rem] text-muted">{t("goals.freeHint")}</p>
        </section>
      }
      onChanged={dashboard.reload}
    />
  );
}
