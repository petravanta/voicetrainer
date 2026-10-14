(function () {
  'use strict';
  const D = window.VTDSP, Synth = window.VTSynth;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '--');

  // ---------------- drills ----------------
  const DRILLS = {
    vowels: D.VOWELS.map(v => ({ id: 'v-' + v.key, type: 'vowel', vowel: v.key, cue: v.cue, sub: `as in "${v.word}"`, title: `"${v.cue}" as in ${v.word}` })),
    sibilants: [
      { id: 's-s', type: 'sib', sib: 's', cue: 'sss', sub: 'as in "see"', title: 'Sustained "sss"' },
      { id: 's-sh', type: 'sib', sib: 'sh', cue: 'shh', sub: 'as in "she"', title: 'Sustained "shh"' },
    ],
    words: [
      ['see', 's', 'i'], ['sit', 's', 'I'], ['say', 's', 'e'], ['sat', 's', 'ae'], ['saw', 's', 'c'], ['sue', 's', 'u'],
      ['she', 'sh', 'i'], ['shed', 'sh', 'E'], ['shop', 'sh', 'a'], ['shoe', 'sh', 'u'], ['shirt', 'sh', 'r'], ['sun', 's', 'V'],
    ].map(([w, sib, v]) => ({ id: 'w-' + w, type: 'word', sib, vowel: v, cue: w, sub: `/${sib === 's' ? 's' : 'ʃ'}/ + ${D.VOWEL_BY_KEY[v].cue}`, title: `Say "${w}" a few times` })),
  };
  const ALL_DRILLS = [...DRILLS.vowels, ...DRILLS.sibilants, ...DRILLS.words];
  const NEED = { vowel: 50, sib: 24, wordVowel: 24, wordSib: 10 }; // frames at ~60 per second

  // ---------------- state ----------------
  const state = {
    goal: 'fem',
    tab: 'vowels',
    drill: null,       // {def, vowelFr:[], sibFr:[], offTarget:0, result}
    lastScores: {},    // drill id -> score this session
    running: null,     // 'mic' | 'file' | 'demo'
    meter: NaN,
    trail: [],
  };
  let session = newSession();
  let take = null; // what the current recording or listening run contained, for the guided exercise
  function newSession() {
    return { start: Date.now(), vowels: {}, sibs: { s: [], sh: [] }, all: [], pitch: [], drills: [] };
  }
  const target = () => (state.goal === 'fem' ? [75, 110] : [-10, 25]);

  // ---------------- theme colours for canvases ----------------
  let C = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['bg', 'panel', 'ink', 'muted', 'line', 'masc', 'fem', 'accent', 'good', 'warn', 'spec-mid', 'f1', 'f2', 'f3']) C[k] = cs.getPropertyValue('--' + k).trim();
    C.font = cs.getPropertyValue('--font-mono').trim();
    buildLut();
    clearSpec();
    drawVowelChart(); drawPitch(); drawHistory();
  }
  function parseColor(s) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = s; c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  let LUT = null;
  function buildLut() {
    const a = parseColor(C.panel), b = parseColor(C['spec-mid']), c = parseColor(C.ink);
    LUT = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255, [p, q, u] = t < 0.55 ? [a, b, t / 0.55] : [b, c, (t - 0.55) / 0.45];
      for (let k = 0; k < 3; k++) LUT[i * 3 + k] = p[k] + (q[k] - p[k]) * u;
    }
  }

  // ---------------- canvas helpers ----------------
  function fitCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(10, Math.round(cv.clientWidth * dpr));
    if (!cv.dataset.base) cv.dataset.base = cv.getAttribute('height');
    const h = Math.round(parseInt(cv.dataset.base, 10) * (cv.clientWidth < 420 ? 0.85 : 1) * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.height = h / dpr + 'px'; return true; }
    return false;
  }
  const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);

  // ---- vowel chart ----
  const VC = { f2: [650, 3400], f1: [250, 1050] };
  function vowelXY(cv, F1, F2) {
    const pad = { l: 44 * dprOf(), r: 14 * dprOf(), t: 14 * dprOf(), b: 30 * dprOf() };
    const lx = (Math.log(VC.f2[1]) - Math.log(F2)) / (Math.log(VC.f2[1]) - Math.log(VC.f2[0]));
    const ly = (Math.log(F1) - Math.log(VC.f1[0])) / (Math.log(VC.f1[1]) - Math.log(VC.f1[0]));
    return [pad.l + lx * (cv.width - pad.l - pad.r), pad.t + ly * (cv.height - pad.t - pad.b)];
  }
  function drawVowelChart() {
    const cv = $('cv-vowel'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf();
    g.clearRect(0, 0, cv.width, cv.height);
    g.font = `${11 * dpr}px ${C.font}`;
    g.lineWidth = 1;
    // grid
    g.strokeStyle = C.line; g.fillStyle = C.muted;
    for (const f of [800, 1000, 1500, 2000, 2500, 3000]) {
      const [x] = vowelXY(cv, 400, f);
      g.beginPath(); g.moveTo(x, 10 * dpr); g.lineTo(x, cv.height - 26 * dpr); g.stroke();
      g.textAlign = 'center'; g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x, cv.height - 10 * dpr);
    }
    for (const f of [300, 400, 500, 600, 800, 1000]) {
      const [, y] = vowelXY(cv, f, 1500);
      g.beginPath(); g.moveTo(40 * dpr, y); g.lineTo(cv.width - 10 * dpr, y); g.stroke();
      g.textAlign = 'right'; g.fillText(f, 36 * dpr, y + 4 * dpr);
    }
    const tv = state.drill && state.drill.def.vowel;
    for (const v of D.VOWELS) {
      const hot = v.key === tv;
      const [mx, my] = vowelXY(cv, v.M[0], v.M[1]), [wx, wy] = vowelXY(cv, v.W[0], v.W[1]);
      g.globalAlpha = tv && !hot ? 0.35 : 1;
      g.strokeStyle = C.muted; g.lineWidth = hot ? 2 * dpr : dpr;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(wx, wy); g.stroke();
      g.strokeStyle = C.masc; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(mx, my, 4.5 * dpr, 0, 7); g.stroke();
      g.fillStyle = C.fem;
      g.beginPath(); g.arc(wx, wy, 5 * dpr, 0, 7); g.fill();
      g.fillStyle = C.ink; g.textAlign = 'left';
      g.font = `${(hot ? 13 : 11) * dpr}px ${C.font}`;
      g.fillText(v.cue.split(' ')[0], wx + 7 * dpr, wy - 6 * dpr);
    }
    g.globalAlpha = 1;
    // trail
    const n = state.trail.length;
    state.trail.forEach((p, i) => {
      const [x, y] = vowelXY(cv, p[0], p[1]);
      g.globalAlpha = 0.15 + 0.85 * (i + 1) / n;
      g.fillStyle = C.ink;
      g.beginPath(); g.arc(x, y, (i === n - 1 ? 6.5 : 3) * dpr, 0, 7); g.fill();
    });
    g.globalAlpha = 1;
    // dashed path from your latest position to the typical value of your goal for this vowel
    const gv = goalVowel(), last = state.trail[n - 1];
    if (gv && last) {
      const T = state.goal === 'fem' ? gv.W : gv.M, col = state.goal === 'fem' ? C.fem : C.masc;
      const [ux, uy] = vowelXY(cv, last[0], last[1]), [tx, ty] = vowelXY(cv, T[0], T[1]);
      const len = Math.hypot(tx - ux, ty - uy), r = 10 * dpr;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(tx, ty, r, 0, 7); g.stroke();
      if (len > r + 8 * dpr) {
        const ex = tx - (tx - ux) / len * r, ey = ty - (ty - uy) / len * r, ang = Math.atan2(ty - uy, tx - ux);
        g.setLineDash([5 * dpr, 4 * dpr]);
        g.beginPath(); g.moveTo(ux, uy); g.lineTo(ex, ey); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.moveTo(ex, ey);
        g.lineTo(ex - 9 * dpr * Math.cos(ang - 0.45), ey - 9 * dpr * Math.sin(ang - 0.45));
        g.lineTo(ex - 9 * dpr * Math.cos(ang + 0.45), ey - 9 * dpr * Math.sin(ang + 0.45));
        g.closePath(); g.fill();
      }
      g.font = `${11 * dpr}px ${C.font}`; g.textAlign = 'left';
      g.fillText(`target ${gv.cue.split(' ')[0]}`, tx + r + 4 * dpr, ty + 14 * dpr);
    }
  }

  // ---- spectrogram ----
  function clearSpec() {
    const cv = $('cv-spec'); if (!cv) return;
    fitCanvas(cv);
    const g = cv.getContext('2d');
    g.fillStyle = C.panel; g.fillRect(0, 0, cv.width, cv.height);
    drawSpecAxis();
  }
  let specMax = -20;
  function drawSpecColumn(fr, fsd) {
    const cv = $('cv-spec'); const g = cv.getContext('2d');
    if (fitCanvas(cv)) clearSpec();
    const dpr = dprOf(), step = Math.max(1, Math.round(2 * dpr)), axisW = 34 * dpr;
    const w = cv.width, h = cv.height;
    g.drawImage(cv, axisW + step, 0, w - axisW - step, h, axisW, 0, w - axisW - step, h);
    const col = g.createImageData(step, h);
    const spec = fr.spec, binHz = fsd / 2 / (spec.length - 1), fmax = 5000;
    let mx = -200;
    for (let i = 0; i < spec.length; i++) if (spec[i] > mx) mx = spec[i];
    specMax = Math.max(mx, specMax - 0.3);
    for (let y = 0; y < h; y++) {
      const f = (1 - y / h) * fmax, b = Math.min(spec.length - 1, Math.round(f / binHz));
      const v = fr.kind === 'silence' ? 0 : clamp(Math.round((spec[b] - specMax + 60) / 60 * 255), 0, 255);
      for (let x = 0; x < step; x++) {
        const o = (y * step + x) * 4;
        col.data[o] = LUT[v * 3]; col.data[o + 1] = LUT[v * 3 + 1]; col.data[o + 2] = LUT[v * 3 + 2]; col.data[o + 3] = 255;
      }
    }
    g.putImageData(col, w - step, 0);
    if (fr.formants) {
      ['f1', 'f2', 'f3'].forEach((k, i) => {
        g.fillStyle = C[k];
        const y = (1 - fr.formants[i] / fmax) * h;
        g.fillRect(w - step, y - 1.5 * dpr, step, 3 * dpr);
      });
    }
  }
  function drawSpecAxis() {
    const cv = $('cv-spec'), g = cv.getContext('2d'), dpr = dprOf(), axisW = 34 * dpr;
    g.fillStyle = C.panel; g.fillRect(0, 0, axisW, cv.height);
    g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'right';
    for (const f of [1000, 2000, 3000, 4000]) {
      const y = (1 - f / 5000) * cv.height;
      g.fillText(f / 1000 + 'k', axisW - 12 * dpr, y + 4 * dpr);
    }
    // goal marks: where F1-F3 sit for a typical voice of the chosen goal on the current vowel
    const v = goalVowel();
    if (v) {
      const goal = state.goal === 'fem' ? v.W : v.M;
      ['f1', 'f2', 'f3'].forEach((k, i) => {
        const y = (1 - goal[i] / 5000) * cv.height;
        g.fillStyle = C[k];
        g.beginPath(); g.moveTo(axisW - 9 * dpr, y - 5 * dpr); g.lineTo(axisW - 1, y); g.lineTo(axisW - 9 * dpr, y + 5 * dpr); g.closePath(); g.fill();
      });
    }
  }
  function goalVowel() {
    if (state.drill && state.drill.def.vowel) return D.VOWEL_BY_KEY[state.drill.def.vowel];
    return state.lastVowel && Date.now() - state.lastVowel.at < 4000 ? state.lastVowel.v : null;
  }

  // ---- pitch trace ----
  const pitchBuf = [];
  const PITCH_RANGE = [60, 400];
  function pitchBand() { return state.goal === 'fem' ? D.PITCH_BANDS.fem : D.PITCH_BANDS.masc; }
  function drawPitch() {
    const cv = $('cv-pitch'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, axisW = 40 * dpr;
    const y = (f) => h - (Math.log(f / PITCH_RANGE[0]) / Math.log(PITCH_RANGE[1] / PITCH_RANGE[0])) * (h - 8 * dpr) - 4 * dpr;
    g.clearRect(0, 0, w, h);
    const [lo, hi] = pitchBand();
    g.fillStyle = state.goal === 'fem' ? C.fem : C.masc;
    g.globalAlpha = 0.14; g.fillRect(axisW, y(hi), w - axisW, y(lo) - y(hi)); g.globalAlpha = 1;
    g.strokeStyle = C.line; g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'right';
    for (const f of [80, 100, 150, 200, 300]) {
      g.beginPath(); g.moveTo(axisW, y(f)); g.lineTo(w, y(f)); g.stroke();
      g.fillText(f, axisW - 6 * dpr, y(f) + 4 * dpr);
    }
    const n = pitchBuf.length, span = 360, dx = (w - axisW) / span;
    g.fillStyle = C.ink;
    for (let i = 0; i < n; i++) {
      const f = pitchBuf[i]; if (!f) continue;
      const x = w - (n - i) * dx;
      g.beginPath(); g.arc(x, y(clamp(f, 60, 400)), 1.8 * dpr, 0, 7); g.fill();
    }
  }

  // ---------------- audio ----------------
  let ctx = null, analyser = null, an = null, node = null, stream = null, buf = null, raf = 0, lastT = 0, loopOn = false;
  let exSrc = null; // reference example currently playing
  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!an || an.sr !== ctx.sampleRate) {
      an = new D.Analyzer(ctx.sampleRate);
      analyser = ctx.createAnalyser();
      let size = 2048; while (size < an.needed) size *= 2;
      analyser.fftSize = Math.min(32768, size);
      analyser.smoothingTimeConstant = 0;
      buf = new Float32Array(analyser.fftSize);
    }
  }
  async function startMic() {
    stop();
    try {
      ensureCtx();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('no api'), { name: 'NoApi' });
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      node = ctx.createMediaStreamSource(stream);
      node.connect(analyser);
      begin('mic', 'Listening to your microphone');
      $('mic-note').hidden = true;
    } catch (err) {
      const note = $('mic-note');
      note.hidden = false;
      if (err && err.name === 'NotAllowedError' && window.isSecureContext && window.self === window.top) {
        note.textContent = 'Microphone access was denied. Allow it in your browser\'s site settings and press Start microphone again. You can also analyze a recording.';
      } else if (err && err.name === 'NotFoundError') {
        note.textContent = 'No microphone was found. Connect one and try again, or analyze a recording.';
      } else {
        note.textContent = 'This page can\'t reach the microphone here. Open the standalone VoiceTrainer.html file in Chrome, Edge, Firefox or Safari for live feedback, or use Analyze a recording (a voice memo works) or the demo voice.';
      }
      setStatus('Not listening');
    }
  }
  async function playBuffer(audioBuf, kind, label) {
    stop();
    ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(analyser);
    src.connect(ctx.destination);
    src.onended = () => { if (node === src) { stop(); setStatus(kind === 'demo' ? 'Demo finished' : 'Recording finished'); } };
    node = src;
    src.start();
    begin(kind, label);
  }
  async function playFile(file) {
    ensureCtx();
    setStatus('Decoding ' + file.name + '...');
    try {
      const ab = await file.arrayBuffer();
      const audio = await ctx.decodeAudioData(ab);
      playBuffer(audio, 'file', 'Analyzing ' + file.name);
    } catch (e) {
      setStatus('That file could not be decoded. Try WAV, MP3, M4A or OGG.');
    }
  }
  function playDemo() {
    ensureCtx();
    const x = Synth.demo(ctx.sampleRate, D.VOWELS);
    const ab = ctx.createBuffer(1, x.length, ctx.sampleRate);
    ab.copyToChannel(x, 0);
    playBuffer(ab, 'demo', 'Demo voice: sibilant and vowels, moving from masculine to feminine resonance');
  }
  function playExample(def, mode) {
    ensureCtx();
    stopExample();
    const fs = ctx.sampleRate;
    const x = mode === 'compare' ? Synth.comparison(fs, def, D.VOWELS, D.SIBILANTS) : Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS);
    const ab = ctx.createBuffer(1, x.length, fs);
    ab.copyToChannel(x, 0);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    if (state.running !== 'file' && state.running !== 'demo') src.connect(analyser); // show it on the charts
    src.onended = () => { if (exSrc === src) finishExample(); };
    exSrc = src;
    meterFrames = []; an.reset();
    src.start();
    ensureLoop();
    setExampleUi(mode);
  }
  function stopExample() {
    if (!exSrc) return;
    const s = exSrc;
    try { s.onended = null; s.stop(); } catch (e) {}
    try { s.disconnect(); } catch (e) {}
    finishExample();
  }
  function finishExample() {
    exSrc = null; exampleEnd = performance.now();
    if (an) an.reset();
    meterFrames = [];
    setExampleUi(null);
  }
  function setExampleUi(mode) {
    const p = $('ex-play'), c = $('ex-compare');
    if (p) p.textContent = mode === 'play' ? 'Stop example' : 'Play example';
    if (c) c.textContent = mode === 'compare' ? 'Stop comparison' : 'Compare masculine and feminine';
  }
  function begin(kind, label) {
    state.running = kind;
    take = newSession(); take.kind = kind;
    setStatus(label, true);
    $('btn-stop').hidden = kind === 'mic'; // the mic button itself becomes Stop
    setMicButton(kind === 'mic');
    an.reset();
    ensureLoop();
  }
  function stop() {
    if (take) { offerPlanFrom(take); take = null; }
    if (node) { try { node.onended = null; node.stop && node.stop(); } catch (e) {} try { node.disconnect(); } catch (e) {} node = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    state.running = null;
    $('btn-stop').hidden = true;
    setMicButton(false);
    setStatus('Not listening');
  }
  function setMicButton(on) {
    const b = $('btn-mic');
    b.textContent = on ? 'Stop microphone' : 'Start microphone';
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('listening', on);
  }
  function setStatus(text, live) {
    const s = $('src-status'); s.textContent = text; s.classList.toggle('on-air', !!live);
  }

  function ensureLoop() { if (!loopOn) { loopOn = true; lastT = 0; raf = requestAnimationFrame(loop); } }
  function loop(t) {
    if (!state.running && !exSrc) { loopOn = false; return; } // nothing to listen to
    raf = requestAnimationFrame(loop);
    if (t - lastT < 14) return; // cap at ~70 analyses per second
    lastT = t;
    analyser.getFloatTimeDomainData(buf);
    const fr = an.analyze(buf);
    onFrame(fr);
  }

  // ---------------- per-frame logic ----------------
  let frameCount = 0, meterFrames = [], sibShown = 0, exampleEnd = -1e9;
  function onFrame(fr) {
    frameCount++;
    drawSpecColumn(fr, an.fsd);
    pitchBuf.push(fr.kind === 'voiced' ? fr.f0 : 0);
    if (pitchBuf.length > 360) pitchBuf.shift();
    // While a reference example plays (and briefly after), show it but don't score it as the user.
    const gated = !!exSrc || performance.now() - exampleEnd < 400;
    const d = !gated && state.drill && !state.drill.result ? state.drill : null;

    if (fr.kind === 'voiced') {
      if (!gated) {
        session.pitch.push(Math.round(fr.f0));
        if (take) take.pitch.push(Math.round(fr.f0));
        if (session.pitch.length > 30000) session.pitch.splice(0, 10000);
      }
      $('ro-pitch').textContent = `${fmt(fr.f0)} Hz ${D.hzToNote(fr.f0)}`;
    }

    if (fr.kind === 'voiced' && fr.formants) {
      const F = fr.formants;
      $('ro-formants').textContent = F.map(f => Math.round(f)).join(' · ');
      state.lastF = { F, at: Date.now() };
      state.trail.push([F[0], F[1]]); if (state.trail.length > 24) state.trail.shift();
      if (fr.stable) {
        let score = NaN, vowel = null, ok = false;
        const cls = D.classifyVowel(F);
        if (d && d.def.vowel) {
          const v = D.VOWEL_BY_KEY[d.def.vowel];
          const fit = D.fitVowel(F, v);
          vowel = v; score = fit.alpha * 100;
          ok = fit.rms < 0.085 || cls.vowel.key === v.key;
          if (ok) d.vowelFr.push({ F, alpha: fit.alpha, per: fit.per });
          else d.offTarget = { key: cls.vowel.key, n: (d.offTarget && d.offTarget.n || 0) + 1 };
        } else if (cls.cost < 0.07) {
          vowel = cls.vowel; score = cls.alpha * 100; ok = true;
        }
        if (ok) {
          if (!gated) addVowelToSession(vowel.key, score);
          pushMeter(score);
          $('ro-vowel').textContent = `${vowel.cue.split(' ')[0]} (${vowel.word})`;
          state.lastVowel = { v: vowel, at: Date.now() };
          $('res-context').textContent = gated ? 'example ' + vowel.cue : d && d.def.vowel ? 'drill vowel ' + vowel.cue : 'vowel ' + vowel.cue;
        }
      }
    } else if (fr.kind === 'fricative') {
      const type = d && d.def.sib ? d.def.sib : fr.sib;
      const sib = D.SIBILANTS[type];
      const score = D.sibilantAlpha(fr.cog, sib) * 100;
      if (!gated) {
        session.sibs[type].push(score);
        if (take) take.sibs[type].push(score);
        if (session.sibs[type].length > 5000) session.sibs[type].splice(0, 1000);
      }
      if (d && d.def.sib) d.sibFr.push({ cog: fr.cog, score });
      sibShown = frameCount;
      $('ro-sib').textContent = `/${type === 's' ? 's' : 'ʃ'}/ ${fmt(score)} · ${(fr.cog / 1000).toFixed(1)} kHz`;
    }
    if (frameCount - sibShown > 120) $('ro-sib').textContent = '--';

    if (frameCount % 3 === 0) { drawVowelChart(); drawPitch(); renderMeter(); drawSpecAxis(); }
    if (d) updateDrill(d);
    if (frameCount % 30 === 0) renderSession();
  }

  function pushMeter(score) {
    meterFrames.push(score);
    if (meterFrames.length > 20) meterFrames.shift();
    state.meter = D.median(meterFrames);
  }
  function addVowelToSession(key, score) {
    (session.vowels[key] = session.vowels[key] || []).push(score);
    if (session.vowels[key].length > 3000) session.vowels[key].splice(0, 1000);
    session.all.push(score);
    if (session.all.length > 20000) session.all.splice(0, 5000);
    if (take) { (take.vowels[key] = take.vowels[key] || []).push(score); take.all.push(score); }
  }

  function renderMeter() {
    const v = state.meter;
    $('res-num').textContent = Number.isFinite(v) ? Math.round(v) : '--';
    const nd = $('meter-needle');
    nd.hidden = !Number.isFinite(v);
    if (Number.isFinite(v)) nd.style.left = clamp(v, 0, 100) + '%';
    const [lo, hi] = target();
    const t = $('meter-target');
    t.style.left = clamp(lo, 0, 100) + '%';
    t.style.width = clamp(hi, 0, 100) - clamp(lo, 0, 100) + '%';
    if (Number.isFinite(v)) {
      const inT = v >= lo && v <= hi;
      $('res-desc').textContent = inT ? 'In your target range. Keep this shape.'
        : state.goal === 'fem' ? (v < 40 ? 'Darker than typical feminine resonance. Try a smaller, brighter mouth space.' : 'Getting brighter. A little more forward and lighter to reach the target.')
          : (v > 60 ? 'Brighter than typical masculine resonance. Try more space in the throat and slightly rounded lips.' : 'Getting darker. A little more depth to reach the target.');
    }
  }

  // ---------------- drills ----------------
  function renderDrillGrid() {
    const grid = $('drill-grid');
    grid.innerHTML = '';
    for (const def of DRILLS[state.tab]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'drill'; b.id = 'drill-' + def.id;
      b.setAttribute('aria-pressed', String(!!(state.drill && state.drill.def.id === def.id)));
      const last = state.lastScores[def.id];
      b.innerHTML = `<span class="cue"></span><span class="sub"></span><span class="last"></span>`;
      b.querySelector('.cue').textContent = def.cue;
      b.querySelector('.sub').textContent = def.sub;
      b.querySelector('.last').textContent = last != null ? 'last ' + Math.round(last) : ' ';
      b.addEventListener('click', () => selectDrill(def));
      grid.appendChild(b);
    }
    for (const t of ['vowels', 'sibilants', 'words']) $('tab-' + t).setAttribute('aria-selected', String(state.tab === t));
  }
  function selectDrill(def, fromPlan) {
    if (!fromPlan && state.plan && state.plan.status === 'active' && planStep() && planStep().def.id !== def.id) {
      state.plan.status = 'paused'; renderPlan();
    }
    state.drill = { def, vowelFr: [], sibFr: [], offTarget: null, result: null };
    meterFrames = []; state.meter = NaN;
    renderDrillGrid();
    renderDrillPanel();
    drawVowelChart();
  }
  function drillInstruction(def) {
    if (def.type === 'vowel') {
      const v = D.VOWEL_BY_KEY[def.vowel];
      return `Hold "${v.cue}" as in "${v.word}" steadily at a comfortable pitch, or repeat "${v.word}" slowly.`;
    }
    if (def.type === 'sib') return def.sib === 's' ? 'Hold a steady "sss" as in "see" for about a second.' : 'Hold a steady "shh" as in "she" for about a second.';
    return `Say "${def.cue}" naturally, a few times in a row, stretching the vowel slightly.`;
  }
  function renderDrillPanel() {
    const p = $('drill-panel'), d = state.drill;
    if (!d) return;
    p.innerHTML = `
      <p class="eyebrow"><span>Drill</span><span>${d.def.type === 'word' ? 'consonant + vowel' : d.def.type === 'sib' ? 'sibilant' : 'vowel'}</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <div class="example-box">
        <div class="btn-row">
          <button type="button" class="btn" id="ex-play">Play example</button>
          <button type="button" class="btn" id="ex-compare">Compare masculine and feminine</button>
        </div>
        <p class="ex-note" id="ex-note"></p>
      </div>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div id="drill-result"></div>
      <div><button type="button" class="btn" id="drill-again" hidden>Try this sound again</button></div>`;
    p.querySelector('.drill-title').textContent = d.def.title;
    p.querySelector('.drill-help').textContent = drillInstruction(d.def);
    $('drill-msg').textContent = state.running ? 'Listening...' : 'Start the microphone (or analyze a recording) to begin.';
    $('drill-again').addEventListener('click', () => selectDrill(d.def));
    $('ex-play').addEventListener('click', () => (exSrc && $('ex-play').textContent.startsWith('Stop') ? stopExample() : playExample(d.def, 'play')));
    $('ex-compare').addEventListener('click', () => (exSrc && $('ex-compare').textContent.startsWith('Stop') ? stopExample() : playExample(d.def, 'compare')));
    renderExampleNote();
  }
  function renderExampleNote() {
    const n = $('ex-note'), d = state.drill; if (!n || !d) return;
    const fem = state.goal === 'fem', def = d.def;
    const parts = [];
    if (def.vowel) { const v = D.VOWEL_BY_KEY[def.vowel], F = fem ? v.W : v.M; parts.push(`F1 ${F[0]}, F2 ${F[1]}, F3 ${F[2]} Hz`); }
    if (def.sib) parts.push(`/${def.sib === 's' ? 's' : 'ʃ'}/ centred near ${((fem ? D.SIBILANTS[def.sib].W : D.SIBILANTS[def.sib].M) / 1000).toFixed(1)} kHz`);
    n.textContent = `Synthesized at typical ${fem ? 'feminine' : 'masculine'} values (${parts.join('; ')}; pitch ${fem ? 'about 200' : 'about 110'} Hz). It shows on the charts while it plays and doesn't count toward your scores. The comparison plays the masculine version first, then the feminine one.`;
  }
  function updateDrill(d) {
    const def = d.def;
    let prog;
    if (def.type === 'vowel') prog = d.vowelFr.length / NEED.vowel;
    else if (def.type === 'sib') prog = d.sibFr.length / NEED.sib;
    else prog = Math.min(d.vowelFr.length / NEED.wordVowel, d.sibFr.length / NEED.wordSib);
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    const msg = $('drill-msg');
    if (msg && frameCount % 6 === 0) {
      if (d.offTarget && d.offTarget.n > 25 && d.offTarget.key !== def.vowel) {
        const heard = D.VOWEL_BY_KEY[d.offTarget.key], want = D.VOWEL_BY_KEY[def.vowel];
        msg.textContent = `That sounds closer to "${heard.cue}" (${heard.word}). Aim for "${want.cue}" as in "${want.word}".`;
        if (d.offTarget.n > 60) d.offTarget.n = 0;
      } else if (def.type === 'word') {
        msg.textContent = `Vowel ${Math.min(100, Math.round(d.vowelFr.length / NEED.wordVowel * 100))}% · consonant ${Math.min(100, Math.round(d.sibFr.length / NEED.wordSib * 100))}%`;
      } else msg.textContent = prog > 0 ? 'Good, keep holding...' : 'Listening...';
    }
    if (prog >= 1) finishDrill(d);
  }

  function finishDrill(d) {
    const def = d.def, res = { id: def.id, label: def.cue, type: def.type, at: Date.now() };
    if (d.vowelFr.length) {
      const v = D.VOWEL_BY_KEY[def.vowel];
      res.vowelScore = D.median(d.vowelFr.map(f => f.alpha)) * 100;
      res.F = [0, 1, 2].map(i => D.median(d.vowelFr.map(f => f.F[i])));
      res.per = [0, 1, 2].map(i => D.median(d.vowelFr.map(f => f.per[i])) * 100);
      res.vowel = v.key;
    }
    if (d.sibFr.length) {
      res.sibScore = D.median(d.sibFr.map(f => f.score));
      res.cog = D.median(d.sibFr.map(f => f.cog));
      res.sib = def.sib;
    }
    res.score = def.type === 'word' ? 0.6 * res.vowelScore + 0.4 * res.sibScore : (res.vowelScore ?? res.sibScore);
    d.result = res;
    state.lastScores[def.id] = res.score;
    session.drills.push({ id: def.id, label: def.cue, score: Math.round(res.score), at: res.at });
    renderDrillResult(res);
    renderDrillGrid();
    renderSession();
    const bar = $('drill-prog'); if (bar) bar.style.width = '100%';
    $('drill-msg').textContent = 'Done. Try this sound again to beat your score, or pick another sound.';
    $('drill-again').hidden = false;
    planDrillFinished(def, res);
  }

  // ---------------- guided exercise ----------------
  // After a recording (or a listening run), pick the vowels and sibilants furthest from the goal,
  // add words that combine them, and walk through them as drills with before/after scores.
  function gapOf(score) { const [lo, hi] = target(); return state.goal === 'fem' ? lo - score : score - hi; }
  function buildPlan(st) {
    const steps = [];
    const vowelKeys = Object.keys(st.vowels).sort((a, b) => gapOf(st.vowels[b].score) - gapOf(st.vowels[a].score));
    let weakV = vowelKeys.filter(k => gapOf(st.vowels[k].score) > 0).slice(0, 3);
    if (weakV.length < 2) weakV = vowelKeys.slice(0, 2); // nothing (much) off target: polish the two closest to the edge
    for (const k of weakV) {
      const sc = st.vowels[k].score, v = D.VOWEL_BY_KEY[k];
      steps.push({ def: ALL_DRILLS.find(d => d.id === 'v-' + k), before: sc,
        reason: gapOf(sc) > 0 ? `"${v.cue.split(' ')[0]}" scored ${Math.round(sc)} in the recording` : `"${v.cue.split(' ')[0]}" is on target (${Math.round(sc)}); keep it steady` });
    }
    const sibKeys = Object.keys(st.sib).sort((a, b) => gapOf(st.sib[b].score) - gapOf(st.sib[a].score));
    let weakS = sibKeys.filter(k => gapOf(st.sib[k].score) > 0);
    for (const k of weakS) {
      steps.push({ def: ALL_DRILLS.find(d => d.id === 's-' + k), before: st.sib[k].score,
        reason: `/${k === 's' ? 's' : 'ʃ'}/ scored ${Math.round(st.sib[k].score)} in the recording` });
    }
    if (!sibKeys.length) {
      weakS = ['s'];
      steps.push({ def: ALL_DRILLS.find(d => d.id === 's-s'), before: null, reason: 'The recording had no clear /s/, so this checks it' });
    }
    // words that pair a weak vowel with a weak (or untested) sibilant
    const offV = weakV.filter(k => gapOf(st.vowels[k].score) > 0);
    const wordV = offV.length ? offV : weakV;
    const words = DRILLS.words.map(w => {
      const vi = wordV.indexOf(w.vowel), si = weakS.indexOf(w.sib);
      return { w, rank: (vi >= 0 ? 3 - vi : 0) * 2 + (si >= 0 ? 2 - si : 0), vi, si };
    }).filter(x => x.vi >= 0).sort((a, b) => b.rank - a.rank);
    const usedV = new Set();
    for (const x of words) {
      if (usedV.has(x.w.vowel)) continue;
      usedV.add(x.w.vowel);
      const vs = st.vowels[x.w.vowel] && st.vowels[x.w.vowel].score, ss = st.sib[x.w.sib] && st.sib[x.w.sib].score;
      steps.push({ def: x.w, before: vs != null && ss != null ? 0.6 * vs + 0.4 * ss : null, estimated: true,
        reason: `Puts ${D.VOWEL_BY_KEY[x.w.vowel].cue.split(' ')[0]} after /${x.w.sib === 's' ? 's' : 'ʃ'}/ inside a word` });
      if (usedV.size >= 3) break;
    }
    return steps.filter(s => s.def);
  }
  function offerPlanFrom(t) {
    if (state.plan && (state.plan.status === 'active' || state.plan.status === 'paused')) return;
    const st = sessionStats(t);
    const nv = Object.keys(st.vowels).length;
    // A recording needs two vowels or a sibilant; a live mic run needs real speech (3+ vowels), not just drills.
    if (t.kind === 'mic' ? nv < 3 : nv < 2 && !Object.keys(st.sib).length) return;
    const steps = buildPlan(st);
    if (!steps.length) return;
    state.plan = { status: 'offer', source: t.kind, steps, idx: 0 };
    renderPlan();
  }
  const planStep = () => state.plan && state.plan.steps[state.plan.idx];
  function startPlan() {
    const pl = state.plan;
    pl.status = 'active'; pl.idx = 0; pl.started = Date.now();
    for (const s of pl.steps) { s.after = null; s.skipped = false; }
    goToStep();
  }
  function goToStep() {
    const pl = state.plan, s = planStep();
    if (!s) return finishPlan();
    pl.status = 'active';
    state.tab = s.def.type === 'vowel' ? 'vowels' : s.def.type === 'sib' ? 'sibilants' : 'words';
    selectDrill(s.def, true);
    renderPlan();
    $('plan').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function planDrillFinished(def, res) {
    const pl = state.plan, s = planStep();
    if (!pl || pl.status !== 'active' || !s || s.def.id !== def.id) return;
    s.after = res.score;
    renderPlan();
    const box = $('drill-again') && $('drill-again').parentElement;
    if (box) {
      const nb = document.createElement('button');
      nb.type = 'button'; nb.className = 'btn primary'; nb.id = 'plan-next';
      nb.textContent = pl.idx + 1 < pl.steps.length ? 'Next step' : 'See results';
      nb.addEventListener('click', () => { pl.idx++; goToStep(); });
      box.classList.add('btn-row');
      box.prepend(nb);
    }
  }
  function finishPlan() {
    const pl = state.plan;
    pl.status = 'done';
    const nb = $('plan-next'); if (nb) nb.remove();
    session.exercises = session.exercises || [];
    session.exercises.push({ at: pl.started, steps: pl.steps.map(s => ({ id: s.def.id, label: s.def.cue, before: s.before == null ? null : Math.round(s.before), after: s.after == null ? null : Math.round(s.after) })) });
    renderPlan(); renderSession();
  }
  function stepLabel(def) {
    return def.type === 'vowel' ? `"${def.cue}" (${D.VOWEL_BY_KEY[def.vowel].word})` : def.type === 'sib' ? `"${def.cue}"` : `word "${def.cue}"`;
  }
  function renderPlan() {
    const box = $('plan'), pl = state.plan;
    box.hidden = !pl || pl.status === 'closed';
    if (box.hidden) return;
    const src = pl.source === 'file' ? 'your recording' : pl.source === 'demo' ? 'the demo voice' : 'what you just said';
    const fmtS = (v) => (v == null ? '--' : Math.round(v));
    let head, actions;
    if (pl.status === 'offer') {
      head = `<p class="eyebrow"><span>Guided exercise</span><span>${pl.steps.length} steps</span></p>
        <h3 class="plan-title">Work on the weakest sounds from ${src}</h3>
        <p class="drill-help">Each step is a short drill. Use the microphone, or record yourself doing the step and analyze that file. Your score before and after appears next to each step.</p>`;
      actions = `<button type="button" class="btn primary" id="plan-start">Start guided exercise</button><button type="button" class="btn" id="plan-close">Not now</button>`;
    } else if (pl.status === 'done') {
      const done = pl.steps.filter(s => s.after != null && s.before != null);
      const gain = done.length ? D.median(done.map(s => (state.goal === 'fem' ? s.after - s.before : s.before - s.after))) : NaN;
      head = `<p class="eyebrow"><span>Guided exercise</span><span>finished</span></p>
        <h3 class="plan-title">${Number.isFinite(gain) ? (gain > 0 ? `Median improvement of ${Math.round(gain)} points toward your goal` : 'No improvement yet; these sounds need more repetitions') : 'Exercise finished'}</h3>
        <p class="drill-help">The results are part of this session. Press Save to progress to keep them.</p>`;
      actions = `<button type="button" class="btn primary" id="plan-start">Run it again</button><button type="button" class="btn" id="plan-close">Close</button>`;
    } else {
      head = `<p class="eyebrow"><span>Guided exercise</span><span>step ${Math.min(pl.idx + 1, pl.steps.length)} of ${pl.steps.length}${pl.status === 'paused' ? ' · paused' : ''}</span></p>
        <h3 class="plan-title">${planStep() ? planStep().reason : ''}</h3>`;
      actions = pl.status === 'paused'
        ? `<button type="button" class="btn primary" id="plan-resume">Resume exercise</button><button type="button" class="btn" id="plan-end">End exercise</button>`
        : `<button type="button" class="btn" id="plan-skip">Skip step</button><button type="button" class="btn" id="plan-end">End exercise</button>`;
    }
    const rows = pl.steps.map((s, i) => {
      const cur = (pl.status === 'active' || pl.status === 'paused') && i === pl.idx;
      const status = s.after != null ? 'done' : s.skipped ? 'skipped' : cur ? 'current' : 'todo';
      const delta = s.after != null && s.before != null ? Math.round(s.after - s.before) : null;
      const good = delta != null && (state.goal === 'fem' ? delta > 0 : delta < 0);
      return `<li class="step ${status}"><span class="step-n">${i + 1}</span><span class="step-name">${stepLabel(s.def)}</span>
        <span class="step-scores">${fmtS(s.before)}${s.estimated && s.before != null ? '<small>est</small>' : ''} &rarr; ${status === 'skipped' ? 'skipped' : fmtS(s.after)}${delta != null ? ` <span class="pill ${good ? 'good' : 'warn'}">${delta > 0 ? '+' : ''}${delta}</span>` : ''}</span></li>`;
    }).join('');
    box.innerHTML = `${head}<ol class="steps">${rows}</ol><div class="btn-row">${actions}</div>`;
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('plan-start', startPlan);
    on('plan-close', () => { pl.status = 'closed'; renderPlan(); });
    on('plan-skip', () => { const s = planStep(); if (s) s.skipped = true; pl.idx++; goToStep(); });
    on('plan-end', finishPlan);
    on('plan-resume', goToStep);
  }

  function onTarget(score) { const [lo, hi] = target(); return score >= lo && score <= hi; }
  function vowelTip(res) {
    const fem = state.goal === 'fem';
    if (onTarget(res.vowelScore)) return 'On target for this vowel. Hold the same mouth shape and try it inside a word drill.';
    // the formant furthest from the goal drives the advice
    // F1 swings with jaw opening, so it only leads the advice when it is clearly the outlier.
    const adj = res.per.map((p, i) => (i === 0 ? p + (fem ? 20 : -20) : p));
    const idx = fem ? adj.indexOf(Math.min(...adj)) : adj.indexOf(Math.max(...adj));
    const tips = fem ? [
      'F1 is low. Let the jaw drop a touch and keep the larynx high (think of a small, light "hmm" before the vowel). F1 rises when the throat space shrinks.',
      'F2 is low. Bring the tongue body forward and spread the lips slightly, as in a gentle smile. F2 responds most to tongue position, so small forward shifts count.',
      'F3 is low. Avoid rounding or pushing the lips forward, and keep the larynx raised. A shorter vocal tract lifts F3.',
    ] : [
      'F1 is high. Add space in the throat (the start of a yawn) and keep the jaw relaxed, without opening the mouth wider.',
      'F2 is high. Let the tongue sit slightly further back and relax the lip spreading. Very light lip rounding helps.',
      'F3 is high. Let the larynx settle lower and round the lips slightly to lengthen the vocal tract.',
    ];
    return tips[idx];
  }
  function sibTip(res) {
    const fem = state.goal === 'fem';
    if (onTarget(res.sibScore)) return 'On target. This hiss is in the typical range for your goal.';
    if (res.sib === 's') return fem
      ? 'Your /s/ is lower than typical feminine. Move the tongue tip a little closer to the back of the upper teeth and spread the lips slightly. A smaller space in front of the tongue raises the hiss.'
      : 'Your /s/ is higher than typical masculine. Pull the tongue tip back slightly and relax the lips toward a slight rounding.';
    return fem
      ? 'Your /ʃ/ is lower than typical feminine. Use less lip rounding and keep the tongue a little further forward.'
      : 'Your /ʃ/ is higher than typical masculine. Round and protrude the lips a little more.';
  }
  function renderDrillResult(res) {
    const box = $('drill-result');
    const parts = [];
    const pill = (s) => `<span class="pill ${onTarget(s) ? 'good' : 'warn'}">${onTarget(s) ? 'on target' : 'off target'}</span>`;
    if (res.vowelScore != null) {
      const v = D.VOWEL_BY_KEY[res.vowel];
      parts.push(`<div class="result">
        <div class="result-score"><strong>${Math.round(res.vowelScore)}</strong><span>vowel "${v.cue}" resonance</span>${pill(res.vowelScore)}</div>
        <table class="formant-table"><thead><tr><th></th><th>You</th><th>Masc avg</th><th>Fem avg</th><th>Position</th></tr></thead><tbody>
        ${[0, 1, 2].map(i => `<tr><td>F${i + 1}</td><td>${Math.round(res.F[i])}</td><td>${v.M[i]}</td><td>${v.W[i]}</td><td>${Math.round(res.per[i])}</td></tr>`).join('')}
        </tbody></table>
        <p class="tip">${vowelTip(res)}</p></div>`);
    }
    if (res.sibScore != null) {
      const s = D.SIBILANTS[res.sib];
      parts.push(`<div class="result">
        <div class="result-score"><strong>${Math.round(res.sibScore)}</strong><span>/${res.sib === 's' ? 's' : 'ʃ'}/ brightness · ${(res.cog / 1000).toFixed(1)} kHz (masc avg ${(s.M / 1000).toFixed(1)}, fem avg ${(s.W / 1000).toFixed(1)})</span>${pill(res.sibScore)}</div>
        <p class="tip">${sibTip(res)}</p></div>`);
    }
    box.innerHTML = parts.join('');
  }

  // ---------------- session summary ----------------
  function barRow(label, sub, score) {
    const row = document.createElement('div');
    row.className = 'bar';
    row.innerHTML = `<span class="label"></span><span class="track"><span class="mark"></span></span><span class="val"></span>`;
    row.querySelector('.label').textContent = label;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; row.querySelector('.label').appendChild(s); }
    row.querySelector('.mark').style.left = clamp(score, 0, 100) + '%';
    row.querySelector('.val').textContent = Math.round(score);
    return row;
  }
  function sessionStats(s = session) {
    const vowels = {};
    for (const [k, arr] of Object.entries(s.vowels)) if (arr.length >= 8) vowels[k] = { score: D.median(arr), n: arr.length };
    const sib = {};
    for (const k of ['s', 'sh']) if (s.sibs[k].length >= 8) sib[k] = { score: D.median(s.sibs[k]), n: s.sibs[k].length };
    const p = s.pitch;
    return {
      vowels, sib,
      resonance: s.all.length >= 20 ? D.median(s.all) : NaN,
      pitch: p.length >= 30 ? { median: D.median(p), p10: D.quantile(p, 0.1), p90: D.quantile(p, 0.9) } : null,
      seconds: Math.round((s.all.length + s.sibs.s.length + s.sibs.sh.length) / 60),
    };
  }
  function renderSession() {
    const st = sessionStats();
    const vb = $('sess-vowels');
    const keys = Object.keys(st.vowels).sort((a, b) => st.vowels[a].score - st.vowels[b].score);
    if (keys.length) {
      vb.innerHTML = '';
      for (const k of keys) { const v = D.VOWEL_BY_KEY[k]; vb.appendChild(barRow(v.cue.split(' ')[0], v.word, st.vowels[k].score)); }
    }
    const sb = $('sess-sibs');
    if (Object.keys(st.sib).length) {
      sb.innerHTML = '';
      for (const k of Object.keys(st.sib)) sb.appendChild(barRow(k === 's' ? '/s/' : '/ʃ/', k === 's' ? 'see' : 'she', st.sib[k].score));
    }
    const sum = $('sess-summary');
    const rows = [
      ['Overall resonance', Number.isFinite(st.resonance) ? Math.round(st.resonance) : '--'],
      ['Median pitch', st.pitch ? `${Math.round(st.pitch.median)} Hz` : '--'],
      ['Pitch range (10-90%)', st.pitch ? `${Math.round(st.pitch.p10)}-${Math.round(st.pitch.p90)} Hz` : '--'],
      ['Drills completed', session.drills.length],
    ];
    sum.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('btn-save').disabled = !(Number.isFinite(st.resonance) || session.drills.length || Object.keys(st.sib).length);
  }

  // ---------------- progress storage ----------------
  const LS_KEY = 'voicetrainer.sessions.v1';
  const Store = {
    kind: 'local', col: null, items: [],
    async init() {
      try {
        if (window.claude && typeof window.claude.use === 'function') {
          const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
          const uid = db && user ? await user.id() : null;
          if (uid) { this.col = db.collection('data/users/' + uid); this.kind = 'account'; }
        }
      } catch (e) { this.col = null; this.kind = 'local'; }
      await this.load();
    },
    async load() {
      if (this.col) {
        try {
          const snap = await this.col.orderBy('at', 'asc').limit(500).get();
          this.items = snap.docs.map(s => Object.assign({ id: s.id }, s.data()));
          return;
        } catch (e) { this.col = null; this.kind = 'local'; }
      }
      try { this.items = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { this.items = []; }
    },
    async save(rec) {
      if (this.col) {
        const ref = this.col.doc(rec.id);
        await ref.set(rec);
      } else {
        const next = this.items.concat([rec]);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      }
      this.items.push(rec);
    },
    async remove(id) {
      if (this.col) await this.col.doc(id).delete();
      else localStorage.setItem(LS_KEY, JSON.stringify(this.items.filter(r => r.id !== id)));
      this.items = this.items.filter(r => r.id !== id);
    },
  };

  async function saveSession() {
    const st = sessionStats();
    const round = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
    const rec = {
      id: 's' + session.start.toString(36) + Math.random().toString(36).slice(2, 6),
      at: new Date(session.start).toISOString(),
      goal: state.goal,
      resonance: round(st.resonance),
      vowels: Object.fromEntries(Object.entries(st.vowels).map(([k, v]) => [k, round(v.score)])),
      sibS: st.sib.s ? round(st.sib.s.score) : null,
      sibSh: st.sib.sh ? round(st.sib.sh.score) : null,
      pitchMedian: st.pitch ? Math.round(st.pitch.median) : null,
      pitchP10: st.pitch ? Math.round(st.pitch.p10) : null,
      pitchP90: st.pitch ? Math.round(st.pitch.p90) : null,
      drills: session.drills.slice(-60),
      exercises: (session.exercises || []).slice(-10),
    };
    const s = $('save-status');
    try {
      await Store.save(rec);
      s.textContent = Store.kind === 'account' ? 'Saved to your progress.' : 'Saved to your progress in this browser.';
      session = newSession();
      renderSession(); resetSessionViews();
      renderHistory();
    } catch (e) {
      s.textContent = e && e.code === 'quota_exceeded' ? 'Progress storage is full. Delete a few old sessions and save again.' : 'Could not save this session. Check your connection and try again.';
    }
  }
  function resetSessionViews() {
    $('sess-vowels').innerHTML = '<p class="empty">Vowels you use will appear here with their own score, so you can see which ones pull your resonance down.</p>';
    $('sess-sibs').innerHTML = '<p class="empty">Hold an "sss" or "shh" to measure how bright your sibilants are.</p>';
    renderSession();
  }

  function renderHistory() {
    const items = Store.items.slice().sort((a, b) => a.at.localeCompare(b.at));
    $('store-kind').textContent = Store.kind === 'account' ? 'Saved to your account' : 'Saved in this browser';
    const has = items.length > 0;
    $('hist-empty').hidden = has;
    $('hist-chart-wrap').hidden = !has;
    $('hist-table-wrap').hidden = !has;
    const tb = document.querySelector('#hist-table tbody');
    tb.innerHTML = '';
    for (const r of items.slice().reverse()) {
      const tr = document.createElement('tr');
      const low = Object.entries(r.vowels || {}).sort((a, b) => a[1] - b[1])[0];
      const lowTxt = low ? `${D.VOWEL_BY_KEY[low[0]].cue.split(' ')[0]} (${Math.round(low[1])})` : '--';
      const date = new Date(r.at);
      const cells = [date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        r.goal === 'masc' ? 'Masculine' : 'Feminine',
        r.resonance != null ? Math.round(r.resonance) : '--',
        r.sibS != null ? Math.round(r.sibS) : '--',
        r.pitchMedian != null ? r.pitchMedian + ' Hz' : '--', lowTxt];
      cells.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (i >= 2 && i <= 4) td.className = 'num'; tr.appendChild(td); });
      const td = document.createElement('td');
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (del.dataset.confirm) { await Store.remove(r.id); renderHistory(); }
        else { del.dataset.confirm = '1'; del.textContent = 'Confirm delete'; }
      });
      td.appendChild(del); tr.appendChild(td); tb.appendChild(tr);
    }
    drawHistory();
  }
  function drawHistory() {
    const cv = $('cv-hist'); if (!cv || !C.ink || $('hist-chart-wrap').hidden) return;
    fitCanvas(cv);
    const items = Store.items.slice().sort((a, b) => a.at.localeCompare(b.at));
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height;
    const pad = { l: 36 * dpr, r: 12 * dpr, t: 10 * dpr, b: 26 * dpr };
    g.clearRect(0, 0, w, h);
    const y = (v) => pad.t + (1 - (clamp(v, -10, 110) + 10) / 120) * (h - pad.t - pad.b);
    const n = items.length, x = (i) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * (w - pad.l - pad.r);
    g.font = `${10 * dpr}px ${C.font}`; g.fillStyle = C.muted; g.strokeStyle = C.line; g.lineWidth = dpr;
    const [lo, hi] = target();
    g.fillStyle = state.goal === 'fem' ? C.fem : C.masc; g.globalAlpha = 0.1;
    g.fillRect(pad.l, y(Math.min(hi, 110)), w - pad.l - pad.r, y(lo) - y(Math.min(hi, 110))); g.globalAlpha = 1;
    g.fillStyle = C.muted; g.textAlign = 'right';
    for (const v of [0, 25, 50, 75, 100]) { g.beginPath(); g.moveTo(pad.l, y(v)); g.lineTo(w - pad.r, y(v)); g.stroke(); g.fillText(v, pad.l - 6 * dpr, y(v) + 4 * dpr); }
    g.textAlign = 'center';
    const every = Math.max(1, Math.ceil(n / 8));
    items.forEach((r, i) => { if (i % every === 0 || i === n - 1) g.fillText(new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), x(i), h - 8 * dpr); });
    const series = (key, color) => {
      const pts = items.map((r, i) => [i, r[key]]).filter(p => p[1] != null);
      if (!pts.length) return;
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2 * dpr;
      g.beginPath(); pts.forEach(([i, v], j) => (j ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)))); g.stroke();
      pts.forEach(([i, v], j) => { g.beginPath(); g.arc(x(i), y(v), (j === pts.length - 1 ? 5 : 3) * dpr, 0, 7); g.fill(); });
    };
    series('resonance', C.accent);
    series('sibS', C.warn);
  }

  // ---------------- wiring ----------------
  function setGoal(goal) {
    state.goal = goal;
    document.body.dataset.goal = goal;
    $('goal-fem').setAttribute('aria-checked', String(goal === 'fem'));
    $('goal-masc').setAttribute('aria-checked', String(goal === 'masc'));
    const [lo, hi] = pitchBand();
    $('pitch-band-label').textContent = `target band ${lo} to ${hi} Hz`;
    try { localStorage.setItem('voicetrainer.goal', goal); } catch (e) {}
    renderMeter(); drawPitch(); drawHistory(); renderSpecGoalHelp(); renderExampleNote(); if (C.ink) drawSpecAxis();
    if (state.drill && state.drill.result) renderDrillResult(state.drill.result);
  }
  function renderSpecGoalHelp() {
    const fem = state.goal === 'fem';
    $('spec-help-goal').innerHTML = `<b>The small triangles on the left edge are your goal.</b> While you hold a vowel they mark where F1, F2 and F3 sit for a typical ${fem ? 'feminine' : 'masculine'} voice on that vowel. Try to bring each dash level with its triangle. ${fem ? 'Raising F2 and F3 (tongue forward, lips spread, larynx up) brightens the voice.' : 'Lowering F2 and F3 (more throat space, slight lip rounding, larynx down) darkens the voice.'}`;
  }
  function initSpecHelp() {
    const btn = $('spec-info'), help = $('spec-help'), cv = $('cv-spec'), tip = $('spec-tip'), fig = cv.closest('figure');
    const setOpen = (open) => { help.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) tip.hidden = true; };
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(help.hidden); });
    document.addEventListener('click', (e) => { if (!help.hidden && !help.contains(e.target) && e.target !== btn) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    let hideT = 0;
    const show = (e) => {
      const r = cv.getBoundingClientRect(), fr = fig.getBoundingClientRect();
      const y = e.clientY - r.top; if (y < 0 || y > r.height) return;
      const f = (1 - y / r.height) * 5000;
      let html = `<b>${(f / 1000).toFixed(2)} kHz</b> at this height`;
      const v = goalVowel(), recent = state.lastF && Date.now() - state.lastF.at < 1500 ? state.lastF.F : null;
      const near = [0, 1, 2].map(i => ({ i, d: Math.abs((recent ? recent[i] : v ? (state.goal === 'fem' ? v.W : v.M)[i] : 1e9) - f) })).sort((a, b) => a.d - b.d)[0];
      if ((recent || v) && near.d < 300) {
        const i = near.i, name = 'F' + (i + 1);
        const what = ['F1 follows how open the mouth and throat are.', 'F2 follows tongue position: forward raises it, back lowers it.', 'F3 follows lip shape and larynx height.'][i];
        html += `<br>${name}${recent ? ` now ${Math.round(recent[i])} Hz` : ''}`;
        if (v) html += `<br>Goal on "${v.cue.split(' ')[0]}": ${(state.goal === 'fem' ? v.W : v.M)[i]} Hz (${state.goal === 'fem' ? 'feminine' : 'masculine'} avg)`;
        html += `<br>${what}`;
      } else if (f > 4000) html += '<br>Hissing sounds like /s/ show up up here.';
      else if (f < 300) html += '<br>Your pitch (the lowest stripe) sits down here.';
      tip.innerHTML = html;
      tip.hidden = false;
      const x = e.clientX - fr.left, top = e.clientY - fr.top;
      tip.style.left = Math.min(Math.max(8, x + 12), fr.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.max(8, top - tip.offsetHeight - 10) + 'px';
      clearTimeout(hideT);
      if (e.pointerType !== 'mouse') hideT = setTimeout(() => { tip.hidden = true; }, 3500);
    };
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(e); });
    cv.addEventListener('pointerdown', show);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
  }
  function init() {
    let g = 'fem';
    try { g = localStorage.getItem('voicetrainer.goal') || 'fem'; } catch (e) {}
    $('goal-fem').addEventListener('click', () => setGoal('fem'));
    $('goal-masc').addEventListener('click', () => setGoal('masc'));
    $('btn-mic').addEventListener('click', () => (state.running === 'mic' ? stop() : startMic()));
    $('btn-demo').addEventListener('click', playDemo);
    $('btn-stop').addEventListener('click', stop);
    $('file-in').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) playFile(f); e.target.value = ''; });
    $('btn-save').addEventListener('click', saveSession);
    $('btn-reset').addEventListener('click', () => { session = newSession(); state.lastScores = {}; resetSessionViews(); renderDrillGrid(); $('save-status').textContent = 'Session cleared.'; });
    for (const t of ['vowels', 'sibilants', 'words']) $('tab-' + t).addEventListener('click', () => { state.tab = t; renderDrillGrid(); });
    initSpecHelp();
    readTheme();
    setGoal(g === 'masc' ? 'masc' : 'fem');
    renderDrillGrid();
    renderSession();
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { clearSpec(); drawVowelChart(); drawPitch(); drawHistory(); }, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawVowelChart(); drawPitch(); clearSpec(); });
    Store.init().then(renderHistory);
  }
  init();

  // test hook for automated checks
  window.__vt = { onFrame, state, sessionStats, get analyzer() { return an; }, setAnalyzer(a) { an = a; } };
})();
