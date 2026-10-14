import { ChevronRight, Settings, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/** Phone "Mais" list: Orçamentos and Ajustes exist so far. */
export function MaisPage() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("nav.mais")}</h1>
      <ul className="flex flex-col gap-2">
        <li>
          <Link
            to="/orcamentos"
            className="flex min-h-[56px] items-center gap-3 rounded-input bg-surface px-3"
          >
            <Wallet size={20} aria-hidden />
            <span className="flex-1">
              <span className="block font-semibold">{t("nav.orcamentos")}</span>
              <span className="block text-[12px] text-muted">{t("nav.orcamentosHint")}</span>
            </span>
            <ChevronRight size={16} aria-hidden />
          </Link>
        </li>
        <li>
          <Link
            to="/ajustes"
            className="flex min-h-[56px] items-center gap-3 rounded-input bg-surface px-3"
          >
            <Settings size={20} aria-hidden />
            <span className="flex-1">
              <span className="block font-semibold">{t("nav.ajustes")}</span>
              <span className="block text-[12px] text-muted">{t("nav.ajustesHint")}</span>
            </span>
            <ChevronRight size={16} aria-hidden />
          </Link>
        </li>
      </ul>
    </section>
  );
}
