import { goalCreateSchema, goalMoveSchema, type Goal } from "@spendual/shared";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { AmountField } from "../../components/ui/amount-input";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Field } from "../../components/ui/field";
import { Sheet } from "../../components/ui/sheet";
import { formatAmountInput, formatMoney, parseAmountInput, toCents } from "../../lib/currency";
import { formatDate, today } from "../../lib/date";
import { allocateGoal, createGoal, patchGoal, withdrawGoal } from "./api";

type ErrorKey = ReturnType<typeof messageKeyFor>;

function FormError({ error }: { error: ErrorKey | null }) {
  const { t } = useTranslation();
  return error ? (
    <p role="alert" className="text-[0.85rem] text-err">
      {t(error)}
    </p>
  ) : null;
}

/** Run a save once at a time. Keeps the typed data when it fails. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const locked = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageKeyFor(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}

interface MoveProps {
  goal: Goal | null;
  kind: "allocate" | "withdraw";
  /** Unallocated savings: a deposit cannot be above it. */
  free: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/** `Depositar` and `Retirar`. A withdrawal asks for a confirmation first (ui-guidelines §6.8). */
export function MoveSheet({ goal, kind, free, onClose, onSaved }: MoveProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={goal !== null}
      onOpenChange={(open) => !open && onClose()}
      title={goal ? t(`goals.${kind}Title`, { name: goal.name }) : ""}
    >
      {goal ? <MoveForm goal={goal} kind={kind} free={free} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function MoveForm({
  goal,
  kind,
  free,
  onSaved,
}: Omit<MoveProps, "goal" | "onClose"> & { goal: Goal }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState(false);
  const [pending, setPending] = useState<{ amount: string; notes?: string } | null>(null);
  const { busy, error, run } = useSubmit();

  const send = (body: { amount: string; notes?: string }) =>
    run(async () => {
      const move = { ...body, effectiveDate: today() };
      await (kind === "allocate" ? allocateGoal : withdrawGoal)(goal.id, move);
      onSaved();
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = goalMoveSchema.safeParse({
      amount: parseAmountInput(amount) ?? "",
      ...(notes.trim() !== "" ? { notes } : {}),
    });
    const limit = kind === "allocate" ? free : goal.balance;
    if (!parsed.success || (limit !== null && toCents(parsed.data.amount) > toCents(limit))) {
      setAmountError(true);
      return;
    }
    setAmountError(false);
    const body = {
      amount: parsed.data.amount,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    };
    if (kind === "withdraw") setPending(body);
    else void send(body);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <p className="text-[0.85rem] text-muted">
        {kind === "withdraw"
          ? t("goals.available", { amount: formatMoney(goal.balance) })
          : free !== null
            ? t("goals.availableFree", { amount: formatMoney(free) })
            : null}
      </p>
      <AmountField
        label={t("goals.amount")}
        placeholder={t("form.amountPlaceholder")}
        value={amount}
        onValueChange={setAmount}
        error={
          amountError
            ? t(kind === "allocate" ? "goals.errors.overFree" : "goals.errors.overBalance")
            : undefined
        }
      />
      <Field
        label={t("form.notes")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={500}
        autoComplete="off"
      />
      <FormError error={error} />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("form.saving") : t(`goals.${kind}Save`)}
      </Button>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("goals.withdrawConfirmTitle")}
        record={
          pending ? `${goal.name} · ${formatMoney(pending.amount)} · ${formatDate(today())}` : ""
        }
        body={t("goals.withdrawConfirmBody")}
        confirmLabel={t("goals.withdrawConfirmAction")}
        onConfirm={async () => {
          if (!pending) return;
          await withdrawGoal(goal.id, { ...pending, effectiveDate: today() });
          onSaved();
        }}
      />
    </form>
  );
}

interface FormProps {
  /** null = closed; "new" = create; a goal = edit. */
  goal: Goal | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Create or edit a goal. Target amount and date are optional. */
export function GoalFormSheet({ goal, onClose, onSaved }: FormProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={goal !== null}
      onOpenChange={(open) => !open && onClose()}
      title={goal === "new" ? t("goals.new") : t("goals.edit")}
    >
      {goal ? <GoalForm goal={goal === "new" ? null : goal} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function GoalForm({ goal, onSaved }: { goal: Goal | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(goal?.name ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [target, setTarget] = useState(
    goal?.targetAmount ? formatAmountInput(goal.targetAmount) : "",
  );
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [errors, setErrors] = useState<{ name?: boolean; target?: boolean }>({});
  const { busy, error, run } = useSubmit();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const targetAmount = target.trim() === "" ? null : parseAmountInput(target);
    const targetDate = date === "" ? null : date;
    const body = {
      name,
      description: description.trim() === "" ? null : description,
      targetAmount,
      targetDate,
    };
    const parsed = goalCreateSchema.safeParse(body);
    const bad = {
      name: !parsed.success && parsed.error.issues.some((i) => i.path[0] === "name"),
      target: target.trim() !== "" && targetAmount === null,
    };
    setErrors(bad);
    if (!parsed.success || bad.target) return;
    void run(async () => {
      await (goal ? patchGoal(goal.id, parsed.data) : createGoal(parsed.data));
      onSaved();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field
        label={t("goals.name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        autoComplete="off"
        error={errors.name ? t("goals.nameRequired") : undefined}
      />
      <Field
        label={t("goals.description")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        autoComplete="off"
      />
      <AmountField
        label={t("goals.target")}
        placeholder={t("goals.optional")}
        value={target}
        onValueChange={setTarget}
        error={errors.target ? t("form.errors.amount") : undefined}
      />
      <Field
        type="date"
        label={t("goals.targetDate")}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <FormError error={error} />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("form.saving") : t("goals.save")}
      </Button>
    </form>
  );
}
