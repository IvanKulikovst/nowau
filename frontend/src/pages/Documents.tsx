import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnalysisShell } from "../components/AnalysisShell";
import { Disclaimer } from "../components/Disclaimer";
import { Badge, Button, Card, ErrorBox, Spinner } from "../components/ui";
import { api, type DocStatus } from "../services/api";

const TYPE_NAMES: Record<string, string> = { supply: "Договор поставки", loan: "Договор займа", pledge: "Договор залога",
  payment: "Платёжный документ", act: "Акт / накладная", claim_letter: "Претензия", other: "Документ" };

function DocCard({ id }: { id: number }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["doc", id], queryFn: () => api.docStatus(id) });
  const confirm = useMutation({
    mutationFn: () => api.confirmFacts(id),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["doc", id] }); if (r.analysis_id) nav(`/analysis/${r.analysis_id}`); },
  });
  const d = q.data as DocStatus | undefined;
  if (!d) return null;
  const pending = d.facts.some((f) => !f.confirmed);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2"><div className="font-medium">{TYPE_NAMES[d.document_type] ?? d.document_type}</div><Badge tone={d.status === "processed" ? "success" : "warning"}>{d.status}</Badge></div>
      {d.facts.length === 0 ? <p className="mt-2 text-sm text-muted">Факты не извлечены (возможно, нет текста или OCR недоступен).</p> : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {d.facts.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-muted">{f.field}</span><span className="min-w-0 flex-1 text-right text-safe">{f.value}</span>
              <Badge tone={f.confirmed ? "success" : "warning"}>{f.label}</Badge>
            </li>))}
        </ul>
      )}
      {pending && <Button className="mt-3" block onClick={() => confirm.mutate()} disabled={confirm.isPending}>Подтверждаю факты</Button>}
      {pending && <p className="mt-2 text-xs text-muted">Пока факты не подтверждены, расчёт использует консервативные допущения.</p>}
    </Card>
  );
}

export default function Documents() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<unknown>(null);
  const s = useQuery({ queryKey: ["summary", id], queryFn: () => api.summary(id) });
  const claimId = s.data?.claim_id;
  const list = useQuery({ queryKey: ["docs", claimId], queryFn: () => api.documents(claimId!), enabled: !!claimId });
  const up = useMutation({
    mutationFn: (f: File) => api.upload(claimId!, f),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ["docs", claimId] }); },
    onError: setErr,
  });
  if (s.isLoading) return <Spinner />;
  if (s.error) return <ErrorBox error={s.error} />;
  return (
    <AnalysisShell title="Документы">
      <Card>
        <p className="mb-3 text-sm text-muted">PDF, DOCX, JPG, PNG до 20 МБ. Система извлечёт даты, суммы и условия; вы подтвердите факты вручную. Фактическая аффилированность и осведомлённость определяются только экспертно.</p>
        <input ref={input} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ""; }} />
        <Button block onClick={() => input.current?.click()} disabled={up.isPending}><Upload size={16} />{up.isPending ? "Обработка…" : "Загрузить документ"}</Button>
        {!!err && <div className="mt-3"><ErrorBox error={err} /></div>}
      </Card>
      <div className="mt-4 space-y-4">{list.data?.map((d) => <DocCard key={d.id} id={d.id} />)}</div>
      {list.data?.length === 0 && <p className="mt-4 text-sm text-muted">Документы пока не загружены.</p>}
      <Disclaimer also={["pd"]} />
    </AnalysisShell>
  );
}

/** /documents — выбор анализа, к которому относятся документы */
export function DocumentsIndex() {
  const q = useQuery({ queryKey: ["analyses"], queryFn: api.analyses });
  if (q.isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Документы</h1>
      <p className="mb-4 text-muted">Выберите анализ, к которому нужно загрузить документы.</p>
      <div className="space-y-2">{q.data?.map((a) => <Link key={a.id} to={`/analysis/${a.id}/documents`} className="block rounded-md border border-border bg-surface p-3 hover:bg-surface2 text-safe">Анализ №{a.id} — {a.case?.number ?? a.case?.debtor ?? "без дела"}</Link>)}</div>
      {q.data?.length === 0 && <p className="text-muted">Сначала выполните анализ на главной.</p>}
      <Disclaimer />
    </div>
  );
}
