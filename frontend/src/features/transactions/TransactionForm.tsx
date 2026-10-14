import type { Bill, Transaction, TransactionType } from "@spendual/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Field, Label } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Segmented } from "../../components/ui/segmented";
import { Select } from "../../components/ui/select";
import { useToast } from "../../components/ui/toast";
import { formatMoney } from "../../lib/currency";
import { formatDayMonth, today } from "../../lib/date";
import {
  lastMethodId,
  recentCategoryIds,
  rememberCategory,
  rememberMethod,
} from "../../lib/recent";
import { cn } from "../../lib/cn";
import { confirmBill } from "../planning/api";
import { createTransaction, listTransactions, patchTransaction } from "./api";
import { CategoryTile } from "./CategoryTile";
import {
  buildConfirm,
  buildCreate,
  buildPatch,
  valuesFromBill,
  valuesFromTransaction,
  visibleFields,
  type FieldErrors,
  type FormValues,
} from "./form-model";
import { useLookups } from "./lookups";

type ErrKey =
  | "form.errors.description"
  | "form.errors.owner"
  | "form.errors.related"
  | "form.errors.account"
  | "form.errors.notes";

function relatedLabel(x: Transaction): string {
  return `${formatDayMonth(x.transactionDate)} · ${x.description} · ${formatMoney(x.amount)}`;
}

const TYPES: TransactionType[] = ["expense", "income", "other_receipt", "transfer", "refund"];

interface Props {
  editing: Transaction | null;
  /** A planned bill to confirm: the form is pre-filled and saves through /bills/:kind/:id/confirm. */
  bill?: Bill | null;
  amountRef: React.RefObject<HTMLInputElement>;
  onSaved: () => void;
}

