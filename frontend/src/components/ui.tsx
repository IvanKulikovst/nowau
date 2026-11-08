import clsx, { type ClassValue } from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; block?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ className, variant = "primary", block, ...p }, ref) => (
  <button ref={ref} {...p}
    className={cn("inline-flex items-center justify-center gap-2 rounded-md px-4 font-medium transition-colors",
      "h-11 md:h-10 disabled:opacity-50 disabled:pointer-events-none",
      block && "w-full md:w-auto",
      variant === "primary" && "bg-primary text-bg hover:bg-primary-hover",
      variant === "outline" && "border border-border bg-bg text-fg hover:bg-surface2",
      variant === "ghost" && "text-fg hover:bg-surface2", className)} />
));

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={cn("rounded-lg border border-border bg-surface p-4 md:p-6 shadow-sm min-w-0", className)} />
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} {...p} className={cn("h-11 md:h-10 w-full rounded-md border border-border bg-bg px-3 text-fg placeholder:text-muted", className)} />
));

export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn("h-11 md:h-10 w-full rounded-md border border-border bg-bg px-3 text-fg", className)} />
);

/** Подпись + поле в одном <label>: поле программно связано с подписью (a11y). */
export const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <label className={cn("block", className)}>
    <span className="mb-1 block text-sm text-muted">{label}</span>
    {children}
  </label>
);

export const Badge = ({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) => (
  <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
    tone === "neutral" && "bg-surface2 text-muted", tone === "success" && "bg-success/15 text-success",
    tone === "warning" && "bg-warning/15 text-warning", tone === "danger" && "bg-danger/15 text-danger",
    tone === "info" && "bg-info/15 text-info")}>{children}</span>
);

export const Spinner = () => (
  <div role="status" aria-label="Загрузка" className="mx-auto my-12 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
);

export const ErrorBox = ({ error }: { error: unknown }) => (
  <Card role="alert" className="border-danger/40 text-danger">
    {error instanceof Error ? error.message : "Произошла ошибка"}
  </Card>
);
