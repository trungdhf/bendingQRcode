import "./style.css";
import { Capacitor } from "@capacitor/core";
import { BarcodeFormat, BarcodeScanner, LensFacing, Resolution } from "@capacitor-mlkit/barcode-scanning";
import { SAMPLE, parsePayload, buildPipe } from "./geometry.js";
import { decodeRGBA } from "./qr.js";
import { drawingSVG } from "./drawing.js";

document.querySelector("#app").innerHTML=`
<main class="compact-app">
<nav class="app-tabs" role="tablist" aria-label="画面を選択">
<button id="camera-tab" class="app-tab active" type="button" role="tab" aria-selected="true" aria-controls="workspace" data-app-tab="camera">QRカメラ</button>
<button id="result-tab" class="app-tab" type="button" role="tab" aria-selected="false" aria-controls="workspace" data-app-tab="result">読み取り結果</button>
<button id="dimensions-tab" class="app-tab" type="button" role="tab" aria-selected="false" aria-controls="workspace" data-app-tab="dimensions">寸法</button>
</nav>
<div id="workspace" class="workspace" data-active-tab="camera" role="tabpanel" aria-labelledby="camera-tab"><aside>
<section id="camera-card" class="card input-card"><div class="section-title"><span>01</span><h2>QRコードをスキャン</h2></div>
<div class="camera-frame"><video id="camera" autoplay muted playsinline aria-label="カメラ映像"></video><div class="camera-placeholder" id="camera-placeholder"><span>▣</span><strong>QRカメラタブを選択してスキャン</strong><small>選択するとカメラが起動します</small></div><div class="scan-frame" aria-hidden="true"></div></div>
<div class="camera-actions"><button id="camera-start" class="primary">カメラを起動してスキャン</button><button id="camera-stop" class="secondary" disabled>停止</button></div>
<label class="zoom-control" for="camera-zoom"><span id="zoom-label">ズーム</span><input id="camera-zoom" type="range" min="1" max="4" step="0.1" value="1" disabled/><output id="zoom-value" for="camera-zoom">1.0×</output></label>
<div id="status" class="status" role="status">カメラでQRコードをスキャンします。カメラへのアクセスを許可してください。</div>
<div id="native-scan-overlay" class="native-scan-overlay" hidden aria-label="QRコードスキャナー">
<div class="native-scan-header"><strong>QRコードを枠内に合わせてください</strong><button id="native-camera-stop" type="button">閉じる</button></div>
<div class="native-scan-frame" aria-hidden="true"></div>
<label class="native-zoom-control" for="native-camera-zoom"><span>ズーム</span><input id="native-camera-zoom" type="range" min="1" max="4" step="0.1" value="1"/><output id="native-zoom-value" for="native-camera-zoom">1.0×</output></label>
</div>
<button id="sample" class="text-button">サンプルデータを表示: DT11-111-7</button></section>
<section id="result-info" class="card info-card"><div class="section-title"><span>02</span><h2>QRコードの寸法</h2></div><div class="part-info"><strong id="part"></strong><small id="material"></small></div><div id="parameters"></div><details class="raw-details"><summary>QRコードの内容を表示</summary><pre id="raw"></pre></details></section>
</aside><div id="main-column" class="main-column"><section class="card drawing-card"><div class="drawing-toolbar"><div><span class="live-dot"></span><strong>配管中心線図</strong></div><div class="exports"><button id="svg-export" class="secondary">SVGをダウンロード</button><button id="png-export" class="secondary">PNGをダウンロード</button><button id="print" class="primary">印刷 / PDF保存</button></div></div>
<div class="view-toolbar"><div class="view-tabs"><button data-view="iso" class="active">アイソメ図</button><button data-view="front">XY</button><button data-view="top">XZ</button><button data-view="side">YZ</button></div><div class="view-controls"><button id="rotate" title="表示方向を90°回転">↻ 表示方向</button><label><input id="points" type="checkbox" checked/> 接続点</label></div></div>
<div id="drawing"></div><div class="drawing-caption"><span><i class="legend-line"></i> 配管中心線</span><span><i class="legend-dot"></i> 接線点 PC / PT</span><span>単位: mm</span></div></section>
</div></div></main>`;

