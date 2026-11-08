import { Disclaimer } from "../components/Disclaimer";
import { Card } from "../components/ui";

const DOCS: Record<string, [string, string]> = {
  terms: ["Условия использования", "Заглушка. Полный текст пользовательского соглашения будет опубликован к запуску версии 2.0. Сервис носит информационно-аналитический характер и не является юридической услугой."],
  privacy: ["Политика конфиденциальности", "Заглушка. Сервис обрабатывает только общедоступные персональные данные (ст. 8 152-ФЗ). Вы вправе потребовать уточнения или удаления данных (ст. 14). Полная политика будет опубликована к версии 2.0."],
  offer: ["Публичная оферта", "Заглушка. Условия оказания платных услуг будут опубликованы при включении оплаты (BILLING_ENABLED=true)."],
};

export default function Legal({ kind }: { kind: "terms" | "privacy" | "offer" }) {
  const [title, text] = DOCS[kind];
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-0">
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      <Card><p className="text-safe">{text}</p></Card>
      <Disclaimer also={["pd"]} />
    </div>
  );
}
