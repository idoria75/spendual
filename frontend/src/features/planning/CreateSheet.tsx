import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { AmountField } from "../../components/ui/amount-input";
import { Field, Label } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Segmented } from "../../components/ui/segmented";
import { Select } from "../../components/ui/select";
import { Sheet } from "../../components/ui/sheet";
import { formatMoney } from "../../lib/currency";
import { today } from "../../lib/date";
import { useLookups } from "../transactions/lookups";
import { createPlan, createRule } from "./api";
import {
  buildPlan,
  buildRule,
  splitPreview,
  type PlanningErrors,
  type PlanningValues,
} from "./form-model";

export type CreateKind = "rule" | "plan";

interface Props {
  kind: CreateKind | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Create a recurring rule ("Recorrente") or an installment plan ("Parcelado"). */
export function CreateSheet({ kind, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(open) => !open && onClose()}
      title={kind ? t(`bills.create.${kind}.title`) : ""}
      tall
    >
      {kind ? <CreateForm kind={kind} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function CreateForm({ kind, onSaved }: { kind: CreateKind; onSaved: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const [v, setV] = useState<PlanningValues>(() => ({
    description: "",
    amount: "",
    unknown: false,
    count: "",
    day: String(Number(today().slice(8, 10))),
    startDate: today(),
    endDate: "",
    scope: "household",
    ownerId: user?.id ?? null,
    payerId: user?.id ?? null,
    categoryId: null,
    accountId: null,
    paymentMethodId: null,
  }));
  const [errors, setErrors] = useState<PlanningErrors>({});
  const [formError, setFormError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const set = <K extends keyof PlanningValues>(key: K, value: PlanningValues[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const idOrNull = (s: string) => (s === "" ? null : Number(s));
  const isRule = kind === "rule";
  const preview = isRule ? null : splitPreview(v.amount, v.count);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setFormError(null);
    let run: () => Promise<unknown>;
    if (isRule) {
      const built = buildRule(v);
      if (!built.ok) return setErrors(built.errors);
      run = () => createRule(built.body);
    } else {
      const built = buildPlan(v);
      if (!built.ok) return setErrors(built.errors);
      run = () => createPlan(built.body);
    }
    setErrors({});
    locked.current = true;
    setBusy(true);
    try {
      await run();
      onSaved();
    } catch (error) {
      setFormError(messageKeyFor(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const categories = (lookups?.categories ?? []).filter((c) => c.active && c.kind === "expense");
  const accounts = (lookups?.accounts ?? []).filter((a) => a.active);
  const methods = (lookups?.paymentMethods ?? []).filter((m) => m.active);
  const users = lookups?.users ?? [];

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
      <Field
        label={t("form.description")}
        value={v.description}
        onChange={(e) => set("description", e.target.value)}
        error={errors.description ? t("form.errors.description") : undefined}
        maxLength={200}
        autoComplete="off"
      />
      <AmountField
        label={t(isRule ? "bills.create.rule.amount" : "bills.create.plan.total")}
        placeholder={t("form.amountPlaceholder")}
        value={v.amount}
        disabled={isRule && v.unknown}
        onValueChange={(a) => set("amount", a)}
        error={errors.amount ? t("form.errors.amount") : undefined}
      />
      {isRule ? (
        <label className="flex min-h-[44px] items-center gap-2 text-[0.88rem]">
          <input
            type="checkbox"
            checked={v.unknown}
            onChange={(e) => set("unknown", e.target.checked)}
            className="h-5 w-5"
          />
          {t("bills.create.rule.unknown")}
        </label>
      ) : (
        <>
          <Field
            label={t("bills.create.plan.count")}
            inputMode="numeric"
            autoComplete="off"
            value={v.count}
            onChange={(e) => set("count", e.target.value)}
            error={errors.count ? t("bills.create.plan.countError") : undefined}
          />
          {preview ? (
            <p className="text-[0.85rem] tabular-nums text-muted">
              {preview.each === preview.last
                ? t("bills.create.plan.preview", {
                    n: preview.n,
                    each: formatMoney(preview.each),
                    total: formatMoney(preview.total),
                  })
                : t("bills.create.plan.previewLast", {
                    n: preview.n - 1,
                    each: formatMoney(preview.each),
                    last: formatMoney(preview.last),
                    total: formatMoney(preview.total),
                  })}
            </p>
          ) : null}
        </>
      )}
      {isRule ? (
        <Field
          hint={Number(v.day) > 28 ? t("bills.create.rule.dayHint") : undefined}
          label={t("bills.create.rule.day")}
          inputMode="numeric"
          autoComplete="off"
          value={v.day}
          onChange={(e) => set("day", e.target.value)}
          error={errors.day ? t("bills.create.rule.dayError") : undefined}
        />
      ) : null}
      <div className="flex flex-col gap-[3px]">
        <Label htmlFor="bill-start">
          {t(isRule ? "bills.create.rule.start" : "bills.create.plan.first")}
        </Label>
        <Input
          id="bill-start"
          type="date"
          value={v.startDate}
          onChange={(e) => set("startDate", e.target.value)}
          aria-invalid={errors.startDate ? true : undefined}
        />
        {errors.startDate ? (
          <p className="text-[0.75rem] text-err">{t("form.errors.date")}</p>
        ) : null}
      </div>
      {isRule ? (
        <div className="flex flex-col gap-[3px]">
          <Label htmlFor="bill-end">{t("bills.create.rule.end")}</Label>
          <Input
            id="bill-end"
            type="date"
            value={v.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            aria-invalid={errors.endDate ? true : undefined}
          />
          {errors.endDate ? (
            <p className="text-[0.75rem] text-err">{t("form.errors.date")}</p>
          ) : null}
        </div>
      ) : null}
      <Segmented
        label={t("form.scopeLabel")}
        value={v.scope}
        onChange={(s) => set("scope", s)}
        options={[
          { value: "household", label: t("form.scope.household") },
          { value: "personal", label: t("form.scope.personal") },
        ]}
      />
      {v.scope === "personal" ? (
        <Select
          label={t("form.owner")}
          value={v.ownerId ?? ""}
          onChange={(e) => set("ownerId", idOrNull(e.target.value))}
          error={errors.ownerId ? t("form.errors.owner") : undefined}
        >
          <option value="">{t("form.choose")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </Select>
      ) : null}
      <Select
        label={t("form.category")}
        value={v.categoryId ?? ""}
        onChange={(e) => set("categoryId", idOrNull(e.target.value))}
        error={errors.categoryId ? t("form.errors.category") : undefined}
      >
        <option value="">{t("form.choose")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        label={t("form.payer")}
        value={v.payerId ?? ""}
        onChange={(e) => set("payerId", idOrNull(e.target.value))}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </Select>
      {isRule ? (
        <Select
          label={t("form.method")}
          value={v.paymentMethodId ?? ""}
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
      <Select
        label={t("form.account")}
        value={v.accountId ?? ""}
        onChange={(e) => set("accountId", idOrNull(e.target.value))}
      >
        <option value="">{t("form.none")}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      {formError ? (
        <p role="alert" className="text-[0.85rem] text-err">
          {t(formError)}
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto bg-surface px-4 pb-5 pt-2">
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t("form.saving") : t("form.save")}
        </Button>
      </div>
    </form>
  );
}
