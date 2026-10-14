import type { Transaction } from "@spendual/shared";
import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { formatDayMonth } from "../../lib/date";
import { CategoryTile } from "./CategoryTile";
import { formatTxAmount, toneColor } from "./display";
import { useLookups } from "./lookups";

const ARROWS = "\u21c4 ";

/** One record row (ui-guidelines §6.3). Tap opens the detail. */
export function TransactionRow({ tx, onOpen }: { tx: Transaction; onOpen: () => void }) {
  const { t } = useTranslation();
  const { data } = useLookups();
  const category = data?.categories.find((c) => c.id === tx.categoryId);
  // Tone: the owner for personal records, otherwise the payer.
  const toneUserId = tx.scope === "personal" ? tx.ownerId : tx.payerId;
  const toneUser = data?.users.find((u) => u.id === toneUserId);
  const voided = tx.status === "voided" || tx.status === "cancelled";
  const transfer = tx.type === "transfer";
  const metaParts = [
    transfer ? t("list.transferNote") : (category?.name ?? t("list.noCategory")),
    t(`form.scope.${tx.scope}`),
  ];

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        style={{ borderLeftColor: toneColor(toneUser?.tonePalette) }}
        className={cn(
          "grid min-h-[56px] w-full grid-cols-[28px_1fr_auto] items-center gap-3 rounded-input border-l-[3px] bg-surface px-3 py-2 text-left",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        {transfer ? (
          <span aria-hidden className="flex h-7 w-7 items-center justify-center text-muted">
            <ArrowLeftRight size={16} />
          </span>
        ) : (
          <CategoryTile id={tx.categoryId} />
        )}
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-[15px] font-semibold",
              voided && "text-muted line-through",
            )}
          >
            {tx.description}
          </span>
          <span className="block truncate text-[12px] text-muted">
            {metaParts.join(" · ")}
            {toneUser ? ` · ${toneUser.displayName}` : ""}
            {voided
              ? ` · ${t(tx.status === "voided" ? "list.voided" : "list.cancelled", { reason: tx.voidReason ?? "" })}`
              : ""}
          </span>
        </span>
        <span
          className={cn(
            "whitespace-nowrap text-[15px] font-semibold",
            voided && "text-muted line-through",
            !voided && transfer && "font-medium text-muted",
            !voided && (tx.type === "income" || tx.type === "other_receipt") && "text-pos",
          )}
        >
          <span className="sr-only">{formatDayMonth(tx.transactionDate)} </span>
          {transfer ? (
            <>
              <span aria-hidden>{ARROWS}</span>
              {formatTxAmount(tx)}
            </>
          ) : (
            formatTxAmount(tx)
          )}
        </span>
      </button>
    </li>
  );
}
