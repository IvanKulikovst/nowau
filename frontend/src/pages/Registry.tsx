import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AnalysisShell } from "../components/AnalysisShell";
import { Disclaimer } from "../components/Disclaimer";
import { Badge, Card, ErrorBox, Spinner } from "../components/ui";
import { api } from "../services/api";
import { pct, rub } from "../services/format";

export default function Registry() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["registry", id], queryFn: () => api.registry(id) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const r = q.data;
  return (
    <AnalysisShell title="Реестр требований">
      {!r.available ? <Card className="text-muted">{r.note}</Card> : (
        <>
          {r.demo_data && <p className="mb-3 text-sm text-info">Демонстрационные данные: строки других кредиторов — оценка по Σ3.</p>}
          {/* Десктоп/планшет — таблица, мобильный — карточки */}
          <table className="hidden w-full table-fixed text-sm md:table">
            <thead><tr className="border-b border-border text-left text-muted">
              <th className="w-1/3 py-2">Кредитор</th><th className="text-right">Сумма</th><th className="text-right">Доля</th><th className="text-right">p_ch</th><th className="pl-4">Действие</th></tr></thead>
            <tbody>{r.rows.map((x) => (
              <tr key={x.name} className="border-b border-border">
                <td className="table-cell py-2 font-medium">{x.name}</td><td className="amount text-right">{rub(x.amount)}</td>
                <td className="amount text-right">{pct(x.share, 1)}</td><td className="amount text-right">{x.p_ch.toFixed(2).replace(".", ",")}</td>
                <td className="pl-4">{x.challenge_candidate ? <Badge tone="warning">П4: рассмотреть оспаривание</Badge> : x.own ? <Badge tone="info">ваше требование</Badge> : "—"}</td>
              </tr>))}</tbody>
          </table>
          <div className="space-y-3 md:hidden">{r.rows.map((x) => (
            <Card key={x.name}><div className="flex justify-between"><span className="font-medium">{x.name}</span><span className="amount">{rub(x.amount)}</span></div>
              <div className="mt-1 text-sm text-muted">Доля {pct(x.share, 1)} · p_ch {x.p_ch.toFixed(2).replace(".", ",")}</div>
              {x.challenge_candidate && <Badge tone="warning">П4: рассмотреть оспаривание</Badge>}</Card>))}</div>
        </>
      )}
      <Disclaimer />
    </AnalysisShell>
  );
}
