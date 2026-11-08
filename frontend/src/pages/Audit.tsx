import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AnalysisShell } from "../components/AnalysisShell";
import { Disclaimer } from "../components/Disclaimer";
import { Button, Card, ErrorBox, Spinner } from "../components/ui";
import { api } from "../services/api";
import { pct } from "../services/format";

function download(name: string, mime: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function Audit() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["audit", id], queryFn: () => api.audit(id) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const a = q.data;
  const p = a.probabilities;
  return (
    <AnalysisShell title="Аудит расчёта">
      <Card>
        <h2 className="mb-2 text-lg font-medium">Формулы</h2>
        <p className="mb-2 text-sm text-muted">Метод: {a.method === "probabilistic" ? "вероятностный" : a.method === "scenario" ? "сценарный" : "точный"} · {a.formula}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-bg p-3 text-sm text-safe tabular-nums">{a.formulas.join("\n")}</pre>
      </Card>
      <Card className="mt-4">
        <h2 className="mb-2 text-lg font-medium">Вероятности</h2>
        <p className="text-sm text-muted">p_итог = clamp(p_база + Δ_практика + Δ_АУ, 0, 1)</p>
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm md:grid-cols-5">
          {[["p_sub", p.p_sub], ["p_ch", p.p_ch], ["p_zero", p.p_zero], ["Δ практика", p.delta_practice], ["Δ АУ", p.delta_au]].map(([k, v]) => (
            <div key={k as string}><dt className="text-muted">{k}</dt><dd className="amount font-medium">{(v as number).toFixed(2).replace(".", ",")}</dd></div>
          ))}
        </dl>
      </Card>
      <Card className="mt-4">
        <h2 className="mb-2 text-lg font-medium">Анализ судебной практики</h2>
        {a.judge ? (
          <ul className="space-y-1 text-sm">
            <li className="text-safe">{a.judge.name}</li>
            <li>N = <span className="amount">{a.judge.n_cases}</span> дел · доля удовлетворённых: <span className="amount">{pct(a.judge.approval_rate)}</span></li>
            {a.judge_delta.deviation != null && <li>Отклонение от средней по суду: <span className="amount">{(a.judge_delta.deviation * 100).toFixed(0)} п.п.</span></li>}
            <li className="text-muted">{a.judge_delta.note}</li>
          </ul>
        ) : <p className="text-sm text-muted">Судья не определён.</p>}
      </Card>
      <Card className="mt-4">
        <h2 className="mb-2 text-lg font-medium">Уровни полноты данных</h2>
        <div className="grid grid-cols-4 gap-2 text-sm md:grid-cols-7">
          {Object.entries(a.information_levels).map(([k, v]) => <div key={k} className="rounded-md bg-bg p-2 text-center"><div className="text-muted">{k}</div><div className="font-medium">{v}/5</div></div>)}
        </div>
      </Card>
      {a.assumptions.length > 0 && <Card className="mt-4"><h2 className="mb-2 text-lg font-medium">Допущения</h2><ul className="list-disc space-y-1 pl-5 text-sm text-safe">{a.assumptions.map((x) => <li key={x}>{x}</li>)}</ul></Card>}
      <Card className="mt-4">
        <h2 className="mb-2 text-lg font-medium">Источники</h2>
        <ul className="space-y-1 text-sm">{a.sources.map((s) => <li key={s.url}><a className="text-info" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
      </Card>
      <div className="mt-4 flex flex-col gap-2 md:flex-row">
        <Button block variant="outline" onClick={() => window.print()}>Экспорт PDF</Button>
        <Button block variant="outline" onClick={() => download(`analysis-${id}.json`, "application/json", JSON.stringify(a, null, 2))}>Экспорт JSON</Button>
      </div>
      <Disclaimer also={["practice", "au", "pd", "fee", "criminal"]} />
    </AnalysisShell>
  );
}
