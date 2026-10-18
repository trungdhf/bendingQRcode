import { arcPoint, projector } from "./geometry.js";

const esc = s => String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" }[c]));
const fmt = n => Number(n.toFixed(2)).toString();
export function drawingSVG(spec, model, { view="iso", quarter=0, points=true, rollSign=1 } = {}) {
  const project = projector(view, quarter);
  const all = model.pieces.flatMap(p=>p.points).map(project);
  const xs=all.map(p=>p[0]), ys=all.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const scale = Math.min(740/Math.max(100,maxX-minX),360/Math.max(100,maxY-minY));
  const screen = p => {
    const q=project(p);
    return [490+(q[0]-(minX+maxX)/2)*scale,310-(q[1]-(minY+maxY)/2)*scale];
  };
  const xy = p => p.map(fmt).join(",");
  const line = (a,b,cls,extra="")=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" class="${cls}" ${extra}/>`;
  let body = "";
  for (const p of model.pieces) {
    const q=p.points.map(screen);
    body += `<polyline points="${q.map(xy).join(" ")}" class="pipe"/>`;
  }
  for (let i=0;i<model.lines.length;i++) {
    const l=model.lines[i], a=screen(l.start), b=screen(l.end), dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy);
    if (len < 12) continue;
    const offset=[52,-65,-83][i] ?? 65;
    const n=[-dy/len,dx/len];
    const da=a.map((v,j)=>v+n[j]*offset), db=b.map((v,j)=>v+n[j]*offset);
    for (const [p,d] of [[a,da],[b,db]]) body+=line(p,d.map((v,j)=>v+n[j]*Math.sign(offset)*7),"extension");
    body+=line(da,db,"dimension",'marker-start="url(#arrow)" marker-end="url(#arrow)"');
    const m=da.map((v,j)=>(v+db[j])/2);
    let angle=Math.atan2(dy,dx)*180/Math.PI;
    if(angle>90||angle < -90) angle+=180;
    const label=`N${i+1} = ${fmt(l.length)}`;
    body+=`<text x="${fmt(m[0])}" y="${fmt(m[1])}" transform="rotate(${fmt(angle)} ${xy(m).replace(","," ")})" class="dim-label">${label}</text>`;
  }
  for(let i=0;i<model.bends.length;i++) {
    const b=model.bends[i], at=screen(arcPoint(b,b.angle*Math.PI/360));
    const label=[at[0]+(i ? -42:0),at[1]-105];
    body+=line([label[0],label[1]+17],at,"leader",'marker-end="url(#arrow)"');
    body+=`<text x="${fmt(label[0])}" y="${fmt(label[1])}" class="bend-label"><tspan x="${fmt(label[0])}">B${i+1} · R${fmt(b.radius)}</tspan><tspan x="${fmt(label[0])}" dy="23">${fmt(b.angle)}°</tspan></text>`;
  }
  if(points) for (const {name,point} of model.labels) {
    const p=screen(point);
    body+=`<circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="4" fill="#b86930"/><text x="${fmt(p[0]+8)}" y="${fmt(p[1]+19)}" class="point-label">${esc(name)}</text>`;
  }
  const origin=[100,530];
  for(const [p,name] of [[[1,0,0],"X"],[[0,1,0],"Y"],[[0,0,1],"Z"]]) {
    const q=project(p), end=[origin[0]+q[0]*55,origin[1]-q[1]*55];
    body+=line(origin,end,"triad",'marker-end="url(#axis-arrow)"');
    body+=`<text x="${fmt(origin[0]+q[0]*72)}" y="${fmt(origin[1]-q[1]*72)}" class="axis-label">${name}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 660" role="img" aria-label="Bản vẽ ống ${esc(spec.part)}">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2c647b"/></marker>
  <marker id="axis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a9ba5"/></marker>
  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#dce4e8"/></pattern></defs>
  <style>
  text{font-family:Arial,sans-serif} .pipe{fill:none;stroke:#176b81;stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round}
  .dimension,.leader{stroke:#2c647b;stroke-width:1.1;fill:none}.extension{stroke:#afbdc5;stroke-width:0.8}
  .dim-label{font-size:17px;fill:#204e65;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:#fff;stroke-width:7px;stroke-linejoin:round}
  .bend-label{font-size:16px;fill:#204e65;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:4px}
  .point-label{font-size:11px;fill:#a05a2a;paint-order:stroke;stroke:#fff;stroke-width:3px}.triad{stroke:#8a9ba5;stroke-width:1.3}.axis-label{font-size:12px;fill:#7a8c96;text-anchor:middle}
  </style>
  <rect width="1000" height="660" fill="white"/><rect x="22" y="82" width="956" height="490" fill="url(#grid)"/>
  <text x="34" y="35" fill="#173c50" font-size="22" font-weight="700">${esc(spec.part)}</text>
  <text x="34" y="60" fill="#718793" font-size="12">${esc(spec.material)} · OD ${fmt(spec.od)} × t${fmt(spec.wall)} · mm · ${view==="iso" ? "ISOMETRIC" : esc(view.toUpperCase())}</text>
  <text x="966" y="35" text-anchor="end" font-size="11" fill="#718793">CENTERLINE DRAWING · NOT TO SCALE</text>
  ${body}
  <path d="M34 588H966" stroke="#dce4e8"/>
  <text x="34" y="612" fill="#173c50" font-size="13">Roll B1 → B2: ${fmt(spec.rolls[0]*rollSign)}° · True N lengths shown · Developed: ${fmt(model.length)} mm</text>
  <text x="34" y="637" fill="#9b682e" font-size="11">Right-hand roll about travel direction. Confirm machine convention. Reference only, not for fabrication.</text>
  </svg>`;
}
