const D = __DATA__;
const M = D.model;
const stage = document.querySelector(".kp-stage");
const root = stage.closest("[data-theme]");
const LIGHT = root && root.getAttribute("data-theme") === "dark" ? 0 : 1;
const cavityEl = stage.querySelector(".kp-cavity");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const P = D.P;

const f1 = (v) => (v < 0 ? `(${v.toFixed(1)})` : v.toFixed(1));
const vec3 = (p) => `vec3(${f1(p[0])},${f1(p[1])},${f1(p[2])})`;
const C = D.cavity;
const WN = D.window;
const K = D.kettles;
const B = D.burners;

// ---------- огонь в топке ----------
const FIRE = `
uniform float uJet;
uniform float uWood;
uniform float uLight;
const vec3 B0=${vec3(B[0])};
const vec3 B1=${vec3(B[1])};
const vec4 K0=vec4(${K[0].map(f1).join(",")});
const vec4 K1=vec4(${K[1].map(f1).join(",")});
const vec4 K2=vec4(${K[2].map(f1).join(",")});
float kettleHit(vec3 o,vec3 d,vec4 k,float far){
  vec2 q=o.xy-k.xy;float a=dot(d.xy,d.xy);float b=dot(q,d.xy);float c=dot(q,q)-k.z*k.z;
  float h=b*b-a*c;if(h<0.)return far;
  float s=(-b-sqrt(h))/a;if(s<0.)return far;
  float z=o.z+d.z*s;return z>k.w?min(far,s):far;
}
float jetOf(vec3 p,vec3 b,float L){
  float u=p.x-b.x;
  float lift=u*.05+u*u*.0005;
  float n=fbm3(vec3(p.x*.08-uTime*2.4,p.y*.1,p.z*.14)+b.y);
  float wy=2.6+max(u,0.)*.95;
  float wz=2.2+max(u,0.)*.09;
  vec2 q=vec2((p.y-b.y*(1.-smoothstep(0.,L,u)*.6))/wy,(p.z-b.z-lift)/wz)/(.75+.5*n);
  float along=smoothstep(-1.,3.,u)*(1.-smoothstep(L*.5,L,u+n*16.));
  float lick=.75+.5*smoothstep(.45,.75,fbm3(vec3(p.x*.05-uTime*1.6,p.y*.05,p.z*.2)));
  return exp(-dot(q,q))*along*lick;
}
float sheetOf(vec3 p,vec4 k){
  float r=length(p.xy-k.xy);
  float under=1.-smoothstep(k.z-4.,k.z+3.,r);
  float n=fbm3(vec3(p.xy*.07,uTime*.9));
  float dz=(k.w-1.5-p.z)/(2.4+3.*n);
  return under*exp(-dz*dz)*step(0.,k.w-p.z+2.);
}
float tongues(vec3 p,float base,float speed){
  float h=p.z-base;
  float n=fbm3(vec3(p.x*.08,p.y*.08,h*.06-uTime*speed));
  float tongue=smoothstep(.25,.8,n);
  float top=8.+20.*tongue;
  return window(h,-1.,top,3.)*(.35+.9*tongue)*exp(-max(h,0.)/14.);
}
float woodOf(vec3 p){
  return window(p.x,${f1(C.x0 + 4)},${f1(C.x0 + 92)},6.)*window(p.y,-42.,42.,6.)*tongues(p,${f1(C.grate)},1.4);
}
float rollOf(vec3 p,float L){
  float reach=${f1(B[0][0])}+L*.95;
  return window(p.x,${f1(B[0][0] + 6)},reach,10.)*window(p.y,-48.,46.,8.)*tongues(p,${f1(C.grate + 5)},2.)*.6;
}
vec3 ramp(float e,float core){
  vec3 red=vec3(.62,.12,.03),orange=vec3(.98,.42,.06),yellow=vec3(1.,.78,.22),pale=vec3(1.,.95,.78);
  vec3 c=mix(red,orange,smoothstep(.05,.35,e));
  c=mix(c,yellow,smoothstep(.35,.7,e));
  return mix(c,pale,smoothstep(.6,1.,e)*core);
}
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  if(uJet<.001&&uWood<.001){gl_FragColor=vec4(0.);return;}
  float px=pixelOf();
  vec3 w=onWallY(vb,${f1(WN.y)});
  float inWin=window(w.x,${f1(WN.x0)},${f1(WN.x1)},.7*px)*window(w.z,${f1(WN.z0)},${f1(WN.z1)},.7*px/uCam.w);
  if(inWin<.001){gl_FragColor=vec4(0.);return;}
  vec3 V=towardViewer();
  vec3 d=-V;
  float far=(w.y-${f1(C.y0)})/V.y;
  far=min(far,(w.z-${f1(C.floor)})/V.z);
  far=min(far,(${f1(C.x1)}-w.x)/max(-V.x,1e-4));
  far=min(far,kettleHit(w,d,K0,far));
  far=min(far,kettleHit(w,d,K1,far));
  far=min(far,kettleHit(w,d,K2,far));
  float L=34.+78.*uJet;
  float e=0.;float core=0.;
  const int N=28;
  float ds=far/float(N);
  float j=hash12(gl_FragCoord.xy+fract(uTime*.7)*31.);
  for(int i=0;i<N;i++){
    vec3 p=w+d*((float(i)+j)*ds);
    float jet=(jetOf(p,B0,L)+jetOf(p,B1,L))*uJet;
    float sh=(sheetOf(p,K0)+sheetOf(p,K1)+sheetOf(p,K2))*uJet*.55;
    float wd=woodOf(p)*uWood+rollOf(p,L)*uJet;
    float nz=smoothstep(30.,0.,p.x-B0.x)*uJet;
    e+=(jet*1.25+sh+wd*1.1)*ds*.055;
    core+=(jet*nz+wd*.3)*ds*.04;
  }
  vec3 hitP=w+d*far;
  float glow=uJet*(.55*exp(-abs(hitP.z-90.)/18.))+uWood*.6*exp(-max(hitP.z-70.,0.)/20.);
  float E=1.-exp(-1.6*e);
  float lit=1.-exp(-1.2*glow);
  vec3 dark=tonemap(ramp(E,clamp(core,0.,1.))*E*1.8+vec3(.9,.36,.08)*lit*.45,1.1);
  float am=max(dark.r,max(dark.g,dark.b));
  vec4 dk=vec4(dark,am);
  vec3 seen=mix(vec3(1.),ramp(E,clamp(core,0.,1.)),smoothstep(0.,.35,E));
  vec4 lt=inkFor(seen,.92*smoothstep(.45,.9,E));
  vec4 tint=inkFor(mix(vec3(1.),vec3(1.,.62,.32),lit),0.)*.75;
  lt=lt+tint*(1.-lt.a);
  vec4 col=mix(dk,lt,uLight)*inWin;
  col.rgb=min(col.rgb,vec3(col.a));
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  col=max(col+n*smoothstep(0.,1.5/255.,col.a),0.);
  gl_FragColor=col;
}`;

