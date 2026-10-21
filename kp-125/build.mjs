// Изометрическая фигура «Анатомия КП-125», собрана набором anatomy (kit/ из скилла).
// node kp-125/build.mjs [--light] [--audit]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = process.env.ANATOMY ?? join(homedir(), ".claude", "skills", "anatomy");
const kitUrl = (file) => pathToFileURL(join(SKILL, file)).href;
const k = await import(kitUrl("kit/iso-kit.mjs"));
const G = await import(kitUrl("kit/lathe.mjs"));
const { tubePieces, tubeSvg } = await import(kitUrl("kit/tube.mjs"));
const A = await import(kitUrl("kit/audit.mjs"));
const { glCamera } = await import(kitUrl("kit/gl.mjs"));
const { kitScript, glScript } = await import(kitUrl("scripts/inline-kit.mjs"));
const { MODEL } = await import(pathToFileURL(join(HERE, "model.mjs")).href);

const THEME = process.argv.includes("--light") ? "light" : "dark";
const W = 720;
const H = 560;

// Мир: 1 единица = 1 см. x вдоль прицепа (дышло в −x), y поперёк (ближний борт +y), z вверх.
const PAD = { x: -366, y: -100, w: 518, d: 200, r: 4 };
const PAD_H = 8;
const AXLE_Z = 42;
const WHEEL_Y = 84;
const TYRE_R = 42;
const FRAME_Z = [56, 64];
const BLOCK = { x0: -96, x1: 126, y0: -62, y1: 62, z0: 64, z1: 138, r: 26 };
const WALL_T = 3;
const FLOOR_Z = 68;
const CAP_T = 22;
const BAND_Z = 120;
const WINDOW = { x0: BLOCK.x0 + CAP_T, x1: BLOCK.x1 - CAP_T - 4, z0: FLOOR_Z, z1: BAND_Z };
const DECK_Z = BLOCK.z1;
const KETTLES = [
  { id: "k1", x: -46, r: 28, bottom: 96 },
  { id: "k2", x: 10, r: 21, bottom: 100 },
  { id: "k3", x: 66, r: 28, bottom: 96 },
];
const CAB = { x0: -152, x1: BLOCK.x0, y0: -56, y1: 56, z0: FRAME_Z[1], z1: 166 };
const CAB_CUT = { x0: CAB.x0 + 4, x1: CAB.x1 - 4, z0: CAB.z0 + 6, z1: 146 };
const BURNERS = [-24, 14].map((y) => ({ y, z: 84 }));
const CHIMNEY = { x: 104, y: -40, r: 9, z0: DECK_Z, z1: 238, cap: 252 };
const ROOF = { x0: -100, x1: 86, y0: -70, y1: 70, z: 222, t: 5 };
const SPARE = { x: -222, y: 0, z: 80, r: 40 };
const DRAW = { x0: -150, x1: -346, z: 58, r: 4.2 };

const P = k.fitProjection(
  [...k.boxCorners(PAD, -PAD_H, 0), [ROOF.x0, ROOF.y0, ROOF.z + 6], [ROOF.x1, ROOF.y1, ROOF.z + 6], [CHIMNEY.x, CHIMNEY.y, CHIMNEY.cap + 44]],
  W,
  H,
  { pad: 22, azimuth: 112, elevation: 27 },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const AX = [1, 0, 0];
const AY = [0, 1, 0];
const AZ = [0, 0, 1];
const vertical = (x, y, z = 0) => G.frameOf([x, y, z], AZ, AX, AY);
const alongY = (x, y, z) => G.frameOf([x, y, z], AY, [0, 0, 1], AX);
const alongX = (x, y, z) => G.frameOf([x, y, z], AX, AY, AZ);

// ---------- recorder for the sorted front layer ----------
const R = A.recorder(P);
const record = R.solid;
// «under»: всё, что под днищем блока и за ним; рисуется до топки, чтобы вырез его не показывал
let LAYER = "front";
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "kp", layer: LAYER, ...rest });
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.4, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, attrs } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, steps, rims, bevel = 0, owner, attrs, seated, cut, annulus = false } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(steps ? { steps } : {}), ...(rims ? { rims } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(annulus ? A.body(F, profile.map(([a, b]) => [a, b]), { name, owner }) : A.solid(F, profile, { name, owner, seated, cut }));
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ringPart(name, F, s0, s1, rIn, rOut, style = {}, { extra = "", bias = 0, owner } = {}) {
  const shape = record(A.ring(F, s0, s1, rIn, rOut, { name, owner }));
  put(name, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.ringBand(s0, s1, rIn, rOut, F, P), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function prism(name, F, poly, s0, s1, style = {}, { extra = "", bias = 0 } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, centre, S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function ball(name, c, r, style = {}, { bias = 0, owner } = {}) {
  const shape = record(A.ball(c, r, { name, owner }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 32 }), { tone: "mid", ...style }), [shape], { bias });
  return shape;
}
const PIPES = [];
function pipe(name, points, r, { tone = "mid", bend = 3, ends = [true, true], maxLength = 14, bias = 0.05, gaps = [], limp = false, rings } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  R.route(name, route, r, { gaps, limp, piece: "kp" });
  PIPES.push(name);
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), gaps, ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias, route: name, chunk: index }),
  );
  return route;
}


