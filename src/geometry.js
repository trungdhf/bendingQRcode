export const SAMPLE = "93131310540501,DT11-111-7,STPG370,114.3,6.0,170,43.4,170,100.0,-83.14,112,304,213,0";
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const mul = (a, s) => a.map(v => v * s);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const norm = a => Math.hypot(...a);
const radians = deg => deg * Math.PI / 180;
export function rotate(v, axis, degrees) {
  const a = radians(degrees);
  return add(add(mul(v, Math.cos(a)), mul(cross(axis, v), Math.sin(a))), mul(axis, dot(axis, v)*(1-Math.cos(a))));
}
export function parsePayload(raw) {
  const f = raw.trim().split(",").map(v => v.trim());
  if (f.length !== 14) throw new Error(`現在のQRコードは14項目 (N3まで) が必要です。項目数: ${f.length}。拡張形式には対応していません。`);
  if (f.some(v => v === "")) throw new Error("QRコードに空の項目があります。");
  const number = i => {
    const v = Number(f[i]);
    if (!Number.isFinite(v)) throw new Error(`${i+1}番目の項目が有効な数値ではありません。`);
    return v;
  };
  const spec = {
    order: f[0], part: f[1], material: f[2], od: number(3), wall: number(4),
    bends: [{ radius: number(5), angle: number(6) }, { radius: number(7), angle: number(8) }],
    rolls: [number(9)], straights: [number(10), number(11), number(12)], reserved: f[13], raw: raw.trim(),
  };
  validate(spec);
  return spec;
}
export function validate(spec) {
  if (!Array.isArray(spec.straights) || !Array.isArray(spec.bends) || !Array.isArray(spec.rolls)) throw new Error("直管、曲げ、ねじり角のデータがありません。");
  if (spec.straights.length !== spec.bends.length+1 || spec.rolls.length !== Math.max(0, spec.bends.length-1)) throw new Error("直管、曲げ、ねじり角の数が一致しません。");
  if (!Number.isFinite(spec.od) || !Number.isFinite(spec.wall) || spec.od <= 0 || spec.wall <= 0 || spec.wall*2 >= spec.od) throw new Error("外径または肉厚が無効です。");
  if (spec.straights.some(n => !Number.isFinite(n) || n <= 0)) throw new Error("直管長は0より大きい値にしてください。");
  if (spec.bends.some(b => !Number.isFinite(b.radius) || !Number.isFinite(b.angle) || b.radius <= spec.od/2 || b.angle <= 0 || b.angle >= 180)) throw new Error("曲げ半径は外径の半分より大きく、曲げ角度は0°より大きく180°未満にしてください。");
  if (spec.rolls.some(r => !Number.isFinite(r))) throw new Error("ねじり角が無効です。");
}
export function arcPoint(b, t) {
  return add(b.start, mul(add(mul(b.incoming, Math.sin(t)), mul(b.normal, 1-Math.cos(t))), b.radius));
}
export const arcTangent = (b, t) => add(mul(b.incoming, Math.cos(t)), mul(b.normal, Math.sin(t)));
export function buildPipe(spec, rollSign = 1) {
  validate(spec);
  if (![1, -1].includes(rollSign)) throw new Error("ねじり方向は+1または-1にしてください。");
  let p = [0, 0, 0], d = [1, 0, 0], u = [0, 1, 0];
  const lines = [], bends = [], pieces = [], labels = [{ name: "S", point: p }];
  for (let i = 0; i < spec.straights.length; i++) {
    const end = add(p, mul(d, spec.straights[i]));
    lines.push({ start: p, end, direction: d, length: spec.straights[i] });
    pieces.push({ kind: "line", points: [p, end] });
    p = end;
    if (i === spec.bends.length) break;
    if (i) u = rotate(u, d, spec.rolls[i-1] * rollSign);
    const b = { ...spec.bends[i], start: p, incoming: d, normal: u };
    const theta = radians(b.angle);
    b.end = arcPoint(b, theta);
    b.center = add(p, mul(u, b.radius));
    bends.push(b);
    labels.push({ name: `PC${i+1}`, point: p }, { name: `PT${i+1}`, point: b.end });
    pieces.push({ kind: "arc", points: Array.from({ length: 101 }, (_, k) => arcPoint(b, theta*k/100)) });
    p = b.end;
    const nextD = arcTangent(b, theta);
    u = add(mul(d, -Math.sin(theta)), mul(u, Math.cos(theta)));
    d = nextD;
  }
  labels.push({ name: `N${spec.straights.length} 終点`, point: p });
  return { lines, bends, pieces, labels, length: spec.straights.reduce((a,b)=>a+b,0) + spec.bends.reduce((s,b)=>s+b.radius*radians(b.angle),0) };
}
export function projector(view = "iso", quarter = 0) {
  const isoU = [1/Math.sqrt(2), 1/Math.sqrt(2), 0];
  const isoV = [-1/Math.sqrt(6), 1/Math.sqrt(6), 2/Math.sqrt(6)];
  return p => {
    const v = rotate(p, [0, 0, 1], quarter*90);
    if (view === "front") return [v[0], v[1]];
    if (view === "top") return [v[0], v[2]];
    if (view === "side") return [v[1], v[2]];
    return [dot(v, isoU), dot(v, isoV)];
  };
}
