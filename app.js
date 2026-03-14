// ── DOM refs ────────────────────────────────────────────
const fileInput   = document.getElementById('file-input');
const fileInput2  = document.getElementById('file-input-2');
const pickSection = document.getElementById('video-pick');
const playerSection = document.getElementById('player-section');
const video       = document.getElementById('video');
const btnPlay     = document.getElementById('btn-play');
const timeDisplay = document.getElementById('time-display');
const seekBar     = document.getElementById('seek-bar');
const btnMirror   = document.getElementById('btn-mirror');
const btnSetA     = document.getElementById('btn-set-a');
const btnSetB     = document.getElementById('btn-set-b');
const btnClearAB  = document.getElementById('btn-clear-ab');
const abDisplay   = document.getElementById('ab-display');
const btnFullscreen = document.getElementById('btn-fullscreen');
const speedBtns   = document.querySelectorAll('.speed-btn');

// ── State ───────────────────────────────────────────────
let loopA = null;
let loopB = null;
let isSeeking = false;
let objectURL = null;

// ── Helpers ─────────────────────────────────────────────
function fmt(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// ── File loading ────────────────────────────────────────
function loadFile(file) {
  if (!file) return;
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(file);
  video.src = objectURL;
  video.loop = true;
  video.playbackRate = 1;
  clearABLoop();
  setActiveSpeed(1);
  video.classList.remove('mirrored');
  btnMirror.classList.remove('active');
  pickSection.classList.add('hidden');
  playerSection.classList.remove('hidden');
  video.play().catch(() => {});
  updatePlayBtn();
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) loadFile(file);
}

fileInput.addEventListener('change', handleFileSelect);
fileInput2.addEventListener('change', handleFileSelect);

// ── Play / Pause ────────────────────────────────────────
function togglePlay() {
  if (!video.src) return;
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
  updatePlayBtn();
}

function updatePlayBtn() {
  btnPlay.textContent = video.paused ? '▶️' : '⏸️';
}

btnPlay.addEventListener('click', togglePlay);
video.addEventListener('play',  updatePlayBtn);
video.addEventListener('pause', updatePlayBtn);

// ── Time update & seek ──────────────────────────────────
video.addEventListener('timeupdate', () => {
  // A-B loop enforcement
  if (loopA !== null && loopB !== null) {
    if (video.currentTime >= loopB) {
      video.currentTime = loopA;
    }
  }

  if (!isSeeking) {
    const pct = video.duration ? (video.currentTime / video.duration) * 1000 : 0;
    seekBar.value = pct;
  }

  timeDisplay.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
});

video.addEventListener('loadedmetadata', () => {
  timeDisplay.textContent = fmt(0) + ' / ' + fmt(video.duration);
});

seekBar.addEventListener('input', () => {
  isSeeking = true;
  const t = (seekBar.value / 1000) * video.duration;
  video.currentTime = t;
});

seekBar.addEventListener('change', () => {
  isSeeking = false;
});

// Allow click-to-toggle on video itself
video.addEventListener('click', togglePlay);

// ── Speed control ───────────────────────────────────────
function setActiveSpeed(speed) {
  speedBtns.forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });
}

speedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = parseFloat(btn.dataset.speed);
    video.playbackRate = speed;
    setActiveSpeed(speed);
  });
});

// ── Mirror ──────────────────────────────────────────────
function toggleMirror() {
  video.classList.toggle('mirrored');
  btnMirror.classList.toggle('active');
}

btnMirror.addEventListener('click', toggleMirror);

// ── Fullscreen ─────────────────────────────────────────
function toggleFullscreen() {
  const wrapper = document.querySelector('.video-wrapper');
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    // Lock to landscape if supported
    const req = wrapper.requestFullscreen
      ? wrapper.requestFullscreen()
      : wrapper.webkitRequestFullscreen
        ? wrapper.webkitRequestFullscreen()
        : Promise.resolve();
    req.catch(() => {});
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

btnFullscreen.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

function updateFullscreenBtn() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  btnFullscreen.classList.toggle('active', isFs);
  btnFullscreen.textContent = isFs ? '⛶ Exit' : '⛶ Fullscreen';
}

// ── A-B Loop ────────────────────────────────────────────
function updateABDisplay() {
  const a = loopA !== null ? fmt(loopA) : '--';
  const b = loopB !== null ? fmt(loopB) : '--';
  abDisplay.textContent = a + ' / ' + b;
}

function clearABLoop() {
  loopA = null;
  loopB = null;
  video.loop = true;
  btnSetA.classList.remove('active');
  btnSetB.classList.remove('active');
  updateABDisplay();
}

btnSetA.addEventListener('click', () => {
  loopA = video.currentTime;
  btnSetA.classList.add('active');
  // If B is set and A >= B, clear B
  if (loopB !== null && loopA >= loopB) {
    loopB = null;
    btnSetB.classList.remove('active');
    video.loop = true;
  }
  updateABDisplay();
});

btnSetB.addEventListener('click', () => {
  const t = video.currentTime;
  // B must be after A
  if (loopA !== null && t > loopA) {
    loopB = t;
    video.loop = false; // disable native loop, we handle it
    btnSetB.classList.add('active');
  }
  updateABDisplay();
});

btnClearAB.addEventListener('click', clearABLoop);

// ── Keyboard shortcuts ─────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Ignore if typing in an input
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'm':
    case 'M':
      toggleMirror();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
  }
});
