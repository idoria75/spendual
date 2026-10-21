import {
  installmentPlanPatchSchema,
  recurrenceRulePatchSchema,
  type InstallmentPlanSummary,
  type RecurrenceRule,
  type RecurrenceRulePatch,
} from "@spendual/shared";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { AmountField } from "../../components/ui/amount-input";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Field, Label } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Sheet } from "../../components/ui/sheet";
import { formatAmountInput, formatMoney, parseAmountInput, toCents } from "../../lib/currency";
import { cancelPlan, patchPlan, patchRule } from "./api";

type ErrorKey = ReturnType<typeof messageKeyFor>;

/** One save at a time. Keeps what was typed when it fails. */
function useSave() {
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

function FormError({ error }: { error: ErrorKey | null }) {
  const { t } = useTranslation();
  return error ? (
    <p role="alert" className="text-[0.85rem] text-err">
      {t(error)}
    </p>
  ) : null;
}

interface RuleProps {
  rule: RecurrenceRule | null;
  onClose: () => void;
  /** `message` is the toast text. */
  onSaved: (message: string) => void;
}

/** Edit a recurring bill: name, amount, end date; pause, resume or end it. */
export function RuleSheet({ rule, onClose, onSaved }: RuleProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={rule !== null}
      onOpenChange={(open) => !open && onClose()}
      title={rule ? t("bills.edit.ruleTitle", { name: rule.description }) : ""}
    >
      {rule ? <RuleForm rule={rule} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function RuleForm({ rule, onSaved }: { rule: RecurrenceRule; onSaved: (m: string) => void }) {
  const { t } = useTranslation();
  const ended = rule.state === "ended";
  const [description, setDescription] = useState(rule.description);
  const [amount, setAmount] = useState(
    rule.expectedAmount === null ? "" : formatAmountInput(rule.expectedAmount),
  );
  const [unknown, setUnknown] = useState(rule.expectedAmount === null);
  const [endDate, setEndDate] = useState(rule.endDate ?? "");
  const [errors, setErrors] = useState<{ description?: boolean; amount?: boolean }>({});
  const [ending, setEnding] = useState(false);
  const { busy, error, run } = useSave();

  const send = (patch: RecurrenceRulePatch, message: string) =>
    run(async () => {
      await patchRule(rule.id, patch);
      onSaved(message);
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const newAmount = unknown ? null : parseAmountInput(amount);
    const bad = {
      description: description.trim() === "",
      amount: !unknown && (newAmount === null || toCents(newAmount) <= 0n),
    };
    setErrors(bad);
    if (bad.description || bad.amount) return;
    const patch: RecurrenceRulePatch = {};
    if (description.trim() !== rule.description) patch.description = description.trim();
    if (newAmount !== rule.expectedAmount) patch.expectedAmount = newAmount;
    const newEnd = endDate === "" ? null : endDate;
    if (newEnd !== rule.endDate) patch.endDate = newEnd;
    const parsed = recurrenceRulePatchSchema.safeParse(patch);
    if (!parsed.success) {
      // Nothing changed.
      onSaved("");
      return;
    }
    void send(parsed.data, t("bills.edit.saved"));
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {ended ? <p className="text-[0.88rem] text-muted">{t("bills.edit.endedNote")}</p> : null}
      <Field
        label={t("form.description")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description ? t("form.errors.description") : undefined}
        maxLength={200}
        autoComplete="off"
        disabled={ended}
      />
      <AmountField
        label={t("bills.create.rule.amount")}
        placeholder={t("form.amountPlaceholder")}
        value={amount}
        onValueChange={setAmount}
        disabled={ended || unknown}
        error={errors.amount ? t("form.errors.amount") : undefined}
      />
      <label className="flex min-h-[44px] items-center gap-2 text-[0.88rem]">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => setUnknown(e.target.checked)}
          disabled={ended}
          className="h-5 w-5"
        />
        {t("bills.create.rule.unknown")}
      </label>
      <div className="flex flex-col gap-[3px]">
        <Label htmlFor="rule-end">{t("bills.create.rule.end")}</Label>
        <Input
          id="rule-end"
          type="date"
          value={endDate}
          min={rule.startDate}
          disabled={ended}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      <p className="text-[0.78rem] text-muted">{t("bills.edit.ruleHint")}</p>
      <FormError error={error} />
      {ended ? null : (
        <>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t("form.saving") : t("bills.edit.save")}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void send(
                  { state: rule.state === "paused" ? "active" : "paused" },
                  t(rule.state === "paused" ? "bills.edit.resumed" : "bills.edit.paused"),
                )
              }
            >
              {t(rule.state === "paused" ? "bills.edit.resume" : "bills.edit.pause")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEnding(true)}>
              {t("bills.edit.end")}
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title={t("bills.edit.endTitle")}
        record={`${rule.description} · ${rule.expectedAmount === null ? t("bills.unknown") : formatMoney(rule.expectedAmount)}`}
        body={t("bills.edit.endBody")}
        confirmLabel={t("bills.edit.end")}
        onConfirm={async () => {
          await patchRule(rule.id, { state: "ended" });
          setEnding(false);
          onSaved(t("bills.edit.ended"));
        }}
      />
    </form>
  );
}

interface PlanProps {
  plan: InstallmentPlanSummary | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Edit a purchase in installments: name and the amount of the installments still to pay. */
export function PlanSheet({ plan, onClose, onSaved }: PlanProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={plan !== null}
      onOpenChange={(open) => !open && onClose()}
      title={plan ? t("bills.edit.planTitle", { name: plan.description }) : ""}
    >
      {plan ? <PlanForm plan={plan} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function PlanForm({
  plan,
  onSaved,
}: {
  plan: InstallmentPlanSummary;
  onSaved: (m: string) => void;
}) {
  const { t } = useTranslation();
  const open = plan.plannedCount > 0;
  const [description, setDescription] = useState(plan.description);
  const [amount, setAmount] = useState(plan.nextAmount ? formatAmountInput(plan.nextAmount) : "");
  const [errors, setErrors] = useState<{ description?: boolean; amount?: boolean }>({});
  const [cancelling, setCancelling] = useState(false);
  const { busy, error, run } = useSave();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const newAmount = parseAmountInput(amount);
    const bad = {
      description: description.trim() === "",
      amount: open && (newAmount === null || toCents(newAmount) <= 0n),
    };
    setErrors(bad);
    if (bad.description || bad.amount) return;
    const patch: { description?: string; installmentAmount?: string } = {};
    if (description.trim() !== plan.description) patch.description = description.trim();
    if (open && newAmount !== null && newAmount !== plan.nextAmount) {
      patch.installmentAmount = newAmount;
    }
    const parsed = installmentPlanPatchSchema.safeParse(patch);
    if (!parsed.success) {
      onSaved("");
      return;
    }
    void run(async () => {
      await patchPlan(plan.id, parsed.data);
      onSaved(t("bills.edit.saved"));
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <p className="text-[0.88rem] text-muted tabular-nums">
        {t("bills.edit.planSummary", {
          paid: plan.paidCount,
          count: plan.installmentCount,
          amount: formatMoney(plan.remainingAmount),
        })}
      </p>
      <Field
        label={t("form.description")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description ? t("form.errors.description") : undefined}
        maxLength={200}
        autoComplete="off"
      />
      <AmountField
        label={t("bills.edit.installmentAmount")}
        placeholder={t("form.amountPlaceholder")}
        value={amount}
        onValueChange={setAmount}
        disabled={!open}
        error={errors.amount ? t("form.errors.amount") : undefined}
      />
      <p className="text-[0.78rem] text-muted">{t("bills.edit.planHint")}</p>
      <FormError error={error} />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("form.saving") : t("bills.edit.save")}
      </Button>
      {open ? (
        <Button variant="ghost" disabled={busy} onClick={() => setCancelling(true)}>
          {t("bills.edit.cancelRest")}
        </Button>
      ) : null}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t("bills.edit.cancelRestTitle")}
        record={`${plan.description} · ${t("bills.edit.cancelRestRecord", { count: plan.plannedCount, amount: formatMoney(plan.remainingAmount) })}`}
        body={t("bills.edit.cancelRestBody")}
        confirmLabel={t("bills.edit.cancelRest")}
        reasonRequired
        onConfirm={async (reason) => {
          await cancelPlan(plan.id, reason);
          setCancelling(false);
          onSaved(t("bills.edit.restCancelled"));
        }}
      />
    </form>
  );
}
