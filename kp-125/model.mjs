// Тепловая модель КП-125: одна ёмкость (вода в трёх котлах плюс сталь), подвод тепла от топлива и потери в воздух.
// КПД подобран так, чтобы время закипания совпадало с паспортным: ~60 мин на жидком топливе и ~87 мин на дровах.
const WATER_KG = 100 + 50 + 100;
const STEEL_KG = 160;
const C = WATER_KG * 4.19 + STEEL_KG * 0.5; // кДж/К
const LOSS = 0.15; // кВт/К, потери стенками блока и крышками
const T_AIR = 15;
const T_BOIL = 100;
const LATENT = 2257; // кДж/кг

const FUELS = {
  liquid: { name: "дизтопливо", lhv: 42700, nominal: 8.5, min: 2, max: 10, boilMin: 60 },
  solid: { name: "дрова", lhv: 15000, nominal: 30, min: 10, max: 32, boilMin: 87 },
};

// T(t) = Tair + (P/k)(1 − e^(−k t / C)); найти P для закипания за boilMin, затем η = P / (ṁ·LHV)
for (const fuel of Object.values(FUELS)) {
  const t = fuel.boilMin * 60;
  const powerKw = ((T_BOIL - T_AIR) * LOSS) / (1 - Math.exp((-LOSS * t) / C));
  fuel.eta = powerKw / ((fuel.nominal * fuel.lhv) / 3600);
}

export const MODEL = { C, LOSS, T_AIR, T_BOIL, LATENT, FUELS, SPEED: 120 };

// шаг модели: dt в секундах реального времени кухни
export function stepHeat(state, fuel, rateKgH, dt) {
  const f = FUELS[fuel];
  const power = (f.eta * rateKgH * f.lhv) / 3600;
  const loss = LOSS * (state.T - T_AIR);
  if (state.T >= T_BOIL - 1e-6 && power > loss) {
    state.T = T_BOIL;
    state.steam = ((power - loss) / LATENT) * 3600;
  } else {
    state.T = Math.min(T_BOIL, state.T + ((power - loss) / C) * dt);
    state.steam = 0;
  }
  return state;
}
