import { allowanceCreateSchema } from "@spendual/shared";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { AmountField } from "../../components/ui/amount-input";
import { Field } from "../../components/ui/field";
import { Sheet } from "../../components/ui/sheet";
import { parseAmountInput } from "../../lib/currency";
import { formatMonth } from "../../lib/date";
import { createAllowance } from "./api";

interface Props {
  /** Person who gets the allowance, or null when the sheet is closed. */
  person: { id: number; name: string } | null;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Set the monthly allowance (mesada) of one person. One per person and month. */
export function AllowanceSheet({ person, month, onClose, onSaved }: Props) {
  return (
    <Sheet
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      title={person ? `${person.name} · ${formatMonth(month)}` : ""}
    >
      {person ? <AllowanceForm person={person} month={month} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function AllowanceForm({
  person,
  month,
  onSaved,
}: {
  person: { id: number; name: string };
  month: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState(false);
  const [formError, setFormError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setFormError(null);
    const parsed = allowanceCreateSchema.safeParse({
      ownerId: person.id,
      month,
      amount: parseAmountInput(amount) ?? "",
      ...(notes.trim() !== "" ? { notes } : {}),
    });
    if (!parsed.success) {
      setAmountError(true);
      return;
    }
    setAmountError(false);
    locked.current = true;
    setBusy(true);
    try {
      await createAllowance(parsed.data);
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
      <AmountField
        label={t("allowance.amount")}
        placeholder={t("form.amountPlaceholder")}
        value={amount}
        onValueChange={setAmount}
        error={amountError ? t("form.errors.amount") : undefined}
      />
      <Field
        label={t("form.notes")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={500}
        autoComplete="off"
      />
      {formError ? (
        <p role="alert" className="text-[0.85rem] text-err">
          {t(formError)}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("form.saving") : t("allowance.save")}
      </Button>
    </form>
  );
}
