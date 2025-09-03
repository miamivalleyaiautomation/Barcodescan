// Trigger-based iOS-friendly Quagga2 scanner (1D + QR)
// Quagga2 docs: https://github.com/ericblade/quagga2
const $ = s => document.querySelector(s);

// UI refs
const startBtn   = $('#startBtn');
const stopBtn    = $('#stopBtn');
const triggerBtn = $('#triggerBtn');
const armedBadge = $('#armedBadge');
const statusText = $('#statusText');
const cameraSel  = $('#cameraSelect');
const envFacing  = $('#envFacing');
const tryHarder  = $('#tryHarder');
const readersWrap= $('#readers');
const beepChk    = $('#beep');

const viewport   = $('#viewport');
const overlay    = $('#overlay');
const octx       = overlay.getContext('2d');

const results    = $('#results');
const tbody      = $('#scanTbody');
const clearBtn   = $('#clearTable');

// state
let ARMED = false;
let armTimer = null;
let last = { code:'', t:0 };
const DEDUPE_MS = 2000;

// --- helpers ---
function resizeOverlay() {
  overlay.width  = viewport.offsetWidth;
  overlay.height = viewport.offsetHeight;
}

function dupe(code) {
  const now = Date.now();
  if (code === last.code && now - last.t < DEDUPE_MS) return true;
  last = { code, t: now }; return false;
}

function beep() {
  if ('vibrate' in navigator) navigator.vibrate(20);
  let a = document.getElementById('beepAudio');
  if (!a) {
    const frag = document.getElementById('beepTpl').content.cloneNode(true);
    document.body.appendChild(frag);
    a = document.getElementById('beepAudio');
  }
  a.play().catch(()=>{});
}

function getReaders() {
  return Array.from(readersWrap.querySelectorAll('input:checked')).map(i => i.value);
}

function addBadge(fmt, code) {
  const el = document.createElement('div');
  el.className = 'badge';
  el.textContent = `${fmt}: ${code}`;
  results.prepend(el);
}

function addRow(fmt, code) {
  const first = tbody.firstElementChild;
  if (first && first.children.length === 1) tbody.removeChild(first);
  const tr = document.createElement('tr');
  const tdT = document.createElement('td');
  const tdC = document.createElement('td');
  const tdD = document.createElement('td');
  tdT.textContent = fmt || 'UNKNOWN';
  tdC.textContent = code || '';
  tdD.textContent = new Date().toLocaleTimeString();
  tr.appendChild(tdT); tr.appendChild(tdC); tr.appendChild(tdD);
  tbody.prepend(tr);
}

function setArmed(on) {
  ARMED = !!on;
  armedBadge.hidden = !ARMED;
  statusText.textContent = ARMED ? 'Armed (waiting for code)…' : 'Idle';
  triggerBtn.disabled = ARMED; // prevent double-arming
}

function buildConstraints() {
  // If a deviceId is selected, prefer it; otherwise use facingMode
  const id = cameraSel && cameraSel.value;
  if (id) {
    return { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } };
  }
  return {
    facingMode: envFacing.checked ? "environment" : "user",
    width: { ideal: 1280 }, height: { ideal: 720 }
  };
}

function buildConfig() {
  return {
    locate: tryHarder.checked,
    inputStream: {
      type: "LiveStream",
      target: viewport,
      constraints: buildConstraints()
    },
    // iOS-friendly: avoid web workers with camera stream
    numOfWorkers: 0,
    locator: { patchSize: "medium", halfSample: true },
    decoder: { readers: getReaders() }
  };
}

function armFor(ms = 3000) {
  clearTimeout(armTimer);
  setArmed(true);
  armTimer = setTimeout(() => setArmed(false), ms);
}

// --- lifecycle ---
async function start() {
  if (Quagga.initialized) await stop();
  resizeOverlay();
  const cfg = buildConfig();

  return new Promise((resolve, reject) => {
    Quagga.init(cfg, err => {
      if (err) { console.error(err); statusText.textContent = 'Init error'; reject(err); return; }
      Quagga.initialized = true;

      Quagga.onProcessed(res => {
        octx.clearRect(0,0,overlay.width,overlay.height);
        if (res?.box) {
          octx.strokeStyle = ARMED ? "lime" : "rgba(173,216,230,.8)";
          octx.lineWidth = 3;
          octx.beginPath();
          res.box.forEach((p,i)=> i?octx.lineTo(p.x,p.y):octx.moveTo(p.x,p.y));
          octx.closePath(); octx.stroke();
        }
      });

      Quagga.onDetected(res => {
        if (!ARMED) return; // ignore until triggered
        const code = res?.codeResult?.code;
        const fmt  = (res?.codeResult?.format || '').toUpperCase();
        if (!code || dupe(code)) return;
        addBadge(fmt, code);
        addRow(fmt, code);
        if (beepChk?.checked) beep();
        clearTimeout(armTimer);
        setArmed(false);
      });

      Quagga.start();
      startBtn.disabled = true;
      stopBtn.disabled  = false;
      setArmed(false);
      statusText.textContent = 'Ready';
      resolve();
    });
  });
}

async function stop() {
  try {
    Quagga.offProcessed();
    Quagga.offDetected();
  } catch {}
  try { Quagga.stop(); } catch {}
  Quagga.initialized = false;
  startBtn.disabled = false;
  stopBtn.disabled  = true;
  setArmed(false);
  statusText.textContent = 'Stopped';
}

// --- device listing ---
async function listCameras() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids = devs.filter(d => d.kind === 'videoinput');
    cameraSel.innerHTML = '';
    vids.forEach((d,i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Camera ${i+1}`;
      cameraSel.appendChild(o);
    });
  } catch (e) {
    // May not have permission yet; ignore
  }
}

// --- events ---
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
triggerBtn.addEventListener('click', () => armFor(3000));
clearBtn.addEventListener('click', () => {
  tbody.innerHTML = '<tr><td colspan="3" class="center muted">No scans yet</td></tr>';
  results.innerHTML = '';
});
envFacing.addEventListener('change', async () => { if (Quagga.initialized) await start(); });
readersWrap.addEventListener('change', async () => { if (Quagga.initialized) await start(); });
cameraSel.addEventListener('change', async () => { if (Quagga.initialized) await start(); });

// populate cameras (labels appear after first permission grant)
(async () => {
  try {
    // Small permission poke to get labels on iOS once user interacts
    await listCameras();
  } catch {}
})();

// keep overlay in sync on rotation/resize
addEventListener('resize', () => { if (Quagga.initialized) resizeOverlay(); });