// ---------- пар над пароотводами и дым над дефлектором ----------
const VT = D.vents;
const CH = D.chimney;
const AIR = `
uniform float uSteam0;uniform float uSteam1;uniform float uSteam2;uniform float uSmoke;uniform float uSoot;uniform float uLight;
float underRoof(vec2 vb,vec3 o,float h){
  vec3 V=towardViewer();
  vec3 p0=rayOf(vb);
  vec2 vh=normalize(V.xy);
  float t=dot(o.xy-p0.xy,vh)/dot(V.xy,vh);
  vec3 p=p0+V*t;
  vec3 q=p+V*((${f1(D.roof[4])}-p.z)/V.z);
  return window(q.x,${f1(D.roof[0])},${f1(D.roof[1])},1.5)*window(q.y,${f1(D.roof[2])},${f1(D.roof[3])},1.5)*(1.-smoothstep(${f1(D.roof[4] - 2)},${f1(D.roof[4] + 1)},p.z));
}
float plume(vec2 vb,vec3 o,float r0,float spread,float hmax,float speed,float seed,out float hOut){
  vec2 s=project(o);
  float h=(s.y-vb.y)/(uK*uCam.w);
  float drift=h*h*.004+h*.12;
  float x=(vb.x-s.x)/uK-drift;
  float w=r0+h*spread;
  float n=fbm2(vec2(x*.12+seed,h*.09-uTime*speed));
  float body=exp(-pow(abs(x)/(w*(.75+.55*n)),2.));
  float rise=smoothstep(-1.,4.,h)*(1.-smoothstep(hmax*.45,hmax,h+n*hmax*.2));
  hOut=h;
  return body*rise*(.55+.7*n)*(1.-underRoof(vb,o,h));
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float h;
  float st=plume(vb,${vec3(VT[0])},2.6,.75,62.,.9,1.,h)*uSteam0+plume(vb,${vec3(VT[1])},2.6,.75,62.,.9,7.,h)*uSteam1+plume(vb,${vec3(VT[2])},2.6,.75,62.,.9,13.,h)*uSteam2;
  float hs;
  float sm=plume(vb,${vec3(CH)},${f1(CH[3] - 3)},.5,60.,.6,21.,hs)*uSmoke;
  float aS=1.-exp(-st*3.2);
  float aM=1.-exp(-sm*1.1);
  vec3 steamL=mix(vec3(.72,.76,.81),vec3(.93,.94,.95),smoothstep(0.,.8,aS));
  vec3 smokeL=mix(vec3(.62,.62,.62),vec3(.36,.35,.34),uSoot);
  vec4 sL=vec4(steamL*aS*.85,aS*.85);
  vec4 mL=vec4(smokeL*aM*.7,aM*.7);
  vec4 sD=vec4(vec3(.78,.8,.82)*aS*.55,aS*.55);
  vec4 mD=vec4(mix(vec3(.4),vec3(.22),uSoot)*aM*.6,aM*.6);
  vec4 s=mix(sD,sL,uLight);vec4 m=mix(mD,mL,uLight);
  vec4 col=s+m*(1.-s.a);
  col.rgb=min(col.rgb,vec3(col.a));
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)-.5)/255.;
  col=max(col+n*smoothstep(0.,1.5/255.,col.a),0.);
  gl_FragColor=col;
}`;

