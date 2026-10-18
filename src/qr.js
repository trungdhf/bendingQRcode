import jsQR from "jsqr";

export function finderCenters(data, width, height) {
  const dark = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const i = (y*width+x)*4;
    return data[i]+data[i+1]+data[i+2] < 384;
  };
  const centers = [];
  for (let y = 1; y < height-1; y += 2) {
    const runs = [];
    let start = 0, previous = dark(0, y);
    for (let x = 1; x <= width; x++) {
      const current = x < width ? dark(x, y) : !previous;
      if (current === previous) continue;
      runs.push({ start, length: x-start, dark: previous });
      if (runs.length > 5) runs.shift();
      if (runs.length === 5 && runs[0].dark && !runs[1].dark && runs[2].dark && !runs[3].dark && runs[4].dark) {
        const total = runs.reduce((s,r)=>s+r.length, 0), module = total/7;
        const expected = [1,1,3,1,1];
        if (module >= 1.3 && runs.every((r,i)=>Math.abs(r.length/module-expected[i]) < expected[i]*0.45)) {
          const cx = Math.round(runs[2].start + runs[2].length/2);
          let up = y, down = y;
          while (up >= 0 && dark(cx, up)) up--;
          while (down < height && dark(cx, down)) down++;
          const cy = (up+down)/2;
          const lengths = [down-up-1];
          for (const [begin, sign] of [[up,-1],[down,1]]) {
            let cursor = begin, white = 0, black = 0;
            while (cursor >= 0 && cursor < height && !dark(cx,cursor) && white < module*3) { white++; cursor += sign; }
            while (cursor >= 0 && cursor < height && dark(cx,cursor) && black < module*3) { black++; cursor += sign; }
            lengths.push(white, black);
          }
          const verticalMatch = Math.abs(lengths[0]/module-3) < 1.3
            && [lengths[1], lengths[3]].every(n=>Math.abs(n/module-1)<0.65)
            && [lengths[2], lengths[4]].every(n=>n/module>=0.5);
          if (verticalMatch) {
            const found = centers.find(c=>Math.hypot(c.x-cx,c.y-cy)<module*1.8);
            if (found) {
              found.x = (found.x*found.count+cx)/(found.count+1);
              found.y = (found.y*found.count+cy)/(found.count+1);
              found.count++;
            } else centers.push({ x: cx, y: cy, module, count: 1 });
          }
        }
      }
      start = x; previous = current;
    }
  }
  return centers.filter(c=>c.count>=2).sort((a,b)=>b.count-a.count).slice(0,80);
}

export function qrCandidates(data, width, height) {
  const centers = finderCenters(data,width,height), boxes = [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = i+1; j < centers.length; j++) {
      for (let k = j+1; k < centers.length; k++) {
        const c = [centers[i],centers[j],centers[k]];
        const modules = c.map(p=>p.module);
        if (Math.max(...modules)/Math.min(...modules)>1.5) continue;
        const sides = [Math.hypot(c[0].x-c[1].x,c[0].y-c[1].y),Math.hypot(c[0].x-c[2].x,c[0].y-c[2].y),Math.hypot(c[1].x-c[2].x,c[1].y-c[2].y)].sort((a,b)=>a-b);
        const module = modules.reduce((a,b)=>a+b,0)/3;
        if (sides[0] < module*12 || sides[0] > module*175 || sides[1]/sides[0]>1.15 || Math.abs(sides[2]/Math.hypot(sides[0],sides[1])-1)>0.09) continue;
        const xs=c.map(p=>p.x), ys=c.map(p=>p.y);
        // The recovery pass is for axis-aligned codes touching form rules.
        if (Math.abs((Math.max(...xs)-Math.min(...xs))/sides[0]-1)>0.1 || Math.abs((Math.max(...ys)-Math.min(...ys))/sides[0]-1)>0.1) continue;
        boxes.push({ x: Math.min(...xs)-module*3.5, y: Math.min(...ys)-module*3.5,
          w: Math.max(...xs)-Math.min(...xs)+module*7, h: Math.max(...ys)-Math.min(...ys)+module*7,
          module, score: c.reduce((n,p)=>n+p.count,0) });
      }
    }
  }
  return boxes.sort((a,b)=>b.score-a.score).slice(0,30);
}

function crop(data, width, height, box, margin) {
  const x = Math.max(0,Math.round(box.x+margin)), y = Math.max(0,Math.round(box.y+margin));
  const w = Math.min(width-x,Math.round(box.w-2*margin)), h = Math.min(height-y,Math.round(box.h-2*margin));
  if (w < 21 || h < 21) return null;
  const border = Math.ceil(box.module*5), ow = w+border*2, oh = h+border*2;
  const out = new Uint8ClampedArray(ow*oh*4).fill(255);
  for (let row = 0; row < h; row++) out.set(data.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),((row+border)*ow+border)*4);
  return { data: out, width: ow, height: oh };
}

export function decodeRGBA(data, width, height) {
  if (data.length !== width*height*4 || width < 1 || height < 1) throw new Error("Dữ liệu ảnh không hợp lệ.");
  const direct = jsQR(data,width,height,{ inversionAttempts: "attemptBoth" });
  if (direct) return direct.data;
  for (const box of qrCandidates(data,width,height)) {
    for (const margin of [0,0.3,-0.3,0.6]) {
      const image = crop(data,width,height,box,margin*box.module);
      if (!image) continue;
      const found = jsQR(image.data,image.width,image.height,{ inversionAttempts: "dontInvert" });
      if (found) return found.data;
    }
  }
  return null;
}