const signed = (poly) => poly.reduce((a, [x, y], i) => {
  const [x2, y2] = poly[(i + 1) % poly.length];
  return a + x * y2 - x2 * y;
}, 0);
const screenOriented = (pts) => (signed(pts) < 0 ? [...pts].reverse() : pts);
function flagRuns(flags, want) {
  const count = flags.length;
  const runs = [];
  const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
  if (start < 0) return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
  let run = null;
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (flags[index] === want) {
      if (!run) run = [index];
      run.push((index + 1) % count);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}
// призма любого (и вогнутого) контура: гнутый лист крыла
function bentPaths(F, poly, s0, s1) {
  const ring = signed(poly) > 0 ? poly : [...poly].reverse();
  const n = ring.length;
  const W3 = (s, [x, y]) => G.add3(G.add3(G.add3(F.o, G.mul3(F.a, s)), G.mul3(F.u, x)), G.mul3(F.v, y));
  const capNear = G.dot3(F.a, V) > 0;
  const [nearS, farS] = capNear ? [s1, s0] : [s0, s1];
  const near = ring.map((p) => at(W3(nearS, p)));
  const far = ring.map((p) => at(W3(farS, p)));
  const normals = ring.map(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % n];
    return G.unit3(G.add3(G.mul3(F.u, y1 - y0), G.mul3(F.v, -(x1 - x0))));
  });
  const facing = normals.map((m) => G.dot3(m, V) > 1e-9);
  const outline = [];
  const crease = [];
  for (const run of flagRuns(facing, false)) outline.push(k.pathOf(run.map((i) => near[i])));
  for (const run of flagRuns(facing, true)) {
    crease.push(k.pathOf(run.map((i) => near[i])));
    outline.push(k.pathOf(run.map((i) => far[i])));
  }
  for (let i = 0; i < n; i++) if (facing[(i + n - 1) % n] !== facing[i]) outline.push(k.pathOf([near[i], far[i]]));
  const parts = [k.pathOf(screenOriented(near), true), k.pathOf(screenOriented(far), true)];
  const buckets = [[], [], [], [], []];
  for (let i = 0; i < n; i++) {
    if (!facing[i]) continue;
    const quad = screenOriented([near[i], near[(i + 1) % n], far[(i + 1) % n], far[i]]);
    parts.push(k.pathOf(quad, true));
    buckets[G.toneOf(normals[i], P)].push(k.pathOf(quad, true));
  }
  const capTone = G.toneOf(capNear ? F.a : G.mul3(F.a, -1), P);
  buckets[capTone].push(k.pathOf(screenOriented(near), true));
  return { fill: parts.join(""), outline: outline.join(""), crease: "", top: buckets[4].join(""), shades: buckets.slice(0, 4).map((b) => b.join("")) };
}


