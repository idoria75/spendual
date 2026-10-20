import type { Transaction } from "@spendual/shared";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Sheet } from "../../components/ui/sheet";
import { formatDate } from "../../lib/date";
import { formatTxAmount } from "./display";
import { useLookups, useSingleUser } from "./lookups";

interface Props {
  tx: Transaction | null;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onVoid: (tx: Transaction) => void;
}

export function TransactionDetail({ tx, onClose, onEdit, onVoid }: Props) {
  const { t } = useTranslation();
  const { data } = useLookups();
  // One account: who paid is never a question.
  const people = useSingleUser() ? undefined : data?.users;
  const rows: [string, string | null | undefined][] = tx
    ? [
        [t("form.type.label"), t(`form.type.${tx.type}`)],
        [t("form.date"), formatDate(tx.transactionDate)],
        [t("form.scopeLabel"), t(`form.scope.${tx.scope}`)],
        [t("form.category"), data?.categories.find((c) => c.id === tx.categoryId)?.name],
        [t("form.payer"), people?.find((u) => u.id === tx.payerId)?.displayName],
        [t("form.owner"), people?.find((u) => u.id === tx.ownerId)?.displayName],
        [t("form.method"), data?.paymentMethods.find((m) => m.id === tx.paymentMethodId)?.name],
        [t("form.account"), data?.accounts.find((a) => a.id === tx.accountId)?.name],
        [t("form.notes"), tx.notes],
        [t("detail.voidReason"), tx.voidReason],
      ]
    : [];
  const canChange = tx?.status === "confirmed";
  const canCancel = tx?.status === "planned";

  return (
    <Sheet
      open={tx !== null}
      onOpenChange={(open) => !open && onClose()}
      title={tx?.description ?? ""}
    >
      {tx ? (
        <div className="flex flex-col gap-3">
          <p className="text-[27px] font-bold">{formatTxAmount(tx)}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.88rem]">
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {canChange ? (
            <div className="flex justify-between gap-3">
              <Button variant="ghost" onClick={() => onEdit(tx)}>
                {t("detail.edit")}
              </Button>
              <Button onClick={() => onVoid(tx)} className="bg-fg text-bg">
                <TriangleAlert size={16} aria-hidden className="mr-1 inline" />
                {t("detail.void")}
              </Button>
            </div>
          ) : null}
          {canCancel ? (
            <Button onClick={() => onVoid(tx)} className="bg-fg text-bg">
              {t("detail.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
