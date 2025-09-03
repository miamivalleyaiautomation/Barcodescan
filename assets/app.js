// Minimal iOS-friendly Quagga2 scanner (1D + QR) with results table
const $ = s => document.querySelector(s);

// UI
const startBtn = $('#startBtn');
const stopBtn = $('#stopBtn');
const cameraSel = $('#cameraSelect');
const envFacing = $('#envFacing');
const tryHarder = $('#tryHarder');
const beepChk = $('#beep');
const readersWrap = $('#readers');
const viewport = $('#viewport');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const results = $('#results');
const tbody = $('#scanTbody');
const clearBtn = $('#clearTable');

// simple dupe guard
let last = { code: '', t: 0 };
const deDupeMs = 2000;
function dupe(code) {
  const now = Date.now();
  if (code === last.code && now - last.t < deDupeMs) return true;
  last = { code, t: now }; return false;
}

// tiny beep + haptic
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

function addRow(fmt, code) {
  // remove empty row
  const first = tbody.firstElementChild;
  if (first && first.children.length === 1) tbody.removeChild(first);

  const tr = document.createElement('tr');
  const tdT = document.createElement('td');
  const tdC = document.createElement('td');
  const tdD = document.createElement('td');
  tdT.textContent = fmt || 'UNKNOWN';
  tdC.textContent = code || '';
  const dt = new Date();
  tdD.textContent = dt.toLocaleTimeString();
  tr.appendChild(tdT); tr.appendChild(tdC); tr.appendChild(tdD);
  tbody.prepend(tr);
}

function addBadge(fmt, code) {
  const el = document.createElement('div');
  el.className = 'badge';
  el.textContent = `${fmt}: ${code}`;
  results.prepend(el);
}

function resizeOverlay() {
  overlay.width = viewport.offsetWidth;
  overlay.height = viewport.offsetHeight;
}

function buildConfig() {
  return {
    locate: tryHarder.checked,
    inputStream: {
      type: "LiveStream",
      target: viewport,
      constraints: {
        facingMode: envFacing.checked ? "environment" : "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    // IMPORTANT for iOS: no web workers
    numOfWorkers: 0,
    locator: { patchSize: "medium", halfSample: true },
    decoder: { readers: getReaders() }
  };
}

async function start() {
  if (Quagga.initialized) await stop();
  resizeOverlay();
  const cfg = buildConfig();

  return new Promise((resolve, reject) => {
    Quagga.init(cfg, err => {
      if (err) { console.error(err); reject(err); return; }
      Quagga.initialized = true;

      Quagga.onProcessed(res => {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        // Draw green box when Quagga locates a candidate
        if (res?.box) {
          octx.strokeStyle = "lime";
          octx.lineWidth = 3;
          octx.beginPath();
          res.box.forEach((p, i) => i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y));
          octx.closePath();
          octx.stroke();
        }
      });

      Quagga.onDetected(res => {
        const code = res?.codeResult?.code;
        const fmt  = (res?.codeResult?.format || '').toUpperCase();
        if (!code || dupe(code)) return;
        addBadge(fmt, code);
        addRow(fmt, code);
        if (beepChk.checked) beep();
      });

      Quagga.start();
      startBtn.disabled = true;
      stopBtn.disabled = false;
      resolve();
    });
  });
}

async function stop() {
  try { Quagga.stop(); } catch {}
  Quagga.initialized = false;
  startBtn.disabled = false;
  stopBtn.disabled  = true;
}

// Events
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
clearBtn.addEventListener('click', () => { tbody.innerHTML = '<tr><td colspan="3" class="muted center">No scans yet</td></tr>'; });

// Camera list (if allowed)
(async () => {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    devs.filter(d => d.kind === 'videoinput').forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || `Camera ${i+1}`;
      cameraSel.appendChild(o);
    });
  } catch (e) { /* permission not granted yet; ignore */ }
})();

// Keep overlay sized if device rotates
addEventListener('resize', () => { if (Quagga.initialized) resizeOverlay(); });
