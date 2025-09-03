// Minimal Quagga2 scanner for iOS web
const $ = s => document.querySelector(s);
const startBtn = $('#startBtn'), stopBtn = $('#stopBtn');
const cameraSel = $('#cameraSelect'), envFacing = $('#envFacing');
const tryHarder = $('#tryHarder'), beepChk = $('#beep');
const readersWrap = $('#readers');
const viewport = $('#viewport'), overlay = $('#overlay');
const overlayCtx = overlay.getContext('2d');
const results = $('#results');
let lastCode='', lastWhen=0;

function dupeGuard(code) {
  const now = Date.now();
  if (code===lastCode && (now-lastWhen)<2000) return true;
  lastCode=code; lastWhen=now; return false;
}
function beep() {
  if ('vibrate' in navigator) navigator.vibrate(20);
  let audio=document.getElementById('beep');
  if (!audio) {
    const frag=document.getElementById('beepTpl').content.cloneNode(true);
    document.body.appendChild(frag);
    audio=document.getElementById('beep');
  }
  audio.play().catch(()=>{});
}
function getReaders() {
  return Array.from(readersWrap.querySelectorAll('input:checked')).map(c=>c.value);
}
function buildConfig() {
  return {
    locate: tryHarder.checked,
    inputStream: {
      type:"LiveStream",
      target: viewport,
      constraints:{ facingMode: envFacing.checked?"environment":"user" }
    },
    decoder: { readers: getReaders() }
  };
}

async function start() {
  if (Quagga.initialized) await stop();
  const config=buildConfig();
  return new Promise((resolve,reject)=>{
    Quagga.init(config, err=>{
      if(err){console.error(err);reject(err);return;}
      Quagga.initialized=true;
      Quagga.onProcessed(res=>{
        overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        if(res?.box){
          overlayCtx.strokeStyle='lime'; overlayCtx.lineWidth=3;
          overlayCtx.beginPath();
          res.box.forEach((p,i)=> i?overlayCtx.lineTo(p.x,p.y):overlayCtx.moveTo(p.x,p.y));
          overlayCtx.closePath(); overlayCtx.stroke();
        }
      });
      Quagga.onDetected(res=>{
        const code=res?.codeResult?.code, fmt=res?.codeResult?.format;
        if(!code||dupeGuard(code)) return;
        const el=document.createElement('div');
        el.className='badge'; el.textContent=`${fmt}: ${code}`;
        results.prepend(el);
        if(beepChk.checked) beep();
      });
      Quagga.start();
      startBtn.disabled=true; stopBtn.disabled=false;
      resolve();
    });
  });
}
async function stop() {
  Quagga.stop(); Quagga.initialized=false;
  startBtn.disabled=false; stopBtn.disabled=true;
}
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

// List cameras
(async()=>{
  try{
    const devs=await navigator.mediaDevices.enumerateDevices();
    devs.filter(d=>d.kind==='videoinput').forEach((d,i)=>{
      const o=document.createElement('option');
      o.value=d.deviceId; o.textContent=d.label||`Camera ${i+1}`;
      cameraSel.appendChild(o);
    });
  }catch(e){console.warn(e);}
})();
