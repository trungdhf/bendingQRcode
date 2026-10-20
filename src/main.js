import "./style.css";
import { SAMPLE, parsePayload, buildPipe } from "./geometry.js";
import { decodeRGBA } from "./qr.js";
import { drawingSVG } from "./drawing.js";

document.querySelector("#app").innerHTML=`
<header class="topbar"><div class="brand-mark">B<span>↗</span></div><div class="brand">bending<span>QR</span><small>曲げパイプ図面ワークスペース</small></div><div class="local-badge"><i></i> 端末内で処理 · サーバーに送信しません</div></header>
<main><div class="intro"><div><p class="eyebrow">QRコードから図面を作成</p><h1>QRを読み取り、正確な配管形状を作成。</h1><p>カメラでQRコードをスキャンすると、アイソメ図と実寸を表示します。</p></div><span class="format-tag">QR v1 / v2 <b>N1 → N6</b></span></div>
<div class="workspace"><aside>
<section class="card input-card"><div class="section-title"><span>01</span><h2>QRコードをスキャン</h2></div>
<div class="camera-frame"><video id="camera" autoplay muted playsinline aria-label="カメラ映像"></video><div class="camera-placeholder" id="camera-placeholder"><span>▣</span><strong>カメラは停止中です</strong><small>下のボタンを押してスキャンを開始してください</small></div><div class="scan-frame" aria-hidden="true"></div></div>
<div class="camera-actions"><button id="camera-start" class="primary">カメラを起動してスキャン</button><button id="camera-stop" class="secondary" disabled>停止</button></div>
<label class="zoom-control" for="camera-zoom"><span id="zoom-label">ズーム</span><input id="camera-zoom" type="range" min="1" max="4" step="0.1" value="1" disabled/><output id="zoom-value" for="camera-zoom">1.0×</output></label>
<div id="status" class="status" role="status">カメラでQRコードをスキャンします。ブラウザーでカメラへのアクセスを許可してください。</div>
<button id="sample" class="text-button">サンプルデータを表示: DT11-111-7</button></section>
<section class="card info-card"><div class="section-title"><span>02</span><h2>QRコードの寸法</h2></div><div class="part-info"><strong id="part"></strong><small id="material"></small></div><div id="parameters"></div><details class="raw-details"><summary>QRコードの内容を表示</summary><pre id="raw"></pre></details></section>
</aside><div class="main-column"><section class="card drawing-card"><div class="drawing-toolbar"><div><span class="live-dot"></span><strong>配管中心線図</strong></div><div class="exports"><button id="svg-export" class="secondary">SVGをダウンロード</button><button id="png-export" class="secondary">PNGをダウンロード</button><button id="print" class="primary">印刷 / PDF保存</button></div></div>
<div class="view-toolbar"><div class="view-tabs"><button data-view="iso" class="active">アイソメ図</button><button data-view="front">XY</button><button data-view="top">XZ</button><button data-view="side">YZ</button></div><div class="view-controls"><button id="rotate" title="表示方向を90°回転">↻ 表示方向</button><label><input id="points" type="checkbox" checked/> 接続点</label></div></div>
<div id="drawing"></div><div class="drawing-caption"><span><i class="legend-line"></i> 配管中心線</span><span><i class="legend-dot"></i> 接線点 PC / PT</span><span>単位: mm</span></div></section>
<section class="card method-card"><div><span class="section-number">03</span><h2>接線連続の幾何計算</h2><p>直管 N → 曲げ R・θ → 次の直管。ねじり角は曲げ角ではなく、曲げ平面を変えます。</p></div><div class="check-list"><span>接続位置の連続性</span><span>曲げ始点の接線連続</span><span>非平面配管のアイソメ図</span></div></section>
<div class="convention"><strong>ねじり角の規約</strong><p>既定: S から N3 に向かう方向を軸とする右手則で N2 周りに回転します。製作前に機械の規約と照合してください。</p><label><input id="reverse" type="checkbox"/> 機械の回転方向に合わせて符号を反転 (QRコードは変更しません)</label></div>
</div></div><footer>現在のQRコードはN3までです。最終項目は元データのまま保持し、意味は割り当てていません。 <span>この参考図を製作指示として使用しないでください。</span></footer></main>`;

