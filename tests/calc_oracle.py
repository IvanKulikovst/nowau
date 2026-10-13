"""Независимый эталон расчёта КРПД (точные дроби) и сверка с движком приложения.
Таблицы читаются из HTML; формулы и интерполяция реализованы заново по тексту ТЗ:
N = n × Q × T × (hт/12) × C1,  K = Qт/7000,  M = N/(КПД×K),  V = M/ρ; округление половина вверх."""
import json, re, sys, random
from fractions import Fraction as F

src = open(sys.argv[1], encoding='utf-8').read()
tent_block = re.search(r'const TENT_DATA = \{(.*?)\n\};', src, re.S).group(1)
TENT = {}
for key, body in re.findall(r'(\w+): \[\s*((?:\[[^\]]*\],?\s*)+)\]', tent_block):
    TENT[key] = [[int(x) for x in row.split(',')] for row in re.findall(r'\[([^\]]*)\]', body)]
DUG = [int(x) for x in re.search(r'const DUGOUT = \[([^\]]*)\]', src).group(1).split(',')]
BLDG = [int(x) for x in re.search(r'const BLDG = \[([^\]]*)\]', src).group(1).split(',')]
assert len(TENT) == 9 and all(len(t) == 11 and all(len(r) == 14 for r in t) for t in TENT.values())
assert len(DUG) == 59 and len(BLDG) == 20
TEMPS = [15, 10, 5, 0, -5, -10, -15, -20, -25, -30, -35, -40, -45, -50]

def lerp(x0, x1, y0, y1, x):
    return y0 if x1 == x0 else y0 + (y1 - y0) * F(x - x0, x1 - x0)

def tent_norm(key, t, w):  # кг у.т. за 12 ч на палатку
    tbl = TENT[key]
    # ближайшие узлы по температуре (шаг 5) и ветру (шаг 2)
    ti = max(i for i, tt in enumerate(TEMPS) if tt >= t); tj = min(ti + 1, 13) if TEMPS[ti] != t else ti
    wi = w // 2; wj = wi if w % 2 == 0 else wi + 1
    def at(r, c): return F(tbl[r][c], 100)
    a = lerp(TEMPS[ti], TEMPS[tj], at(wi, ti), at(wi, tj), t)
    b = lerp(TEMPS[ti], TEMPS[tj], at(wj, ti), at(wj, tj), t)
    return lerp(wi * 2, wj * 2, a, b, w)

def norm(rec):
    o, t = rec['object'], rec['tempC']
    c1 = F(1) if rec['tInC'] == 18 else F(rec['tInC'] - t, 18 - t)
    if o in TENT: return tent_norm(o, t, rec['windMs']) * rec['qty'] * rec['days'] * F(rec['heatH'], 12) * c1
    if o == 'dugout': return F(DUG[8 - t], 100) * F(rec['qty'], 100) * rec['days'] * c1
    if o == 'bldg':
        lo = t if (8 - t) % 2 == 0 else t + 1; hi = t if (8 - t) % 2 == 0 else t - 1
        n = lerp(lo, hi, F(BLDG[(8 - lo) // 2], 100), F(BLDG[(8 - hi) // 2], 100), t)
        return n * rec['qty'] * rec['days'] * c1
    return F(138 if o == 'wash_h' else 115, 1000) * rec['qty'] * rec['days']

def rnd(x, scale):  # округление половина вверх к 1/scale
    v = x * scale; return int((v.numerator * 2 + v.denominator) // (2 * v.denominator))

def expected(rec):
    N = norm(rec); kpd = F(rec['kpdBp'], 10000); K = F(rec['qt'], 7000)
    M = N / (kpd * K); V = M / rec['density']
    return {'nMilli': rnd(N, 1000), 'kMilli': rnd(K, 1000), 'massG': rnd(M, 1000), 'volL': rnd(V, 1000)}

def gen(n, seed=1):
    random.seed(seed); out = []
    objs = list(TENT) + ['dugout', 'bldg', 'wash_h', 'wash_s']
    for i in range(n):
        o = objs[i % len(objs)]
        r = {'id': 'case%05d' % i, 'title': 'т', 'date': '2026-01-01', 'object': o, 'updatedAt': '2026-01-01T00:00:00.000Z',
             'kpdBp': random.choice([7000, 4400, 100, 10000, random.randint(100, 10000)]),
             'density': random.choice([590, 100, 2000, random.randint(100, 2000)]),
             'qt': random.choice([1862, 500, 7000, random.randint(500, 7000)]),
             'days': random.choice([1, 7, 3660, random.randint(1, 3660)]), 'windMs': 0, 'heatH': 12, 'tInC': 18, 'tempC': 0}
        if o in TENT:
            r.update(tempC=random.randint(-50, 15), windMs=random.randint(0, 20), heatH=random.choice([12, 1, 24, random.randint(1, 24)]), qty=random.choice([1, random.randint(1, 1000)]))
        elif o == 'dugout': r.update(tempC=random.randint(-50, 8), qty=random.choice([1, 100, random.randint(1, 100000)]))
        elif o == 'bldg': r.update(tempC=random.randint(-30, 8), qty=random.randint(1, 25))
        else: r.update(qty=random.randint(1, 100000))
        if o not in ('wash_h', 'wash_s') and random.random() < 0.3: r['tInC'] = random.randint(r['tempC'], 30)
        out.append(r)
    return out

if __name__ == '__main__':
    mode = sys.argv[2]
    if mode == 'gen':
        json.dump(gen(int(sys.argv[3])), sys.stdout)
    elif mode == 'check':
        cases = json.load(open(sys.argv[3])); got = json.load(open(sys.argv[4]))
        bad = 0
        for rec, g in zip(cases, got):
            e = expected(rec)
            if not g.get('ok'):
                if e['massG'] <= 10**15: bad += 1; print('APP REJECTED', rec, g)
                continue
            gg = {k: int(g[k]) for k in e}
            if gg != e: bad += 1; print('MISMATCH', rec, 'app', gg, 'oracle', e) if bad < 20 else None
        print('cases', len(cases), 'mismatches', bad)
    elif mode == 'mono':
        for k, t in TENT.items():
            for r in range(11):
                for c in range(13):
                    if t[r][c + 1] <= t[r][c]: print('temp non-monotone', k, 'wind', r * 2, TEMPS[c], TEMPS[c + 1], t[r][c], t[r][c + 1])
            for c in range(14):
                for r in range(10):
                    if t[r + 1][c] < t[r][c]: print('wind non-monotone', k, 'col', TEMPS[c], 'wind', r * 2, '->', r * 2 + 2, t[r][c], t[r + 1][c])
            # выбросы: точка далеко от среднего соседей по строке
            for r in range(11):
                for c in range(1, 13):
                    mid = (t[r][c - 1] + t[r][c + 1]) / 2
                    if abs(t[r][c] - mid) > 0.08 * mid + 3: print('row outlier', k, 'wind', r * 2, 't', TEMPS[c], t[r][c - 1], t[r][c], t[r][c + 1])
            for c in range(14):
                for r in range(1, 10):
                    mid = (t[r - 1][c] + t[r + 1][c]) / 2
                    if abs(t[r][c] - mid) > 0.12 * mid + 3: print('col outlier', k, 't', TEMPS[c], 'wind', r * 2, t[r - 1][c], t[r][c], t[r + 1][c])
        for i in range(58):
            if DUG[i + 1] <= DUG[i]: print('dugout non-monotone', i)
        for i in range(19):
            if BLDG[i + 1] <= BLDG[i]: print('bldg non-monotone', i)
