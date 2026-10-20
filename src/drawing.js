import { arcPoint, projector } from "./geometry.js";

const esc = s => String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" }[c]));
const fmt = n => Number(n.toFixed(2)).toString();
const add3 = (a,b) => a.map((v,i)=>v+b[i]);
const sub3 = (a,b) => a.map((v,i)=>v-b[i]);
const mul3 = (a,s) => a.map(v=>v*s);
const dot3 = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross3 = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit3 = v => { const length=Math.hypot(...v); return length ? mul3(v,1/length) : [1,0,0]; };
function tubeSurface(model, project, screen, scale, radius) {
  const path=[];
  for(const piece of model.pieces) {
    const points=piece.kind==="line"
      ? Array.from({length:17},(_,i)=>piece.points[0].map((v,j)=>v+(piece.points[1][j]-v)*i/16))
      : piece.points;
    for(const point of points) {
      if(!path.length || Math.hypot(...sub3(point,path[path.length-1]))>1e-6) path.push(point);
    }
  }
  const tangents=path.map((point,i)=>unit3(sub3(path[Math.min(i+1,path.length-1)],path[Math.max(i-1,0)])));
  const frames=[];
  for(let i=0;i<tangents.length;i++) {
    const tangent=tangents[i];
    if(i===0) {
      const reference=Math.abs(tangent[2])<0.9 ? [0,0,1] : [0,1,0];
      frames.push(unit3(cross3(tangent,reference)));
      continue;
    }
    const previous=tangents[i-1], previousFrame=frames[i-1];
    const axis=cross3(previous,tangent), sine=Math.hypot(...axis), cosine=dot3(previous,tangent);
    let transported=previousFrame;
    if(sine>1e-8) {
      const unitAxis=mul3(axis,1/sine);
      transported=add3(add3(mul3(previousFrame,cosine),mul3(cross3(unitAxis,previousFrame),sine)),
        mul3(unitAxis,dot3(unitAxis,previousFrame)*(1-cosine)));
    }
    frames.push(unit3(sub3(transported,mul3(tangent,dot3(transported,tangent)))));
  }
  const centers=path.map(point=>screen(point));
  const upper=[], lower=[];
  for(let i=0;i<path.length;i++) {
    const previous=centers[Math.max(i-1,0)], next=centers[Math.min(i+1,path.length-1)];
    const dx=next[0]-previous[0], dy=next[1]-previous[1], length=Math.hypot(dx,dy)||1;
    const normal2=[-dy/length,dx/length];
    const frameV=cross3(tangents[i],frames[i]);
    const radialU=project(add3(path[i],mul3(frames[i],radius))).map((v,j)=>v-project(path[i])[j]);
    const radialV=project(add3(path[i],mul3(frameV,radius))).map((v,j)=>v-project(path[i])[j]);
    const projectedU=[radialU[0]*scale,-radialU[1]*scale];
    const projectedV=[radialV[0]*scale,-radialV[1]*scale];
    const halfWidth=Math.max(1,Math.hypot(dot3(projectedU,normal2),dot3(projectedV,normal2)));
    upper.push([centers[i][0]+normal2[0]*halfWidth*0.5,centers[i][1]+normal2[1]*halfWidth*0.5]);
    lower.push([centers[i][0]-normal2[0]*halfWidth*0.5,centers[i][1]-normal2[1]*halfWidth*0.5]);
  }
  const curve=points=>points.map((point,i)=>`${i?"L":"M"}${fmt(point[0])} ${fmt(point[1])}`).join(" ");
  const lowerEdge=[...lower].reverse().map(point=>`L${fmt(point[0])} ${fmt(point[1])}`).join(" ");
  const outline=`${curve(upper)} ${lowerEdge} Z`;
  return `<path class="tube" d="${outline}"/>`+
    `<path class="tube-highlight" d="${curve(upper)}"/>`+
    `<path class="tube-shadow" d="${curve(lower)}"/>`+
    `<circle class="tube-cap" cx="${fmt(centers[0][0])}" cy="${fmt(centers[0][1])}" r="${fmt(Math.max(2,(upper[0][0]-lower[0][0])/2))}"/>`+
    `<circle class="tube-cap" cx="${fmt(centers.at(-1)[0])}" cy="${fmt(centers.at(-1)[1])}" r="${fmt(Math.max(2,(upper.at(-1)[0]-lower.at(-1)[0])/2))}"/>`;
}
export function drawingSVG(spec, model, { view="iso", quarter=0, points=true } = {}) {
  const viewName = { iso:"アイソメ図", front:"XY平面", top:"XZ平面", side:"YZ平面" }[view] ?? view.toUpperCase();
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
  let body = tubeSurface(model,project,screen,scale,spec.od/2);
  for (const p of model.pieces) {
    const q=p.points.map(screen);
    body += `<polyline points="${q.map(xy).join(" ")}" class="pipe-centerline"/>`;
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
    body+=`<text x="${fmt(label[0])}" y="${fmt(label[1])}" class="bend-label"><tspan x="${fmt(label[0])}">B${i+1} · R ${fmt(b.radius)}</tspan><tspan x="${fmt(label[0])}" dy="23">${fmt(b.angle)}°</tspan></text>`;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 660" role="img" aria-label="${esc(spec.part)} の配管図">
  <defs><linearGradient id="tube-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7eaf2"/><stop offset=".48" stop-color="#b8d2de"/><stop offset="1" stop-color="#8daab7"/></linearGradient>
  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2c647b"/></marker>
  <marker id="axis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a9ba5"/></marker>
  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#dce4e8"/></pattern></defs>
  <style>
  text{font-family:Arial,sans-serif} .tube{fill:url(#tube-fill);stroke:#8ba7b3;stroke-width:1.2;stroke-linejoin:round}
  .tube-highlight{fill:none;stroke:#fff;stroke-opacity:.58;stroke-width:1.5;stroke-linecap:round}
  .tube-shadow{fill:none;stroke:#315f72;stroke-opacity:.25;stroke-width:1.1;stroke-linecap:round}
  .tube-cap{fill:#b9d2de;stroke:#7898a7;stroke-width:1}
  .pipe-centerline{fill:none;stroke:#087e9a;stroke-width:2;stroke-dasharray:8 5;stroke-linejoin:round;stroke-linecap:round}
  .dimension,.leader{stroke:#2c647b;stroke-width:1.1;fill:none}.extension{stroke:#afbdc5;stroke-width:0.8}
  .dim-label{font-size:17px;fill:#204e65;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:#fff;stroke-width:7px;stroke-linejoin:round}
  .bend-label{font-size:16px;fill:#204e65;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:4px}
  .point-label{font-size:11px;fill:#a05a2a;paint-order:stroke;stroke:#fff;stroke-width:3px}.triad{stroke:#8a9ba5;stroke-width:1.3}.axis-label{font-size:12px;fill:#7a8c96;text-anchor:middle}
  </style>
  <rect width="1000" height="660" fill="white"/><rect x="22" y="82" width="956" height="490" fill="url(#grid)"/>
  <text x="34" y="35" fill="#173c50" font-size="22" font-weight="700">${esc(spec.part)}</text>
  <text x="34" y="60" fill="#718793" font-size="12">${esc(spec.material)} · 外径 ${fmt(spec.od)} × 肉厚 ${fmt(spec.wall)} · mm · ${esc(viewName)}</text>
  <text x="966" y="35" text-anchor="end" font-size="11" fill="#718793">配管中心線図 · 縮尺なし</text>
  ${body}
  </svg>`;
}
