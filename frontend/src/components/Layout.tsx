import { Bell, FileText, FolderOpen, Home, Menu, Settings, User, X, CreditCard } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useMe } from "../hooks/useAuth";
import { setToken } from "../services/api";
import { cn } from "./ui";
import { CookieBanner } from "./CookieBanner";

const NAV = [
  { to: "/", label: "Главная", icon: Home, end: true },
  { to: "/cases", label: "Мои дела", icon: FolderOpen },
  { to: "/documents", label: "Документы", icon: FileText },
  { to: "/profile", label: "Настройки", icon: Settings },
  { to: "/pricing", label: "Подписка", icon: CreditCard },
];
const TABS = [
  { to: "/", label: "Главная", icon: Home, end: true },
  { to: "/cases", label: "Дела", icon: FolderOpen },
  { to: "/documents", label: "Документы", icon: FileText },
  { to: "/notifications", label: "Уведомл.", icon: Bell },
  { to: "/profile", label: "Профиль", icon: User },
];

const Logo = () => (
  <Link to="/" className="flex items-center gap-2 font-semibold text-fg">
    <img src="/icons/icon.svg" alt="" className="h-7 w-7" /> Профиль кредитора
  </Link>
);

export function Layout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const logout = () => { setToken(null); nav("/login"); };
  const link = ({ isActive }: { isActive: boolean }) =>
    cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm", isActive ? "bg-surface2 font-medium text-fg" : "text-muted hover:bg-surface2");

  return (
    <div className="min-h-screen lg:flex">
      {/* Десктоп: sidebar 280px */}
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
        <Logo />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}><n.icon size={18} />{n.label}</NavLink>)}
        </nav>
        <div className="border-t border-border pt-4 text-sm">
          <div className="text-safe font-medium">{me?.email}</div>
          <div className="text-muted">Тариф: {me?.tier}</div>
          <button onClick={logout} className="mt-2 text-info">Выйти</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Планшет: top bar + hamburger (скрыт на мобильном и десктопе) */}
        <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-border bg-bg px-6 py-3 md:flex lg:hidden">
          <Logo />
          <button aria-label="Меню" onClick={() => setOpen(!open)} className="rounded-md p-2 hover:bg-surface2">
            {open ? <X /> : <Menu />}
          </button>
        </header>
        {open && (
          <nav className="hidden border-b border-border bg-surface p-4 md:grid md:grid-cols-2 lg:hidden">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={link}><n.icon size={18} />{n.label}</NavLink>)}
            <button onClick={logout} className="px-3 py-2 text-left text-sm text-info">Выйти</button>
          </nav>
        )}
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden"><Logo /></header>

        <main className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-6 md:px-6 md:pb-12 lg:px-8">{children}</main>
      </div>

      {/* Мобильный: bottom tab bar */}
      <nav aria-label="Основная навигация" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", isActive ? "text-fg font-medium" : "text-muted")}>
            <t.icon size={22} />{t.label}
          </NavLink>
        ))}
      </nav>
      <CookieBanner enabled={!!me?.flags.show_cookie_banner} />
    </div>
  );
}
