import { useState } from "react";
import { Button } from "./ui";

/** Показывается только при SHOW_COOKIE_BANNER=true (флаг приходит из /users/me). */
export function CookieBanner({ enabled }: { enabled: boolean }) {
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem("cp_cookie"); } catch { return false; } });
  if (!enabled || hidden) return null;
  return (
    <div role="dialog" aria-label="Cookie" className="fixed inset-x-0 bottom-16 z-40 mx-4 rounded-lg border border-border bg-bg p-4 shadow-lg md:bottom-4 md:left-auto md:max-w-md">
      <p className="mb-3 text-sm">Мы используем cookie для работы сервиса и внутренней аналитики.</p>
      <Button onClick={() => { try { localStorage.setItem("cp_cookie", "1"); } catch { /* ignore */ } setHidden(true); }}>Понятно</Button>
    </div>
  );
}
