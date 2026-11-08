const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const rub = (n: number | null | undefined) => (n == null ? "—" : `${nf.format(Math.round(n))} ₽`);
export const pct = (p: number | null | undefined, digits = 0) =>
  p == null ? "—" : `${(p * 100).toFixed(digits).replace(".", ",")}%`;
export const mln = (n: number) => `${(n / 1e6).toFixed(1).replace(".", ",")} млн`;

export const MODE_NAMES: Record<string, string> = {
  P0: "Р0 · До сделки", P1: "Р1 · Сделка заключена", P2: "Р2 · Признаки кризиса",
  P3: "Р3 · Заявление подано", P4: "Р4 · Судья и АУ известны", P5: "Р5 · Реестр закрыт", P6: "Р6 · Торги",
};
export const QUEUE_NAMES: Record<string, string> = {
  current: "Текущие платежи (вне очереди)", secured: "Залоговый кредитор", third: "Третья очередь",
  third_subordinated: "Третья очередь, риск субординации",
};
export const SCENARIO_COLORS: Record<string, string> = {
  base: "var(--color-success)", challenged: "var(--color-warning)", subordinated: "var(--color-danger)",
  subordinated_after_ch: "#9333ea", zero: "var(--color-text-muted)",
};
