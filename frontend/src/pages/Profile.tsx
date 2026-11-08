import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Disclaimer } from "../components/Disclaimer";
import { Button, Card, ErrorBox, Input, Field } from "../components/ui";
import { useMe } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { api } from "../services/api";

export default function Profile() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const [oldP, setOld] = useState("");
  const [newP, setNew] = useState("");
  const pw = useMutation({ mutationFn: () => api.changePassword(oldP, newP), onSuccess: () => { setOld(""); setNew(""); } });
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Профиль</h1>
      <Card>
        <div className="text-safe font-medium">{me?.email}</div>
        <div className="text-sm text-muted">Роль: {me?.role} · Тариф: {me?.tier}</div>
        {me && <div className="mt-1 text-xs text-muted">Источники данных: {me.flags.parsers_mode === "mock" ? "демо (mock)" : "КАД Арбитр и ЕФРСБ"}</div>}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">Тема</h2>
        <div className="flex gap-2">
          <Button variant={theme === "light" ? "primary" : "outline"} onClick={() => setTheme("light")}>Светлая</Button>
          <Button variant={theme === "dark" ? "primary" : "outline"} onClick={() => setTheme("dark")}>Тёмная</Button>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">Смена пароля</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); pw.mutate(); }}>
          <Field label="Текущий пароль"><Input type="password" value={oldP} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="Новый пароль (от 6 символов)"><Input type="password" value={newP} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" /></Field>
          {pw.error && <ErrorBox error={pw.error} />}
          {pw.isSuccess && <p className="text-sm text-success">Пароль изменён</p>}
          <Button type="submit" disabled={pw.isPending || newP.length < 6}>Сменить пароль</Button>
        </form>
      </Card>
      <Disclaimer also={["pd"]} />
    </div>
  );
}
