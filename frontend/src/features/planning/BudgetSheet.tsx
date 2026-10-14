import { budgetEditSchema, type BudgetEditMode, type BudgetLine } from "@spendual/shared";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Segmented } from "../../components/ui/segmented";
import { Sheet } from "../../components/ui/sheet";
import { parseAmountInput } from "../../lib/currency";
import { formatMonth } from "../../lib/date";
import { putBudget } from "./api";

export interface BudgetTarget {
  line: BudgetLine;
  name: string;
}

interface Props {
  target: BudgetTarget | null;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit one budget: from this month on, or only this month. Past months never change. */
export function BudgetSheet({ target, month, onClose, onSaved }: Props) {
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target?.name ?? ""}
    >
      {target ? <BudgetForm target={target} month={month} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function BudgetForm({
  target,
  month,
  onSaved,
}: {
  target: BudgetTarget;
  month: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(target.line.amount?.replace(".", ",") ?? "");
  const [mode, setMode] = useState<BudgetEditMode>("going_forward");
  const [amountError, setAmountError] = useState(false);
  const [formError, setFormError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const label = formatMonth(month);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setFormError(null);
    const parsed = budgetEditSchema.safeParse({
      categoryId: target.line.categoryId,
      period: month,
      amount: parseAmountInput(amount) ?? "",
      mode,
    });
    if (!parsed.success) {
      setAmountError(true);
      return;
    }
    setAmountError(false);
    locked.current = true;
    setBusy(true);
    try {
      await putBudget(parsed.data);
      onSaved();
    } catch (error) {
      setFormError(messageKeyFor(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
      <Field
        label={t("budgets.amount")}
        inputMode="decimal"
        autoComplete="off"
        placeholder={t("form.amountPlaceholder")}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={amountError ? t("budgets.errors.amount") : undefined}
      />
      <Segmented
        label={t("budgets.modeLabel")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "this_period_only", label: t("budgets.modeOnly", { month: label }) },
          { value: "going_forward", label: t("budgets.modeForward", { month: label }) },
        ]}
      />
      <p className="text-[0.8rem] text-muted">{t("budgets.pastNote")}</p>
      {formError ? (
        <p role="alert" className="text-[0.85rem] text-err">
          {t(formError)}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("form.saving") : t("form.save")}
      </Button>
    </form>
  );
}
