import { cn } from "./ui";
import { pct } from "../services/format";
import type { Risk } from "../services/api";

const DOT = { red: "bg-danger", yellow: "bg-warning", green: "bg-success" } as const;
const TXT = { red: "Высокий уровень", yellow: "Средний уровень", green: "Низкий уровень" } as const;

/** Светофор: цвет всегда дублируется текстом (не только цветом). */
export function Traffic({ risks }: { risks: Risk[] }) {
  return (
    <ul className="flex flex-col gap-3 md:flex-row md:gap-4" aria-label="Светофор рисков">
      {risks.map((r) => (
        <li key={r.key} className="flex flex-1 items-start gap-3 rounded-md border border-border bg-bg p-3 min-w-0">
          <span aria-hidden className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", DOT[r.light])} />
          <div className="min-w-0">
            <div className="text-sm text-muted line-clamp-2">{r.title}</div>
            <div className="font-medium text-safe">
              {r.key === "mass" ? r.label : r.label}{" "}
              <span className="amount text-muted">({pct(r.p)})</span>
            </div>
            <span className="sr-only">{TXT[r.light]}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