const $=id=>document.getElementById(id);
let spec=parsePayload(SAMPLE), model=buildPipe(spec), view="iso", quarter=0, displaySource="サンプルデータ";
let cameraStream=null, scanFrame=0, scanTimer=0, scanBusy=false;
let cameraTrack=null, cameraZoomMode="digital";
let nativeScanListener=null, nativeScanErrorListener=null, nativeCameraRunning=false, nativeScanBusy=false;
function status(text,error=false) { $("status").textContent=text; $("status").classList.toggle("error",error); }
function render() {
  model=buildPipe(spec);
  $("drawing").innerHTML=drawingSVG(spec,model,{view,quarter,points:$("points").checked});
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
  spec=next; displaySource=source; quarter=0; render();
  setActiveTab("result");
}
function setActiveTab(tab) {
  const tabs=["camera","result","dimensions"];
  if(!tabs.includes(tab)) return;
  const activeTabId=`${tab}-tab`;
  $("workspace").dataset.activeTab=tab;
  $("workspace").setAttribute("aria-labelledby",activeTabId);
  for(const button of document.querySelectorAll("[data-app-tab]")) {
    const active=button.dataset.appTab===tab;
    button.classList.toggle("active",active);
    button.setAttribute("aria-selected",String(active));
  }
}
async function activateTab(tab) {
  if(tab!=="camera" && (cameraStream || nativeCameraRunning)) {
    await stopActiveCamera();
  }
  setActiveTab(tab);
  if(tab==="camera") await startCamera();
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
async function stopNativeCamera() {
  if(!nativeCameraRunning && !nativeScanListener && !nativeScanErrorListener) return;
  nativeCameraRunning=false;
  const listener=nativeScanListener, errorListener=nativeScanErrorListener;
  nativeScanListener=null;
  nativeScanErrorListener=null;
  try {
    await listener?.remove();
    await errorListener?.remove();
    await BarcodeScanner.stopScan();
  } finally {
    document.body.classList.remove("barcode-scanner-active");
    document.documentElement.classList.remove("native-camera-active");
    $("native-scan-overlay").hidden=true;
    $("camera-start").disabled=false;
    $("camera-stop").disabled=true;
  }
}
async function stopActiveCamera() {
  if(nativeCameraRunning || nativeScanListener || nativeScanErrorListener) {
    await stopNativeCamera();
    return;
  }
  stopCamera();
}
async function handleNativeBarcode({barcodes}) {
  if(nativeScanBusy) return;
  const raw=barcodes.find(barcode=>barcode.format===BarcodeFormat.QrCode)?.rawValue;
  if(!raw) return;
  nativeScanBusy=true;
  try {
    await stopNativeCamera();
    loadPayload(raw,"Androidカメラ · ML Kit");
    status("QRコードを読み取りました。");
  } catch(error) {
    status(`読み取ったQRコードを処理できません: ${error.message || error}`,true);
  }
}
async function handleNativeScanError({message}) {
  try {
    await stopNativeCamera();
  } catch(error) {
    status(`カメラを停止できません: ${error.message || error}`,true);
    return;
  }
  status(`Androidカメラを利用できません: ${message}`,true);
}
async function startNativeCamera() {
  if(nativeCameraRunning) return;
  $("camera-start").disabled=true;
  status("AndroidのQRスキャナーを起動しています…");
  try {
    const {supported}=await BarcodeScanner.isSupported();
    if(!supported) throw new Error("このデバイスはAndroid QRスキャンに対応していません。");
    let {camera}=await BarcodeScanner.checkPermissions();
    if(camera!=="granted") ({camera}=await BarcodeScanner.requestPermissions());
    if(camera!=="granted") throw new Error("カメラのアクセスが許可されていません。アプリの設定でカメラを許可してください。");

    $("native-scan-overlay").hidden=false;
    document.body.classList.add("barcode-scanner-active");
    document.documentElement.classList.add("native-camera-active");
    nativeScanBusy=false;
    nativeScanListener=await BarcodeScanner.addListener("barcodesScanned",handleNativeBarcode);
    nativeScanErrorListener=await BarcodeScanner.addListener("scanError",handleNativeScanError);
    nativeCameraRunning=true;
    await BarcodeScanner.startScan({
      formats:[BarcodeFormat.QrCode],
      lensFacing:LensFacing.Back,
      resolution:Resolution["1920x1080"],
    });
    if(!nativeCameraRunning) return;
    $("camera-stop").disabled=false;
    status("AndroidのカメラでQRコードをスキャン中です。");
    try {
      const {zoomRatio:min}=await BarcodeScanner.getMinZoomRatio();
      const {zoomRatio:max}=await BarcodeScanner.getMaxZoomRatio();
      const zoom=$("native-camera-zoom");
      zoom.min=String(min);
      zoom.max=String(Math.max(min,max));
      zoom.value=String(Math.min(Math.max(1,min),Math.max(min,max)));
      $("native-zoom-value").textContent=`${Number(zoom.value).toFixed(1)}×`;
    } catch(error) {
      status(`ズーム範囲を取得できません: ${error.message || error}`,true);
    }
  } catch(error) {
    try {
      await stopNativeCamera();
    } catch(cleanupError) {
      status(`Androidカメラを開始できません: ${error.message || error} (停止処理: ${cleanupError.message || cleanupError})`,true);
      return;
    }
    status(`Androidカメラを開始できません: ${error.message || error}`,true);
  } finally {
    if(!nativeCameraRunning) $("camera-start").disabled=false;
  }
}
function startCamera() {
  if(Capacitor.isNativePlatform() && Capacitor.getPlatform()==="android") {
    return startNativeCamera();
  }
  return startWebCamera();
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
async function startWebCamera() {
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
$("camera-stop").addEventListener("click",async()=>{
  try { await stopActiveCamera(); status("カメラを停止しました。"); }
  catch(error) { status(`カメラを停止できません: ${error.message || error}`,true); }
});
$("native-camera-stop").addEventListener("click",async()=>{
  try { await stopNativeCamera(); status("QRスキャンを停止しました。"); }
  catch(error) { status(`カメラを停止できません: ${error.message || error}`,true); }
});
$("native-camera-zoom").addEventListener("input",async event=>{
  const zoomRatio=Number(event.currentTarget.value);
  $("native-zoom-value").textContent=`${zoomRatio.toFixed(1)}×`;
  if(!nativeCameraRunning) return;
  try { await BarcodeScanner.setZoomRatio({zoomRatio}); }
  catch(error) { status(`カメラズームを変更できません: ${error.message || error}`,true); }
});
$("camera-zoom").addEventListener("input",updateCameraZoom);
document.querySelectorAll("[data-app-tab]").forEach(button=>{
  button.addEventListener("click",async()=>{
    try { await activateTab(button.dataset.appTab); }
    catch(error) { status(`カメラを切り替えできません: ${error.message || error}`,true); }
  });
  button.addEventListener("keydown",async event=>{
    if(event.key!=="ArrowLeft" && event.key!=="ArrowRight") return;
    event.preventDefault();
    const tabs=[...document.querySelectorAll("[data-app-tab]")];
    const index=tabs.indexOf(button);
    const direction=event.key==="ArrowRight" ? 1 : -1;
    const next=tabs[(index+direction+tabs.length)%tabs.length];
    try { await activateTab(next.dataset.appTab); }
    catch(error) { status(`カメラを切り替えできません: ${error.message || error}`,true); return; }
    next.focus();
  });
});
$("sample").addEventListener("click",async()=>{
  try { await stopActiveCamera(); }
  catch(error) { status(`カメラを停止できません: ${error.message || error}`,true); return; }
  try{loadPayload(SAMPLE,"サンプルデータ");status("サンプルデータ DT11-111-7 を表示しています。");}
  catch(error){status(error.message,true);}
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden && (cameraStream || nativeCameraRunning)) {
    void stopActiveCamera().then(()=>status("ページを離れたためカメラを停止しました。"))
      .catch(error=>status(`カメラを停止できません: ${error.message || error}`,true));
  }
});
window.addEventListener("pagehide",()=>{ void stopActiveCamera(); });
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>{
  view=button.dataset.view;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b===button));render();
}));
$("rotate").addEventListener("click",()=>{quarter=(quarter+1)%4;render();});
 $("points").addEventListener("change",render);
if(!Capacitor.isNativePlatform() && "serviceWorker" in window.navigator) {
  window.addEventListener("load",()=>{
    void window.navigator.serviceWorker.register("./sw.js")
      .catch(error=>console.error("オフライン用アプリを登録できません:",error));
  });
}
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
