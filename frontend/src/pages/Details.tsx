import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckSquare, Square } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useParams } from "react-router-dom";
import { AnalysisShell } from "../components/AnalysisShell";
import { Disclaimer } from "../components/Disclaimer";
import { Badge, Card, ErrorBox, Spinner } from "../components/ui";
import { api } from "../services/api";
import { SCENARIO_COLORS, mln, pct, rub } from "../services/format";

export default function Details() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["details", id], queryFn: () => api.details(id) });
  const [done, setDone] = useState<Record<string, boolean>>({});
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const d = q.data;
  const chart = d.scenarios.map((s) => ({ ...s, label: s.title, p: Math.round(s.probability * 100) }));

  return (
    <AnalysisShell title="Детали расчёта">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Сценарии</h2>
        <Card>
          <div className="h-56" aria-hidden>
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" domain={[0, 100]} unit="%" stroke="var(--color-text-muted)" fontSize={12} />
                <YAxis type="category" dataKey="label" width={120} stroke="var(--color-text-muted)" fontSize={11} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="p" radius={4}>{chart.map((s) => <Cell key={s.name} fill={SCENARIO_COLORS[s.name]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {d.scenarios.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 text-safe">{s.title}</span>
                <span className="amount shrink-0 text-muted">{pct(s.probability)}</span>
                <span className="amount w-24 shrink-0 text-right font-medium">{mln(s.payout_rub)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">Приоритеты</h2>
        <ol className="list-decimal space-y-1 pl-5">{d.priorities.map((p) => <li key={p} className="text-safe">{p}</li>)}</ol>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-medium">Анализ судебной практики</h2>
          {d.judge ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-safe">{d.judge.name}</div>
              <div className="text-muted">Дел: <span className="amount">{d.judge.n_cases}</span> · доля удовлетворённых: <span className="amount">{pct(d.judge.approval_rate)}</span></div>
              <Badge tone={d.judge.is_significant ? "success" : "warning"}>{d.judge.is_significant ? "статистически значимо" : "статистически незначимо"}</Badge>
            </div>
          ) : <p className="text-sm text-muted">Судья ещё не определён — используется статистика суда.</p>}
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-medium">Признаки аффилированности АУ, требующие проверки</h2>
          {d.au ? <div className="text-sm"><div className="font-medium text-safe">{d.au.name}, {d.au.sro}</div></div> : <p className="text-sm text-muted">Арбитражный управляющий не назначен.</p>}
          <div className="mt-2 text-sm text-muted">Баллы: <span className="amount font-medium text-fg">{d.au_index.score}</span> / 100 (флаг при &gt; 60)</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-safe">{d.au_index.items.map((i) => <li key={i.label}>{i.label} (+{i.points})</li>)}</ul>
          {d.au_index.critical && <Badge tone="danger">Критический флаг — требуется судебная проверка</Badge>}
        </Card>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">Стоимость действий</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {d.actions.map((a) => (
            <Card key={a.key}>
              <div className="flex items-start justify-between gap-2"><div className="font-medium text-safe">{a.title}</div>
                {a.expected_gain_rub != null && <Badge tone={a.economically_justified ? "success" : "warning"}>{a.economically_justified ? "оправдано" : "не оправдано"}</Badge>}</div>
              <p className="mt-1 text-sm text-muted text-safe">{a.reason}</p>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted">Госпошлина</dt><dd className="amount text-right">{rub(a.fee_rub)}</dd>
                <dt className="text-muted">Юристы</dt><dd className="amount text-right">{Math.round(a.lawyers_rub[0] / 1000)}–{Math.round(a.lawyers_rub[1] / 1000)} тыс. ₽</dd>
                <dt className="text-muted">Срок</dt><dd className="text-right">{a.months} мес.</dd>
                {a.expected_gain_rub != null && (<><dt className="text-muted">Прирост</dt><dd className="amount text-right font-medium">{rub(a.expected_gain_rub)}</dd></>)}
              </dl>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-medium">Чек-лист</h2>
          <ul className="space-y-2">
            {d.checklist.map((c) => (
              <li key={c}><button className="flex w-full items-start gap-2 text-left text-sm" onClick={() => setDone({ ...done, [c]: !done[c] })} aria-pressed={!!done[c]}>
                {done[c] ? <CheckSquare size={18} className="mt-0.5 shrink-0 text-success" /> : <Square size={18} className="mt-0.5 shrink-0 text-muted" />}
                <span className={done[c] ? "text-muted line-through text-safe" : "text-safe"}>{c}</span></button></li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-medium">Календарь</h2>
          <ul className="space-y-2 text-sm">
            {d.calendar.map((c) => <li key={c.title} className="flex gap-2"><Calendar size={16} className="mt-0.5 shrink-0 text-muted" /><span className="text-safe">{c.date ? new Date(c.date).toLocaleDateString("ru-RU") + " — " : ""}{c.title}</span></li>)}
          </ul>
        </Card>
      </section>
      <Disclaimer also={["practice", "au", "fee", "criminal"]} />
    </AnalysisShell>
  );
}
