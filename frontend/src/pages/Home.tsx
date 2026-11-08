import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Disclaimer } from "../components/Disclaimer";
import { Button, Card, ErrorBox, Input, Field, Select } from "../components/ui";
import { api, type AnalyzeBody } from "../services/api";

const CONSTR = [["supply", "Поставка / услуги"], ["loan", "Заём"], ["pledge", "Залог"], ["surety", "Поручительство"],
  ["guarantee", "Независимая гарантия"], ["escrow", "Эскроу"], ["title", "Сохранение права собственности"],
  ["penalty", "Неустойка"], ["deposit", "Задаток"]];

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const [f, setF] = useState({ amount: "", executed: "", execDate: "", construction: "supply", status: "independent", credit: false });
  const m = useMutation({
    mutationFn: (b: AnalyzeBody) => api.analyze(b),
    onSuccess: (s) => nav(`/analysis/${s.id}`),
  });
  const digits = q.replace(/\s/g, "");
  const valid = /^(\d{10}|\d{12})$/.test(digits) || /^[АA]\d{2}-\d+\/\d{4}$/i.test(q.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const isInn = /^\d{10,12}$/.test(digits);
    const claim = {
      amount: f.amount ? Number(f.amount) : undefined,
      executed_amount: f.executed ? Number(f.executed) : undefined,
      execution_date: f.execDate || undefined,
      construction_type: f.construction, status: f.status,
    };
    m.mutate({ ...(isInn ? { inn: digits } : { case_number: q.trim() }), claim });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold">Профиль кредитора</h1>
      <p className="mt-2 text-muted">Узнайте, сколько вы получите при банкротстве должника</p>
      <Card className="mt-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="ИНН должника или номер дела"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="7701234567 или А40-12345/2025" inputMode="text" aria-label="ИНН или номер дела" autoFocus /></Field>
          <button type="button" className="text-sm text-info" onClick={() => setMore(!more)} aria-expanded={more}>
            {more ? "Скрыть параметры требования" : "Указать параметры вашего требования (точнее прогноз)"}
          </button>
          {more && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Сумма требования (неоплаченный остаток), ₽"><Input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="10000000" /></Field>
              <Field label="Тип конструкции"><Select value={f.construction} onChange={(e) => setF({ ...f, construction: e.target.value })}>{CONSTR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Получено исполнение, ₽"><Input type="number" min="0" value={f.executed} onChange={(e) => setF({ ...f, executed: e.target.value })} placeholder="2000000" /></Field>
              <Field label="Дата исполнения"><Input type="date" value={f.execDate} onChange={(e) => setF({ ...f, execDate: e.target.value })} /></Field>
              <Field label="Связь с должником"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                  <option value="independent">Независимый кредитор</option><option value="affiliated">Аффилированное лицо</option><option value="kdl">Контролирующее лицо (КДЛ)</option>
                </Select></Field>
            </div>
          )}
          {m.error && <ErrorBox error={m.error} />}
          <Button type="submit" block disabled={!valid || m.isPending}>{m.isPending ? "Считаем…" : "Рассчитать →"}</Button>
          {q && !valid && <p className="text-xs text-muted">Введите ИНН (10 или 12 цифр) или номер дела вида А40-12345/2025</p>}
        </form>
      </Card>
      <div className="mt-6">
        <div className="mb-2 font-medium">Что вы узнаете:</div>
        <ul className="space-y-1.5 text-muted">
          {["Очередь и приоритет", "Риски оспаривания и субординации", "Ожидаемую выплату в рублях", "Рекомендации и стоимость действий"].map((t) => (
            <li key={t} className="flex items-center gap-2"><Check size={16} className="text-success" />{t}</li>
          ))}
        </ul>
      </div>
      <Disclaimer also={["ads"]} />
    </div>
  );
}