export function TransactionForm({ editing, bill = null, amountRef, onSaved }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: lookups, failed, reload } = useLookups();
  const { showToast } = useToast();

  const [values, setValues] = useState<FormValues>(() =>
    bill
      ? valuesFromBill(bill, user?.id ?? null, bill.dueDate)
      : editing
        ? valuesFromTransaction(editing)
        : {
            type: "expense",
            amount: "",
            description: "",
            scope: "household",
            ownerId: user?.id ?? null,
            categoryId: null,
            payerId: user?.id ?? null,
            date: today(),
            paymentMethodId: lastMethodId(),
            accountId: null,
            relatedTransactionId: null,
            notes: "",
          },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const locked = useRef(false);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const type = editing?.type ?? values.type;
  const scope = editing?.scope ?? values.scope;
  const f = visibleFields(type, scope);

  const month = values.date.slice(0, 7);
  useEffect(() => {
    if (editing || type !== "refund" || !/^\d{4}-\d{2}$/.test(month)) return;
    let active = true;
    listTransactions({ month, type: "expense", status: "confirmed" })
      .then((items) => active && setExpenses(items))
      .catch((e: unknown) => {
        console.error(e);
        if (active) setExpenses([]);
      });
    return () => {
      active = false;
    };
  }, [editing, type, month]);

  const activeCategories = useMemo(
    () => (lookups?.categories ?? []).filter((c) => c.active || c.id === values.categoryId),
    [lookups, values.categoryId],
  );
  const visibleCategories = useMemo(() => {
    if (showAllCategories) return activeCategories;
    const byId = new Map(activeCategories.map((c) => [c.id, c]));
    const picked: typeof activeCategories = [];
    for (const id of [values.categoryId, ...recentCategoryIds()]) {
      const c = id === null ? undefined : byId.get(id);
      if (c && !picked.includes(c) && picked.length < 4) picked.push(c);
    }
    for (const c of activeCategories) if (picked.length < 4 && !picked.includes(c)) picked.push(c);
    return picked;
  }, [activeCategories, showAllCategories, values.categoryId]);

  if (!lookups) {
    return (
      <p role="status" className="py-6 text-muted">
        {failed ? (
          <Button variant="ghost" onClick={() => void reload()}>
            {t("common.retry")}
          </Button>
        ) : (
          t("common.loading")
        )}
      </p>
    );
  }

  const users = lookups.users;
  const activeAccounts = lookups.accounts.filter((a) => a.active || a.id === values.accountId);
  const methods = lookups.paymentMethods.filter((m) => m.active || m.id === values.paymentMethodId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setFormError(null);
    let run: (() => Promise<unknown>) | null;
    if (bill) {
      const built = buildConfirm(values);
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      const body = built.body;
      run = () => confirmBill(bill.kind, bill.id, body);
    } else if (editing) {
      const built = buildPatch(values, editing);
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      const body = built.body;
      run = body === null ? null : () => patchTransaction(editing.id, body);
    } else {
      const built = buildCreate(values);
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      const body = built.body;
      run = () => createTransaction(body);
    }
    setErrors({});
    if (run === null) {
      onSaved();
      return;
    }
    locked.current = true;
    setSubmitting(true);
    try {
      await run();
      if (!bill && values.categoryId !== null && f.category) rememberCategory(values.categoryId);
      if (!editing && !bill) rememberMethod(values.paymentMethodId);
      showToast(t(bill ? "bills.confirmed" : editing ? "form.savedEdit" : "form.saved"));
      onSaved();
    } catch (error) {
      setFormError(messageKeyFor(error));
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  };

  const err = (name: keyof FieldErrors, key: ErrKey) => (errors[name] ? t(key) : undefined);
  const idOrNull = (s: string) => (s === "" ? null : Number(s));

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-1 flex-col gap-3">
      {editing || bill ? null : (
        <div role="group" aria-label={t("form.typeLabel")} className="flex flex-wrap gap-2">
          {TYPES.map((ty) => (
            <Chip key={ty} active={values.type === ty} onClick={() => set("type", ty)}>
              {t(`form.type.${ty}`)}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-[3px]">
        <Label htmlFor="tx-amount">{t("form.amount")}</Label>
        <Input
          id="tx-amount"
          ref={amountRef}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t("form.amountPlaceholder")}
          value={values.amount}
          onChange={(e) => set("amount", e.target.value)}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? "tx-amount-error" : undefined}
          className="min-h-[56px] text-[34px] font-bold"
        />
        {bill && bill.expectedAmount === null ? (
          <p className="text-[0.75rem] text-muted">{t("bills.unknownHint")}</p>
        ) : null}
        {errors.amount ? (
          <p id="tx-amount-error" className="text-[0.75rem] text-err">
            {t("form.errors.amount")}
          </p>
        ) : null}
      </div>

      {bill ? (
        <p className="truncate text-[0.95rem] font-semibold">
          {bill.sequenceNumber !== null && bill.installmentCount !== null
            ? `${bill.description} · ${bill.sequenceNumber}/${bill.installmentCount}`
            : bill.description}
        </p>
      ) : (
        <Field
          label={t("form.description")}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          error={err("description", "form.errors.description")}
          maxLength={200}
          autoComplete="off"
        />
      )}

      {editing || bill ? null : (
        <Segmented
          label={t("form.scopeLabel")}
          value={values.scope}
          onChange={(s) => set("scope", s)}
          options={[
            { value: "household", label: t("form.scope.household") },
            { value: "personal", label: t("form.scope.personal") },
          ]}
        />
      )}

      {f.owner && !editing && !bill ? (
        <Select
          label={t("form.owner")}
          value={values.ownerId ?? ""}
          onChange={(e) => set("ownerId", idOrNull(e.target.value))}
          error={err("ownerId", "form.errors.owner")}
        >
          <option value="">{t("form.choose")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </Select>
      ) : null}

      {f.related && !editing && !bill ? (
        <Select
          label={t("form.related")}
          value={values.relatedTransactionId ?? ""}
          onChange={(e) => set("relatedTransactionId", idOrNull(e.target.value))}
          error={err("relatedTransactionId", "form.errors.related")}
        >
          <option value="">{t("form.choose")}</option>
          {expenses.map((x) => (
            <option key={x.id} value={x.id}>
              {relatedLabel(x)}
            </option>
          ))}
        </Select>
      ) : null}

      {f.account ? (
        <Select
          label={t("form.account")}
          value={values.accountId ?? ""}
          onChange={(e) => set("accountId", idOrNull(e.target.value))}
          error={err("accountId", "form.errors.account")}
        >
          <option value="">{t("form.choose")}</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      ) : null}

      {!bill && f.category && (!editing || editing.type !== "transfer") ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[0.72rem] font-semibold text-muted">{t("form.category")}</legend>
          <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={values.categoryId === c.id}
                onClick={() =>
                  set("categoryId", values.categoryId === c.id && !f.categoryRequired ? null : c.id)
                }
                className={cn(
                  "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-input border px-1 text-[0.72rem]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  values.categoryId === c.id
                    ? "border-accent bg-surface-2 font-semibold"
                    : "border-line",
                )}
              >
                <CategoryTile id={c.id} size={40} />
                <span className="max-w-full truncate">{c.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAllCategories((s) => !s)}
            className="min-h-[44px] self-start text-[0.82rem] font-semibold text-accent"
          >
            {showAllCategories ? t("form.categoryFewer") : t("form.categoryAll")}
          </button>
          {errors.categoryId ? (
            <p className="text-[0.75rem] text-err">{t("form.errors.category")}</p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Select
          label={t("form.payer")}
          value={values.payerId ?? ""}
          onChange={(e) => set("payerId", idOrNull(e.target.value))}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-[3px]">
          <Label htmlFor="tx-date">{t("form.date")}</Label>
          <Input
            id="tx-date"
            type="date"
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
            aria-invalid={errors.date ? true : undefined}
          />
          {errors.date ? <p className="text-[0.75rem] text-err">{t("form.errors.date")}</p> : null}
        </div>
      </div>

      {f.method ? (
        <Select
          label={t("form.method")}
          value={values.paymentMethodId ?? ""}
          onChange={(e) => set("paymentMethodId", idOrNull(e.target.value))}
        >
          <option value="">{t("form.none")}</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={showMore}
          onClick={() => setShowMore((s) => !s)}
          className="flex min-h-[44px] items-center gap-1 self-start text-[0.82rem] font-semibold text-accent"
        >
          <ChevronDown size={16} aria-hidden className={showMore ? "rotate-180" : ""} />
          {t("form.moreDetails")}
        </button>
        {showMore ? (
          <>
            {f.accountInDetails ? (
              <Select
                label={t("form.account")}
                value={values.accountId ?? ""}
                onChange={(e) => set("accountId", idOrNull(e.target.value))}
              >
                <option value="">{t("form.none")}</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Field
              label={t("form.notes")}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              error={err("notes", "form.errors.notes")}
              maxLength={500}
              autoComplete="off"
            />
          </>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-[0.85rem] text-err">
          {t(formError)}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 mt-auto bg-surface px-4 pb-1 pt-2">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t("form.saving") : t(bill ? "bills.confirm" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
