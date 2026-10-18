import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { SAMPLE } from "../src/geometry.js";
import { decodeRGBA } from "../src/qr.js";

function qrImage({rule=false}={}) {
  const qr=QRCode.create(SAMPLE,{errorCorrectionLevel:"L"});
  const module=5, pad=24, width=qr.modules.size*module+pad*2, height=width;
  const data=new Uint8ClampedArray(width*height*4).fill(255);
  const black=(x,y)=>{
    const i=(y*width+x)*4;
    data[i]=data[i+1]=data[i+2]=0;
  };
  for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x)){
    for(let j=0;j<module;j++)for(let i=0;i<module;i++)black(pad+x*module+i,pad+y*module+j);
  }
  if(rule) for(let y=pad+qr.modules.size*module-1;y<pad+qr.modules.size*module+4;y++)for(let x=0;x<width;x++)if(x%31<24)black(x,y);
  return {data,width,height};
}
test("reads the complete current QR payload",()=>{
  const image=qrImage();
  assert.equal(decodeRGBA(image.data,image.width,image.height),SAMPLE);
});
test("recovers QR touching a dashed form rule without fixed page coordinates",()=>{
  const image=qrImage({rule:true});
  assert.equal(decodeRGBA(image.data,image.width,image.height),SAMPLE);
});
test("blank image returns null and malformed pixel data is rejected",()=>{
  assert.equal(decodeRGBA(new Uint8ClampedArray(80*80*4).fill(255),80,80),null);
  assert.throws(()=>decodeRGBA(new Uint8ClampedArray(12),2,2));
});
