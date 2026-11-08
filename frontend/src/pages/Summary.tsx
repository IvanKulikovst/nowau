import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnalysisShell } from "../components/AnalysisShell";
import { Disclaimer } from "../components/Disclaimer";
import { Traffic } from "../components/Traffic";
import { Badge, Button, Card, ErrorBox, Select, Spinner } from "../components/ui";
import { api } from "../services/api";
import { MODE_NAMES, QUEUE_NAMES, pct, rub } from "../services/format";

export default function Summary() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["summary", id], queryFn: () => api.summary(id) });
  const setMode = useMutation({
    mutationFn: (mode: string) => api.setMode(q.data!.case_id!, mode),
    onSuccess: (s) => { qc.setQueryData(["summary", String(s.id)], s); nav(`/analysis/${s.id}`); },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const s = q.data;
  const title = s.case?.number ? `Дело ${s.case.number}` : s.case?.inn ? `Должник ИНН ${s.case.inn}` : "Результат анализа";

  return (
    <AnalysisShell title={title}>
      {s.demo_data && <Banner tone="info">Демонстрационные данные: источники КАД/ЕФРСБ работают в режиме mock. Для реального анализа включите PARSERS_MODE=live.</Banner>}
      {s.manual_data && <Banner tone="info">Часть данных введена вручную и не проверена системой.</Banner>}
      {s.status === "partial" && <Banner tone="warn">Часть источников недоступна{s.manual_input_required ? " — требуется ручной ввод" : ""}: {s.warnings.join("; ")}</Banner>}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="info">{MODE_NAMES[s.mode]}</Badge>
        <Badge>{QUEUE_NAMES[s.queue] ?? s.queue}</Badge>
        <span className="amount text-muted">Ваше требование: {rub(s.claim_amount + s.executed_amount)}</span>
      </div>

      {/* Мобильный порядок: рекомендация → выплата → риски. Десктоп: выплата → риски → рекомендация */}
      <div className="flex flex-col gap-4">
        <Card className="order-2 md:order-1">
          <div className="text-sm text-muted">Ожидаемая выплата · {s.probabilistic_label}</div>
          <div className="amount mt-1 text-3xl font-semibold">{rub(s.expected_amount)} <span className="text-xl text-muted">({pct(s.expected_pct)})</span></div>
          <div className="mt-1 text-sm text-muted">Диапазон: {pct(s.range_low_pct)} — {pct(s.range_high_pct)} · {rub(s.range_low)} — {rub(s.range_high)}</div>
          {s.confidence === "low" && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />Вероятностный прогноз: данных мало, диапазон расширен (25–75%).
            </div>
          )}
        </Card>
        <div className="order-3 md:order-2"><div className="mb-2 font-medium">Риски</div><Traffic risks={s.risks} /></div>
        {s.recommendation && (
          <Card className="order-1 md:order-3 border-info/40">
            <div className="text-sm text-muted">Рекомендация</div>
            <div className="mt-1 text-lg font-medium text-safe">{s.recommendation.title}</div>
            <p className="mt-1 text-muted text-safe">{s.recommendation.reason}</p>
            <Link to={`/analysis/${id}/details`}><Button className="mt-4" block>Что делать →</Button></Link>
          </Card>
        )}
      </div>

      {s.assumptions.length > 0 && (
        <details className="mt-6 text-sm text-muted">
          <summary className="cursor-pointer">Допущения расчёта ({s.assumptions.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{s.assumptions.map((a) => <li key={a} className="text-safe">{a}</li>)}</ul>
        </details>
      )}

      {s.case_id && (
        <div className="mt-6 max-w-sm">
          <label className="mb-1 block text-sm text-muted" htmlFor="mode">Режим (определён автоматически: {MODE_NAMES[s.auto_mode.mode]})</label>
          <Select id="mode" value={s.mode} onChange={(e) => setMode.mutate(e.target.value)} disabled={setMode.isPending}>
            {Object.entries(MODE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {(s.mode_manual || setMode.data) && <p className="mt-2 text-xs text-warning">Вы выбрали режим вручную. Автоматический расчёт может отличаться. Убедитесь, что данные актуальны.</p>}
        </div>
      )}
      <Disclaimer also={["fee", "ads"]} />
    </AnalysisShell>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return <div role="note" className={`mb-4 rounded-md p-3 text-sm text-safe ${tone === "info" ? "bg-info/10 text-info" : "bg-warning/10 text-warning"}`}>{children}</div>;
}
