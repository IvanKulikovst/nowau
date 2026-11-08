import { Disclaimer } from "../components/Disclaimer";

export default function Notifications() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Уведомления</h1>
      <p className="text-muted">Уведомлений пока нет. Критические изменения вероятностей (&gt; 0,15 или пересечение порога) появятся здесь; email-рассылка в версии 1.0 отключена (mock).</p>
      <Disclaimer />
    </div>
  );
}