const layerOpts = { view: [D.W, D.H], camera: D.camera, fixed: { uLight: LIGHT } };
const fire = glLayer({ canvas: stage.querySelector(".kp-fire"), fragment: FIRE, uniforms: ["uJet", "uWood"], ...layerOpts });
const air = glLayer({ canvas: stage.querySelector(".kp-air"), fragment: AIR, uniforms: ["uSteam0", "uSteam1", "uSteam2", "uSmoke", "uSoot"], ...layerOpts });
if (fire && air) stage.setAttribute("data-gl", "");

// ---------- модель ----------
const FUELS = M.FUELS;
const heat = { T: M.T_AIR, steam: 0 };
function stepHeat(fuel, rate, dt) {
  const f = FUELS[fuel];
  const power = (f.eta * rate * f.lhv) / 3600;
  const loss = M.LOSS * (heat.T - M.T_AIR);
  if (heat.T >= M.T_BOIL - 1e-6 && power > loss) {
    heat.T = M.T_BOIL;
    heat.steam = ((power - loss) / M.LATENT) * 3600;
  } else {
    heat.T = Math.min(M.T_BOIL, heat.T + ((power - loss) / M.C) * dt);
    heat.steam = 0;
  }
}
let fuel = "liquid";
let burning = false;
let rate = 0;
let want = FUELS.liquid.nominal;
let minutes = 0;
const env = { jet: { x: 0, v: 0 }, wood: { x: 0, v: 0 }, steam: { x: 0, v: 0 }, smoke: { x: 0, v: 0 }, swap: { x: 1, v: 0 } };

// ---------- тур без участия зрителя ----------
let touring = !still.matches;
let tourClock = 0;
let phase = "cold";
let phaseClock = 0;
let tourFuel = "liquid";
let idleTimer = 0;
function setPhase(next) { phase = next; phaseClock = 0; }
function tourStep(dt) {
  phaseClock += dt;
  if (phase === "cold" && phaseClock > 1.6) { fuel = tourFuel; want = FUELS[fuel].nominal; ignite(true); setPhase("heat"); }
  else if (phase === "heat" && heat.T >= M.T_BOIL) setPhase("boil");
  else if (phase === "boil" && phaseClock > 4) { want = fuel === "liquid" ? 4 : 16; setPhase("simmer"); }
  else if (phase === "simmer" && phaseClock > 7) { ignite(false); setPhase("out"); }
  else if (phase === "out" && phaseClock > 3) setPhase("reset");
  else if (phase === "reset" && phaseClock > 1.2) { heat.T = M.T_AIR; heat.steam = 0; minutes = 0; tourFuel = tourFuel === "liquid" ? "solid" : "liquid"; setPhase("cold"); }
}
function ignite(on) {
  burning = on;
  if (on && heat.T <= M.T_AIR + 0.01) minutes = 0;
}

