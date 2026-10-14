import { useTranslation } from "react-i18next";

type NavKey = "aPagar" | "orcamentos" | "mais";

/** Simple page for views that come in later phases. */
export function PlaceholderPage({ navKey }: { navKey: NavKey }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-[17px] font-bold">{t(`nav.${navKey}`)}</h1>
      <p className="text-muted">{t("placeholder.soon")}</p>
    </section>
  );
}
