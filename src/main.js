import "./style.css";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import { SAMPLE, parsePayload, buildPipe } from "./geometry.js";
import { decodeRGBA } from "./qr.js";
import { drawingSVG } from "./drawing.js";

pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerSource],{type:"text/javascript"}));
document.querySelector("#app").innerHTML=`
<header class="topbar"><div class="brand-mark">B<span>↗</span></div><div class="brand">bending<span>QR</span><small>PIPE DRAWING WORKSPACE</small></div><div class="local-badge"><i></i> Xử lý cục bộ · Không tải file lên server</div></header>
<main><div class="intro"><div><p class="eyebrow">TỪ PHIẾU UỐN ĐẾN BẢN VẼ</p><h1>Đọc QR. Dựng đúng đường ống.</h1><p>Chọn PDF hoặc ảnh có mã QR — xem ngay hình isometric và kích thước thật.</p></div><span class="format-tag">QR v1 <b>N1 → N3</b></span></div>
<div class="workspace"><aside>
<section class="card input-card"><div class="section-title"><span>01</span><h2>Nguồn dữ liệu</h2></div>
<label class="dropzone" id="dropzone" tabindex="0"><input id="file" type="file" accept=".pdf,image/*"/><div class="upload-icon">↥</div><strong>Chọn PDF hoặc ảnh QR</strong><small>hoặc kéo thả file vào đây · tối đa 25 MB</small><span class="choose-file">Chọn file</span></label>
<div id="status" class="status" role="status">Đang hiển thị dữ liệu mẫu. Chọn file của anh để đọc QR.</div>
<details class="manual"><summary>Dán nội dung QR thủ công</summary><label for="payload">Chuỗi CSV từ mã QR</label><textarea id="payload" rows="5" spellcheck="false"></textarea><button id="apply" class="secondary">Đọc chuỗi QR</button></details>
<button id="sample" class="text-button">Dùng dữ liệu mẫu DT11-111-7</button></section>
<section class="card info-card"><div class="section-title"><span>02</span><h2>Thông số từ QR</h2></div><div class="part-info"><strong id="part"></strong><small id="material"></small></div><div id="parameters"></div><details class="raw-details"><summary>Xem nguyên văn QR</summary><pre id="raw"></pre></details></section>
</aside><div class="main-column"><section class="card drawing-card"><div class="drawing-toolbar"><div><span class="live-dot"></span><strong>Bản vẽ đường tâm</strong></div><div class="exports"><button id="svg-export" class="secondary">Tải SVG</button><button id="png-export" class="secondary">Tải PNG</button><button id="print" class="primary">In / Lưu PDF</button></div></div>
<div class="view-toolbar"><div class="view-tabs"><button data-view="iso" class="active">Isometric</button><button data-view="front">XY</button><button data-view="top">XZ</button><button data-view="side">YZ</button></div><div class="view-controls"><button id="rotate" title="Đổi hướng nhìn 90°">↻ Đổi hướng</button><label><input id="points" type="checkbox" checked/> Điểm nối</label></div></div>
<div id="drawing"></div><div class="drawing-caption"><span><i class="legend-line"></i> Đường tâm ống</span><span><i class="legend-dot"></i> Điểm tiếp tuyến PC / PT</span><span>Đơn vị: mm</span></div></section>
<section class="card method-card"><div><span class="section-number">03</span><h2>Hình học nối tiếp tuyến</h2><p>Đoạn thẳng N → cung R, θ → đoạn thẳng tiếp theo. Góc xoay thay đổi mặt phẳng uốn, không phải góc uốn.</p></div><div class="check-list"><span>Vị trí nối liên tục</span><span>Tiếp tuyến tại đầu cung</span><span>Isometric khi ống ra khỏi mặt phẳng</span></div></section>
<div class="convention"><strong>Quy ước góc xoay</strong><p>Mặc định: quy tắc tay phải quanh N2 theo chiều S → N3. Cần đối chiếu với máy trước khi chế tạo.</p><label><input id="reverse" type="checkbox"/> Đảo dấu để đối chiếu chiều xoay máy (không sửa QR)</label></div>
</div></div><footer>QR hiện tại chủ đích chỉ chứa đến N3. Trường cuối được giữ nguyên, chưa gán ý nghĩa. <span>Không dùng bản tham khảo này làm lệnh chế tạo.</span></footer></main>`;

