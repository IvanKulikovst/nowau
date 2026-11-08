import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { cn } from "./ui";

const TABS = [["", "Сводка"], ["details", "Детали"], ["audit", "Аудит"], ["registry", "Реестр"], ["documents", "Документы"]];

export function AnalysisShell({ title, children }: { title: string; children: ReactNode }) {
  const { id } = useParams();
  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} /> Назад</Link>
      <h1 className="mb-4 text-2xl font-semibold text-safe">{title}</h1>
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Разделы анализа">
        {TABS.map(([p, label]) => (
          <NavLink key={p} to={`/analysis/${id}${p ? "/" + p : ""}`} end
            className={({ isActive }) => cn("shrink-0 rounded-md px-3 py-2 text-sm", isActive ? "bg-primary text-bg" : "text-muted hover:bg-surface2")}>
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