// ---------- кадр ----------
let frame = 0, last = 0, clock = 0, visible = false;
function draw(dt) {
  const calm = still.matches;
  const f = FUELS[fuel];
  const target = burning ? want : 0;
  rate += (target - rate) * (calm ? 1 : 1 - Math.exp(-dt / 0.5));
  const simDt = dt * M.SPEED;
  if (burning || heat.T > M.T_AIR) minutes += simDt / 60;
  stepHeat(fuel, Math.max(rate, 0), simDt);
  const share = rate / f.max;
  settle(env.jet, fuel === "liquid" && burning ? 0.25 + 0.75 * share : 0, dt, 0.35, calm);
  settle(env.wood, fuel === "solid" && burning ? 0.3 + 0.7 * share : 0, dt, 0.8, calm);
  settle(env.steam, Math.min(1, heat.steam / 30) + (heat.T > 85 ? (heat.T - 85) / 60 : 0), dt, 0.9, calm);
  settle(env.smoke, burning ? (fuel === "solid" ? 0.9 : 0.35 + 0.3 * share) : 0, dt, 1.2, calm);
  settle(env.swap, fuel === "solid" ? 1 : 0, dt, 0.6, calm);
  const fireLevel = Math.max(env.jet.x, env.wood.x);
  cavityEl.style.setProperty("--kp-heat", fireLevel.toFixed(3));
  cavityEl.style.setProperty("--kp-jet", env.jet.x.toFixed(3));
  cavityEl.style.setProperty("--kp-wood-fire", env.wood.x.toFixed(3));
  cavityEl.style.setProperty("--kp-wood", fuel === "solid" || env.wood.x > 0.02 ? "1" : "0");
  const time = calm ? 0.8 : clock;
  if (fire) (env.jet.x > 1e-3 || env.wood.x > 1e-3) ? fire.draw({ uJet: env.jet.x, uWood: env.wood.x }, time) : fire.clear();
  if (air) {
    const s = env.steam.x;
    if (s > 1e-3 || env.smoke.x > 1e-3) air.draw({ uSteam0: s, uSteam1: s * 0.8, uSteam2: s * 0.95, uSmoke: env.smoke.x, uSoot: env.swap.x }, time);
    else air.clear();
  }
  const rateText = rate > 0.05 ? `${fuel === "liquid" ? "форсунки" : "дрова"} ${rate.toFixed(1).replace(".", ",")} кг/ч` : fuel === "liquid" ? "форсунки погашены" : "очаг погашен";
  const state = heat.T >= M.T_BOIL ? `кипит · пар ${Math.round(heat.steam)} кг/ч` : `вода ${Math.round(heat.T)} °C`;
  const text = `${Math.floor(minutes)} мин · ${state} · ${rateText}`;
  if (readout && readout.textContent !== text) readout.textContent = text;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  if (touring) tourStep(dt);
  draw(dt);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
addEventListener("resize", () => draw(0));

// ---------- управление ----------
function takeOver() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { touring = !still.matches; if (touring) { setPhase(burning ? (heat.T >= M.T_BOIL ? "boil" : "heat") : "cold"); tourFuel = fuel; } }, 9000);
}
stage.addEventListener("keydown", (event) => {
  const f = FUELS[fuel];
  if (event.key === " " || event.key === "Enter") { ignite(!burning); if (burning && want < f.min) want = f.nominal; }
  else if (event.key === "f" || event.key === "F" || event.key === "а" || event.key === "А") { fuel = fuel === "liquid" ? "solid" : "liquid"; want = FUELS[fuel].nominal; }
  else if (event.key === "ArrowRight" || event.key === "ArrowUp") want = Math.min(f.max, want + (fuel === "liquid" ? 0.5 : 2));
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") want = Math.max(f.min, want - (fuel === "liquid" ? 0.5 : 2));
  else return;
  event.preventDefault();
  takeOver();
});
stage.addEventListener("click", () => { stage.focus(); ignite(!burning); if (burning) want = FUELS[fuel].nominal; takeOver(); });
if (still.matches) { fuel = "liquid"; burning = true; want = 8.5; rate = 8.5; heat.T = 100; heat.steam = 20; minutes = 60; }
draw(0);
