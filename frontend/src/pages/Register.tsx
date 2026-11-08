import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Disclaimer } from "../components/Disclaimer";
import { Button, Card, ErrorBox, Input, Field } from "../components/ui";
import { api, setToken } from "../services/api";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => api.register(email, password),
    onSuccess: (t) => { setToken(t.access_token); nav("/"); },
  });
  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">Регистрация</h1>
      <Card>
        {/* При PUBLIC_SIGNUP=false бэкенд ответит 403 «Регистрация временно недоступна» — показываем как есть */}
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Пароль"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          {m.error && <ErrorBox error={m.error} />}
          <Button type="submit" block disabled={m.isPending}>Зарегистрироваться</Button>
        </form>
        <p className="mt-4 text-sm text-muted">Уже есть аккаунт? <Link className="text-info" to="/login">Войти</Link></p>
      </Card>
      <Disclaimer />
    </div>
  );
}
