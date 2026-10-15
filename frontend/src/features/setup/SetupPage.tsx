import { allowanceCreateSchema, budgetEditSchema } from "@spendual/shared";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { messageKeyFor } from "../../auth/error-messages";
import { AmountField } from "../../components/ui/amount-input";
import { Button } from "../../components/ui/button";
import { ToastProvider, useToast } from "../../components/ui/toast";
import { parseAmountInput } from "../../lib/currency";
import { currentMonth } from "../../lib/date";
import { completeSetup, createAllowance, putBudget } from "../planning/api";
import { LookupsProvider, useLookups } from "../transactions/lookups";
import { useSetup } from "./SetupGate";

/** First-run setup: monthly budgets and allowances. Both buttons mark the setup as done. */
export function SetupPage() {
  return (
    <ToastProvider>
      <LookupsProvider>
        <SetupForm />
      </LookupsProvider>
    </ToastProvider>
  );
}

function SetupForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { markCompleted } = useSetup();
  const { showToast } = useToast();
  const { data: lookups, failed, reload } = useLookups();
  const [overall, setOverall] = useState("");
  const [categoryAmounts, setCategoryAmounts] = useState<Record<number, string>>({});
  const [allowances, setAllowances] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);
  const locked = useRef(false);
  // Steps that already worked, so a retry after a failure does not repeat them.
  const done = useRef(new Set<string>());

  const finish = async (mode: "save" | "skip") => {
    if (locked.current) return;
    locked.current = true;
    setBusy(mode);
    setFormError(null);
    try {
      if (mode === "save") await saveAll();
      await completeSetup();
      markCompleted();
      showToast(t("setup.done"));
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(messageKeyFor(error));
    } finally {
      locked.current = false;
      setBusy(null);
    }
  };

  const saveAll = async () => {
    const period = currentMonth();
    const budgets: [string, number | null, string][] = [
      ["budget:all", null, overall],
      ...Object.entries(categoryAmounts).map(([id, v]): [string, number | null, string] => [
        `budget:${id}`,
        Number(id),
        v,
      ]),
    ];
    for (const [key, categoryId, text] of budgets) {
      const amount = parseAmountInput(text);
      if (amount === null || done.current.has(key)) continue;
      const body = budgetEditSchema.parse({ categoryId, period, amount, mode: "going_forward" });
      await putBudget(body);
      done.current.add(key);
    }
    for (const [id, text] of Object.entries(allowances)) {
      const key = `allowance:${id}`;
      const amount = parseAmountInput(text);
      if (amount === null || done.current.has(key)) continue;
      await createAllowance(
        allowanceCreateSchema.parse({ ownerId: Number(id), month: period, amount }),
      );
      done.current.add(key);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void finish("save");
  };

  const categories = (lookups?.categories ?? []).filter((c) => c.active && c.kind === "expense");
  const users = lookups?.users ?? [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col p-4">
      <h1 className="text-[1.3rem] font-bold">{t("setup.title")}</h1>
      <p className="mt-1 text-[0.88rem] text-muted [text-wrap:pretty]">{t("setup.intro")}</p>
      {lookups === null ? (
        <p role="status" className="py-6 text-muted">
          {failed ? (
            <Button variant="ghost" onClick={() => void reload()}>
              {t("common.retry")}
            </Button>
          ) : (
            t("common.loading")
          )}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-1 flex-col gap-5">
          <section aria-labelledby="setup-overall" className="flex flex-col gap-2">
            <h2 id="setup-overall" className="text-[1rem] font-bold">
              {t("setup.overallTitle")}
            </h2>
            <AmountField
              label={t("setup.overallLabel")}
              placeholder={t("form.amountPlaceholder")}
              value={overall}
              onValueChange={setOverall}
            />
          </section>

          <section aria-labelledby="setup-categories" className="flex flex-col gap-2">
            <h2 id="setup-categories" className="text-[1rem] font-bold">
              {t("setup.categoriesTitle")}
            </h2>
            <p className="text-[0.82rem] text-muted">{t("setup.optional")}</p>
            {categories.map((c) => (
              <AmountField
                key={c.id}
                label={c.name}
                placeholder={t("form.amountPlaceholder")}
                value={categoryAmounts[c.id] ?? ""}
                onValueChange={(v) => setCategoryAmounts((x) => ({ ...x, [c.id]: v }))}
              />
            ))}
          </section>

          <section aria-labelledby="setup-allowances" className="flex flex-col gap-2">
            <h2 id="setup-allowances" className="text-[1rem] font-bold">
              {t("setup.allowancesTitle")}
            </h2>
            <p className="text-[0.82rem] text-muted">{t("setup.optional")}</p>
            {users.map((u) => (
              <AmountField
                key={u.id}
                label={t("setup.allowanceLabel", { name: u.displayName })}
                placeholder={t("form.amountPlaceholder")}
                value={allowances[u.id] ?? ""}
                onValueChange={(v) => setAllowances((x) => ({ ...x, [u.id]: v }))}
              />
            ))}
          </section>

          {formError ? (
            <p role="alert" className="text-[0.85rem] text-err">
              {t(formError)}
            </p>
          ) : null}

          <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 bg-bg px-4 pb-5 pt-2">
            <Button type="submit" disabled={busy !== null} className="w-full">
              {busy === "save" ? t("form.saving") : t("setup.finish")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void finish("skip")}
              className="w-full"
            >
              {t("setup.skip")}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
