import type { Bill, Transaction, TransactionCreate, TransactionType } from "@spendual/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { messageKeyFor } from "../../auth/error-messages";
import { AmountInput } from "../../components/ui/amount-input";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Field, Label } from "../../components/ui/field";
import { StickyActions } from "../../components/ui/sticky-actions";
import { Input } from "../../components/ui/input";
import { Segmented } from "../../components/ui/segmented";
import { Select } from "../../components/ui/select";
import { useToast } from "../../components/ui/toast";
import { formatMoney } from "../../lib/currency";
import { formatDayMonth, today } from "../../lib/date";
import { lastMethodId, rememberMethod } from "../../lib/recent";
import { confirmBill, createPlan } from "../planning/api";
import { splitPreview } from "../planning/form-model";
import {
  correctTransaction,
  createTransaction,
  findSimilar,
  listTransactions,
  patchTransaction,
} from "./api";
import { CategoryPicker } from "./CategoryPicker";
import { UserPicker } from "./UserPicker";
import {
  buildConfirm,
  buildCreate,
  buildInstallment,
  categoryKindFor,
  isCreditCardMethod,
  isReceipt,
  buildPatch,
  valuesFromBill,
  valuesFromTransaction,
  visibleFields,
  type FieldErrors,
  type FormValues,
} from "./form-model";
import type { EntryPreset } from "./entry";
import { byUsage, useLookups } from "./lookups";

type ErrKey =
  | "form.errors.description"
  | "form.errors.owner"
  | "form.errors.related"
  | "form.errors.account"
  | "form.errors.notes"
  | "form.errors.installmentCount";

function relatedLabel(x: Transaction): string {
  return `${formatDayMonth(x.transactionDate)} · ${x.description} · ${formatMoney(x.amount)}`;
}

const TYPES: TransactionType[] = ["expense", "income", "other_receipt", "transfer", "refund"];

interface Props {
  editing: Transaction | null;
  /** Starting type, scope and owner of a new record. */
  preset?: EntryPreset | null;
  /** Copy of another record: the form starts filled, dated today, and saves as a new record. */
  duplicating?: Transaction | null;
  /** Record to void and replace by the one in the form. */
  correcting?: Transaction | null;
  /** A planned bill to confirm: the form is pre-filled and saves through /bills/:kind/:id/confirm. */
  bill?: Bill | null;
  amountRef: React.RefObject<HTMLInputElement>;
  onSaved: () => void;
}