const $=id=>document.getElementById(id);
let spec=parsePayload(SAMPLE), model=buildPipe(spec), view="iso", quarter=0, displaySource="サンプルデータ";
let cameraStream=null, scanFrame=0, scanTimer=0, scanBusy=false;
let cameraTrack=null, cameraZoomMode="digital";
function status(text,error=false) { $("status").textContent=text; $("status").classList.toggle("error",error); }
function render() {
  model=buildPipe(spec,$("reverse").checked ? -1:1);
  $("drawing").innerHTML=drawingSVG(spec,model,{view,quarter,points:$("points").checked,rollSign:$("reverse").checked ? -1:1});
  $("part").textContent=spec.part;
  $("material").textContent=`${spec.material} · Ø${spec.od} × t${spec.wall} · ${displaySource}`;
  const rows=[
    ...spec.straights.map((n,i)=>[`N${i+1} · 直管長`,`${n} mm`]),
    ...spec.bends.map((b,i)=>[`B${i+1} · 曲げ半径 / 曲げ角度`,`R${b.radius} / ${b.angle}°`]),
    ...spec.rolls.map((roll,i)=>[`ねじり角${i+1}`,`${roll}°`]),
    ["展開長",`${model.length.toFixed(2)} mm`],
    ["予備項目 (未定義)",spec.reserved],
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
  spec=next; displaySource=source; $("reverse").checked=false; quarter=0; render();
}
function decodeCanvas(canvas) {
  const image=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
  return decodeRGBA(image.data,image.width,image.height);
}
function stopCamera() {
  window.cancelAnimationFrame(scanFrame);
  window.clearTimeout(scanTimer);
  scanFrame=0;
  scanTimer=0;
  scanBusy=false;
  if(cameraStream) cameraStream.getTracks().forEach(track=>track.stop());
  cameraStream=null;
  cameraTrack=null;
  $("camera").srcObject=null;
  $("camera").classList.remove("active");
  $("camera").style.transform="";
  $("camera-placeholder").hidden=false;
  $("camera-start").disabled=false;
  $("camera-stop").disabled=true;
  $("camera-zoom").disabled=true;
  $("camera-zoom").value="1";
  $("zoom-value").textContent="1.0×";
  $("zoom-label").textContent="ズーム";
}
function configureCameraZoom(track) {
  const zoom=$("camera-zoom"), capabilities=track.getCapabilities?.()?.zoom;
  const min=capabilities?.min ?? 1;
  const max=capabilities?.max ?? 4;
  zoom.min=String(min);
  zoom.max=String(Math.max(min,max));
  zoom.step=String(capabilities?.step ?? 0.1);
  zoom.value=String(Math.min(Math.max(1,min),Math.max(min,max)));
  cameraZoomMode=capabilities ? "native" : "digital";
  zoom.disabled=false;
  $("zoom-label").textContent=capabilities ? "カメラズーム" : "デジタルズーム";
  updateCameraZoom();
}
async function updateCameraZoom() {
  const zoom=$("camera-zoom"), value=Number(zoom.value);
  $("zoom-value").textContent=`${value.toFixed(1)}×`;
  if(cameraZoomMode==="digital") {
    $("camera").style.transform=`scale(${value})`;
    return;
  }
  try {
    await cameraTrack?.applyConstraints({advanced:[{zoom:value}]});
  } catch {
    cameraZoomMode="digital";
    zoom.min="1";
    zoom.max="4";
    zoom.step="0.1";
    zoom.value=String(Math.min(value,4));
    $("zoom-label").textContent="デジタルズーム";
    $("zoom-value").textContent=`${Number(zoom.value).toFixed(1)}×`;
    $("camera").style.transform=`scale(${zoom.value})`;
    status("カメラの光学ズームに対応していないため、デジタルズームを使用します。");
  }
}
function scanCameraFrame() {
  if(!cameraStream || scanBusy) return;
  const video=$("camera");
  if(video.readyState>=2 && video.videoWidth) {
    scanBusy=true;
    try {
      const zoom=cameraZoomMode==="digital" ? Number($("camera-zoom").value) : 1;
      const sourceWidth=video.videoWidth/zoom, sourceHeight=video.videoHeight/zoom;
      const ratio=Math.min(1,1280/sourceWidth);
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(sourceWidth*ratio));
      canvas.height=Math.max(1,Math.round(sourceHeight*ratio));
      const sx=(video.videoWidth-sourceWidth)/2, sy=(video.videoHeight-sourceHeight)/2;
      canvas.getContext("2d",{willReadFrequently:true}).drawImage(
        video,sx,sy,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height,
      );
      const raw=decodeCanvas(canvas);
      if(raw) {
        stopCamera();
        try {
          loadPayload(raw,"カメラ");
          status("QRコードをカメラで読み取りました。");
        } catch(error) {
          status(`${error.message || "QRコードが無効です。"} 前の図面を表示したままにします。`,true);
        }
        scanBusy=false;
        return;
      }
    } catch(error) {
      stopCamera();
      status(`カメラ映像を処理できません: ${error.message}`,true);
      scanBusy=false;
      return;
    }
    scanBusy=false;
  }
  scanTimer=setTimeout(()=>{scanFrame=requestAnimationFrame(scanCameraFrame);},160);
}
async function startCamera() {
  if(cameraStream) return;
  if(!window.navigator.mediaDevices?.getUserMedia) {
    status("このブラウザーはカメラに対応していません。HTTPSまたはlocalhostで開いてください。",true);
    return;
  }
  $("camera-start").disabled=true;
  status("カメラへのアクセス許可を確認しています…");
  try {
    cameraStream=await window.navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
    });
    cameraTrack=cameraStream.getVideoTracks()[0];
    const video=$("camera");
    video.srcObject=cameraStream;
    await video.play();
    configureCameraZoom(cameraTrack);
    video.classList.add("active");
    $("camera-placeholder").hidden=true;
    $("camera-stop").disabled=false;
    status("QRコードをスキャン中です。コードを枠内に合わせてください。");
    scanFrame=requestAnimationFrame(scanCameraFrame);
  } catch(error) {
    stopCamera();
    const message=error.name==="NotAllowedError"
      ? "カメラへのアクセスが許可されていません。ブラウザーの設定でカメラを許可して、もう一度お試しください。"
      : error.name==="NotFoundError"
        ? "このデバイスでカメラが見つかりません。"
        : `カメラを起動できません: ${error.message || error.name}`;
    status(message,true);
  }
}
$("camera-start").addEventListener("click",startCamera);
$("camera-stop").addEventListener("click",()=>{stopCamera();status("カメラを停止しました。");});
$("camera-zoom").addEventListener("input",updateCameraZoom);
$("sample").addEventListener("click",()=>{
  stopCamera();
  try{loadPayload(SAMPLE,"サンプルデータ");status("サンプルデータ DT11-111-7 を表示しています。");}
  catch(error){status(error.message,true);}
});
document.addEventListener("visibilitychange",()=>{if(document.hidden && cameraStream){stopCamera();status("ページを離れたためカメラを停止しました。");}});
window.addEventListener("pagehide",stopCamera);
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
    canvas.toBlob(blob=>{if(blob)save(blob,`${safeName()}_${view}.png`);else status("PNGを出力できません。",true);});
  }catch(e){status(`PNGを出力できません: ${e.message}`,true);}finally{URL.revokeObjectURL(url);}
});
render();