// контур корпуса: скругления в плане, срезы по x для торцевых «колпаков»
const BLOCK_PLAN = { x: BLOCK.x0, y: BLOCK.y0, w: BLOCK.x1 - BLOCK.x0, d: BLOCK.y1 - BLOCK.y0, r: BLOCK.r };
function clipRing(ring, xcut, keepLess) {
  const out = [];
  const inside = (p) => (keepLess ? p[0] <= xcut : p[0] >= xcut);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (xcut - a[0]) / (b[0] - a[0]);
      out.push([xcut, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
const BLOCK_RING = k.roundedPlan(BLOCK_PLAN, 10);
function extruded(name, ring, z0, z1, style = {}, { extra = "", inner = "", bias = 0, bevel = 0 } = {}) {
  const shape = record(A.extruded(ring, z0, z1 - z0, { name }));
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  put(name, [cx, cy, (z0 + z1) / 2], S(k.extrude(ring, z0, z1 - z0, P, { convex: true, bevel }), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}

// ---------- back layer: площадка, тень и топка изнутри ----------
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PAD, -4), -PAD_H, PAD_H, P)}"/>`);
back.push(S(k.slabOf(PAD, -PAD_H, PAD_H, P, 4, 1.2), { tone: "lo", inner: Ln(k.sideSeam(PAD, -3, P, 4), { tone: "faint" }) }));
record(A.slab(PAD, -PAD_H, PAD_H, { name: "stand.pad", ground: true }, 4));
const joints = [-270, -150, -30, 90].map((x) => k.lineOnTop([x, PAD.y], [x, PAD.y + PAD.d], 0, P)).join("") + k.lineOnTop([PAD.x, 0], [PAD.x + PAD.w, 0], 0, P);
back.push(Ln(joints, { tone: "faint" }));
back.push(`<path class="iso-halo" d="${k.haloOf({ x: CAB.x0 - 6, y: -100, w: BLOCK.x1 - CAB.x0 + 12, d: 200, r: 30 }, 0, 6, P)}" style="filter:blur(6px)"/>`);

const cavity = [];
const C = (svg) => cavity.push(svg);
const inner = { x0: WINDOW.x0, x1: WINDOW.x1, y0: BLOCK.y0 + WALL_T, y1: BLOCK.y1 - WALL_T };
// пол, дальняя стенка с футеровкой, торцы изнутри
C(S(k.slabOf({ x: inner.x0, y: BLOCK.y0, w: inner.x1 - inner.x0, d: BLOCK.y1 - WALL_T - BLOCK.y0, r: 0 }, BLOCK.z0, FLOOR_Z - BLOCK.z0, P, 2), { tone: "lo", crease: "none" }));
C(S(k.slabOf({ x: inner.x0, y: BLOCK.y0, w: inner.x1 - inner.x0, d: WALL_T, r: 0 }, FLOOR_Z, BAND_Z - FLOOR_Z, P, 2), { tone: "mid", crease: "none" }));
C(S(k.slabOf({ x: inner.x1 - 1, y: BLOCK.y0, w: 1, d: BLOCK.y1 - BLOCK.y0, r: 0 }, FLOOR_Z, BAND_Z - FLOOR_Z, P, 2), { tone: "mid", crease: "none" }));
const brick = [];
for (let z = FLOOR_Z + 6; z < BAND_Z; z += 6) brick.push(path3([[inner.x0, inner.y0, z], [inner.x1 - 1, inner.y0, z]]));
for (let row = 0, z = FLOOR_Z; z < BAND_Z; z += 6, row++) for (let x = inner.x0 + (row % 2 ? 9 : 0) + 9; x < inner.x1 - 1; x += 18) brick.push(path3([[x, inner.y0, z], [x, inner.y0, Math.min(z + 6, BAND_Z)]]));
for (let z = FLOOR_Z + 6; z < BAND_Z; z += 6) brick.push(path3([[inner.x1 - 1, inner.y0, z], [inner.x1 - 1, inner.y1, z]]));
C(Ln(brick.join(""), { tone: "faint" }));
// колосник
const GRATE = { x0: inner.x0 + 2, x1: inner.x1 - 6, y0: -46, y1: 46, z: FLOOR_Z + 4 };
for (const x of [GRATE.x0, GRATE.x1 - 4]) C(S(k.slabOf({ x, y: GRATE.y0, w: 4, d: GRATE.y1 - GRATE.y0, r: 0.3 }, FLOOR_Z, 4, P, 2), { tone: "lo" }));
for (let y = GRATE.y0 + 3; y < GRATE.y1 - 2; y += 6) C(S(k.slabOf({ x: GRATE.x0 + 4, y: y - 1.2, w: GRATE.x1 - GRATE.x0 - 8, d: 2.4, r: 0.4 }, FLOOR_Z + 2, 2, P, 2), { tone: "mid", crease: "none" }));
// поленья: видны при работе на дровах
const logs = [];
for (const [x0, y, z, len] of [[-70, -22, 72.5, 44], [-62, 6, 72.5, 40], [-24, -10, 72.5, 46], [-48, -8, 77, 36], [-6, 18, 72.5, 34]]) {
  const F = alongX(x0, y, z + 2.5);
  logs.push(S(G.disc(0, len, 2.6, F, P, { steps: 20 }), { tone: "lo" }) + Ln(G.circleOf(F, len, 1.4, P), { tone: "faint" }));
}
C(`<g class="kp-logs">${logs.join("")}</g>`);
// огнеупорные кольца форсуночных амбразур
for (const b of BURNERS) C(S(G.ringBand(0, 2, 3.2, 6.5, alongX(inner.x0, b.y, b.z), P), { tone: "lo" }));
// котлы: нижние пояса и днища
for (const kettle of [...KETTLES].sort((a, b) => k.depthOf([a.x, 0, 0], P) - k.depthOf([b.x, 0, 0], P))) {
  const F = vertical(kettle.x, 0, kettle.bottom - 3);
  const top = BAND_Z + 4 - (kettle.bottom - 3);
  C(S(G.solidOf([[0, kettle.r - 6], [1.6, kettle.r - 2, 1], [3, kettle.r], [top, kettle.r]], F, P), { tone: "hi", className: "kp-kettle", inner: Ln(G.arcOf(F, 3, kettle.r, P) + G.arcOf(F, 14, kettle.r, P), { tone: "faint" }) }));
}
// без WebGL: плоские языки пламени
const fallback = [];
for (const b of BURNERS) {
  const pts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([inner.x0 + t * 92, b.y + Math.sin(t * Math.PI) * 16, b.z + t * 6]); }
  for (let i = 14; i >= 0; i--) { const t = i / 14; pts.push([inner.x0 + t * 92, b.y - Math.sin(t * Math.PI) * 16, b.z + t * 6 - Math.sin(t * Math.PI) * 4]); }
  fallback.push(`<path class="kp-flame-fb kp-liquid" d="${path3(pts, true)}"/>`);
}
fallback.push(`<path class="kp-flame-fb kp-solid" d="${path3([[inner.x0 + 4, -40, 73], [inner.x0 + 84, -40, 73], [inner.x0 + 84, 40, 73], [inner.x0 + 4, 40, 73]], true)}"/>`);
record(A.slab({ x: inner.x0, y: BLOCK.y0, w: inner.x1 - inner.x0, d: BLOCK.y1 - WALL_T - BLOCK.y0, r: 0 }, BLOCK.z0, FLOOR_Z - BLOCK.z0, { name: "block.floor" }, 2));
record(A.slab({ x: inner.x0, y: BLOCK.y0, w: inner.x1 - inner.x0, d: WALL_T, r: 0 }, FLOOR_Z, BAND_Z - FLOOR_Z, { name: "block.farwall" }, 2));
const cavityGroup = `<g class="kp-cavity">${cavity.join("")}<g class="kp-fallback">${fallback.join("")}</g></g>`;

// ---------- шкаф форсунок изнутри (back layer, без огня) ----------
const box2 = [];
const B2 = (svg) => box2.push(svg);
B2(S(k.slabOf({ x: CAB.x0, y: CAB.y0, w: CAB.x1 - CAB.x0, d: CAB.y1 - CAB.y0, r: 0 }, CAB.z0, 4, P, 2), { tone: "lo", crease: "none" }));
B2(S(k.slabOf({ x: CAB.x0, y: CAB.y0, w: CAB.x1 - CAB.x0, d: 2, r: 0 }, CAB.z0 + 4, CAB.z1 - CAB.z0 - 4, P, 2), { tone: "mid", crease: "none" }));
B2(S(k.slabOf({ x: CAB.x1 - 2, y: CAB.y0, w: 2, d: CAB.y1 - CAB.y0, r: 0 }, CAB.z0 + 4, CAB.z1 - CAB.z0 - 4, P, 2), { tone: "mid", crease: "none" }));
// форсунки на задней стенке шкафа (она же передняя стенка топки)
const burnerSvg = [];
for (const b of [...BURNERS].sort((a, c) => k.depthOf([0, a.y, 0], P) - k.depthOf([0, c.y, 0], P))) {
  const F = G.frameOf([CAB.x1 - 2, b.y, b.z], [-1, 0, 0], AY, AZ);
  burnerSvg.push(S(G.disc(0, 1.4, 7.5, F, P), { tone: "mid" }) + Dots(G.dotsOf(F, 1.4, 6, 6, P, { all: true }), { size: 0.4 }));
  burnerSvg.push(S(G.solidOf([[1.4, 4], [10, 4], [10, 5.4], [13, 5.4], [13, 2.6], [18, 2.6]], F, P), { tone: "hi", lit: true, inner: Ln(G.arcOf(F, 6, 4, P), { tone: "faint" }) }));
  const vF = vertical(CAB.x1 - 2 - 11.5, b.y, b.z + 5.4);
  burnerSvg.push(S(G.disc(0, 4, 0.9, vF, P), { tone: "mid" }));
  const wF = vertical(CAB.x1 - 2 - 11.5, b.y, b.z + 9.4);
  burnerSvg.push(S(G.disc(0, 1.4, 3.6, wF, P), { tone: "hi" }) + Faded(G.ribsOf(wF, 0, 1.4, 3.6, 22, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
}
// баки 2 × 48 л стоят в верхнем отделении шкафа над полкой; из выреза видны их сливные трубки, фильтр-тройник и форсунки
const TEE = { x: -122, y: 34, z: 70 };
const teeF = vertical(TEE.x, TEE.y, TEE.z);
const teeSvg = S(G.disc(0, 7, 3.4, teeF, P), { tone: "hi", inner: Ln(G.arcOf(teeF, 2.5, 3.4, P), { tone: "faint" }) }) + S(G.disc(7, 10, 4.2, teeF, P), { tone: "mid" });
const fuelLine = (route, r = 0.8) => {
  const pts = G.fillet(route, 2.6, 8, { P, tube: r });
  return tubePieces(pts, r, P, { maxLength: 400 }).map((piece) => tubeSvg(piece, { tone: "hi" })).join("");
};
const lines = [];
lines.push(fuelLine([[TEE.x, TEE.y, CAB_CUT.z1], [TEE.x, TEE.y, TEE.z + 10]]));
lines.push(fuelLine([[TEE.x - 10, TEE.y - 12, CAB_CUT.z1], [TEE.x - 10, TEE.y - 12, TEE.z + 8.5], [TEE.x - 10, TEE.y, TEE.z + 8.5], [TEE.x - 4.2, TEE.y, TEE.z + 8.5]]));
lines.push(fuelLine([[TEE.x - 3.4, TEE.y, TEE.z + 3], [-138, TEE.y, TEE.z + 3], [-138, BURNERS[1].y, TEE.z + 3], [-138, BURNERS[1].y, BURNERS[1].z], [CAB.x1 - 20, BURNERS[1].y, BURNERS[1].z]]));
lines.push(fuelLine([[TEE.x - 3.4, TEE.y - 2, TEE.z + 1], [-142, TEE.y - 2, TEE.z + 1], [-142, BURNERS[0].y, TEE.z + 1], [-142, BURNERS[0].y, BURNERS[0].z], [CAB.x1 - 20, BURNERS[0].y, BURNERS[0].z]]));
B2(S(k.slabOf({ x: CAB.x0 + 2, y: CAB.y0 + 2, w: CAB.x1 - CAB.x0 - 4, d: CAB.y1 - CAB.y0 - 2, r: 0 }, CAB_CUT.z1 - 3, 3, P, 2), { tone: "lo" }));
B2(burnerSvg.join(""));
B2(lines.join(""));
B2(teeSvg);
const cabinetGroup = `<g class="kp-inside">${box2.join("")}</g>`;

// ---------- front layer ----------
LAYER = "under";
// колёса
for (const side of [-1, 1]) {
  LAYER = side < 0 ? "under" : "front";
  const y = side * WHEEL_Y;
  const F = alongY(0, y - 10, AXLE_Z);
  const tyre = [[0, 26], [0, 37, 1], [1.6, 40.6, 1], [4.4, 42], [15.6, 42], [18.4, 40.6, 1], [20, 37, 1], [20, 26]];
  const tread = Faded(G.ribsOf(F, 4.4, 15.6, TYRE_R, 36, P, { fade: [0.1, 0.55], twist: 0.18, seams: true }), { tone: "lo" }) + Faded(G.ribsOf(F, 4.4, 15.6, TYRE_R, 36, P, { fade: [0.1, 0.55], twist: -0.18, phase: 0.087 }), { tone: "lo" });
  turned(`wheel${side}.tyre`, F, tyre, { tone: "lo", className: "kp-rubber" }, { extra: tread + Ln(G.arcOf(F, 10, TYRE_R, P), { tone: "faint" }), smooth: true, annulus: true });
  const hubF = alongY(0, y, AXLE_Z);
  disc(`wheel${side}.rim`, hubF, side * 7, side * 8.5, 26, { tone: "mid" }, { bevel: 0.6, extra: Ln(G.circleOf(hubF, side * 8.5, 21, P), { tone: "faint" }) + Dots(G.dotsOf(hubF, side * 8.5, 16, 6, P, { all: true, phase: 0.26 }), { size: 1.1, tone: "lo" }) });
  disc(`wheel${side}.hub`, hubF, side * 8.5, side * 12, 10, { tone: "mid" });
  disc(`wheel${side}.cap`, hubF, side * 12, side * 14.5, 5.5, { tone: "mid" });
  if (side > 0) put(`wheel${side}.nuts`, G.add3(hubF.o, [0, side * 12.2, 0]), Dots(G.dotsOf(hubF, side * 12, 7.4, 6, P, { all: true }), { size: 0.6, tone: "hi" }), Array.from({ length: 6 }, (_, i) => record(A.ball(G.pointOf(hubF, side * 12, 7.4, (i / 6) * Math.PI * 2), 0.6 / KS, { name: `wheel${side}.nut` }))), { bias: 0.4 });
}
LAYER = "under";
box("axle", [-4.5, -WHEEL_Y - 7, AXLE_Z - 4.5], [4.5, WHEEL_Y + 7, AXLE_Z + 4.5], { tone: "lo" }, { r: 1.6, steps: 3 });
for (const side of [-1, 1]) {
  const y0 = side > 0 ? 36 : -43;
  for (let i = 0; i < 4; i++) box(`spring${side}.leaf`, [-36 + i * 7, y0, 48 + i * 1.5], [36 - i * 7, y0 + 7, 49.5 + i * 1.5], { tone: i ? "mid" : "lo" });
  box(`spring${side}.seat`, [-6, y0 - 1, AXLE_Z + 4.5], [6, y0 + 8, 48], { tone: "mid" });
  box(`frame${side}.rail`, [CAB.x0 + 2, y0, FRAME_Z[0]], [BLOCK.x1 - 8, y0 + 7, FRAME_Z[1]], { tone: "mid" }, { inner: Ln(k.sideSeam({ x: CAB.x0 + 2, y: y0, w: BLOCK.x1 - 10 - CAB.x0, d: 7, r: 0.4 }, 60, P, 2), { tone: "faint" }) });
}
const CROSS = [];
for (const x of [CAB.x0 + 2, -60, 58, BLOCK.x1 - 14]) CROSS.push(box("frame.cross", [x, -36, FRAME_Z[0] + 1], [x + 6, 36, FRAME_Z[1] - 1], { tone: "lo" }));

// крылья: угловатые, с боковым щитком; брызговики за колёсами
for (const side of [-1, 1]) {
  LAYER = side < 0 ? "under" : "front";
  const yIn = side > 0 ? BLOCK.y1 : -WHEEL_Y - 14;
  const yOut = side > 0 ? WHEEL_Y + 14 : BLOCK.y0;
  const F = alongY(0, yIn, 0);
  // F: a = y, u = z, v = x
  const top = 92;
  const shell = [[64, -60], [top, -40], [top, 40], [64, 60], [64, 57], [top - 2.2, 38.8], [top - 2.2, -38.8], [64, -57]];
  put(`fender${side}`, [0, (yIn + yOut) / 2, top - 6], S(bentPaths(F, shell, 0, yOut - yIn), { tone: "mid" }), [[[top - 2.2, -38.8], [top, -40], [top, 40], [top - 2.2, 38.8]], [[64, -60], [top, -40], [top - 2.2, -38.8], [64, -57]], [[64, 57], [top - 2.2, 38.8], [top, 40], [64, 60]]].map((q, i) => record(A.prism(F, q, 0, yOut - yIn, { name: `fender${side}.${i}` }))));
  if (side > 0) {
    const plateF = G.frameOf([0, yOut, 0], AY, AZ, AX);
    const plate = [[top, -40], [top, 40], [top - 16, 52], [top - 16, -52]];
    prism(`fender${side}.skirt`, plateF, plate, 0, 1.4, { tone: "hi" }, {
      extra: Ln(path3([[-24, yOut + 1.4, top - 5], [-6, yOut + 1.4, top - 5]]) + path3([[-24, yOut + 1.4, top - 9], [-12, yOut + 1.4, top - 9]]), { tone: "lo", free: true }) + Dots([[-46, top - 13], [46, top - 13], [-36, top - 3], [36, top - 3]].map(([x, z]) => at([x, yOut + 1.4, z])), { size: 0.5 }),
    });
  }
  const flapX = 46;
  box(`mudflap${side}.bracket`, [flapX - 2, side > 0 ? 43 : -WHEEL_Y + 12, FRAME_Z[0]], [flapX + 1.2, side > 0 ? WHEEL_Y - 12 : -43, FRAME_Z[0] + 3], { tone: "lo" });
  box(`mudflap${side}`, [flapX, side > 0 ? WHEEL_Y - 12 : -WHEEL_Y - 12, 20], [flapX + 1.2, side > 0 ? WHEEL_Y + 12 : -WHEEL_Y + 12, 62], { tone: "lo", className: "kp-rubber" });
}

// корпус котлов: скруглённые торцы, вырез по ближнему борту
LAYER = "front";
const NEAR = BLOCK.y1 - WALL_T;
const frontCap = clipRing(BLOCK_RING, BLOCK.x0 + CAP_T, true);
const rearCap = clipRing(BLOCK_RING, BLOCK.x1 - CAP_T - 4, false);
extruded("block.front", frontCap, BLOCK.z0, BAND_Z, { tone: "mid" });
extruded("block.rear", rearCap, BLOCK.z0, BAND_Z, { tone: "mid" }, { inner: Ln(k.ringSeam(rearCap, 92, P), { tone: "faint" }) });
box("block.sill", [WINDOW.x0, NEAR, BLOCK.z0], [WINDOW.x1, BLOCK.y1, FLOOR_Z], { tone: "lo" }, { r: 0 });
// верхний пояс с крышкой: жалюзи-прорези вдоль борта
const slots = [];
for (let x = BLOCK.x0 + 16; x < BLOCK.x1 - 18; x += 11) slots.push(k.pathOf([[x, BLOCK.y1, 128.6], [x + 6.4, BLOCK.y1, 128.6], [x + 6.4, BLOCK.y1, 130.4], [x, BLOCK.y1, 130.4]].map(at), true));
extruded("block.top", BLOCK_RING, BAND_Z, DECK_Z, { tone: "mid" }, { bevel: 1, inner: Ln(k.ringSeam(BLOCK_RING, 124, P), { tone: "faint" }), extra: Ln(slots.join(""), { tone: "lo" }) });
// торцевые уголки окна: кромки выреза
box("block.lintel", [WINDOW.x0, NEAR, BAND_Z - 2], [WINDOW.x1, BLOCK.y1, BAND_Z], { tone: "lo" }, { r: 0 });

// котлы сверху: обечайка, крышка, ручка, прижимы, пароотвод
const VENTS = [];
for (const kettle of KETTLES) {
  const F = vertical(kettle.x, 0, DECK_Z);
  const R0 = kettle.r;
  ringPart(`${kettle.id}.collar`, F, 0, 3, R0 - 0.5, R0 + 3, { tone: "mid" });
  const lid = [[3, R0 + 2], [4.5, R0 + 2], [5.2, R0 + 0.6, 1], [7.4, R0 - 6, 1], [9, R0 * 0.55, 1], [9.8, 0]];
  // высота купола крышки над настилом на радиусе r (по тому же профилю)
  const lidAt = (r) => {
    const pts = lid.slice(2);
    for (let i = 0; i < pts.length - 1; i++) {
      const [s0, r0] = pts[i];
      const [s1, r1] = pts[i + 1];
      if (r <= r0 && r >= r1) return DECK_Z + s0 + ((s1 - s0) * (r0 - r)) / (r0 - r1);
    }
    return DECK_Z + 9.8;
  };
  turned(`${kettle.id}.lid`, F, lid, { tone: "hi" }, { inner: Ln(G.arcOf(F, 4.5, R0 + 2, P), { tone: "faint" }), smooth: true });
  for (const dx of [-8, 8]) {
    const z0 = lidAt(Math.hypot(dx, 6)) - 0.3;
    disc(`${kettle.id}.handle.post`, vertical(kettle.x + dx, 6, z0), 0, DECK_Z + 14.2 - z0, 1, { tone: "mid" });
  }
  disc(`${kettle.id}.handle`, alongX(kettle.x - 9, 6, DECK_Z + 15.4), 0, 18, 1.2, { tone: "hi" });
  for (const ang of [0.35, 1.9, 3.5, 5.0]) {
    const cx = kettle.x + (R0 + 5) * Math.cos(ang);
    const cy = (R0 + 5) * Math.sin(ang);
    disc(`${kettle.id}.clamp`, vertical(cx, cy, DECK_Z), 0, 6.4, 1.4, { tone: "mid" });
    box(`${kettle.id}.wing`, [cx - 2.6, cy - 0.5, DECK_Z + 6.4], [cx + 2.6, cy + 0.5, DECK_Z + 8], { tone: "lo" });
  }
  const vx = kettle.x - R0 * 0.45;
  const vy = -R0 * 0.35;
  const vz = lidAt(Math.hypot(R0 * 0.45, R0 * 0.35) - 3) - 0.2;
  const vF = vertical(vx, vy, vz);
  turned(`${kettle.id}.vent`, vF, [[0, 3], [1.4, 3], [1.4, 1.6], [12, 1.6]], { tone: "mid" });
  turned(`${kettle.id}.valve`, vF, [[12, 3.8], [13.4, 3.8], [14.2, 3.2, 1], [15, 1.4, 1], [15.4, 0]], { tone: "hi" }, { smooth: true });
  VENTS.push([vx, vy, vz + 15]);
}

// навес на четырёх стойках
for (const [x, y] of [[ROOF.x0 + 14, BLOCK.y0 + 6], [ROOF.x0 + 14, BLOCK.y1 - 6], [ROOF.x1 - 10, BLOCK.y0 + 6], [ROOF.x1 - 10, BLOCK.y1 - 6]]) {
  disc("roof.socket", vertical(x, y, DECK_Z), 0, 4, 2.4, { tone: "lo" });
  disc("roof.post", vertical(x, y, DECK_Z + 4), 0, ROOF.z - DECK_Z - 4, 1.2, { tone: "mid" }, { inner: Ln(G.arcOf(vertical(x, y, DECK_Z + 4), 40, 1.2, P), { tone: "faint" }) });
}
box("roof", [ROOF.x0, ROOF.y0, ROOF.z], [ROOF.x1, ROOF.y1, ROOF.z + ROOF.t], { tone: "mid" }, { r: 1.2, steps: 3, bevel: 1, inner: Ln(k.sideSeam({ x: ROOF.x0, y: ROOF.y0, w: ROOF.x1 - ROOF.x0, d: ROOF.y1 - ROOF.y0, r: 1.2 }, ROOF.z + 1.6, P, 3), { tone: "faint" }) });
box("roof.ridge", [ROOF.x0 + 4, -1.5, ROOF.z + ROOF.t], [ROOF.x1 - 4, 1.5, ROOF.z + ROOF.t + 1.2], { tone: "lo" }, { r: 0.6 });
box("roof.latch", [-12, ROOF.y1 - 10, ROOF.z + ROOF.t], [12, ROOF.y1 - 6, ROOF.z + ROOF.t + 1.4], { tone: "lo" });

// дымовая труба с дефлектором (задний дальний угол, мимо навеса)
{
  const F = vertical(CHIMNEY.x, CHIMNEY.y, DECK_Z);
  disc("chimney.flange", F, 0, 3, CHIMNEY.r + 5, { tone: "mid" }, { extra: Dots(G.dotsOf(F, 3, CHIMNEY.r + 3, 8, P, { fade: [0.04, 0.42] }), { size: 0.45 }) });
  const joint = 50;
  const top = CHIMNEY.z1 - DECK_Z;
  const collar = joint + 40;
  turned("chimney.lower", F, [[3, CHIMNEY.r], [joint, CHIMNEY.r]], { tone: "mid" }, { inner: Ln(G.arcOf(F, 24, CHIMNEY.r, P), { tone: "faint" }) });
  ringPart("chimney.joint", F, joint, joint + 3, CHIMNEY.r - 0.6, CHIMNEY.r + 1.6, { tone: "lo" });
  turned("chimney.upper", F, [[joint + 3, CHIMNEY.r - 0.6], [collar, CHIMNEY.r - 0.6]], { tone: "mid" });
  ringPart("chimney.collar", F, collar, collar + 3, CHIMNEY.r - 0.6, CHIMNEY.r + 1.2, { tone: "lo" });
  turned("chimney.top", F, [[collar + 3, CHIMNEY.r - 0.6], [top, CHIMNEY.r - 0.6]], { tone: "mid" });
  const capZ = CHIMNEY.cap - DECK_Z;
  for (const ang of [0.5, 2.6, 4.7]) disc("deflector.leg", vertical(CHIMNEY.x + (CHIMNEY.r - 1.4) * Math.cos(ang), CHIMNEY.y + (CHIMNEY.r - 1.4) * Math.sin(ang), CHIMNEY.z1), 0, capZ - top - 5.6, 0.6, { tone: "lo" });
  turned("deflector.cap", F, [[capZ - 6, 0], [capZ - 5, CHIMNEY.r + 7], [capZ - 4.2, CHIMNEY.r + 7], [capZ, 0]], { tone: "hi" });
}

// шкаф форсунок спереди: рамка выреза, крышка, табличка
const CN = CAB.y1;
box("cab.front", [CAB.x0, CAB.y0, CAB.z0], [CAB.x0 + 2, CAB.y1, CAB.z1], { tone: "mid" }, { r: 0 });
box("cab.post", [CAB.x0 + 2, CN - 2, CAB.z0], [CAB_CUT.x0, CN, CAB.z1], { tone: "mid" }, { r: 0 });
box("cab.post", [CAB_CUT.x1, CN - 2, CAB.z0], [CAB.x1, CN, CAB.z1], { tone: "mid" }, { r: 0 });
box("cab.sill", [CAB_CUT.x0, CN - 2, CAB.z0], [CAB_CUT.x1, CN, CAB_CUT.z0], { tone: "mid" }, { r: 0 });
box("cab.head", [CAB_CUT.x0, CN - 2, CAB_CUT.z1], [CAB_CUT.x1, CN, CAB.z1], { tone: "mid" }, { r: 0 });
box("cab.lid", [CAB.x0 - 1, CAB.y0 - 1, CAB.z1], [CAB.x1, CAB.y1 + 1, CAB.z1 + 2.4], { tone: "mid" }, {
  r: 0.6,
  bevel: 0.6,
  extra: Ln(k.planOutline({ x: CAB.x0 + 4, y: CAB.y0 + 4, w: CAB.x1 - CAB.x0 - 8, d: CAB.y1 - CAB.y0 - 8, r: 1 }, CAB.z1 + 2.4, P, 3), { tone: "faint" }),
});
for (const y of [CAB.y0 + 14, CAB.y1 - 14]) disc("cab.hinge", alongY(CAB.x1 - 1.2, y - 5, CAB.z1 + 3.5), 0, 10, 1.1, { tone: "lo" });
box("cab.hasp", [CAB.x0 - 2.4, -5, CAB.z1 - 9], [CAB.x0, 5, CAB.z1 - 2], { tone: "lo" });
box("cab.plate", [CAB.x0 - 0.6, 14, CAB.z1 - 20], [CAB.x0, 40, CAB.z1 - 12], { tone: "lo" }, {
  extra: Ln([18, 12].map((w, i) => path3([[CAB.x0 - 0.6, 17, CAB.z1 - 14.4 - i * 2.4], [CAB.x0 - 0.6, 17 + w, CAB.z1 - 14.4 - i * 2.4]])).join(""), { tone: "lo", free: true }),
});
// ручка на передней стенке шкафа
for (const y of [-14, 14]) disc("cab.handle.post", G.frameOf([CAB.x0, y, 112], [-1, 0, 0], AY, AZ), 0, 3, 0.8, { tone: "mid" });
disc("cab.handle", alongY(CAB.x0 - 3.8, -14.8, 112), 0, 29.6, 1, { tone: "hi" });

// дышло: одна длинная труба, петля, цепь, опорная стойка
const drawF = G.frameOf([DRAW.x0, 0, DRAW.z], [-1, 0, 0], AY, AZ);
const DRAWBAR = turned("drawbar", drawF, [[0, DRAW.r], [DRAW.x0 - DRAW.x1 - 12, DRAW.r]], { tone: "mid" }, { inner: Ln(G.arcOf(drawF, 30, DRAW.r, P), { tone: "faint" }) });
for (const side of [-1, 1]) {
  const a = [CAB.x0 + 2, side * 33, DRAW.z];
  const b = [DRAW.x0 - 40, side * 3.3, DRAW.z];
  turned(`drawbar.brace${side}`, G.frameAlong(a, G.unit3(G.sub3(b, a))), [[0, 2.6], [G.len3(G.sub3(b, a)), 2.6]], { tone: "mid" }, { seated: true, cut: [DRAWBAR, CROSS[0]] });
}
box("drawbar.head", [DRAW.x1 - 4, -5.5, DRAW.z - 5.5], [DRAW.x1 + 12, 5.5, DRAW.z + 5.5], { tone: "mid" }, { r: 1, steps: 3, bevel: 0.4 });
ringPart("drawbar.eye", vertical(DRAW.x1 - 13, 0, DRAW.z - 2), 0, 4, 5.5, 9.5, { tone: "hi" });
const JACK = { x: DRAW.x1 + 34, y: 0 };
disc("jack.tube", vertical(JACK.x, JACK.y, 8), 0, DRAW.z - DRAW.r - 8, 2.4, { tone: "mid" });
disc("jack.foot", vertical(JACK.x, JACK.y, 0), 0, 2, 7, { tone: "lo" });
disc("jack.screw", vertical(JACK.x, JACK.y, 2), 0, 6, 1.4, { tone: "mid" });
disc("jack.head", vertical(JACK.x, JACK.y, DRAW.z + DRAW.r - 0.3), 0, 3.3, 3.6, { tone: "lo" });
disc("jack.crank", vertical(JACK.x, JACK.y, DRAW.z + DRAW.r + 3), 0, 5, 1, { tone: "mid" });
disc("jack.handle", alongY(JACK.x, 0, DRAW.z + DRAW.r + 8.6), 0, 8, 0.9, { tone: "hi" });
// запасное колесо плашмя на ложементе
box("spare.cradle", [SPARE.x - 30, -4, DRAW.z + DRAW.r - 0.4], [SPARE.x + 30, 4, SPARE.z - 10], { tone: "lo" });
for (const [y0, y1] of [[-30, -4], [4, 30]]) box("spare.cradle", [SPARE.x - 4, y0, DRAW.z + DRAW.r - 0.4], [SPARE.x + 4, y1, SPARE.z - 10], { tone: "lo" });
{
  const F = vertical(SPARE.x, SPARE.y, SPARE.z - 10);
  const tyre = [[0, 24], [0, 35, 1], [1.6, 38.6, 1], [4.4, 40], [15.6, 40], [18.4, 38.6, 1], [20, 35, 1], [20, 24]];
  const tread = Faded(G.ribsOf(F, 4.4, 15.6, 40, 36, P, { fade: [0.1, 0.55], twist: 0.18, seams: true }), { tone: "lo" }) + Faded(G.ribsOf(F, 4.4, 15.6, 40, 36, P, { fade: [0.1, 0.55], twist: -0.18, phase: 0.087 }), { tone: "lo" });
  turned("spare.tyre", F, tyre, { tone: "lo", className: "kp-rubber" }, { extra: tread, smooth: true, annulus: true });
  disc("spare.rim", F, 13, 14.5, 24, { tone: "mid" }, { extra: Ln(G.circleOf(F, 14.5, 21, P), { tone: "faint" }) + Dots(G.dotsOf(F, 14.5, 16, 6, P, { all: true, phase: 0.26 }), { size: 1.1, tone: "lo" }) });
  disc("spare.hub", F, 14.5, 18, 10, { tone: "mid" });
  disc("spare.clamp", F, 18, 21, 4, { tone: "hi" });
}

// задние опорные стойки
LAYER = "under";
for (const side of [-1, 1]) {
  const y = side * 44;
  disc(`leg${side}.tube`, vertical(BLOCK.x1 - 18, y, 8), 0, FRAME_Z[0] - 8, 2.6, { tone: "mid" });
  disc(`leg${side}.foot`, vertical(BLOCK.x1 - 18, y, 0), 0, 2, 7, { tone: "lo" });
  disc(`leg${side}.screw`, vertical(BLOCK.x1 - 18, y, 2), 0, 6, 1.4, { tone: "mid" });
}
LAYER = "front";
// противооткатные упоры у ближнего колеса
for (const dir of [-1, 1]) {
  const F = alongY(dir * 45, WHEEL_Y - 10, 0);
  const tri = dir < 0 ? [[0, -12], [0, 4], [14, 3.2]] : [[0, 12], [0, -4], [14, -3.2]];
  prism(`chock${dir}`, F, tri, 0, 20, { tone: "lo" });
}

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const itemSvg = (item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`;
const frontItems = R.items.filter((item) => item.layer !== "under");
// внутренности шкафа видны только через проём: обрезаем по нему и рисуем сразу после стенок шкафа и торца корпуса
const cutClip = path3([[CAB_CUT.x0, CAB.y1, CAB_CUT.z0], [CAB_CUT.x1, CAB.y1, CAB_CUT.z0], [CAB_CUT.x1, CAB.y1, CAB_CUT.z1], [CAB_CUT.x0, CAB.y1, CAB_CUT.z1]], true);
const afterCab = Math.max(...frontItems.map((item, i) => (/^(cab\.(front|post|sill|head)|block\.front)/.test(item.name) ? i : -1)));
const front = frontItems.map(itemSvg);
front.splice(afterCab + 1, 0, `<clipPath id="kp-cab-cut"><path d="${cutClip}"/></clipPath><g clip-path="url(#kp-cab-cut)">${cabinetGroup}</g>`);
const under = R.items.filter((item) => item.layer === "under").map(itemSvg);

// ---------- page ----------
const LABEL =
  "Полевая кухня КП-125 на одноосном прицепе на бетонной площадке: длинное трубчатое дышло со сцепной петлёй и цепью, на нём запасное колесо, впереди шкаф форсунок, за ним корпус котлов со скруглёнными торцами и навесом на четырёх стойках, сзади дымовая труба с дефлектором. Ближний борт корпуса и шкафа вырезан: в шкафу два топливных бака, фильтр-тройник и две форсунки; в топке колосник, днища трёх котлов и пламя.";
const backSvg = k.figureSvg({ width: W, height: H, label: LABEL, body: [...back, `<g class="kp-olive">${under.join("")}</g>`, cavityGroup], className: "kp-back" });
const layer = (cls, body = "") => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg kp-layer ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const stage = `<div class="iso-stage kp-stage" tabindex="0" role="group" aria-label="Кухня КП-125. Пробел — разжечь или погасить, F — сменить топливо, стрелки влево и вправо — подача топлива.">${backSvg}<canvas class="kp-layer kp-fire" aria-hidden="true"></canvas>${layer("kp-front", `<g class="kp-olive">${front.join("")}</g>`)}<canvas class="kp-layer kp-air" aria-hidden="true"></canvas></div>`;

const DATA = {
  W,
  H,
  P,
  camera: glCamera(P),
  model: MODEL,
  cavity: { x0: inner.x0, x1: inner.x1 - 1, y0: inner.y0, y1: inner.y1, floor: FLOOR_Z, top: BAND_Z, grate: GRATE.z + 2 },
  window: { ...WINDOW, y: BLOCK.y1 },
  kettles: KETTLES.map(({ x, r, bottom }) => [x, 0, r, bottom - 3]),
  burners: BURNERS.map((b) => [inner.x0 - 1, b.y, b.z]),
  vents: VENTS,
  chimney: [CHIMNEY.x, CHIMNEY.y, CHIMNEY.cap - 4, CHIMNEY.r + 7],
  roof: [ROOF.x0, ROOF.x1, ROOF.y0, ROOF.y1, ROOF.z],
};

const CSS = readFileSync(join(HERE, "kp.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const plate = k.plateHtml({
  fig: "Рис. 1",
  title: "КП-125, разрез топки",
  hint: "Пробел · F · ← →",
  readout: "холодная · вода 15 °C",
  keys: [
    { mark: "lit", label: "Форсунки: здесь дизтопливо превращается в пламя" },
    { mark: "raised", label: "Котлы: первые блюда 100 л, вторые 50 л, кипятильник 100 л" },
    { mark: "edge", label: "Топливная линия: баки → фильтр-тройник → форсунки" },
  ],
  caption:
    "Кухня полевая прицепная КП-125 готовит обед из двух блюд на 125 человек. Дизтопливо или керосин из двух баков по 48 л идёт через фильтр-тройник к двум форсункам; пламя проходит под днищами котлов вдоль всей топки и уходит в дымовую трубу. Без форсунок кухня топится дровами на колоснике. Время сжато в 120 раз; нагрев посчитан по паспортным данным: вода в котлах закипает примерно за час на жидком топливе (7–10 кг/ч) и за полтора на дровах (28–32 кг/ч), отсюда КПД модели около 33 и 20 %. Внешний вид по фотографии кухни; размещение баков и форсунок внутри шкафа упрощено.",
  body: stage,
});
const fragment = `<style>${CSS}</style>${plate}`;
const SCRIPT = kitScript() + glScript() + LIVE;
const page = k.pageHtml({ title: "Анатомия КП-125", theme: THEME, body: fragment, script: SCRIPT, width: 760 }).replace('<html lang="en">', '<html lang="ru">');
const name = THEME === "light" ? "kp-125-light.html" : "kp-125.html";
writeFileSync(join(HERE, name), page);
// фрагмент для публикации как Artifact: без собственного каркаса документа, тема по зрителю
const { ISO_CSS } = k;
const artifact = `<title>Анатомия КП-125</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${ISO_CSS}
:root{--kp-page:#f2f2ef;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--kp-page:#0b0b0b;color-scheme:dark}}
:root[data-theme="dark"]{--kp-page:#0b0b0b;color-scheme:dark}
body{background:var(--kp-page);margin:0}
.kp-root{background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:40px 64px;box-sizing:border-box}
.kp-root *{box-sizing:border-box}
.kp-root .iso-page{width:min(760px,100%);margin:0 auto}
</style>
<script>(function(){var r=document.documentElement.getAttribute("data-theme");var dark=r?r==="dark":matchMedia("(prefers-color-scheme: dark)").matches;window.__KP_THEME=dark?"dark":"light";})();</script>
<div class="iso kp-root" id="kp-root"><main class="iso-page">${fragment}</main></div>
<script>document.getElementById("kp-root").setAttribute("data-theme",window.__KP_THEME);</script>
<script type="module">${SCRIPT.replace(/<\/(script)/gi, "<\\/$1")}</script>
`;
if (THEME === "light") writeFileSync(join(HERE, "..", "kp-125-anatomy.html"), artifact);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`, `${PIPES.length} pipes`);
// шина охватывает обод: это посадка, а не ошибка порядка
A.auditOrExit(R, P, { allow: [["wheel-1.rim", "wheel-1.tyre"], ["wheel1.rim", "wheel1.tyre"], ["spare.rim", "spare.tyre"]] });