const $=id=>document.getElementById(id);
let spec=parsePayload(SAMPLE), model=buildPipe(spec), view="iso", quarter=0, busy=false, displaySource="Dữ liệu mẫu";
$("payload").value=SAMPLE;
function status(text,error=false) { $("status").textContent=text; $("status").classList.toggle("error",error); }
function render() {
  model=buildPipe(spec,$("reverse").checked ? -1:1);
  $("drawing").innerHTML=drawingSVG(spec,model,{view,quarter,points:$("points").checked,rollSign:$("reverse").checked ? -1:1});
  $("part").textContent=spec.part;
  $("material").textContent=`${spec.material} · Ø${spec.od} × t${spec.wall} · ${displaySource}`;
  const rows=[
    ...spec.straights.map((n,i)=>[`N${i+1} · đoạn thẳng`,`${n} mm`]),
    ...spec.bends.map((b,i)=>[`B${i+1} · bán kính / góc uốn`,`R${b.radius} / ${b.angle}°`]),
    ["ネレ1 · góc xoay",`${spec.rolls[0]}°`],
    ["Chiều dài triển khai",`${model.length.toFixed(2)} mm`],
    ["Trường cuối (chưa định nghĩa)",spec.reserved],
  ];
  $("parameters").replaceChildren(...rows.map(([k,v])=>{
    const row=document.createElement("div"); row.className="parameter";
    const key=document.createElement("span"), value=document.createElement("b");
    key.textContent=k; value.textContent=v; row.append(key,value); return row;
  }));
  $("raw").textContent=spec.raw;
}
function loadPayload(raw,source) {
  const next=parsePayload(raw);
  spec=next; displaySource=source; $("payload").value=raw; $("reverse").checked=false; quarter=0; render();
}
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
function decodeCanvas(canvas) {
  const image=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
  return decodeRGBA(image.data,image.width,image.height);
}
async function readPDF(file) {
  const task=pdfjs.getDocument({ data:new Uint8Array(await file.arrayBuffer()), isEvalSupported:false, useSystemFonts:true });
  let doc;
  try {
    doc=await task.promise;
    const limit=Math.min(doc.numPages,20);
    for(let i=1;i<=limit;i++) {
      status(`Đang đọc QR trang ${i}/${doc.numPages}…`); await nextFrame();
      const page=await doc.getPage(i), base=page.getViewport({scale:1});
      const canvas=document.createElement("canvas");
      const viewport=page.getViewport({scale:Math.min(5,4400/Math.max(base.width,base.height))});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      try {
        await page.render({canvasContext:canvas.getContext("2d"),viewport,background:"rgb(255,255,255)"}).promise;
        const result=decodeCanvas(canvas);
        if(result) return {raw:result,source:`PDF · trang ${i}`};
      } finally { canvas.width=1;canvas.height=1;page.cleanup(); }
    }
    throw new Error(`Không đọc được QR trong ${limit} trang đầu. Thử ảnh rõ hơn hoặc dán chuỗi QR thủ công.`);
  } finally { if(doc) await doc.destroy(); else await task.destroy(); }
}
async function readImage(file) {
  const bitmap=await createImageBitmap(file);
  try {
    const ratio=Math.min(1,4400/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio)); canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const raw=decodeCanvas(canvas);canvas.width=1;canvas.height=1;
    if(!raw) throw new Error("Không đọc được QR trong ảnh. Thử ảnh gốc rõ nét hoặc dán chuỗi QR.");
    return {raw,source:"Ảnh QR"};
  } finally { bitmap.close(); }
}
async function readFile(file) {
  if(!file || busy) return;
  if(file.size>25*1024*1024) {status("File vượt quá giới hạn 25 MB.",true);return;}
  busy=true; $("file").disabled=true;status("Đang mở file và tìm QR…");await nextFrame();
  try {
    const result=file.type==="application/pdf"||/\.pdf$/i.test(file.name) ? await readPDF(file) : await readImage(file);
    loadPayload(result.raw,result.source);
    status(`Đã đọc QR thành công · ${result.source}. Bản vẽ được dựng từ QR, không lấy số từ bảng PDF.`);
  } catch(error) { status(`${error.message || "Không đọc được file."} Bản vẽ đang hiển thị vẫn là dữ liệu trước.`,true); }
  finally {busy=false;$("file").disabled=false;$("file").value="";}
}
$("file").addEventListener("change",e=>readFile(e.target.files[0]));
$("dropzone").addEventListener("dragover",e=>{e.preventDefault();$("dropzone").classList.add("dragging");});
$("dropzone").addEventListener("dragleave",()=> $("dropzone").classList.remove("dragging"));
$("dropzone").addEventListener("drop",e=>{e.preventDefault();$("dropzone").classList.remove("dragging");readFile(e.dataTransfer.files[0]);});
$("dropzone").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("file").click();}});
$("apply").addEventListener("click",()=>{
  if(busy)return;
  try{loadPayload($("payload").value,"Chuỗi nhập tay");status("Đã dựng hình từ chuỗi QR.");}catch(e){status(e.message,true);}
});
$("sample").addEventListener("click",()=>{if(busy)return;loadPayload(SAMPLE,"Dữ liệu mẫu");status("Đang hiển thị dữ liệu mẫu DT11-111-7.");});
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>{
  view=button.dataset.view;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b===button));render();
}));
$("rotate").addEventListener("click",()=>{quarter=(quarter+1)%4;render();});
for(const id of ["points","reverse"])$(id).addEventListener("change",render);
$("print").addEventListener("click",()=>window.print());
function save(blob,name) {const a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function safeName(){return spec.part.replace(/[^a-z0-9._-]/gi,"_");}
$("svg-export").addEventListener("click",()=>save(new Blob([$("drawing").innerHTML],{type:"image/svg+xml"}),`${safeName()}_${view}.svg`));
$("png-export").addEventListener("click",async()=>{
  const url=URL.createObjectURL(new Blob([$("drawing").innerHTML],{type:"image/svg+xml"}));
  try {
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement("canvas");canvas.width=2400;canvas.height=1584;
    canvas.getContext("2d").drawImage(img,0,0,2400,1584);
    canvas.toBlob(blob=>{if(blob)save(blob,`${safeName()}_${view}.png`);else status("Không xuất được PNG.",true);});
  }catch(e){status(`Không xuất được PNG: ${e.message}`,true);}finally{URL.revokeObjectURL(url);}
});
render();
