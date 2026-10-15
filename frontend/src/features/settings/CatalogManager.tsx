import type { Account, AccountType, Category, PaymentMethod } from "@spendual/shared";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { messageKeyFor } from "../../auth/error-messages";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Select } from "../../components/ui/select";
import { cn } from "../../lib/cn";
import {
  createAccount,
  createCategory,
  createPaymentMethod,
  patchAccount,
  patchCategory,
  patchPaymentMethod,
} from "../transactions/api";
import { useLookups } from "../transactions/lookups";

export type CatalogKind = "categories" | "accounts" | "paymentMethods";
const ACCOUNT_TYPES: AccountType[] = ["bank", "cash", "credit_card", "other"];

type Item = Category | Account | PaymentMethod;

export function CatalogManager({ kind }: { kind: CatalogKind }) {
  const { t } = useTranslation();
  const { data, reload } = useLookups();
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("bank");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const items: Item[] = data?.[kind] ?? [];

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      setError(messageKeyFor(e));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    const ok = await run(() => {
      if (kind === "categories") return createCategory({ name: trimmed });
      if (kind === "accounts") return createAccount({ name: trimmed, type: accountType });
      return createPaymentMethod({ name: trimmed });
    });
    if (ok) setName("");
  };

  const patch = (id: number, body: { name?: string; active?: boolean }) => {
    if (kind === "categories") return patchCategory(id, body);
    if (kind === "accounts") return patchAccount(id, body);
    return patchPaymentMethod(id, body);
  };

  const rename = async (event: FormEvent, id: number) => {
    event.preventDefault();
    const trimmed = editName.trim();
    if (trimmed === "") return;
    if (await run(() => patch(id, { name: trimmed }))) setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2">
        <Field
          label={t(`settings.${kind}.newLabel`)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="off"
        />
        {kind === "accounts" ? (
          <Select
            label={t("settings.accountType")}
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`settings.accountTypes.${ty}`)}
              </option>
            ))}
          </Select>
        ) : null}
        <Button type="submit" disabled={busy || name.trim() === ""} className="self-start">
          {t("settings.add")}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-[0.85rem] text-err">
          {t(error)}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex min-h-[48px] items-center gap-2 rounded-input bg-surface px-3"
          >
            {editingId === item.id ? (
              <form
                onSubmit={(e) => void rename(e, item.id)}
                className="flex flex-1 items-end gap-2"
              >
                <div className="flex-1">
                  <Field
                    label={t("settings.rename")}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <Button type="submit" disabled={busy}>
                  {t("settings.save")}
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  {t("settings.cancel")}
                </Button>
              </form>
            ) : (
              <>
                <span className={cn("flex-1 py-2 leading-tight [overflow-wrap:anywhere]", !item.active && "text-muted")}>
                  {item.name}
                  {item.active ? "" : ` · ${t("settings.archived")}`}
                </span>
                <button
                  type="button"
                  aria-label={`${t("settings.rename")}: ${item.name}`}
                  disabled={busy}
                  onClick={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                  }}
                  className="flex h-11 w-11 items-center justify-center text-muted"
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`${t(item.active ? "settings.archive" : "settings.unarchive")}: ${item.name}`}
                  disabled={busy}
                  onClick={() => void run(() => patch(item.id, { active: !item.active }))}
                  className="flex h-11 w-11 items-center justify-center text-muted"
                >
                  {item.active ? (
                    <Archive size={16} aria-hidden />
                  ) : (
                    <ArchiveRestore size={16} aria-hidden />
                  )}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
