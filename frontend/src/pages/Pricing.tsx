import { useQuery } from "@tanstack/react-query";
import { Disclaimer } from "../components/Disclaimer";
import { Card } from "../components/ui";
import { api } from "../services/api";
import { useMe } from "../hooks/useAuth";

const PLANS = [
  ["Сводка", "Бесплатно", "Светофор, диапазон выплаты, одно действие"],
  ["Детали", "Подписка", "Сценарии, профиль АУ, пороги, стоимость действий"],
  ["Аудит", "Премиум", "Формулы, доверительные интервалы, ссылки на акты, выгрузка"],
];

export default function Pricing() {
  const { data: me } = useMe();
  const sub = useQuery({ queryKey: ["sub"], queryFn: api.subscription });
  const disabled = me ? !me.flags.billing_enabled : true;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Тарифы</h1>
      {disabled && <Card className="mb-4" role="status"><div className="text-lg font-medium">Оплата скоро</div><p className="text-sm text-muted">В версии 1.0 все функции доступны без оплаты (тариф «{sub.data?.tier ?? "admin"}»).</p></Card>}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map(([n, price, d]) => (
          <Card key={n}><div className="text-lg font-medium">{n}</div><div className="text-muted">{price}</div><p className="mt-2 text-sm text-safe">{d}</p></Card>
        ))}
      </div>
      <Disclaimer also={["ads"]} />
    </div>
  );
}
