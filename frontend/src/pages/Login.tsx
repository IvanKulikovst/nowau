import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Disclaimer } from "../components/Disclaimer";
import { Button, Card, ErrorBox, Input, Field } from "../components/ui";
import { api, setToken } from "../services/api";

export default function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (t) => { setToken(t.access_token); qc.invalidateQueries({ queryKey: ["me"] }); nav("/"); },
  });
  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">Вход</h1>
      <Card>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
          <Field label="Пароль"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          {m.error && <ErrorBox error={m.error} />}
          <Button type="submit" block disabled={m.isPending}>Войти</Button>
        </form>
        <p className="mt-4 text-sm text-muted">Нет аккаунта? <Link className="text-info" to="/register">Регистрация</Link></p>
      </Card>
      <Disclaimer />
    </div>
  );
}
