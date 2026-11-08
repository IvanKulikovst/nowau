import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Disclaimer } from "../components/Disclaimer";
import { Badge, Card, ErrorBox, Spinner } from "../components/ui";
import { api } from "../services/api";
import { MODE_NAMES, pct, rub } from "../services/format";

export default function Cases() {
  const q = useQuery({ queryKey: ["analyses"], queryFn: api.analyses });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Мои дела</h1>
      {q.data?.length === 0 && <p className="text-muted">Анализов пока нет. <Link className="text-info" to="/">Рассчитать</Link></p>}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {q.data?.map((a) => (
          <Link key={a.id} to={`/analysis/${a.id}`}>
            <Card className="h-full hover:bg-surface2">
              <div className="line-clamp-1 font-medium">{a.case?.number ?? a.case?.debtor ?? `Анализ №${a.id}`}</div>
              <div className="mt-1"><Badge tone="info">{MODE_NAMES[a.mode]}</Badge></div>
              <div className="amount mt-2 text-lg">{rub(a.expected_amount)} <span className="text-muted">({pct(a.expected_pct)})</span></div>
            </Card>
          </Link>
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}