export function TransactionForm({
  editing,
  preset = null,
  duplicating = null,
  correcting = null,
  bill = null,
  amountRef,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: lookups, failed, reload } = useLookups();
  const { showToast } = useToast();

  const [values, setValues] = useState<FormValues>(() =>
    bill
      ? valuesFromBill(bill, user?.id ?? null, bill.dueDate)
      : editing
        ? valuesFromTransaction(editing)
        : correcting
          ? valuesFromTransaction(correcting)
          : duplicating
            ? { ...valuesFromTransaction(duplicating), date: today() }
            : {
                type: preset?.type ?? "expense",
                amount: "",
                description: "",
                scope: preset?.scope ?? "household",
                ownerId: preset ? preset.ownerId : (user?.id ?? null),
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
  const [showMore, setShowMore] = useState(false);
  const [installment, setInstallment] = useState<"no" | "yes">("no");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [similar, setSimilar] = useState<{
    items: Transaction[];
    run: () => Promise<unknown>;
  } | null>(null);
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const locked = useRef(false);
  const dropped = useRef(new Map<string, number>());

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

  const categoryKind = categoryKindFor(type);
  const activeCategories = useMemo(
    () =>
      (lookups?.categories ?? [])
        .filter(
          (c) =>
            c.id === values.categoryId ||
            ((categoryKind === null || c.kind === categoryKind) && c.active),
        )
        .sort(byUsage),
    [lookups, values.categoryId, categoryKind],
  );
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
  const singleUser = users.length === 1;
  const activeAccounts = lookups.accounts.filter((a) => a.active || a.id === values.accountId);
  const methods = lookups.paymentMethods.filter((m) => m.active || m.id === values.paymentMethodId);
  const method = methods.find((m) => m.id === values.paymentMethodId);
  const account = lookups.accounts.find((a) => a.id === values.accountId);
  const canInstall =
    !editing &&
    !bill &&
    type === "expense" &&
    (isCreditCardMethod(method?.name) || account?.type === "credit_card");
  const installing = canInstall && installment === "yes";
  const preview = installing ? splitPreview(values.amount, installmentCount) : null;

  // A category dropped by a type change comes back when the type goes back to its kind.
  const changeType = (ty: TransactionType) => {
    const kind = categoryKindFor(ty);
    const current = lookups.categories.find((c) => c.id === values.categoryId);
    if (current) dropped.current.set(current.kind, current.id);
    const keep = current !== undefined && current.kind === kind;
    const restored = kind === null ? undefined : dropped.current.get(kind);
    setValues((v) => ({ ...v, type: ty, categoryId: keep ? v.categoryId : (restored ?? null) }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setFormError(null);
    let run: (() => Promise<unknown>) | null;
    let check: TransactionCreate | null = null;
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
    } else if (installing) {
      const built = buildInstallment(values, installmentCount);
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      const body = built.body;
      run = () => createPlan(body);
    } else {
      const built = buildCreate(values);
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      const body = built.body;
      if (correcting) {
        run = () => correctTransaction(correcting.id, body);
      } else {
        run = () => createTransaction(body);
        check = body;
      }
    }
    setErrors({});
    if (run === null) {
      onSaved();
      return;
    }
    // A new record that looks like an existing one asks first. A failed check never blocks saving.
    if (check) {
      const similar = await findSimilar(check).catch(() => []);
      if (similar.length > 0) {
        setSimilar({ items: similar, run });
        return;
      }
    }
    await execute(run);
  };

  /** Runs the save once at a time, then toasts and closes. */
  const execute = async (run: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setSubmitting(true);
    try {
      await run();
      if (!editing && !bill) rememberMethod(values.paymentMethodId);
      showToast(
        t(
          bill
            ? "bills.confirmed"
            : editing
              ? "form.savedEdit"
              : correcting
                ? "form.corrected"
                : installing
                  ? "form.installment.saved"
                  : "form.saved",
        ),
      );
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
            <Chip key={ty} active={values.type === ty} onClick={() => changeType(ty)}>
              {t(`form.type.${ty}`)}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-[3px]">
        <Label htmlFor="tx-amount">{t("form.amount")}</Label>
        <AmountInput
          id="tx-amount"
          ref={amountRef}
          placeholder={t("form.amountPlaceholder")}
          value={values.amount}
          onValueChange={(v) => set("amount", v)}
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

      {f.owner && !editing && !bill && !singleUser ? (
        <UserPicker
          users={users}
          selected={values.ownerId}
          onSelect={(id) => set("ownerId", id)}
          legend={t("form.owner")}
          error={err("ownerId", "form.errors.owner")}
        />
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
        <CategoryPicker
          categories={activeCategories}
          selected={values.categoryId === null ? [] : [values.categoryId]}
          onSelect={(id) =>
            set("categoryId", values.categoryId === id && !f.categoryRequired ? null : id)
          }
          error={errors.categoryId ? t("form.errors.category") : undefined}
        />
      ) : null}

      {singleUser ? null : (
        <UserPicker
          users={users}
          selected={values.payerId}
          onSelect={(id) => set("payerId", id)}
          legend={t(isReceipt(type) ? "form.receiver" : "form.payer")}
        />
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-[3px]">
          <Label htmlFor="tx-date">{t(installing ? "form.installment.first" : "form.date")}</Label>
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

      {canInstall ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-[3px]">
            <Label>{t("form.installment.label")}</Label>
            <Segmented
              label={t("form.installment.label")}
              value={installment}
              onChange={setInstallment}
              options={[
                { value: "no", label: t("form.installment.no") },
                { value: "yes", label: t("form.installment.yes") },
              ]}
            />
          </div>
          {installing ? (
            <>
              <Field
                label={t("form.installment.count")}
                inputMode="numeric"
                autoComplete="off"
                value={installmentCount}
                onChange={(e) => setInstallmentCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
                error={err("installmentCount", "form.errors.installmentCount")}
              />
              {preview ? (
                <p className="text-[0.85rem] tabular-nums text-muted">
                  {t("form.installment.preview", {
                    n: preview.n,
                    each: formatMoney(preview.each),
                  })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
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

      <StickyActions>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t("form.saving") : t(bill ? "bills.confirm" : "form.save")}
        </Button>
      </StickyActions>
      <ConfirmDialog
        open={similar !== null}
        onOpenChange={(open) => {
          if (!open) setSimilar(null);
        }}
        title={t("form.duplicate.title")}
        record={similar?.items[0] ? relatedLabel(similar.items[0]) : ""}
        body={t("form.duplicate.body", { count: similar?.items.length ?? 0 })}
        confirmLabel={t("form.duplicate.confirm")}
        onConfirm={async () => {
          const pending = similar;
          setSimilar(null);
          if (pending) await execute(pending.run);
        }}
      />
    </form>
  );
}
