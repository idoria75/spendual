import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-[17px] font-bold">{t("app.title")}</h1>;
}
