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
  // Breath exercises: guided steps plus a live breathiness gauge. aim 'band' completes after a few
  // seconds inside the goal zone; 'explore' is free practice.
  DRILLS.breath = [
    { id: 'b-dog', type: 'breath', aim: 'explore', cue: 'Big dog, little dog', sub: 'larynx height and airflow', title: 'Big dog, little dog',
      why: 'A panting game for feeling your larynx move and noticing your airflow. A big dog pants low and slow with a lowered larynx and an open throat; a little dog pants high and quick with a raised larynx and a small throat. It mainly trains larynx height (resonance); because it starts as pure breath, it also makes airflow easy to feel.',
      steps: (fem) => [
        'Rest a finger lightly on your larynx, the bump at the front of your neck.',
        'Big dog: pant slowly through an open mouth with a deep, hollow, dark sound. Feel the larynx drop.',
        'Little dog: pant quickly and lightly with a small, bright, high sound. Feel the larynx rise.',
        'Switch between the two a few times, slowly, with no strain in the neck.',
        fem ? 'Settle in the little-dog position and add gentle voice: a soft, light "hee".' : 'Settle in the big-dog position and add gentle voice: a soft, relaxed "huh".',
        'Watch the resonance meter move, and keep the breathiness gauge in the zone once you add voice. Panting alone is unvoiced, so the gauge only reads when there is tone.',
      ] },
    { id: 'b-sigh', type: 'breath', aim: 'band', cue: 'Sigh to clear tone', sub: 'find where breathy ends', title: 'Sigh to clear tone',
      why: 'You start very airy and let the tone clear, so you feel exactly where breathy turns into clear. Good for learning control in both directions.',
      steps: () => [
        'Take an easy breath with relaxed shoulders.',
        'Sigh out on "haaa" with lots of air and only a little tone. The gauge should sit high.',
        'Over about three seconds, let the tone become clearer while the throat stays relaxed.',
        'Stop changing when the gauge enters the zone, and hold "ah" there.',
        'Repeat until you can land in the zone straight away.',
      ] },
    { id: 'b-whisper', type: 'breath', aim: 'band', cue: 'Whisper to voice', sub: 'add light airflow', title: 'Whisper to voice',
      why: 'For a voice that feels pressed or heavy. A little airflow is part of a lighter vocal weight, which many people pair with feminine resonance. Too much air tires the voice, so the zone stops short of breathy.',
      steps: () => [
        'Whisper "hee" a few times, quietly.',
        'Whisper it again and slowly blend in voice, like turning up a dimmer switch.',
        'Stop when the gauge reaches the zone: a clear pitch with a hint of air.',
        'Keep the volume low. This is about the quality of the sound, not loudness.',
      ] },
    { id: 'b-onset', type: 'breath', aim: 'band', cue: 'Clean onset "uh-oh"', sub: 'less air leaking', title: 'Clean, gentle onset',
      why: 'For a voice that leaks too much air, which makes it quieter and tires it faster. A clean, gentle start brings the vocal folds together without pushing.',
      steps: () => [
        'Say "uh-oh" gently, like noticing a small mistake. Feel the tiny catch before each syllable.',
        'Start an "ee" with that same tiny catch, and hold it.',
        'Keep it soft: a light catch, never a cough or a hard click.',
        'If the gauge is above the zone, use slightly less air and slightly more tone; if below, ease off the effort.',
      ] },
    { id: 'b-hum', type: 'breath', aim: 'band', cue: 'Hum into a vowel', sub: 'balanced closure', title: 'Hum into a vowel',
      why: 'Humming, and humming through a straw, help the vocal folds close efficiently without pushing: the balanced point between breathy and pressed.',
      steps: () => [
        'Hum "mmm" at a comfortable pitch until you feel a buzz on your lips and nose.',
        'Optional: hum through a drinking straw for about 20 seconds, then take it away.',
        'Open the hum into "mmm-ah" and keep the same easy buzz in the "ah".',
        'Hold the "ah" with the gauge in the zone.',
      ] },
    { id: 'b-scale', type: 'breath', aim: 'band', cue: 'Breathy, clear, pressed', sub: 'know your range', title: 'Breathy, clear, pressed',
      why: 'Making each quality on purpose shows you the whole range, so you can choose where to sit instead of drifting.',
      steps: () => [
        'Hold "ah" very breathy: the gauge goes high.',
        'Now clear: the gauge moves to the middle.',
        'Now slightly pressed, like lifting something light: the gauge goes low. Never strain.',
        'Move slowly between the three a few times.',
        'Finish in the zone and hold it there.',
      ] },
  ];
  // Control exercises: move one part of the tract and check that the matching formant (and only it)
  // moves, to build trust in what the feedback is tracking.
  DRILLS.control = [
    { id: 'c-jaw', type: 'iso', kind: 'jaw', vowel: 'a', cue: 'Jaw only', sub: 'jaw (F1) · "ah" to "uh"', title: 'Move only the jaw',
      why: 'The jaw reading (F1) follows how open the mouth is. Move only the jaw: the jaw bar should move while the tongue and lips/larynx bars barely change.',
      steps: ['Hold a relaxed "ah" at a comfortable pitch until it says the starting point is set.',
        'Keep the tongue lying flat and the lips loose. Slowly close the jaw about a finger-width, still voicing, then open it again.',
        'Watch the jaw bar move while the tongue and lips/larynx bars stay near the middle.',
        'Go back and forth slowly a few times.'] },
    { id: 'c-tongue', type: 'iso', kind: 'tongue', vowel: 'i', cue: 'Tongue only', sub: 'tongue (F2) · "ee" to smiling "oo"', title: 'Move only the tongue',
      why: 'The tongue reading (F2) follows where the body of the tongue sits, front or back. Slide it while the smile and the jaw stay put.',
      steps: ['Hold "ee" with a slight smile until the starting point is set.',
        'Keep smiling and keep the jaw still. Slowly pull the tongue back, as if starting "oo" but without rounding the lips. It sounds odd; that is fine.',
        'The tongue bar should swing a long way while the jaw and lips/larynx bars change much less.',
        'Slide the tongue forward and back slowly.'] },
    { id: 'c-lips', type: 'iso', kind: 'lips', vowel: 'i', cue: 'Lips only', sub: 'lips (F3) · smile to rounded', title: 'Move only the lips',
      why: 'Rounding and pushing the lips forward lengthens the front of the tract, which lowers the lips/larynx reading (F3), and the tongue reading (F2) a little. Spreading into a smile raises them.',
      steps: ['Hold "ee" until the starting point is set.',
        'Keep the tongue exactly where it is, high and forward. Slowly round and push the lips forward, like the French "u" or German "ü".',
        'The lips/larynx bar should drop while the jaw bar holds steady. The tongue bar dips a little too; that is expected.',
        'Alternate slowly between a smile and rounded lips.'] },
    { id: 'c-larynx', type: 'iso', kind: 'larynx', vowel: 'i', cue: 'Larynx only', sub: 'all formants together', title: 'Move only the larynx',
      why: 'Raising the larynx shortens the whole tract, so all formants rise together; lowering it makes all of them fall. This is the main size control behind resonance.',
      steps: ['Hold a quiet "ee" until the starting point is set.',
        'Keep the jaw, lips and tongue still. Slowly raise the larynx (a small, light kitten voice, or the start of a swallow), then let it drop (the start of a yawn).',
        'All three bars (jaw, tongue, lips/larynx) should move the same way together, because the whole tube got shorter or longer.',
        'Pitch may rise with the larynx at first. That is normal, and the check ignores pitch here.'] },
    { id: 'c-pitch', type: 'iso', kind: 'pitch', vowel: 'a', cue: 'Pitch, not resonance', sub: 'trust check', title: 'Change pitch, keep resonance',
      why: 'Pitch and resonance are separate. Glide the pitch on one steady vowel: pitch should move while the mouth and throat readings stay put. This shows the resonance feedback is not just measuring pitch.',
      steps: ['Hold "ah" at a comfortable pitch until the starting point is set.',
        'Keep the mouth shape exactly the same and slide the pitch up a few notes and back down, like a slow siren.',
        'The pitch bar should move while the jaw, tongue and lips/larynx bars stay near the middle.'] },
  ];
  const ALL_DRILLS = [...DRILLS.vowels, ...DRILLS.sibilants, ...DRILLS.words];
  const NEED = { vowel: 50, sib: 24, wordVowel: 24, wordSib: 10, breathIn: 180, isoBase: 40, isoIn: 90 }; // frames at ~60 per second

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
    return { start: Date.now(), vowels: {}, sibs: { s: [], sh: [] }, all: [], pitch: [], breath: [], drills: [] };
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
    drawVowelChart(); drawPitch(); drawHistory(); renderTractLive();
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
  function playDemo(sweep) {
    ensureCtx();
    const v = DemoVoice.get();
    const x = sweep ? Synth.demo(ctx.sampleRate, D.VOWELS) : Synth.demoVoice(ctx.sampleRate, D.VOWELS, v);
    const ab = ctx.createBuffer(1, x.length, ctx.sampleRate);
    ab.copyToChannel(x, 0);
    playBuffer(ab, 'demo', sweep ? 'Demo voice: sibilant and vowels, moving from masculine to feminine resonance'
      : `Demo voice: s and four vowels at ${v.pitch} Hz, resonance ${v.res}, brightness ${v.bright}`);
  }

  // Demo voice settings, shared by the synthetic demo and the reading voice.
  const DEMO_PRESETS = { fem: { pitch: 205, res: 100, bright: 65 }, masc: { pitch: 115, res: 0, bright: 40 } };
  const DemoVoice = {
    KEY: 'voicetrainer.demovoice', v: null,
    get() {
      if (!this.v) {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) {}
        const type = saved && (saved.type === 'masc' || saved.type === 'fem') ? saved.type : state.goal;
        this.v = Object.assign({ type, rate: 0.95, reader: 'speech' }, DEMO_PRESETS[type], saved || {});
      }
      return this.v;
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.v)); } catch (e) {} },
    setType(t) { Object.assign(this.get(), { type: t }, DEMO_PRESETS[t]); this.save(); this.paint(); },
    paint() {
      const v = this.get();
      for (const t of ['fem', 'masc']) $('vd-' + t).setAttribute('aria-checked', String(v.type === t));
      $('vd-pitch').value = v.pitch; $('vd-pitch-out').textContent = v.pitch + ' Hz';
      $('vd-res').value = v.res; $('vd-res-out').textContent = v.res;
      $('vd-bright').value = v.bright; $('vd-bright-out').textContent = v.bright;
      $('vd-rate').value = v.rate; $('vd-rate-out').textContent = (+v.rate).toFixed(2) + '×';
      $('vd-reader').value = v.reader;
      $('reader-voice-wrap').hidden = v.reader === 'synth' || this.voiceCount < 2;
    },
    open() { this.paint(); Reader.fillVoices(); $('voice-dlg').showModal(); },
    init() {
      for (const t of ['fem', 'masc']) $('vd-' + t).addEventListener('click', () => this.setType(t));
      for (const k of ['pitch', 'res', 'bright', 'rate']) {
        $('vd-' + k).addEventListener('input', (e) => { this.get()[k] = +e.target.value; this.save(); this.paint(); });
      }
      $('btn-demo-set').addEventListener('click', () => this.open());
      $('reader-voice-set').addEventListener('click', () => this.open());
      $('vd-play').addEventListener('click', () => { Reader.stopListen(); playDemo(false); });
      $('vd-sweep').addEventListener('click', () => { Reader.stopListen(); playDemo(true); });
      $('reader-voice').addEventListener('change', (e) => { this.get().voice = e.target.value; this.save(); });
      $('vd-reader').addEventListener('change', (e) => { Reader.stopListen(); this.get().reader = e.target.value; this.save(); this.paint(); });
    },
  };
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
    const hadRun = !!state.running;
    if (take) { offerPlanFrom(take); take = null; }
    if (node) { try { node.onended = null; node.stop && node.stop(); } catch (e) {} try { node.disconnect(); } catch (e) {} node = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    state.running = null;
    $('btn-stop').hidden = true;
    setMicButton(false);
    setStatus('Not listening');
    if (hadRun) autoSave('stopped listening');
  }
  function setMicButton(on) {
    for (const b of [$('btn-mic'), $('reader-mic')]) {
      if (!b) continue;
      b.textContent = on ? 'Stop microphone' : 'Start microphone';
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('listening', on);
    }
  }
  function setStatus(text, live) {
    const s = $('src-status'); s.textContent = text; s.classList.toggle('on-air', !!live);
  }

  function ensureLoop() { if (!loopOn) { loopOn = true; lastT = 0; raf = requestAnimationFrame(loop); } }
  function loop(t) {
    if (!state.running && !exSrc && !Reader.synth) { loopOn = false; return; } // nothing to listen to
    raf = requestAnimationFrame(loop);
    if (t - lastT < 14) return; // cap at ~70 analyses per second
    lastT = t;
    analyser.getFloatTimeDomainData(buf);
    const fr = an.analyze(buf);
    onFrame(fr);
  }

  // ---------------- per-frame logic ----------------
  const AVG_MS = 1500; // averaging window for the resonance meter and the coach gauges
  let frameCount = 0, meterFrames = [], sibShown = 0, exampleEnd = -1e9, breathBuf = [], breathShown = -1e9;
  function onFrame(fr) {
    frameCount++;
    drawSpecColumn(fr, an.fsd);
    pitchBuf.push(fr.kind === 'voiced' ? fr.f0 : 0);
    if (pitchBuf.length > 360) pitchBuf.shift();
    // While a reference example plays (and briefly after), show it but don't score it as the user.
    const gated = !!exSrc || !!Reader.tts || !!Reader.synth || performance.now() - exampleEnd < 400;
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
          if (!gated || exSrc) {
            if (tractLive.v !== vowel) tractLive.hist = [];
            tractLive.hist = (tractLive.hist || []).concat([F]).slice(-90); // ~1.5 s
            tractLive.F = [0, 1, 2].map(i => D.median(tractLive.hist.map(f => f[i])));
            tractLive.v = vowel; tractLive.at = performance.now();
          }
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

    if (fr.breath != null) {
      breathBuf.push(fr.breath); if (breathBuf.length > 60) breathBuf.shift();
      breathShown = frameCount;
      const b = D.median(breathBuf);
      $('ro-breath').textContent = `${Math.round(b)} · ${breathWord(b)}`;
      if (!gated) {
        session.breath.push(Math.round(fr.breath));
        if (session.breath.length > 30000) session.breath.splice(0, 10000);
      }
      if (d && d.def.type === 'breath') d.breathFr.push(fr.breath);
    }
    if (d && d.def.type === 'iso' && fr.kind === 'voiced' && fr.formants) d.isoFr.push({ F: fr.formants, f0: fr.f0, n: frameCount });
    if (frameCount - breathShown > 120) { $('ro-breath').textContent = '--'; breathBuf.length = 0; }
    if (Reader.open) $('rh-breath').textContent = $('ro-breath').textContent;

    if (frameCount % 3 === 0) { drawVowelChart(); drawPitch(); renderMeter(); drawSpecAxis(); }
    if (!gated) coachFrame(fr);
    if (!gated) Reader.frame(fr);
    if (frameCount % 6 === 0) { renderCoach(); renderTractLive(); }
    if (d) updateDrill(d);
    if (frameCount % 30 === 0) renderSession();
  }

  function pushMeter(score) {
    // average over the last ~1.5 s so the needle moves calmly
    const now = performance.now();
    meterFrames.push({ t: now, s: score });
    while (meterFrames.length > 1 && now - meterFrames[0].t > AVG_MS) meterFrames.shift();
    state.meter = D.median(meterFrames.map(m => m.s));
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
    if (Reader.open) {
      $('rh-res').textContent = Number.isFinite(v) ? Math.round(v) : '--';
      $('rh-vowel').textContent = $('ro-vowel').textContent;
      $('rh-pitch').textContent = $('ro-pitch').textContent;
    }
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
    for (const t of ['vowels', 'sibilants', 'words', 'breath', 'control']) $('tab-' + t).setAttribute('aria-selected', String(state.tab === t));
  }
  function selectDrill(def, fromPlan) {
    if (!fromPlan && state.plan && state.plan.status === 'active' && planStep() && planStep().def.id !== def.id) {
      state.plan.status = 'paused'; renderPlan();
    }
    state.drill = { def, vowelFr: [], sibFr: [], breathFr: [], isoFr: [], inZone: 0, offTarget: null, result: null };
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
    if (d.def.type === 'breath') return renderBreathPanel(d);
    if (d.def.type === 'iso') return renderIsoPanel(d);
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
      <div id="coach" class="coach" aria-live="polite">
        <p class="eyebrow"><span>Live coach</span><span id="coach-trend"></span></p>
        <p class="coach-cue" id="coach-cue"></p>
        <p class="coach-why" id="coach-why"></p>
        <details class="how" id="coach-how" hidden><summary>How do I do that?</summary><div class="how-body"></div></details>
        <div class="gauges" id="coach-gauges"></div>
        <figure class="tract-coach" hidden><canvas id="cv-tract-coach" height="230"></canvas><ul class="tract-read" id="tract-read-coach"></ul>
          <figcaption class="tract-key"><span><i class="ln you"></i>your shape (estimated)</span><span><i class="ln goal"></i>goal shape</span><span><i class="ln arrow"></i>what to change</span></figcaption></figure>
      </div>
      <div id="drill-result"></div>
      <div><button type="button" class="btn" id="drill-again" hidden>Try this sound again</button></div>`;
    p.querySelector('.drill-title').textContent = d.def.title;
    p.querySelector('.drill-help').textContent = drillInstruction(d.def);
    $('drill-msg').textContent = state.running ? 'Listening...' : 'Start the microphone (or analyze a recording) to begin.';
    $('drill-again').addEventListener('click', () => selectDrill(d.def));
    $('ex-play').addEventListener('click', () => (exSrc && $('ex-play').textContent.startsWith('Stop') ? stopExample() : playExample(d.def, 'play')));
    $('ex-compare').addEventListener('click', () => (exSrc && $('ex-compare').textContent.startsWith('Stop') ? stopExample() : playExample(d.def, 'compare')));
    renderExampleNote();
    state.coach = { vf: [], vt: -1e9, sf: [], st: -1e9, hist: [], key: null, pendingKey: null, pendingAt: 0, shownAt: 0, eased: {}, trendAt: 0 };
    renderCoach();
  }

  // ---------------- live coach ----------------
  // Turns the last few frames into one concrete adjustment, plus a gauge per formant.
  const COACH_CUES = {
    fem: {
      '0:1': ['Open your jaw a little more and keep your throat light.', 'Your jaw is more closed (or your throat bigger) than this vowel needs (low F1). Opening the mouth and keeping the throat small fixes it.'],
      '0:-1': ['Close your jaw slightly.', 'Your mouth is more open than this vowel needs (high F1).'],
      '1:1': ['Slide your tongue forward, toward your top teeth, and spread your lips a little.', 'Your tongue sits further back than the goal for this vowel (low F2). A more forward tongue brightens the vowel.'],
      '1:-1': ['Let your tongue sit a little further back.', 'Your tongue is further forward than this vowel needs (high F2).'],
      '2:1': ['Pull your lips into a slight smile and keep your larynx up.', 'Your lips are more rounded or your larynx lower than the goal (low F3). Less rounding and a shorter throat fix it.'],
      '2:-1': ['Relax the smile slightly.', 'Your lips are more spread or your larynx higher than this vowel needs (high F3).'],
      'all:1': ['Make the whole space smaller: raise your larynx (like a light, high "hee" or the start of a swallow) and smile slightly.', 'Jaw, tongue and lips readings are all low by a similar amount: your throat is longer than the goal. That is a larynx change, not the tongue or lips alone.'],
      'all:-1': ['Ease off a little: let the larynx drop slightly.', 'Jaw, tongue and lips readings are all above the goal together: your throat is shorter than it needs to be.'],
    },
    masc: {
      '0:1': ['Open your jaw a little more.', 'Your mouth is more closed than this vowel needs (low F1).'],
      '0:-1': ['Open your throat: start a yawn with your mouth closed and speak through that space.', 'Your throat space is small for this vowel (high F1). A wider, lower throat fixes it.'],
      '1:1': ['Bring your tongue slightly forward.', 'Your tongue sits further back than this vowel needs (low F2).'],
      '1:-1': ['Let your tongue sit a little further back and relax any smile.', 'Your tongue is further forward than the goal (high F2). Moving it back darkens the vowel.'],
      '2:1': ['Relax the lip rounding slightly.', 'Your lips are more rounded or your larynx lower than this vowel needs (low F3).'],
      '2:-1': ['Round your lips slightly and let your larynx settle lower.', 'Your lips are spread or your larynx high compared with the goal (high F3). Rounded lips and a longer throat fix it.'],
      'all:1': ['Ease off a little: let the larynx rise slightly.', 'Jaw, tongue and lips readings are all below the goal together: your throat is longer than it needs to be.'],
      'all:-1': ['Make the whole space bigger: lower your larynx (the start of a yawn) and round your lips a little.', 'Jaw, tongue and lips readings are all high by a similar amount: your throat is shorter than the goal. That is a larynx change, not the tongue or lips alone.'],
    },
  };
  const SIB_CUES = {
    '1': ['Bring your tongue tip closer to your top teeth and smile slightly to raise the hiss.', 'A smaller space in front of the tongue makes a higher, brighter hiss.'],
    '-1': ['Pull your tongue tip back a little and round your lips to lower the hiss.', 'A bigger space in front of the tongue makes a lower, darker hiss.'],
  };
  const FORMANT_ROLE = [['Jaw', 'opening (F1)'], ['Tongue', 'front/back (F2)'], ['Lips, larynx', '(F3)']];
  // Step-by-step "how do I do that?" for each physical adjustment the coach can ask for.
  const HOWTO = {
    larynxUp: { title: 'Raising the larynx (a smaller, lighter throat)', steps: [
      'Find your larynx: put a finger lightly on your Adam\'s apple (the bump at the front of your neck). Everyone has one, even if it is small.',
      'Swallow once and feel it jump up. That upward movement is what you want, just much smaller and held.',
      'Now whisper a light, high "hee" or make a small "kitten mew". You should feel the bump rise a little and stay up.',
      'Keep it there while you say the vowel quietly. Your neck should not squeeze; if it feels tight or strained, let it down a little and try again more gently.',
      'Check the gauges: the tongue and lips/larynx markers should move right together when this works.'] },
    larynxDown: { title: 'Opening the throat (a lower larynx)', steps: [
      'An "open throat" just means more space between the back of your tongue and the back of your throat, with the larynx sitting lower.',
      'Start a yawn with your mouth closed and stop halfway. Notice the cool, wide feeling at the back of the mouth and the bump in your neck moving down. That is the open throat.',
      'Keep that feeling and speak the vowel through it, without actually yawning or opening the mouth wider.',
      'Another way: say "uh" like a sleepy, low "duh". The larynx drops and the throat widens on its own.',
      'Check the gauges: all three markers (jaw, tongue, lips/larynx) should move left a little.'] },
    throatLight: { title: 'Keeping the throat light', steps: [
      'Light means not opening up the back of the throat. Avoid the "yawn" feeling.',
      'Think of the sound sitting just behind your front teeth rather than deep in your chest or throat.',
      'A small smile and a raised larynx (see the swallow trick) both help keep the space small.'] },
    tongueForward: { title: 'Moving the tongue forward', steps: [
      'Rest the tip of your tongue against the back of your bottom front teeth.',
      'Let the middle of your tongue arch up and forward toward the ridge behind your top teeth, as if getting ready to say "ee" or "y".',
      'Hold the vowel and slide the tongue body a few millimetres further forward. Small moves count: watch the tongue marker move right.'] },
    tongueBack: { title: 'Moving the tongue back', steps: [
      'Let the tip of your tongue drop away from your teeth.',
      'Feel the back of the tongue settle toward your throat, as in "oo" or "aw".',
      'Hold the vowel and pull the tongue body back slightly. Watch the tongue marker move left.'] },
    smile: { title: 'Spreading the lips (a slight smile)', steps: [
      'Pull the corners of your mouth back a little, as if politely smiling. Keep the teeth visible but relaxed.',
      'Avoid pushing the lips forward or rounding them. Rounded lips make the tube longer and darker.'] },
    round: { title: 'Rounding the lips', steps: [
      'Push your lips slightly forward into a soft circle, as for "oo", without closing the mouth more.',
      'A little goes a long way: rounding lengthens the vocal tract, which shows on the tongue and lips/larynx gauges.'] },
    jawOpen: { title: 'Opening the jaw', steps: [
      'Let your bottom jaw drop by about a finger\'s width, keeping the tongue where it is.',
      'Keep the jaw loose, not pushed down. The jaw marker moves right as the mouth opens.'] },
    jawClose: { title: 'Closing the jaw slightly', steps: [
      'Bring your teeth a little closer together without clenching.',
      'Keep the tongue position the same. The jaw marker moves left as the mouth closes.'] },
  };
  const CUE_HOWTO = {
    fem: { '0:1': ['jawOpen', 'throatLight'], '0:-1': ['jawClose'], '1:1': ['tongueForward', 'smile'], '1:-1': ['tongueBack'], '2:1': ['smile', 'larynxUp'], '2:-1': ['smile'], 'all:1': ['larynxUp', 'smile'], 'all:-1': ['larynxDown'] },
    masc: { '0:1': ['jawOpen'], '0:-1': ['larynxDown'], '1:1': ['tongueForward'], '1:-1': ['tongueBack'], '2:1': ['round'], '2:-1': ['round', 'larynxDown'], 'all:1': ['larynxUp'], 'all:-1': ['larynxDown', 'round'] },
  };
  function renderHowto(key) {
    const box = $('coach-how');
    if (!box) return;
    const ids = (CUE_HOWTO[state.goal] || {})[key] || [];
    if (box.dataset.key === key + state.goal) return; // keep it open while the tip is the same
    box.dataset.key = key + state.goal;
    box.hidden = !ids.length;
    box.querySelector('.how-body').innerHTML = ids.map(id => {
      const h = HOWTO[id];
      return `<div class="how-item"><p class="how-title">${h.title}</p><ol>${h.steps.map(s => `<li>${s}</li>`).join('')}</ol></div>`;
    }).join('');
  }
  function coachFrame(fr) {
    const co = state.coach, d = state.drill;
    if (!co || !d) return;
    const now = performance.now();
    // keep about the last 1.5 s of frames; the gauges and tips use their median
    const keep = (arr, ts, v) => { arr.push(v); ts.push(now); while (ts.length > 1 && now - ts[0] > AVG_MS) { ts.shift(); arr.shift(); } };
    if (d.def.vowel && fr.kind === 'voiced' && fr.formants) { keep(co.vf, co.vft || (co.vft = []), fr.formants); co.vt = now; }
    if (d.def.sib && fr.kind === 'fricative') { keep(co.sf, co.sft || (co.sft = []), fr.cog); co.st = now; }
  }
  // what each gauge asks for in body terms: [to raise it, to lower it]
  const GAUGE_ACT = { jaw: ['open', 'close'], tongue: ['forward', 'back'], lips: ['smile', 'round'], larynx: ['larynx up', 'larynx down'], sib: ['brighter', 'darker'] };
  let gaugeKind = 'jaw';
  function gaugeRow(label, sub, pos, need, slack = 0, kind = 'sib') {
    gaugeKind = kind;
    const lo = D.COACH_BAND[state.goal][0] - slack, hi = D.COACH_BAND[state.goal][1] + slack;
    const x = (v) => clamp((v + 40) / 180 * 100, 0, 100);
    const mark = need ? (need === 1 ? '→ ' : '← ') + GAUGE_ACT[gaugeKind][need === 1 ? 0 : 1] : '✓';
    return `<div class="gauge"><span class="g-label">${label} <small>${sub}</small></span>
      <span class="g-track"><span class="g-band" style="left:${x(lo)}%;width:${x(hi) - x(lo)}%"></span><span class="g-mark ${need ? 'off' : 'ok'}" style="left:${x(pos)}%"></span></span>
      <span class="g-need ${need ? 'off' : 'ok'}">${mark}</span></div>`;
  }
  const COACH_HOLD_MS = 3500, COACH_MIN_SHOW_MS = 2500;

  // ---------------- vocal tract sketch ----------------
  // Side view (facing left) of one plausible tract shape for the measured formants, with the goal
  // shape for the same vowel dashed on top and an arrow for the change the coach is asking for.
  const TRACT_REC = {
    fem: { '0:1': 'Open the jaw a little', '0:-1': 'Close the jaw slightly', '1:1': 'Tongue forward', '1:-1': 'Tongue a little back',
      '2:1': 'Slight smile, larynx up', '2:-1': 'Relax the smile', 'all:1': 'Larynx up: a smaller throat', 'all:-1': 'Let the larynx drop slightly' },
    masc: { '0:1': 'Open the jaw a little', '0:-1': 'Open the throat (start of a yawn)', '1:1': 'Tongue slightly forward', '1:-1': 'Tongue back, relax the smile',
      '2:1': 'Relax the lip rounding', '2:-1': 'Round the lips, larynx lower', 'all:1': 'Let the larynx rise slightly', 'all:-1': 'Larynx down: a bigger throat' },
  };
  // The lower jaw (teeth, lower lip, chin, jawbone, and the front of the tongue resting on it)
  // rotates open around the jaw joint in front of the ear.
  const JAW_PIVOT = [190, 92];
  function jawRot(J) {
    const a = -J * 0.0085, c = Math.cos(a), sn = Math.sin(a), [cx, cy] = JAW_PIVOT;
    return ([x, y]) => [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c];
  }
  function tractGeom(t) {
    const J = 5 + 20 * clamp(1 - t.height, -0.2, 1.4);
    const Ly = 236 - 34 * clamp(t.larynx, -1, 2);
    const pro = 12 * Math.max(t.round, 0), spr = 7 * Math.max(-t.round, 0);
    const rot = jawRot(J);
    const palY = (x) => { const u = clamp((x - 78) / 100, 0, 1); return 102 - 46 * u + 26 * u * u + (x > 178 ? (x - 178) * 0.9 : 0); };
    const back = clamp(t.back, -0.2, 1.2);
    const px = 108 + 76 * back;
    const py = Math.max(palY(px) + 6, 98 + (1 - t.height) * 34 + J * 0.35);
    const tip = rot([84, 110]), floor = rot([104, 144]);
    const tongue = [tip, rot([100, 104]), [px, py], [182 + 20 * back, (py + Ly) / 2 - 6],
      [188 + 12 * back, Ly - 14], [150, Ly - 10], floor];
    // lower lip, chin and under the jaw rotate with the jaw; the neck stays put
    const lower = [[68, 107], [54 - pro + spr, 110 + spr * 0.2], [55 - pro * 0.6 + spr, 118], [62, 127], [60, 145], [72, 157], [112, 165]].map(rot);
    return {
      J, Ly, tongue, peak: [px, py],
      upLip: [52 - pro + spr, 101], loLip: lower[1], lipPro: pro, lipSpr: spr,
      upper: [[57, 88], [52 - pro + spr, 96], [53 - pro + spr, 102 - spr * 0.2], [68, 106]],
      lower: [...lower, [132, 282]],
      teeth: [[70, 111], [77, 111], [77, 121], [70, 121]].map(rot),
      larynx: [209, Ly + 10],
    };
  }
  function tractPath(g, pts, k, closed) {
    // Catmull-Rom through the points
    const P = (i) => pts[closed ? (i + pts.length) % pts.length : clamp(i, 0, pts.length - 1)];
    g.moveTo(...pts[0].map((v) => v * k));
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      g.bezierCurveTo((p1[0] + (p2[0] - p0[0]) / 6) * k, (p1[1] + (p2[1] - p0[1]) / 6) * k,
        (p2[0] - (p3[0] - p1[0]) / 6) * k, (p2[1] - (p3[1] - p1[1]) / 6) * k, p2[0] * k, p2[1] * k);
    }
  }
  function drawTractLayer(g, k, G, style) {
    g.save();
    g.strokeStyle = style.stroke; g.lineWidth = style.width; g.setLineDash(style.dash || []);
    // tongue
    g.beginPath(); tractPath(g, G.tongue, k, true); g.closePath();
    const fill = () => { if (style.fill) { g.save(); g.globalAlpha = 0.1; g.fillStyle = style.fill; g.fill(); g.restore(); } };
    fill();
    g.stroke();
    // lips, chin and jaw
    g.beginPath(); tractPath(g, G.upper, k, false); g.stroke();
    g.beginPath(); tractPath(g, G.lower, k, false); g.stroke();
    // lower teeth
    g.beginPath(); G.teeth.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k))); g.closePath(); g.stroke();
    // larynx: epiglottis, the box and the vocal folds
    const Ly = G.Ly;
    g.beginPath(); g.moveTo(194 * k, (Ly - 22) * k); g.quadraticCurveTo(192 * k, (Ly - 6) * k, 200 * k, Ly * k); g.stroke();
    g.beginPath(); g.roundRect ? g.roundRect(198 * k, Ly * k, 22 * k, 22 * k, 5 * k) : g.rect(198 * k, Ly * k, 22 * k, 22 * k);
    fill();
    g.stroke();
    g.beginPath(); g.moveTo(201 * k, (Ly + 10) * k); g.lineTo(217 * k, (Ly + 10) * k); g.stroke();
    g.restore();
  }
  function tractLabel(g, k, dpr, text, col) {
    g.font = `600 ${12 * dpr}px ${C.font}`; g.textAlign = 'center';
    const w = g.measureText(text).width + 14 * dpr, x = 150 * k, y = 268 * k;
    g.fillStyle = C.panel; g.fillRect(x - w / 2, y - 14 * dpr, w, 20 * dpr);
    g.fillStyle = col; g.fillText(text, x, y);
  }
  // Plain-language comparison of the two shapes, one row per part.
  function tractReadout(y, t, fromStart) {
    const vs = fromStart ? 'than at the start' : 'than the goal';
    const row = (part, d, eps, more, less) => ({ part, ok: Math.abs(d) <= eps, text: Math.abs(d) <= eps ? (fromStart ? 'unchanged' : 'about right') : `${d > 0 ? more : less} ${vs}` });
    return [
      row('Jaw', t.height - y.height, 0.06, 'more open', 'more closed'),
      row('Tongue', y.back - t.back, 0.05, 'further back', 'further forward'),
      row('Lips', y.round - t.round, 0.07, 'more rounded', 'more spread'),
      row('Larynx', y.larynx - t.larynx, fromStart ? 0.15 : 0.25, 'higher (shorter throat)', 'lower (longer throat)'),
    ];
  }
  function renderTractRead(el, rows) {
    if (!el) return;
    if (!rows) { el.innerHTML = ''; return; }
    el.innerHTML = rows.map(r => `<li class="${r.ok ? 'ok' : 'off'}"><b>${r.part}</b> ${r.text}</li>`).join('');
  }
  function drawTract(cv, F, v, key, refF) {
    let readout = null;
    if (!cv || !C.ink) return readout;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf();
    g.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min(cv.width / 300, cv.height / 282);
    g.save();
    g.translate((cv.width - 300 * k) / 2 + 8 * k, 0);
    // fixed parts: face profile, back of the head and neck, palate and velum, upper teeth, back of the throat
    g.strokeStyle = C.muted; g.lineWidth = 1.2 * dpr; g.setLineDash([]);
    g.beginPath(); tractPath(g, [[74, 0], [68, 30], [62, 46], [50, 60], [38, 72], [48, 82], [57, 88]], k, false); g.stroke();
    g.beginPath(); tractPath(g, [[150, 0], [250, 10], [284, 70], [274, 140], [262, 190], [258, 282]], k, false); g.stroke();
    g.beginPath(); g.moveTo(78 * k, 102 * k); g.quadraticCurveTo(122 * k, 64 * k, 176 * k, 82 * k); g.quadraticCurveTo(200 * k, 88 * k, 204 * k, 112 * k); g.stroke();
    g.strokeRect(70 * k, 98 * k, 7 * k, 11 * k);
    g.beginPath(); g.moveTo(224 * k, 70 * k); g.lineTo(224 * k, 282 * k); g.stroke();
    g.beginPath(); g.moveTo(176 * k, 82 * k); g.quadraticCurveTo(200 * k, 60 * k, 224 * k, 70 * k); g.stroke(); // nasal passage
    g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'left';
    g.fillText('palate', 108 * k, 68 * k); g.fillText('throat', 230 * k, 120 * k); g.fillText('lips', 18 * k, 106 * k);
    const goalCol = state.goal === 'fem' ? C.fem : C.masc;
    if (!F || !v) {
      g.fillStyle = C.muted; g.font = `${12 * dpr}px ${C.font}`; g.textAlign = 'center';
      g.fillText('Hold a vowel to see a sketch', 150 * k, 270 * k);
      g.restore(); return readout;
    }
    // dashed: the goal shape, or (in control exercises) the shape you started from
    const goalF = refF || (state.goal === 'fem' ? v.W : v.M);
    const sy = D.tractShape(F, v, state.goal), st = D.tractShape(goalF, v, state.goal);
    // differences are drawn twice as large (larynx 1.5x) so small changes are visible
    const amp = (key2, m) => st[key2] + m * (sy[key2] - st[key2]);
    const shown = { height: amp('height', 2), back: amp('back', 2), round: amp('round', 2), larynx: amp('larynx', 1.5) };
    const you = tractGeom(shown), tgt = tractGeom(st);
    readout = tractReadout(sy, st, !!refF);
    drawTractLayer(g, k, you, { stroke: C.ink, width: 1.8 * dpr, fill: C.ink });
    drawTractLayer(g, k, tgt, { stroke: refF ? C.muted : goalCol, width: 2 * dpr, dash: [5 * dpr, 4 * dpr] });
    g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`;
    g.fillText('tongue', (you.peak[0] - 14) * k, (you.peak[1] + 22) * k);
    g.fillText('larynx', 228 * k, (you.Ly + 14) * k);
    // the recommended change
    if (refF) { /* no recommendation in control exercises */ } else if (key && key !== 'ok' && key !== 'idle' && !key.startsWith('sib')) {
      const [f, dir] = key.split(':'), d = +dir;
      const anchor = (G) => (f === '0' ? G.loLip : f === '1' ? G.peak : f === '2' ? G.upLip : G.larynx);
      let [x1, y1] = anchor(you), [x2, y2] = anchor(tgt);
      if (Math.hypot(x2 - x1, y2 - y1) < 8) {
        // too small to see: draw the direction instead
        const dv = f === '0' ? [0, 1] : f === '1' ? [-1, 0] : f === '2' ? [1, 0] : [0, -1];
        x2 = x1 + dv[0] * d * 16; y2 = y1 + dv[1] * d * 16;
      }
      g.strokeStyle = C.warn; g.fillStyle = C.warn; g.lineWidth = 2.4 * dpr; g.setLineDash([]);
      const ax = x1 * k, ay = y1 * k, bx = x2 * k, by = y2 * k, a = Math.atan2(by - ay, bx - ax), hl = 8 * dpr;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - hl * Math.cos(a - 0.45), by - hl * Math.sin(a - 0.45)); g.lineTo(bx - hl * Math.cos(a + 0.45), by - hl * Math.sin(a + 0.45)); g.closePath(); g.fill();
      tractLabel(g, k, dpr, TRACT_REC[state.goal][key] || '', C.ink);
    } else if (key === 'ok') tractLabel(g, k, dpr, 'Close to the goal shape', C.good);
    g.restore();
    return readout;
  }
  // live sketch outside drills: steadied the same way as the coach's tips
  const tractLive = { F: null, v: null, at: -1e9, key: null, shownAt: 0, pending: null, pendingAt: 0 };
  function renderTractLive() {
    const t = tractLive, now = performance.now();
    const fresh = t.F && now - t.at < COACH_HOLD_MS;
    let key = 'idle';
    if (fresh) { const c = D.coachVowel(t.F, t.v, state.goal); key = c.focus ? `${c.focus.formant}:${c.focus.dir}` : 'ok'; }
    if (key !== t.pending) { t.pending = key; t.pendingAt = now; }
    if (key !== t.key && (t.key === null || key === 'idle' || (now - t.pendingAt >= (key === 'ok' ? 600 : 1000) && now - t.shownAt >= (key === 'ok' ? 600 : COACH_MIN_SHOW_MS)))) { t.key = key; t.shownAt = now; }
    renderTractRead($('tract-read'), drawTract($('cv-tract'), fresh ? t.F : null, fresh ? t.v : null, t.key));
    const cap = $('tract-vowel'); if (cap) cap.textContent = fresh ? `vowel "${t.v.cue}" as in ${t.v.word}` : '';
  }
  // smooth a gauge position so the marker glides instead of jumping
  function ease(co, k, v) {
    const p = co.eased[k];
    return (co.eased[k] = p == null || !isFinite(p) ? v : p + 0.2 * (v - p));
  }
  function renderCoach() {
    const co = state.coach, d = state.drill, cueEl = $('coach-cue');
    if (!co || !d || !cueEl) return;
    const now = performance.now(), def = d.def;
    // keep the last reading on screen for a few seconds after the sound stops
    const vRecent = def.vowel && co.vf.length && now - co.vt < COACH_HOLD_MS;
    const sRecent = def.sib && co.sf.length && now - co.st < COACH_HOLD_MS;
    let key = 'idle', cue, why = '', dist = null, rows = '';
    if (vRecent) {
      const v = D.VOWEL_BY_KEY[def.vowel];
      const F = [0, 1, 2].map(i => D.median(co.vf.map(f => f[i])));
      const c = D.coachVowel(F, v, state.goal);
      // when all three are off together the fix is the larynx, so say that on each gauge it explains
      const allDir = c.focus && c.focus.formant === 'all' ? c.focus.dir : 0;
      rows += c.pos.map((p, i) => gaugeRow(FORMANT_ROLE[i][0], FORMANT_ROLE[i][1], ease(co, 'f' + i, p), c.need[i], i === 0 ? 20 : 0,
        allDir && c.need[i] === allDir ? 'larynx' : ['jaw', 'tongue', 'lips'][i])).join('');
      dist = c.distance;
      key = c.focus ? `${c.focus.formant}:${c.focus.dir}` : 'ok';
    }
    if (sRecent) {
      const cog = D.median(co.sf), c = D.coachSibilant(cog, D.SIBILANTS[def.sib], state.goal);
      rows += gaugeRow(def.sib === 's' ? '/s/' : '/ʃ/', `hiss ${(cog / 1000).toFixed(1)} kHz`, ease(co, 'sib', c.pos), c.dir);
      if (!vRecent || co.st > co.vt) { key = c.onTarget ? 'ok' : 'sib:' + c.dir; dist = c.distance; }
    }
    // switch the tip only when the new one has held steadily, and leave each tip up long
    // enough to read and try; reaching the target is shown sooner than leaving it
    if (key !== co.pendingKey) { co.pendingKey = key; co.pendingAt = now; }
    if (key !== co.key) {
      const steady = now - co.pendingAt, shown = now - co.shownAt;
      const need = co.key === null ? 0 : key === 'ok' ? 600 : co.key === 'ok' ? 1500 : 1000;
      if (co.key === null || key === 'idle' || (steady >= need && shown >= (key === 'ok' ? 600 : COACH_MIN_SHOW_MS))) { co.key = key; co.shownAt = now; }
    }
    const k = co.key;
    if (k === 'idle' || k === null) {
      cue = state.running ? `Hold ${def.type === 'sib' ? 'the hiss' : def.type === 'word' ? 'the word' : 'the vowel'} and you will get a live tip here.` : 'Start the microphone to get live tips while you practise.';
    } else if (k === 'ok') {
      cue = 'On target. Hold this shape and notice how it feels.';
    } else if (k.startsWith('sib:')) {
      [cue, why] = SIB_CUES[k.slice(4)];
    } else {
      [cue, why] = COACH_CUES[state.goal][k] || ['', ''];
    }
    cueEl.textContent = cue;
    cueEl.classList.toggle('ok', k === 'ok');
    $('coach-why').textContent = why;
    renderHowto(k);
    $('coach-gauges').innerHTML = rows;
    const ct = $('cv-tract-coach');
    if (ct) {
      ct.parentElement.hidden = !def.vowel;
      if (def.vowel) renderTractRead($('tract-read-coach'), drawTract(ct, vRecent ? [0, 1, 2].map(i => D.median(co.vf.map(f => f[i]))) : null, D.VOWEL_BY_KEY[def.vowel], k));
    }
    // closer / further, compared with about half a second ago
    const tr = $('coach-trend');
    if (dist != null) {
      co.hist.push([now, dist]);
      while (co.hist.length && now - co.hist[0][0] > 2000) co.hist.shift();
      const past = co.hist.find(h => now - h[0] <= 700);
      const delta = past ? dist - past[1] : 0;
      if (now - co.trendAt < 700 && tr.textContent) return;
      co.trendAt = now;
      tr.textContent = dist === 0 ? 'in the target zone' : delta < -3 ? 'getting closer' : delta > 3 ? 'moving away' : `${Math.round(dist)} point${Math.round(dist) === 1 ? '' : 's'} away`;
      tr.className = dist === 0 || delta < -3 ? 'trend good' : delta > 3 ? 'trend warn' : 'trend';
    } else { tr.textContent = ''; tr.className = 'trend'; }
  }
  function renderExampleNote() {
    const n = $('ex-note'), d = state.drill; if (!n || !d) return;
    const fem = state.goal === 'fem', def = d.def;
    const parts = [];
    if (def.vowel) { const v = D.VOWEL_BY_KEY[def.vowel], F = fem ? v.W : v.M; parts.push(`jaw (F1) ${F[0]}, tongue (F2) ${F[1]}, lips/larynx (F3) ${F[2]} Hz`); }
    if (def.sib) parts.push(`/${def.sib === 's' ? 's' : 'ʃ'}/ centred near ${((fem ? D.SIBILANTS[def.sib].W : D.SIBILANTS[def.sib].M) / 1000).toFixed(1)} kHz`);
    n.textContent = `Synthesized at typical ${fem ? 'feminine' : 'masculine'} values (${parts.join('; ')}; pitch ${fem ? 'about 200' : 'about 110'} Hz). It shows on the charts while it plays and doesn't count toward your scores. The comparison plays the masculine version first, then the feminine one.`;
  }
  function updateDrill(d) {
    const def = d.def;
    if (def.type === 'breath') return updateBreath(d);
    if (def.type === 'iso') return updateIso(d);
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

  // ---------------- breath exercises ----------------
  function breathWord(b) { return b < 15 ? 'firm' : b < 35 ? 'clear' : b < 55 ? 'light, airy' : b < 75 ? 'breathy' : 'mostly air'; }
  const breathBand = () => D.BREATH_BAND[state.goal];
  function renderBreathPanel(d) {
    const p = $('drill-panel'), def = d.def, [lo, hi] = breathBand();
    p.innerHTML = `
      <p class="eyebrow"><span>Breath exercise</span><span>${def.aim === 'explore' ? 'free practice' : 'hold in the zone'}</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <ol class="breath-steps"></ol>
      <div class="coach" aria-live="polite">
        <p class="eyebrow"><span>Breathiness</span><span id="br-num" class="trend"></span></p>
        <p class="coach-cue" id="br-cue"></p>
        <div class="gauge breath-gauge">
          <span class="g-label">clear <small>to airy</small></span>
          <span class="g-track"><span class="g-band" style="left:${lo}%;width:${hi - lo}%"></span><span class="g-mark" id="br-mark" hidden></span></span>
          <span class="g-need" id="br-need"></span>
        </div>
        <p class="coach-why">Zone ${lo}-${hi} for a ${state.goal === 'fem' ? 'feminine' : 'masculine'} goal: clear tone with ${state.goal === 'fem' ? 'a little' : 'little or no'} audible air. The number is an estimate from how clear the harmonics are; room noise and the mic shift it, so compare within one setup.</p>
      </div>
      ${def.aim === 'band' ? '<div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>' : ''}
      <p class="drill-msg" id="drill-msg"></p>
      <div><button type="button" class="btn" id="drill-again" hidden>Do this exercise again</button></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    p.querySelector('.drill-help').textContent = def.why;
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps(state.goal === 'fem')) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('drill-again').addEventListener('click', () => selectDrill(def));
    $('drill-msg').textContent = state.running ? 'Listening...' : 'Start the microphone to see your breathiness live.';
    d.cue = { key: null, at: 0, pending: null, pendingAt: 0, eased: {} };
    updateBreath(d, true);
  }
  const BREATH_CUES = {
    idle: 'Make a sustained, voiced sound and the gauge will show how breathy it is.',
    ok: 'In the zone. Keep it easy and notice how it feels.',
    high: 'Airier than the zone. Use a little less air and let more tone through, without pushing.',
    low: 'Clearer and firmer than the zone. Ease off the effort and let a little air flow with the tone.',
  };
  function updateBreath(d, force) {
    if (!force && frameCount % 6) return;
    const def = d.def, [lo, hi] = breathBand(), now = performance.now();
    const recent = d.breathFr.slice(-90);
    const fresh = recent.length >= 5 && frameCount - breathShown < 90;
    const b = fresh ? D.median(recent) : NaN;
    const key = !fresh ? 'idle' : b > hi ? 'high' : b < lo ? 'low' : 'ok';
    // the same steadiness rules as the live coach: no flicker between tips
    const c = d.cue || (d.cue = { key: null, at: 0, pending: null, pendingAt: 0, eased: {} });
    if (key !== c.pending) { c.pending = key; c.pendingAt = now; }
    if (key !== c.key && (c.key === null || (key === 'idle' && now - c.pendingAt > COACH_HOLD_MS - 1200) ||
      (key !== 'idle' && now - c.pendingAt >= (key === 'ok' ? 600 : 1000) && now - c.at >= (key === 'ok' ? 600 : COACH_MIN_SHOW_MS)))) { c.key = key; c.at = now; }
    const cue = $('br-cue'); if (!cue) return;
    cue.textContent = c.key === 'idle' && !state.running ? 'Start the microphone to see your breathiness live.' : BREATH_CUES[c.key || 'idle'];
    cue.classList.toggle('ok', c.key === 'ok');
    const mark = $('br-mark');
    if (fresh) {
      const x = ease(c, 'b', b);
      mark.hidden = false; mark.style.left = clamp(x, 0, 100) + '%';
      mark.classList.toggle('ok', key === 'ok');
      $('br-num').textContent = `${Math.round(b)} · ${breathWord(b)}`;
      $('br-need').textContent = key === 'ok' ? '✓' : key === 'high' ? '← clearer' : 'airier →';
      $('br-need').className = 'g-need ' + (key === 'ok' ? 'ok' : 'off');
    } else if (c.eased.b == null) { mark.hidden = true; $('br-need').textContent = ''; }
    if (def.aim !== 'band' || d.result) return;
    if (fresh && key === 'ok') d.inZone += 6;
    const prog = d.inZone / NEED.breathIn;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    $('drill-msg').textContent = prog > 0 ? `In the zone for ${(d.inZone / 60).toFixed(1)} of ${(NEED.breathIn / 60).toFixed(1)} seconds.` : state.running ? 'Listening...' : '';
    if (prog >= 1) finishBreath(d);
  }
  function finishBreath(d) {
    const def = d.def, score = D.median(d.breathFr);
    d.result = { id: def.id, score, at: Date.now() };
    state.lastScores[def.id] = score;
    session.drills.push({ id: def.id, label: def.cue, score: Math.round(score), at: d.result.at, kind: 'breath' });
    renderDrillGrid(); renderSession();
    $('drill-msg').textContent = `Done: three seconds in the zone. Your median breathiness was ${Math.round(score)} (${breathWord(score)}). Do it again, or try another exercise.`;
    $('drill-again').hidden = false;
    autoSave('drill finished');
  }

  // ---------------- control exercises ----------------
  const ISO_ROWS = [['Jaw', 'opening (F1)'], ['Tongue', 'front/back (F2)'], ['Lips, larynx', '(F3)'], ['Pitch', 'semitones']];
  const ISO_MAIN = { jaw: [0], tongue: [1], lips: [2], larynx: [0, 1, 2], pitch: [3] };
  function renderIsoPanel(d) {
    const p = $('drill-panel'), def = d.def, main = ISO_MAIN[def.kind];
    p.innerHTML = `
      <p class="eyebrow"><span>Control exercise</span><span>${def.sub}</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <ol class="breath-steps"></ol>
      <div class="coach" aria-live="polite">
        <p class="eyebrow"><span>Change from your starting point</span><span id="iso-state" class="trend"></span></p>
        <p class="coach-cue" id="iso-cue"></p>
        <div class="gauges">${ISO_ROWS.map(([l, sub], i) => `<div class="gauge iso-row${main.includes(i) ? ' main' : ''}">
          <span class="g-label">${l} <small>${sub}</small></span>
          <span class="g-track iso-track"><span class="iso-zero"></span><span class="g-mark" id="iso-m${i}" hidden></span></span>
          <span class="g-need" id="iso-v${i}"></span></div>`).join('')}</div>
        <figure class="tract-coach"><canvas id="cv-tract-iso" height="230"></canvas><ul class="tract-read" id="tract-read-iso"></ul>
          <figcaption class="tract-key"><span><i class="ln you"></i>your shape now (estimated)</span><span><i class="ln start"></i>where you started</span></figcaption></figure>
      </div>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div class="btn-row"><button type="button" class="btn" id="iso-reset">Set a new starting point</button><button type="button" class="btn" id="drill-again" hidden>Do this exercise again</button></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    p.querySelector('.drill-help').textContent = def.why;
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('drill-again').addEventListener('click', () => selectDrill(def));
    $('iso-reset').addEventListener('click', () => { d.base = null; d.isoFr = []; d.inZone = 0; d.best = 0; d.eased = {}; updateIso(d, true); });
    d.base = null; d.best = 0; d.eased = {};
    updateIso(d, true);
  }
  function updateIso(d, force) {
    if (!force && frameCount % 6) return;
    const def = d.def, cue = $('iso-cue'); if (!cue) return;
    const fr = d.isoFr;
    if (!d.base) {
      // the starting point: the median of the first steady stretch of voice
      if (fr.length >= NEED.isoBase) {
        const first = fr.slice(0, NEED.isoBase);
        d.base = { F: [0, 1, 2].map(i => D.median(first.map(f => f.F[i]))), f0: D.median(first.map(f => f.f0)) };
      } else {
        cue.textContent = state.running ? `Hold the starting sound steadily (${Math.round(fr.length / NEED.isoBase * 100)}%).` : 'Start the microphone, then hold the starting sound.';
        $('iso-state').textContent = '';
        drawTract($('cv-tract-iso'), null, D.VOWEL_BY_KEY[def.vowel], null);
        return;
      }
    }
    const recent = fr.filter(f => frameCount - f.n < 30); // about the last half second
    const fresh = recent.length >= 6;
    $('iso-state').textContent = 'starting point set';
    if (!fresh) {
      cue.textContent = 'Starting point set. Now make the movement slowly, keeping the sound going.';
      return;
    }
    const F = [0, 1, 2].map(i => D.median(recent.map(f => f.F[i]))), f0 = D.median(recent.map(f => f.f0));
    const r = D.isolation(def.kind, d.base.F, F, d.base.f0, f0);
    const vals = [...r.dev.map(x => x * 100), r.semis];
    vals.forEach((v, i) => {
      const scale = i === 3 ? 8 : 30; // full track = +-30% or +-8 semitones
      const x = ease(d, 'i' + i, v);
      const m = $('iso-m' + i); m.hidden = false; m.style.left = clamp(50 + x / scale * 50, 0, 100) + '%';
      m.classList.toggle('ok', ISO_MAIN[def.kind].includes(i) && r.moved);
      $('iso-v' + i).textContent = i === 3 ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : `${v >= 0 ? '+' : ''}${Math.round(v)}%`;
    });
    renderTractRead($('tract-read-iso'), drawTract($('cv-tract-iso'), F, D.VOWEL_BY_KEY[def.vowel], null, d.base.F));
    const main = ISO_MAIN[def.kind];
    if (main[0] < 3) d.best = Math.max(d.best, ...main.map(i => Math.abs(r.dev[i])));
    else d.best = Math.max(d.best, Math.abs(r.semis));
    if (r.ok) cue.textContent = def.kind === 'pitch' ? 'Pitch moved and the formants held still. That is the separation you want.' : 'Isolated: the right formant is moving on its own.';
    else if (r.moved) {
      const a = r.dev.map(Math.abs), names = ['The jaw (F1)', 'The tongue (F2)', 'The lips or larynx (F3)'];
      const extra = def.kind === 'pitch' ? names[a.indexOf(Math.max(...a))]
        : def.kind === 'larynx' ? null : names[[0, 1, 2].filter(i => !main.includes(i)).sort((x, y) => a[y] - a[x])[0]];
      cue.textContent = def.kind === 'larynx' ? 'Only some formants moved. Keep the mouth still and let the whole throat do the work.'
        : `${extra} moved too. Keep it still and move more slowly.`;
    } else cue.textContent = 'Starting point set. Now make the movement slowly, keeping the sound going.';
    if (d.result) return;
    if (r.ok) d.inZone += 6;
    const prog = d.inZone / NEED.isoIn;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    $('drill-msg').textContent = prog > 0 ? `Isolated for ${(d.inZone / 60).toFixed(1)} of ${(NEED.isoIn / 60).toFixed(1)} seconds.` : '';
    if (prog >= 1) finishIso(d);
  }
  function finishIso(d) {
    const def = d.def, pct = def.kind === 'pitch' ? null : Math.round(d.best * 100);
    d.result = { id: def.id, at: Date.now() };
    state.lastScores[def.id] = def.kind === 'pitch' ? d.best : pct;
    session.drills.push({ id: def.id, label: def.cue, score: def.kind === 'pitch' ? Math.round(d.best) : pct, at: d.result.at, kind: 'control' });
    renderDrillGrid(); renderSession();
    $('drill-msg').textContent = def.kind === 'pitch'
      ? `Done. Your pitch moved by up to ${d.best.toFixed(1)} semitones while the formants held still: the resonance reading follows your mouth and throat, not your pitch.`
      : def.kind === 'larynx' ? `Done. The jaw, tongue and lips readings all moved together, by up to ${pct}%: the feedback is tracking your larynx.`
        : `Done. The ${def.kind} reading (${['F1', 'F2', 'F3'][ISO_MAIN[def.kind][0]]}) moved by up to ${pct}% while the others held steadier: the feedback is tracking your ${def.kind}.`;
    $('drill-again').hidden = false;
    autoSave('drill finished');
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
    autoSave('drill finished');
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
    autoSave('exercise finished');
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
      'Jaw and throat (F1 low): let the jaw drop a touch and keep the larynx high (think of a small, light "hmm" before the vowel). A smaller throat space helps.',
      'Tongue (F2 low): bring the tongue body forward and spread the lips slightly, as in a gentle smile. Small forward shifts of the tongue count.',
      'Lips and larynx (F3 low): avoid rounding or pushing the lips forward, and keep the larynx raised for a shorter throat.',
    ] : [
      'Throat and jaw (F1 high): add space in the throat (the start of a yawn) and keep the jaw relaxed, without opening the mouth wider.',
      'Tongue (F2 high): let the tongue sit slightly further back and relax the lip spreading. Very light lip rounding helps.',
      'Lips and larynx (F3 high): let the larynx settle lower and round the lips slightly for a longer throat.',
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
        ${[0, 1, 2].map(i => `<tr><td>${['Jaw', 'Tongue', 'Lips, larynx'][i]} <small>F${i + 1}</small></td><td>${Math.round(res.F[i])}</td><td>${v.M[i]}</td><td>${v.W[i]}</td><td>${Math.round(res.per[i])}</td></tr>`).join('')}
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
      breath: s.breath && s.breath.length >= 30 ? D.median(s.breath) : NaN,
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
      ['Median breathiness', Number.isFinite(st.breath) ? `${Math.round(st.breath)} (${breathWord(st.breath)})` : '--'],
      ['Drills completed', session.drills.length],
    ];
    sum.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('btn-save').disabled = !(Number.isFinite(st.resonance) || session.drills.length || Object.keys(st.sib).length);
    $('btn-save').textContent = autoOn() ? 'Save and start new session' : 'Save to progress';
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
          this.items = snap.docs.filter(s => !s.id.startsWith('_')).map(s => Object.assign({ id: s.id }, s.data()));
          return;
        } catch (e) { this.col = null; this.kind = 'local'; }
      }
      try { this.items = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { this.items = []; }
    },
    async save(rec) {
      // upsert: auto-save rewrites the same session record as it grows
      const next = this.items.filter(r => r.id !== rec.id).concat([rec]);
      if (this.col) await this.col.doc(rec.id).set(rec);
      else localStorage.setItem(LS_KEY, JSON.stringify(next));
      this.items = next;
    },
    async remove(id) {
      if (this.col) await this.col.doc(id).delete();
      else localStorage.setItem(LS_KEY, JSON.stringify(this.items.filter(r => r.id !== id)));
      this.items = this.items.filter(r => r.id !== id);
    },
  };

  const hasData = () => { const st = sessionStats(); return Number.isFinite(st.resonance) || session.drills.length > 0 || Object.keys(st.sib).length > 0; };
  function sessionRecord() {
    const st = sessionStats();
    const round = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
    if (!session.id) session.id = 's' + session.start.toString(36) + Math.random().toString(36).slice(2, 6);
    return {
      id: session.id,
      at: new Date(session.start).toISOString(),
      goal: state.goal,
      resonance: round(st.resonance),
      vowels: Object.fromEntries(Object.entries(st.vowels).map(([k, v]) => [k, round(v.score)])),
      sibS: st.sib.s ? round(st.sib.s.score) : null,
      sibSh: st.sib.sh ? round(st.sib.sh.score) : null,
      pitchMedian: st.pitch ? Math.round(st.pitch.median) : null,
      pitchP10: st.pitch ? Math.round(st.pitch.p10) : null,
      pitchP90: st.pitch ? Math.round(st.pitch.p90) : null,
      breath: round(st.breath),
      drills: session.drills.slice(-60),
      exercises: (session.exercises || []).slice(-10),
    };
  }
  // ---- auto-save: keeps this session's record up to date at natural checkpoints ----
  let autoBusy = false, autoAgain = false;
  const autoOn = () => $('auto-save').checked;
  async function autoSave(why) {
    if (!autoOn() || session.noAuto || !hasData()) return;
    if (autoBusy) { autoAgain = true; return; }
    autoBusy = true;
    try {
      await Store.save(sessionRecord());
      const t = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      $('save-status').textContent = `Auto-saved at ${t}${why ? ' (' + why + ')' : ''}.`;
      renderHistory();
    } catch (e) {
      $('save-status').textContent = e && e.code === 'quota_exceeded' ? 'Auto-save failed: progress storage is full. Delete a few old sessions.' : 'Auto-save failed. It will try again at the next checkpoint.';
    } finally {
      autoBusy = false;
      if (autoAgain) { autoAgain = false; autoSave(why); }
    }
  }
  async function saveSession() {
    const rec = sessionRecord();
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
        r.pitchMedian != null ? r.pitchMedian + ' Hz' : '--', r.breath != null ? Math.round(r.breath) : '--', lowTxt];
      cells.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (i >= 2 && i <= 5) td.className = 'num'; tr.appendChild(td); });
      const td = document.createElement('td');
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (del.dataset.confirm) {
          await Store.remove(r.id);
          if (r.id === session.id) { session.noAuto = true; $('save-status').textContent = 'Deleted. Auto-save will start again with your next session.'; }
          renderHistory();
        }
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
    document.body.classList.toggle('goal-masc', goal === 'masc');
    const [lo, hi] = pitchBand();
    $('pitch-band-label').textContent = `target band ${lo} to ${hi} Hz`;
    try { localStorage.setItem('voicetrainer.goal', goal); } catch (e) {}
    try { if (!localStorage.getItem(DemoVoice.KEY)) DemoVoice.v = null; } catch (e) {}
    renderMeter(); drawPitch(); drawHistory(); renderSpecGoalHelp(); renderExampleNote(); if (state.coach) { state.coach.key = null; renderCoach(); } if (C.ink) drawSpecAxis();
    if (state.drill && state.drill.result) renderDrillResult(state.drill.result);
  }
  function renderSpecGoalHelp() {
    const fem = state.goal === 'fem';
    $('spec-help-goal').innerHTML = `<b>The small triangles on the left edge are your goal.</b> While you hold a vowel they mark where the jaw, tongue and lips/larynx resonances (F1, F2, F3) sit for a typical ${fem ? 'feminine' : 'masculine'} voice on that vowel. Try to bring each dash level with its triangle. ${fem ? 'Moving the tongue forward, spreading the lips and raising the larynx lifts the upper two dashes and brightens the voice.' : 'More throat space, slight lip rounding and a lower larynx bring the upper two dashes down and darken the voice.'}`;
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
        const i = near.i, name = ['Jaw resonance (F1)', 'Tongue resonance (F2)', 'Lips and larynx resonance (F3)'][i];
        const what = ['It rises as the jaw opens and the throat gets smaller.', 'It rises as the tongue moves forward and falls as it moves back.', 'It rises with a smile or a higher larynx and falls with rounded lips or a lower larynx.'][i];
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

  // ---------------- reading practice ----------------
  // Built-in texts: the Rainbow Passage (Fairbanks, 1960) and the Grandfather Passage (Van Riper,
  // 1963), both widely treated as public domain, plus original or traditional texts.
  const BUILTIN_TEXTS = [
    { id: 'b-rainbow', title: 'The Rainbow Passage', body: 'When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon. There is, according to legend, a boiling pot of gold at one end. People look, but no one ever finds it. When a man looks for something beyond his reach, his friends say he is looking for the pot of gold at the end of the rainbow.\n\nThroughout the centuries people have explained the rainbow in various ways. Some have accepted it as a miracle without physical explanation. To the Hebrews it was a token that there would be no more universal floods. The Greeks used to imagine that it was a sign from the gods to foretell war or heavy rain. The Norsemen considered the rainbow as a bridge over which the gods passed from earth to their home in the sky. Others have tried to explain the phenomenon physically. Aristotle thought that the rainbow was caused by reflection of the sun\'s rays by the rain. Since then physicists have found that it is not reflection, but refraction by the raindrops which causes the rainbows.' },
    { id: 'b-grandfather', title: 'The Grandfather Passage', body: 'You wish to know all about my grandfather. Well, he is nearly ninety-three years old. He dresses himself in an ancient black frock coat, usually minus several buttons; yet he still thinks as swiftly as ever. A long, flowing beard clings to his chin, giving those who observe him a pronounced feeling of the utmost respect. When he speaks, his voice is just a bit cracked and quivers a trifle. Twice each day he plays skillfully and with zest upon our small organ. Except in the winter when the ooze or snow or ice prevents, he slowly takes a short walk in the open air each day. We have often urged him to walk more and smoke less, but he always answers, "Banana oil!" Grandfather likes to be modern in his language.' },
    { id: 'b-northwind', title: 'The North Wind and the Sun (Aesop, retold)', body: 'The North Wind and the Sun were arguing about which of them was stronger, when a traveller came along wrapped in a warm cloak. They agreed that whoever first made the traveller take off the cloak would be called the stronger.\n\nThe North Wind blew as hard as it could, but the harder it blew, the more tightly the traveller held the cloak around their shoulders, and at last the North Wind gave up. Then the Sun came out and shone warmly, and straight away the traveller took off the cloak. So the North Wind had to admit that the Sun was the stronger of the two.' },
    { id: 'b-bright', title: 'Bright vowels (ee, ay, eh)', body: 'Please keep the green seeds in the tea tin. Lisa sees three bees in the tall trees.\n\nKate baked a cake on a rainy day. They stayed late to paint the gate grey.\n\nTen red pens fell under the bed. Every evening, Eve feels the sea breeze.' },
    { id: 'b-sibilants', title: 'Sibilants (s and sh)', body: 'She sees six silver ships sailing south. Sam\'s sister sewed a soft silk scarf.\n\nSally sells sea shells by the seashore. Fresh fish is served on Sunday.\n\nSunshine sparkles on the shallow stream, and she sits by the shore to rest.' },
    { id: 'b-everyday', title: 'Everyday phrases', body: 'Hi, it\'s so nice to see you again. How have you been?\n\nCould I get a small coffee with oat milk, please? Thanks so much.\n\nSorry, could you say that again? I\'ll be there in about ten minutes.\n\nHave a lovely evening, and see you next week!' },
  ];
  const ADD_PRESETS = [
    { id: 'add-own', title: '', note: 'Paste or type anything you want to practise: a script for a phone call, a poem, a paragraph from a book. Blank lines start new paragraphs.' },
  ];
  const TEXTS_KEY = 'voicetrainer.texts.v1';
  const Texts = {
    user: [],
    async load() {
      try { this.user = JSON.parse(localStorage.getItem(TEXTS_KEY) || '[]'); } catch (e) { this.user = []; }
      if (Store.col) {
        try { const s = await Store.col.doc('_texts').get(); if (s.exists) this.user = (s.data().items || []); } catch (e) {}
      }
    },
    async save() {
      try { localStorage.setItem(TEXTS_KEY, JSON.stringify(this.user)); } catch (e) {}
      if (Store.col) { try { await Store.col.doc('_texts').set({ items: this.user }); } catch (e) {} }
    },
    all() { return [...this.user, ...BUILTIN_TEXTS]; },
  };

  const Reader = {
    open: false, mode: 'voice', words: [], cum: [], idx: 0, tracker: new D.NucleusTracker(),
    paceT: 0, paceLast: 0, base: 0, size: 2, current: null, wasPause: false,
    frame(fr) {
      if (!this.open || this.mode !== 'voice' || !this.words.length) return;
      const now = performance.now();
      const hit = this.tracker.push(fr, now);
      if (hit) {
        // a new syllable: move to the word that owns it, never more than one word per syllable
        const n = this.base + this.tracker.count;
        let i = this.idx;
        while (i + 1 < this.words.length && this.cum[i + 1] < n && i < this.idx + 1) i++;
        if (i !== this.idx) this.go(i, true);
      }
      // a pause: snap to the start of the next sentence or clause if we are close to it
      const pause = this.tracker.silentMs > 450;
      if (pause && !this.wasPause) this.resync();
      this.wasPause = pause;
    },
    resync() {
      const w = this.words;
      for (let d = 0; d <= 3; d++) {
        for (const j of [this.idx + d, this.idx - d]) {
          if (j >= 0 && j < w.length - 1 && /[.!?;:,]$/.test(w[j].text) && j >= this.idx - 2) {
            this.go(j + 1, false); return;
          }
        }
      }
    },
    go(i, fromVoice) {
      i = clamp(i, 0, this.words.length - 1);
      this.idx = i;
      if (!fromVoice) { this.base = this.cum[i] - this.tracker.count; }
      this.paint();
    },
    paint() {
      const els = this.words;
      els.forEach((w, j) => {
        w.el.classList.toggle('past', j < this.idx);
        w.el.classList.toggle('cur', j === this.idx);
        w.el.classList.toggle('next', j === this.idx + 1);
      });
      this.paintTrack();
      const cur = els[this.idx] && els[this.idx].el;
      if (cur) {
        const stage = $('reader-stage');
        const target = stage.scrollTop + cur.getBoundingClientRect().top - stage.getBoundingClientRect().top - stage.clientHeight * 0.38;
        if (Math.abs(stage.scrollTop - target) > cur.offsetHeight * 0.8) {
          stage.scrollTo({ top: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
      }
      $('rh-hint').textContent = this.synth ? 'The synthetic demo voice is reading, and the meters are analysing it live. It does not count toward your progress.'
        : this.tts ? (state.running === 'mic' ? 'The speech voice is reading. The microphone picks it up, so the meters show it (use speakers, not headphones); it does not count toward your progress.' : 'The speech voice is reading. Start the microphone too if you want the meters to follow it through your speakers.') : this.idx >= els.length - 1 ? 'Last word. Back to start to read it again.' : this.mode === 'tap' ? 'Space or tap the text to move on. Backspace goes back.' : this.mode === 'pace' ? 'The highlight moves at a steady pace. Click any word to jump there.' : state.running === 'mic' ? 'Read aloud. The highlight follows your syllables; click a word if it drifts.' : 'Start the microphone and read aloud.';
    },
    // the single focus line: words left to right, the current one centred and highlighted
    paintTrack() {
      if (!this.focusLine) return;
      const els = this.words, track = $('reader-track'), inner = $('track-inner');
      els.forEach((w, j) => {
        w.tw.classList.toggle('cur', j === this.idx);
        w.tw.classList.toggle('next', j === this.idx + 1);
        w.tw.classList.toggle('ahead', j > this.idx + 1);
      });
      const cur = els[this.idx] && els[this.idx].tw;
      if (cur) inner.style.transform = `translateX(${track.clientWidth / 2 - cur.offsetLeft - cur.offsetWidth / 2}px)`;
    },
    setFocusLine(on) {
      this.focusLine = on;
      $('reader').classList.toggle('no-track', !on);
      const b = $('reader-focus'); b.textContent = on ? 'Focus line on' : 'Focus line off'; b.setAttribute('aria-pressed', String(on));
      try { localStorage.setItem('voicetrainer.focusline', on ? '1' : '0'); } catch (e) {}
      if (on) requestAnimationFrame(() => this.paintTrack());
    },
    render(text) {
      this.current = text;
      const box = $('reader-text'), track = $('track-inner');
      box.innerHTML = ''; track.innerHTML = '';
      this.words = []; this.cum = [];
      let syl = 0;
      for (const para of text.body.split(/\n\s*\n/)) {
        const p = document.createElement('p');
        for (const tok of para.trim().split(/\s+/).filter(Boolean)) {
          const span = document.createElement('span');
          span.className = 'w'; span.textContent = tok;
          const i = this.words.length;
          span.addEventListener('click', (e) => { e.stopPropagation(); this.go(i, false); });
          p.append(span, ' ');
          const tw = document.createElement('span');
          tw.className = 'tw'; tw.textContent = tok;
          tw.addEventListener('click', () => this.go(i, false));
          track.append(tw, ' ');
          this.cum.push(syl);
          syl += D.countSyllables(tok);
          this.words.push({ text: tok, el: span, tw });
        }
        box.appendChild(p);
      }
      this.cum.push(syl);
      this.restart();
    },
    // read the passage aloud with the browser's own speech voice, one sentence per utterance
    // (Chrome cuts long utterances short); the highlight follows word boundary events,
    // or an estimated pace when the voice does not report them
    voices() {
      const S = window.speechSynthesis;
      return S ? S.getVoices().filter(v => /^en/i.test(v.lang)) : [];
    },
    fillVoices() {
      const sel = $('reader-voice'), list = this.voices();
      DemoVoice.voiceCount = list.length;
      $('reader-voice-wrap').hidden = list.length < 2 || DemoVoice.get().reader === 'synth';
      if (!list.length) return;
      const keep = sel.value;
      sel.innerHTML = '';
      const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Automatic'; sel.appendChild(auto);
      for (const v of list) { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + (v.lang ? ' (' + v.lang + ')' : ''); sel.appendChild(o); }
      const want = DemoVoice.get().voice || keep;
      if (list.some(v => v.voiceURI === want)) sel.value = want;
    },
    pickVoice() {
      const list = this.voices(), want = DemoVoice.get().voice;
      const chosen = list.find(v => v.voiceURI === want);
      if (chosen) return chosen;
      const fem = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|hazel|serena|allison|ava|kate|libby|sonia|aria|jenny|emma|joanna|salli|kimberly|amy|natasha/i;
      const masc = /\bmale|man\b|daniel|alex\b|fred|david|mark|george|ryan|guy|thomas|oliver|arthur|matthew|joey|justin|brian|william/i;
      const isFem = v => fem.test(v.name), isMasc = v => !isFem(v) && masc.test(v.name);
      const match = list.filter(DemoVoice.get().type === 'fem' ? isFem : isMasc);
      return match.find(v => v.localService) || match[0] || list.find(v => v.default) || list[0] || null;
    },
    listen() {
      const S = window.speechSynthesis;
      if (this.tts || this.synth) return this.stopListen();
      if (DemoVoice.get().reader === 'synth') return this.listenSynth();
      if (!S || !window.SpeechSynthesisUtterance) { $('rh-hint').textContent = 'This browser has no speech voice to read the text aloud.'; return; }
      // the microphone stays on if it is running, so the meters can follow the voice from the speakers
      S.cancel();
      // group words from the current one into sentences
      const start = this.idx >= this.words.length - 1 ? 0 : this.idx;
      const groups = [];
      let g = null;
      for (let i = start; i < this.words.length; i++) {
        if (!g) { g = { first: i, text: '', offs: [] }; groups.push(g); }
        g.offs.push(g.text.length);
        g.text += this.words[i].text + ' ';
        if (/[.!?]["')\]]*$/.test(this.words[i].text) || g.offs.length >= 40) g = null;
      }
      const tts = this.tts = { boundary: false, gi: 0, t0: 0, wordAt: 0 };
      const voice = this.pickVoice();
      const dv = DemoVoice.get(), rate = dv.rate;
      // speech pitch is relative to the voice's own; typical voices sit near 200 Hz and 115 Hz
      const pitch = clamp(dv.pitch / (dv.type === 'fem' ? 205 : 115), 0.3, 2);
      this.go(start, false);
      const speakNext = () => {
        if (this.tts !== tts) return;
        const grp = groups[tts.gi];
        if (!grp) return this.stopListen(true);
        const u = new SpeechSynthesisUtterance(grp.text.trim());
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
        u.rate = rate; u.pitch = pitch;
        u.onstart = () => { tts.t0 = performance.now(); tts.wordAt = tts.t0; this.go(grp.first, false); };
        u.onboundary = (e) => {
          if (this.tts !== tts || (e.name && e.name !== 'word')) return;
          tts.boundary = true;
          let j = 0;
          while (j + 1 < grp.offs.length && grp.offs[j + 1] <= e.charIndex) j++;
          this.go(grp.first + j, false);
        };
        u.onend = () => { if (this.tts === tts) { tts.gi++; speakNext(); } };
        u.onerror = (e) => { if (this.tts === tts && e.error !== 'interrupted' && e.error !== 'canceled') this.stopListen(true); };
        tts.grp = grp;
        try { S.speak(u); } catch (e) { this.stopListen(); $('rh-hint').textContent = 'The speech voice could not start in this browser.'; }
      };
      // fallback pacing for voices that never send word boundaries
      const pace = () => {
        if (this.tts !== tts) return;
        requestAnimationFrame(pace);
        if (tts.boundary || !tts.t0 || !tts.grp) return;
        const now = performance.now(), w = this.words[this.idx];
        const need = 60000 / (165 * rate) * (0.6 + 0.4 * Math.max(1, D.countSyllables(w.text)));
        const last = tts.grp.first + tts.grp.offs.length - 1;
        if (now - tts.wordAt >= need && this.idx < last) { tts.wordAt = now; this.go(this.idx + 1, false); }
      };
      this.setListenButton(true);
      speakNext();
      pace();
      this.paint();
    },
    // The synthetic demo voice reads sentence by sentence through the analyser, so every meter
    // tracks it like microphone input; the highlight follows its own word timings.
    listenSynth() {
      if (state.running) stop();
      ensureCtx();
      const fs = ctx.sampleRate, start = this.idx >= this.words.length - 1 ? 0 : this.idx;
      const groups = [];
      let g = null;
      for (let i = start; i < this.words.length; i++) {
        if (!g) { g = { first: i, words: [] }; groups.push(g); }
        g.words.push(this.words[i].text);
        if (/[.!?]["')\]]*$/.test(this.words[i].text) || g.words.length >= 40) g = null;
      }
      const sy = this.synth = { gi: 0, src: null, chunk: null };
      const dv = DemoVoice.get();
      const playNext = () => {
        if (this.synth !== sy) return;
        const grp = groups[sy.gi];
        if (!grp) return this.stopListen(true);
        const r = Synth.readText(fs, grp.words, D.VOWELS, dv);
        const ab = ctx.createBuffer(1, r.x.length, fs);
        ab.copyToChannel(r.x, 0);
        const src = ctx.createBufferSource();
        src.buffer = ab; src.connect(ctx.destination); src.connect(analyser);
        src.onended = () => { if (this.synth === sy) { sy.gi++; playNext(); } };
        sy.src = src; sy.chunk = { t0: ctx.currentTime + 0.02, starts: r.starts, first: grp.first };
        src.start(sy.chunk.t0);
      };
      const follow = () => {
        if (this.synth !== sy) return;
        requestAnimationFrame(follow);
        const c = sy.chunk; if (!c) return;
        const el = ctx.currentTime - c.t0;
        let j = 0;
        while (j + 1 < c.starts.length && c.starts[j + 1] <= el) j++;
        if (el >= 0 && c.first + j !== this.idx) this.go(c.first + j, false);
      };
      an.reset(); meterFrames = [];
      setStatus('Analysing the demo voice reading', true);
      this.go(start, false);
      this.setListenButton(true);
      playNext(); follow(); ensureLoop();
      this.paint();
    },
    stopListen(finished) {
      if (!this.tts && !this.synth) return;
      if (this.synth) {
        const sy = this.synth; this.synth = null;
        if (sy.src) { try { sy.src.onended = null; sy.src.stop(); } catch (e) {} try { sy.src.disconnect(); } catch (e) {} }
        if (!state.running) setStatus('Not listening');
      }
      this.tts = null;
      exampleEnd = performance.now();
      try { window.speechSynthesis.cancel(); } catch (e) {}
      this.setListenButton(false);
      if (finished) this.go(this.words.length - 1, false);
      this.tracker.reset(); this.base = this.cum[this.idx] || 0;
      this.paint();
    },
    setListenButton(on) {
      const b = $('reader-listen');
      b.textContent = on ? 'Stop reading' : 'Hear it read';
      b.setAttribute('aria-pressed', String(on));
    },
    restart() { this.stopListen(); this.tracker.reset(); this.base = 0; this.idx = 0; this.paceLast = performance.now(); this.paceT = 0; $('reader-stage').scrollTop = 0; this.paint(); },
    tick() {
      if (!this.open) return;
      requestAnimationFrame(() => this.tick());
      if (this.mode !== 'pace' || !this.words.length) { this.paceLast = performance.now(); return; }
      const now = performance.now(), dt = now - this.paceLast; this.paceLast = now;
      this.paceT += dt;
      const w = this.words[this.idx];
      const wpm = +$('reader-wpm').value;
      // longer words and punctuation take longer
      const need = 60000 / wpm * (0.6 + 0.4 * Math.max(1, D.countSyllables(w.text))) + (/[.!?]$/.test(w.text) ? 450 : /[,;:]$/.test(w.text) ? 200 : 0);
      if (this.paceT >= need && this.idx < this.words.length - 1) { this.paceT = 0; this.go(this.idx + 1, false); }
    },
    setMode(m) {
      this.mode = m;
      for (const k of ['voice', 'pace', 'tap']) $('rmode-' + k).setAttribute('aria-checked', String(k === m));
      $('reader-wpm-wrap').hidden = m !== 'pace';
      this.tracker.reset(); this.base = this.cum[this.idx] || 0; this.paceT = 0;
      try { localStorage.setItem('voicetrainer.readmode', m); } catch (e) {}
      this.paint();
    },
    fillPicker(selectId) {
      const sel = $('reader-pick');
      sel.innerHTML = '';
      const og = (label, items) => { const g = document.createElement('optgroup'); g.label = label; for (const [v, t] of items) { const o = document.createElement('option'); o.value = v; o.textContent = t; g.appendChild(o); } sel.appendChild(g); };
      if (Texts.user.length) og('Your texts', Texts.user.map(t => [t.id, t.title]));
      og('Built in', BUILTIN_TEXTS.map(t => [t.id, t.title]));
      og('Add a text', [['add-own', 'Add your own text...']]);
      sel.value = selectId || (this.current && this.current.id) || BUILTIN_TEXTS[0].id;
    },
    pick(id) {
      const preset = ADD_PRESETS.find(p => p.id === id);
      if (preset) return this.editForm(null, preset);
      const t = Texts.all().find(x => x.id === id);
      if (!t) return;
      try { localStorage.setItem('voicetrainer.readtext', id); } catch (e) {}
      $('reader-form').hidden = true; $('reader-text').hidden = false;
      this.render(t);
      this.fillPicker(id);
      $('reader-edit').hidden = !id.startsWith('u-');
    },
    editForm(existing, preset) {
      this.stopListen();
      $('reader-text').hidden = true; $('reader-form').hidden = false; $('reader-edit').hidden = true;
      $('rf-title').value = existing ? existing.title : (preset && preset.title) || '';
      $('rf-body').value = existing ? existing.body : '';
      $('rf-note').textContent = existing ? 'Edit your text, or delete it.' : preset ? preset.note : '';
      $('rf-delete').hidden = !existing;
      this.editing = existing;
      ($('rf-title').value ? $('rf-body') : $('rf-title')).focus();
    },
    async saveForm() {
      const title = $('rf-title').value.trim(), body = $('rf-body').value.trim();
      if (!title || !body) return;
      if (this.editing) { this.editing.title = title; this.editing.body = body; }
      else Texts.user.unshift({ id: 'u-' + Date.now().toString(36), title, body });
      const id = this.editing ? this.editing.id : Texts.user[0].id;
      this.editing = null;
      await Texts.save();
      this.fillPicker(id);
      this.pick(id);
    },
    show() {
      this.open = true;
      $('reader').hidden = false;
      document.body.style.overflow = 'hidden';
      let id = BUILTIN_TEXTS[0].id;
      try { id = localStorage.getItem('voicetrainer.readtext') || id; } catch (e) {}
      if (!Texts.all().some(t => t.id === id)) id = BUILTIN_TEXTS[0].id;
      this.fillPicker(id);
      this.pick(id);
      setMicButton(state.running === 'mic');
      requestAnimationFrame(() => this.paintTrack());
      this.tick();
      $('reader-close').focus();
    },
    hide() {
      this.stopListen();
      this.open = false;
      $('reader').hidden = true;
      document.body.style.overflow = '';
      $('btn-read').focus();
    },
    init() {
      let m = 'voice';
      try { m = localStorage.getItem('voicetrainer.readmode') || 'voice'; } catch (e) {}
      $('btn-read').addEventListener('click', () => this.show());
      let fl = true;
      try { fl = localStorage.getItem('voicetrainer.focusline') !== '0'; } catch (e) {}
      this.setFocusLine(fl);
      $('reader-focus').addEventListener('click', () => this.setFocusLine(!this.focusLine));
      window.addEventListener('resize', () => { if (this.open) this.paintTrack(); });
      $('reader-close').addEventListener('click', () => this.hide());
      $('reader-mic').addEventListener('click', () => (state.running === 'mic' ? stop() : (this.synth && this.stopListen(), startMic().then(() => { if (!this.tts) this.restart(); else this.paint(); }))));
      $('reader-listen').addEventListener('click', () => this.listen());
      if (window.speechSynthesis) {
        this.fillVoices();
        window.speechSynthesis.addEventListener('voiceschanged', () => this.fillVoices());
      } else $('reader-listen').hidden = true;
      $('reader-restart').addEventListener('click', () => this.restart());
      $('reader-pick').addEventListener('change', (e) => this.pick(e.target.value));
      for (const k of ['voice', 'pace', 'tap']) $('rmode-' + k).addEventListener('click', () => this.setMode(k));
      $('reader-wpm').addEventListener('input', (e) => { $('reader-wpm-out').textContent = e.target.value; });
      const size = (d) => { this.size = clamp(this.size + d, 1.2, 3.6); $('reader-text').style.setProperty('--rsize', this.size + 'rem'); };
      $('reader-smaller').addEventListener('click', () => size(-0.25));
      $('reader-bigger').addEventListener('click', () => size(0.25));
      $('reader-text').addEventListener('click', () => { if (this.mode === 'tap') this.go(this.idx + 1, false); });
      $('reader-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveForm(); });
      $('rf-cancel').addEventListener('click', () => { this.editing = null; this.pick((this.current && this.current.id) || BUILTIN_TEXTS[0].id); });
      $('rf-delete').addEventListener('click', async () => {
        const b = $('rf-delete');
        if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Confirm delete'; return; }
        delete b.dataset.confirm; b.textContent = 'Delete this text';
        Texts.user = Texts.user.filter(t => t !== this.editing); this.editing = null;
        await Texts.save(); this.fillPicker(BUILTIN_TEXTS[0].id); this.pick(BUILTIN_TEXTS[0].id);
      });
      $('reader-edit').addEventListener('click', () => { if (this.current && this.current.id.startsWith('u-')) this.editForm(Texts.user.find(t => t.id === this.current.id)); });
      document.addEventListener('keydown', (e) => {
        if (!this.open) return;
        if (e.key === 'Escape') { if ($('reader-form').hidden) this.hide(); else $('rf-cancel').click(); return; }
        if (e.target.closest('input, textarea, select')) return;
        if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); this.go(this.idx + 1, false); }
        else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.idx - 1, false); }
      });
      this.setMode(m === 'pace' || m === 'tap' ? m : 'voice');
    },
  };

  function init() {
    let g = 'fem';
    try { g = localStorage.getItem('voicetrainer.goal') || 'fem'; } catch (e) {}
    $('goal-fem').addEventListener('click', () => setGoal('fem'));
    $('goal-masc').addEventListener('click', () => setGoal('masc'));
    $('btn-mic').addEventListener('click', () => (state.running === 'mic' ? stop() : startMic()));
    $('btn-demo').addEventListener('click', () => playDemo(false));
    DemoVoice.init();
    $('btn-stop').addEventListener('click', stop);
    $('file-in').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) playFile(f); e.target.value = ''; });
    $('btn-save').addEventListener('click', saveSession);
    try { $('auto-save').checked = localStorage.getItem('voicetrainer.autosave') === '1'; } catch (e) {}
    $('auto-save').addEventListener('change', (e) => {
      try { localStorage.setItem('voicetrainer.autosave', e.target.checked ? '1' : '0'); } catch (err) {}
      $('save-status').textContent = e.target.checked ? 'Auto-save is on. This session is saved whenever you stop listening, finish a drill or leave the page.' : 'Auto-save is off.';
      renderSession();
      if (e.target.checked) autoSave();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSave(); });
    $('btn-reset').addEventListener('click', () => { session = newSession(); state.lastScores = {}; resetSessionViews(); renderDrillGrid(); $('save-status').textContent = 'Session cleared.'; });
    for (const t of ['vowels', 'sibilants', 'words', 'breath', 'control']) $('tab-' + t).addEventListener('click', () => { state.tab = t; renderDrillGrid(); });
    initSpecHelp();
    readTheme();
    setGoal(g === 'masc' ? 'masc' : 'fem');
    renderDrillGrid();
    renderSession();
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { clearSpec(); drawVowelChart(); drawPitch(); drawHistory(); renderTractLive(); if (state.coach) renderCoach(); }, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawVowelChart(); drawPitch(); clearSpec(); });
    Store.init().then(() => { renderHistory(); return Texts.load(); });
    Reader.init();
  }
  init();

  // test hook for automated checks
  window.__vt = { onFrame, state, sessionStats, get analyzer() { return an; }, setAnalyzer(a) { an = a; } };
})();
