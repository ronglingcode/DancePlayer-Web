(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const setupSection = $('setup-section');
  const recordSection = $('record-section');
  const reviewSection = $('review-section');

  const refInput = $('ref-input');
  const refPickLabel = $('ref-pick-label');
  const setupControls = $('setup-controls');

  const layoutBtns = document.querySelectorAll('.layout-btn');
  const camBtns = document.querySelectorAll('.cam-btn');
  const audioBtns = document.querySelectorAll('.audio-btn');
  const btnMirror = $('btn-mirror-cam');

  const btnStart = $('btn-start');
  const btnStop = $('btn-stop');
  const btnDownload = $('btn-download');
  const btnRetry = $('btn-retry');
  const btnNewRef = $('btn-new-ref');

  const canvas = $('preview-canvas');
  const ctx = canvas.getContext('2d');
  const recTime = $('rec-time');
  const resultVideo = $('result-video');
  const statusHint = $('status-hint');

  const refVideo = document.createElement('video');
  refVideo.playsInline = true;
  refVideo.preload = 'auto';

  const camVideo = document.createElement('video');
  camVideo.playsInline = true;
  camVideo.muted = true;

  const state = {
    refFile: null,
    refUrl: null,
    camStream: null,
    layout: 'sbs',
    facing: 'user',
    mirror: true,
    audioMode: 'ref', // 'ref' | 'both' | 'mic'
    recorder: null,
    recording: false,
    rafId: 0,
    timerId: 0,
    startMs: 0,
    chunks: [],
    mimeType: '',
    wakeLock: null,
  };

  // ── Web Audio graph (lazy init) ─────────────────
  let audioCtx = null;
  let audioDest = null;
  let refMediaSource = null;
  let refGainRec = null;
  let refGainSpk = null;
  let micMediaSource = null;
  let micGainRec = null;

  async function setupAudioGraph() {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (_) {}
    }
    if (!audioDest) audioDest = audioCtx.createMediaStreamDestination();

    if (!refMediaSource) {
      refMediaSource = audioCtx.createMediaElementSource(refVideo);
      refGainSpk = audioCtx.createGain();
      refGainRec = audioCtx.createGain();
      refMediaSource.connect(refGainSpk).connect(audioCtx.destination);
      refMediaSource.connect(refGainRec).connect(audioDest);
    }

    if (micMediaSource) {
      try { micMediaSource.disconnect(); } catch (_) {}
      micMediaSource = null;
    }
    const micTracks = state.camStream ? state.camStream.getAudioTracks() : [];
    if (micTracks.length > 0) {
      const micStream = new MediaStream(micTracks);
      micMediaSource = audioCtx.createMediaStreamSource(micStream);
      if (!micGainRec) micGainRec = audioCtx.createGain();
      micMediaSource.connect(micGainRec).connect(audioDest);
    }

    applyAudioMode();
  }

  function applyAudioMode() {
    const mode = state.audioMode;
    if (refGainSpk) refGainSpk.gain.value = mode === 'mic' ? 0 : 1;
    if (refGainRec) refGainRec.gain.value = mode === 'mic' ? 0 : 1;
    if (micGainRec) micGainRec.gain.value = mode === 'ref' ? 0 : 1;
  }

  function showPhase(name) {
    setupSection.classList.toggle('hidden', name !== 'setup');
    recordSection.classList.toggle('hidden', name !== 'record');
    reviewSection.classList.toggle('hidden', name !== 'review');
  }

  function setStatus(msg) { statusHint.textContent = msg || ''; }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    setStatus('Camera/recording not supported. Use Chrome on Android or Safari on iOS 14.5+.');
    btnStart.disabled = true;
  }

  refInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.refUrl) URL.revokeObjectURL(state.refUrl);
    state.refFile = file;
    state.refUrl = URL.createObjectURL(file);
    refVideo.src = state.refUrl;
    refVideo.load();
    refPickLabel.textContent = file.name;
    setupControls.classList.remove('hidden');
    setStatus('');
  });

  layoutBtns.forEach((b) => b.addEventListener('click', () => {
    layoutBtns.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.layout = b.dataset.layout;
  }));

  camBtns.forEach((b) => b.addEventListener('click', async () => {
    if (b.classList.contains('active')) return;
    camBtns.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.facing = b.dataset.facing;
    if (state.camStream) {
      stopCamStream();
      try { await openCamera(); }
      catch (e) { setStatus('Camera switch failed: ' + e.message); }
    }
  }));

  btnMirror.addEventListener('click', () => {
    state.mirror = !state.mirror;
    btnMirror.classList.toggle('active', state.mirror);
  });

  audioBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('active')) return;
    audioBtns.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.audioMode = b.dataset.mode;
    applyAudioMode();
  }));

  async function openCamera() {
    const constraints = {
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    };
    state.camStream = await navigator.mediaDevices.getUserMedia(constraints);
    camVideo.srcObject = state.camStream;
    await camVideo.play().catch(() => {});
    if (camVideo.readyState < 1) {
      await new Promise((res) => camVideo.addEventListener('loadedmetadata', res, { once: true }));
    }
  }

  function stopCamStream() {
    if (state.camStream) {
      state.camStream.getTracks().forEach((t) => t.stop());
      state.camStream = null;
      camVideo.srcObject = null;
    }
  }

  function setupCanvas() {
    if (state.layout === 'sbs') {
      canvas.width = 1280;
      canvas.height = 720;
    } else {
      canvas.width = 720;
      canvas.height = 1280;
    }
  }

  function paneRects() {
    const w = canvas.width, h = canvas.height;
    if (state.layout === 'sbs') {
      return [
        { x: 0, y: 0, w: w / 2, h },
        { x: w / 2, y: 0, w: w / 2, h },
      ];
    }
    return [
      { x: 0, y: 0, w, h: h / 2 },
      { x: 0, y: h / 2, w, h: h / 2 },
    ];
  }

  function drawPane(video, rect, mirror) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      const scale = Math.min(rect.w / vw, rect.h / vh);
      const dw = vw * scale, dh = vh * scale;
      const dx = rect.x + (rect.w - dw) / 2;
      const dy = rect.y + (rect.h - dh) / 2;
      if (mirror) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, dw, dh);
      } else {
        ctx.drawImage(video, dx, dy, dw, dh);
      }
    }
    ctx.restore();
  }

  function drawDivider() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (state.layout === 'sbs') {
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
    } else {
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFrame() {
    const [refRect, camRect] = paneRects();
    drawPane(refVideo, refRect, false);
    drawPane(camVideo, camRect, state.mirror);
    drawDivider();
    state.rafId = requestAnimationFrame(drawFrame);
  }

  function pickMime() {
    const candidates = [
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const m of candidates) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; }
      catch (_) {}
    }
    return '';
  }

  async function startRecording() {
    if (!state.refFile) { setStatus('Pick a reference video first.'); return; }
    btnStart.disabled = true;
    setStatus('');

    try {
      if (!state.camStream) await openCamera();
    } catch (e) {
      btnStart.disabled = false;
      setStatus('Camera access denied: ' + e.message);
      return;
    }

    if (refVideo.readyState < 1) {
      await new Promise((res) => refVideo.addEventListener('loadedmetadata', res, { once: true }));
    }

    setupCanvas();
    showPhase('record');

    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}

    try {
      await setupAudioGraph();
    } catch (e) {
      setStatus('Audio setup failed: ' + e.message);
      btnStart.disabled = false;
      showPhase('setup');
      return;
    }

    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ]);

    state.mimeType = pickMime();
    let recorder;
    try {
      recorder = new MediaRecorder(combined, state.mimeType ? { mimeType: state.mimeType } : {});
    } catch (e) {
      setStatus('Recorder failed: ' + e.message);
      btnStart.disabled = false;
      showPhase('setup');
      return;
    }
    state.recorder = recorder;
    state.chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
    recorder.onstop = onRecorderStop;

    refVideo.currentTime = 0;
    drawFrame();
    try { await refVideo.play(); } catch (_) {}
    recorder.start();

    state.recording = true;
    state.startMs = performance.now();
    btnStart.disabled = false;
    btnStop.disabled = false;
    recTime.textContent = '0:00';

    state.timerId = setInterval(() => {
      const sec = Math.floor((performance.now() - state.startMs) / 1000);
      recTime.textContent = formatTime(sec);
    }, 250);

    refVideo.onended = () => { if (state.recording) stopRecording(); };
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    btnStop.disabled = true;

    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    clearInterval(state.timerId);
    state.timerId = 0;

    refVideo.pause();
    refVideo.onended = null;

    if (state.recorder && state.recorder.state !== 'inactive') {
      try { state.recorder.stop(); } catch (_) {}
    }

    if (state.wakeLock) {
      state.wakeLock.release().catch(() => {});
      state.wakeLock = null;
    }
  }

  function onRecorderStop() {
    const type = state.mimeType || 'video/webm';
    const blob = new Blob(state.chunks, { type });
    state.chunks = [];
    const url = URL.createObjectURL(blob);
    if (resultVideo.src) URL.revokeObjectURL(resultVideo.src);
    resultVideo.src = url;
    btnDownload.href = url;
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    btnDownload.download = `dance-compare-${Date.now()}.${ext}`;
    showPhase('review');
  }

  btnStart.addEventListener('click', startRecording);
  btnStop.addEventListener('click', stopRecording);

  btnRetry.addEventListener('click', () => {
    if (resultVideo.src) {
      URL.revokeObjectURL(resultVideo.src);
      resultVideo.removeAttribute('src');
      resultVideo.load();
    }
    showPhase('setup');
  });

  btnNewRef.addEventListener('click', () => {
    if (state.refUrl) URL.revokeObjectURL(state.refUrl);
    state.refUrl = null;
    state.refFile = null;
    refVideo.removeAttribute('src');
    refVideo.load();
    refInput.value = '';
    refPickLabel.textContent = 'Pick Reference Video';
    setupControls.classList.add('hidden');
    if (resultVideo.src) {
      URL.revokeObjectURL(resultVideo.src);
      resultVideo.removeAttribute('src');
      resultVideo.load();
    }
    showPhase('setup');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.recording) stopRecording();
  });

  window.addEventListener('pagehide', () => {
    stopRecording();
    stopCamStream();
    if (state.refUrl) URL.revokeObjectURL(state.refUrl);
  });
})();
