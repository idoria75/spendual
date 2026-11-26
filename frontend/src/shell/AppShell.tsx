import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  History,
  House,
  List,
  MoreHorizontal,
  PiggyBank,
  Plus,
  Receipt,
  Settings,
  User,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Logo } from "../components/ui/logo";
import { ToastProvider } from "../components/ui/toast";
import { EntryProvider, useEntry } from "../features/transactions/entry";
import { EntrySheet } from "../features/transactions/EntrySheet";
import { LookupsProvider, useLookups } from "../features/transactions/lookups";
import { MonthProvider, useMonth } from "../features/transactions/month";
import { toneColor } from "../features/transactions/display";
import { cn } from "../lib/cn";
import { currentMonth, formatMonth, shiftMonth } from "../lib/date";

type NavKey =
  | "inicio"
  | "analises"
  | "pessoal"
  | "lancamentos"
  | "aPagar"
  | "orcamentos"
  | "metas"
  | "historico"
  | "mais"
  | "ajustes";
interface NavItem {
  to: string;
  key: NavKey;
  icon: LucideIcon;
}

const SIDEBAR: NavItem[] = [
  { to: "/", key: "inicio", icon: House },
  { to: "/lancamentos", key: "lancamentos", icon: List },
  { to: "/a-pagar", key: "aPagar", icon: Receipt },
  { to: "/orcamentos", key: "orcamentos", icon: Wallet },
  { to: "/metas", key: "metas", icon: PiggyBank },
  { to: "/analises", key: "analises", icon: ChartColumn },
  { to: "/pessoal", key: "pessoal", icon: User },
  { to: "/historico", key: "historico", icon: History },
  { to: "/ajustes", key: "ajustes", icon: Settings },
];
const TABS_LEFT: NavItem[] = [SIDEBAR[0]!, SIDEBAR[1]!];
const TABS_RIGHT: NavItem[] = [SIDEBAR[2]!, { to: "/mais", key: "mais", icon: MoreHorizontal }];

function NavItemLink({ item, layout }: { item: NavItem; layout: "tab" | "side" }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-input text-[0.75rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          layout === "tab"
            ? "min-h-[64px] flex-1 flex-col justify-center gap-[2px]"
            : "min-h-[44px] gap-3 px-3 text-[0.9rem]",
          isActive ? "font-bold text-accent" : "text-muted",
        )
      }
    >
      <Icon size={20} aria-hidden />
      <span>{t(`nav.${item.key}`)}</span>
    </NavLink>
  );
}

function MonthSelector() {
  const { t } = useTranslation();
  const { month, setMonth } = useMonth();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t("nav.prevMonth")}
        onClick={() => setMonth(shiftMonth(month, -1))}
        className="flex h-11 w-11 items-center justify-center"
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <button
        type="button"
        title={t("nav.currentMonth")}
        aria-label={t("nav.currentMonthLabel", { month: formatMonth(month) })}
        onClick={() => setMonth(currentMonth())}
        className="min-h-[44px] min-w-[8.5rem] rounded-input text-center text-[0.9rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {formatMonth(month)}
      </button>
      <button
        type="button"
        aria-label={t("nav.nextMonth")}
        onClick={() => setMonth(shiftMonth(month, 1))}
        className="flex h-11 w-11 items-center justify-center"
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, reload: reloadLookups } = useLookups();
  const { openNew, version } = useEntry();
  // A saved record changes how often a category was used, so the pickers sort again.
  useEffect(() => {
    if (version > 0) void reloadLookups();
  }, [version, reloadLookups]);
  const tone = data?.users.find((u) => u.id === user?.id)?.tonePalette ?? user?.tonePalette;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <nav
        aria-label={t("nav.main")}
        className="hidden flex-col gap-1 border-r border-line bg-surface p-3 md:flex"
      >
        <Link
          to="/"
          className="flex min-h-[44px] items-center gap-2 px-3 py-2 text-[1.1rem] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Logo size={28} />
          {t("app.title")}
        </Link>
        {SIDEBAR.map((item) => (
          <NavItemLink key={item.key} item={item} layout="side" />
        ))}
      </nav>

      <div className="flex min-w-0 flex-col pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-1">
          <div className="flex items-center gap-1">
            <Link
              to="/"
              aria-label={t("app.title")}
              className="flex h-11 w-11 items-center justify-center md:hidden"
            >
              <Logo size={28} />
            </Link>
            <MonthSelector />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={openNew} className="hidden md:inline-flex md:items-center md:gap-1">
              <Plus size={16} aria-hidden />
              {t("nav.newEntryLong")}
            </Button>
            <Link
              to="/pessoal"
              className="flex min-h-[44px] items-center gap-2 text-[0.85rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden
                className="h-3 w-3 rounded-chip"
                style={{ background: toneColor(tone) }}
              />
              {user?.displayName}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[720px] p-4">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label={t("nav.tabs")}
        className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom,0px)] md:hidden"
      >
        {TABS_LEFT.map((item) => (
          <NavItemLink key={item.key} item={item} layout="tab" />
        ))}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label={t("nav.newEntry")}
            onClick={openNew}
            className="flex h-14 w-14 -translate-y-4 items-center justify-center rounded-chip bg-accent text-accent-fg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Plus size={28} aria-hidden />
          </button>
        </div>
        {TABS_RIGHT.map((item) => (
          <NavItemLink key={item.key} item={item} layout="tab" />
        ))}
      </nav>
      <EntrySheet />
    </div>
  );
}

/** Phone bottom tabs, desktop sidebar (ui-guidelines §2). Wraps the protected routes. */
export function AppShell() {
  return (
    <ToastProvider>
      <LookupsProvider>
        <MonthProvider>
          <EntryProvider>
            <Shell />
          </EntryProvider>
        </MonthProvider>
      </LookupsProvider>
    </ToastProvider>
  );
}
