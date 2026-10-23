(function () {
  'use strict';
  const D = window.VTDSP, Synth = window.VTSynth;
  // Practice words, breath and control exercises and reading texts live in data/*.json (see CONTRIBUTING.md); build.js inlines them here
  const DATA = window.VTDATA;
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
    words: DATA.words.map(({ word: w, sibilant: sib, vowel: v }) => ({ id: 'w-' + w, type: 'word', sib, vowel: v, cue: w, sub: `/${sib === 's' ? 's' : 'ʃ'}/ + ${D.VOWEL_BY_KEY[v].cue}`, title: `Say "${w}" a few times` })),
  };
  // Breath exercises: guided steps plus a live breathiness gauge. aim 'band' completes after a few
  // seconds inside the goal zone; 'explore' is free practice.
  DRILLS.breath = DATA.breath.map(b => ({ ...b, type: 'breath', steps: (fem) => b.steps.map(s => (typeof s === 'string' ? s : fem ? s.feminine : s.masculine)) }));
  // Prosody: intonation patterns, checked on each spoken phrase from its pitch contour (semitones
  // around the phrase's own median, so they work at any pitch). check() returns {ok, value, text}.
  const rise = (n, top) => (wi, u) => (wi < n - 1 ? 1.02 - 0.03 * wi / Math.max(1, n - 1) : 0.99 + (top - 0.99) * u * u);
  DRILLS.prosody = [
    { id: 'pr-question', type: 'prosody', cue: 'Question rise', sub: 'end higher', title: 'Rise at the end of a question',
      say: "You're coming tonight?", f0At: rise(3, 1.45),
      why: 'Yes/no questions usually rise at the end. A clear, smooth rise sounds engaged and friendly; it is one of the easiest ways to bring more melody into speech.',
      steps: ['Say the question naturally, as if you really want to know.', 'Let the pitch climb on the last word, "tonight", rather than on the whole sentence.', 'Pause after each try so the app can read the phrase.'],
      check: (s) => ({ ok: s.end >= 3, value: s.end, text: s.end >= 3 ? `Rose ${s.end.toFixed(1)} semitones at the end. That is a clear question rise.` : s.end > 0.8 ? `A small rise (${s.end.toFixed(1)} semitones). Lift the last word a little more.` : 'The end did not rise. Let "tonight" climb, as if surprised.' }) },
    { id: 'pr-statement', type: 'prosody', cue: 'Settled statement', sub: 'end lower', title: 'Fall at the end of a statement',
      say: "I'm going home now.", f0At: (wi, u) => 1.12 - 0.08 * wi - (wi === 3 ? 0.14 * u : 0),
      why: 'Statements usually settle downward at the end. Ending with a rise on a statement (uptalk) can sound unsure; a gentle fall sounds calm and certain without being flat.',
      steps: ['Say the sentence as a plain fact.', 'Let the pitch settle down on "now", like putting something down gently.', 'Pause after each try.'],
      check: (s) => ({ ok: s.end <= -1.5, value: -s.end, text: s.end <= -1.5 ? `Settled down ${(-s.end).toFixed(1)} semitones at the end. Calm and certain.` : s.end > 0.8 ? 'That ended with a rise, which sounds like a question. Let "now" fall.' : 'Nearly level at the end. Let the last word drop a little further.' }) },
    { id: 'pr-pair', type: 'prosody', cue: 'Statement, then question', sub: 'fall, then rise', title: 'Same words, two tunes', pair: true,
      say: "It's raining. / It's raining?",
      why: 'Saying the same words as a statement and then as a question isolates the tune from the words. You hear and feel that the meaning lives in the pitch contour.',
      steps: ['Say "It\'s raining." as a fact, letting it fall at the end. Pause.', 'Then say "It\'s raining?" as a surprised question, rising at the end. Pause.', 'The app checks the first phrase for a fall and the second for a rise.'],
      check: (s, step) => step === 0
        ? ({ ok: s.end <= -1, value: -s.end, text: s.end <= -1 ? 'Statement fell. Now ask it as a question.' : 'For the statement, let the end fall. Try the statement again.' })
        : ({ ok: s.end >= 2.5, value: s.end, text: s.end >= 2.5 ? `Question rose ${s.end.toFixed(1)} semitones. Two clear tunes.` : 'For the question, lift the end more. Start again with the statement.' }) },
    { id: 'pr-range', type: 'prosody', cue: 'Expressive range', sub: 'wider melody', title: 'Use more of your range',
      say: "Oh, that's wonderful!", f0At: (wi, u) => [1.3, 0.95, 1.0 + 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.6))][wi] || 1,
      why: 'Lively speech moves across a wider pitch range. Feminine-coded speech often uses a wider, more varied range; masculine-coded speech often uses a narrower one. Either way, controlling range is a skill of its own.',
      steps: (fem) => [fem ? 'Say it with real delight: lift high on "won-" and let it come down after.' : 'Say it warmly with some lift on "won-", then settle down.', 'Keep the voice light; reach with melody, not volume.', 'Pause after each try.'],
      check: (s, step, fem) => { const need = fem ? 7 : 4.5; return { ok: s.span >= need, value: s.span, text: s.span >= need ? `Used ${s.span.toFixed(1)} semitones of range. Nicely expressive.` : `Used ${s.span.toFixed(1)} semitones. Aim for about ${need}: reach higher on the excited word.` }; } },
    { id: 'pr-stress', type: 'prosody', cue: 'Stress one word', sub: 'pitch accent', title: 'Lift the word that matters',
      say: 'I wanted the RED one, not the blue one.', f0At: (wi, u) => (wi === 3 ? 1.0 + 0.45 * u : wi === 4 ? 1.35 - 0.33 * u : 1.05 - 0.02 * wi),
      why: 'English marks the important word with a pitch accent: a quick lift (or dip) on its stressed syllable. Clear accents make speech sound engaged and easy to follow.',
      steps: ['Say the sentence, giving "RED" a clear lift in pitch, not just more volume.', 'Keep the rest of the sentence relaxed so the accent stands out.', 'Pause after each try.'],
      check: (s) => ({ ok: s.peak >= 3.5, value: s.peak, text: s.peak >= 3.5 ? `The accent stood ${s.peak.toFixed(1)} semitones above your line. Clear emphasis.` : `The highest point was ${s.peak.toFixed(1)} semitones above your line. Lift "RED" more.` }) },
    { id: 'pr-lilt', type: 'prosody', cue: 'Melody, not monotone', sub: 'pitch movement', title: 'Let the pitch move',
      say: 'Hi there, how have you been lately?', f0At: (wi, u) => 1 + 0.3 * Math.sin(1.7 * wi + 3 * u) + (wi === 5 ? 0.3 * u * u : 0),
      why: 'A monotone keeps the pitch almost still. Natural, friendly speech keeps the pitch moving gently up and down across the sentence.',
      steps: (fem) => [fem ? 'Say it warmly and let the pitch rise and fall across the words, like a friendly greeting.' : 'Say it in a relaxed, friendly way with gentle ups and downs.', 'Think of the melody of the words rather than their loudness.', 'Pause after each try.'],
      check: (s, step, fem) => { const need = fem ? 2.4 : 1.6; return { ok: s.sd >= need, value: s.sd, text: s.sd >= need ? `Pitch movement ${s.sd.toFixed(1)} (goal ${need}+). It has a melody.` : `Pitch movement ${s.sd.toFixed(1)}; aim for ${need}+. Let the pitch travel more between words.` }; } },
  ];
  // Control exercises: move one part of the tract and check that the matching formant (and only it)
  // moves, to build trust in what the feedback is tracking.
  DRILLS.control = DATA.control.map(c => ({ ...c, type: 'iso' }));
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
  const target = () => (state.goal === 'fem' ? [75, 100] : [0, 25]);

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
  const pitchBuf = [], pitchT = [];
  const PITCH_RANGE = [60, 400];
  // the goal's typical band, unless you set your own range for this goal in Settings
  const PITCH_MIN_SPAN = 10;
  const validBand = (b) => Array.isArray(b) && b.length === 2 && b.every(Number.isFinite) && b[0] >= PITCH_RANGE[0] && b[1] <= PITCH_RANGE[1] && b[1] - b[0] >= PITCH_MIN_SPAN;
  function customBand(goal = state.goal) { const c = typeof Data !== 'undefined' && Data.d ? (Data.setting('pitchRange') || {})[goal] : null; return validBand(c) ? c : null; }
  function pitchBand() { return customBand() || D.PITCH_BANDS[state.goal === 'fem' ? 'fem' : 'masc']; }
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
    Words.draw(g, w, h, axisW, dx, y);
  }

  // ---- recognised words over the pitch track (browser speech recognition, mic only) ----
  const Words = {
    KEY: 'voicetrainer.pitchwords', CONSENT: 'voicetrainer.speechconsent', on: false, rec: null, labels: [], lastT: 0, interim: [], note: '', readerIdx: -1,
    supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
    init() {
      const box = $('pitch-words'); if (!box) return;
      try { this.on = localStorage.getItem(this.KEY) === '1' && this.consented(); } catch (e) {}
      box.checked = this.on;
      box.addEventListener('change', () => {
        // recognition sends audio off the device, so it needs an explicit opt-in first
        if (box.checked && !this.consented()) { box.checked = false; this.ask(); return; }
        this.set(box.checked);
      });
      const dlg = $('speech-consent');
      dlg.addEventListener('close', () => {
        if (dlg.returnValue !== 'yes') return;
        try { localStorage.setItem(this.CONSENT, '1'); } catch (e) {}
        this.consentNow = true;
        this.set(true);
      });
      $('pw-withdraw').addEventListener('click', () => {
        try { localStorage.removeItem(this.CONSENT); } catch (e) {}
        this.consentNow = false;
        this.set(false);
        this.setNote('Consent withdrawn. Speech recognition is off and will ask again before it is used.');
      });
      this.sync();
    },
    consentNow: false,
    consented() { if (this.consentNow) return true; try { return localStorage.getItem(this.CONSENT) === '1'; } catch (e) { return false; } },
    ask() { const d = $('speech-consent'); d.returnValue = ''; if (d.showModal) d.showModal(); },
    set(on) {
      this.on = on && this.consented();
      $('pitch-words').checked = this.on;
      try { localStorage.setItem(this.KEY, this.on ? '1' : '0'); } catch (e) {}
      this.sync();
    },
    setNote(t) { const n = $('pitch-words-note'); if (n) { n.textContent = t; n.hidden = !t; } const pv = $('pitch-words-privacy'); if (pv) pv.hidden = !this.on; },
    // Run recognition only while the switch is on and the microphone is live.
    sync() {
      // In reading practice the words come from the passage itself (the highlighted word), so
      // recognition is not needed there.
      const reading = typeof Reader !== 'undefined' && Reader.open && !Reader.collapsed;
      const want = this.on && this.consented() && state.running === 'mic' && !reading && this.supported();
      if (want && !this.rec) this.start();
      else if (!want && this.rec) this.stop();
      if (!reading) this.readerIdx = -1;
      if (!this.on) this.setNote('');
      else if (reading) this.setNote('In reading practice the words come from the passage as the highlight moves.');
      else if (!this.supported()) this.setNote('This browser cannot recognise speech, so words only appear during reading practice.');
      else if (state.running !== 'mic') this.setNote('Words appear while the microphone is on.');
    },
    start() {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new R();
      r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
      this.rec = r; this.lastT = performance.now(); this.interim = '';
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i], text = res[0].transcript.trim();
          if (res.isFinal) this.place(text); else interim += ' ' + text;
        }
        // words still being recognised show straight away (faded) and firm up when final
        this.interim = D.placeWords(interim.trim().split(/\s+/).filter(Boolean), this.voicedSince(this.lastT));
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.setNote('Speech recognition was blocked, so no words are shown.'); this.on = false; const b = $('pitch-words'); if (b) b.checked = false; }
        else if (e.error === 'network') this.setNote('Speech recognition needs an internet connection in this browser.');
      };
      r.onend = () => { if (this.rec === r) { if (this.on && state.running === 'mic') { try { r.start(); } catch (err) { this.rec = null; } } else this.rec = null; } };
      try { r.start(); this.setNote(''); } catch (err) { this.rec = null; }
    },
    stop() { const r = this.rec; this.rec = null; this.interim = []; if (r) { r.onend = null; try { r.abort(); } catch (e) {} } },
    voicedSince(t) { const times = []; for (let i = 0; i < pitchT.length; i++) if (pitchBuf[i] && pitchT[i] > t) times.push(pitchT[i]); return times; },
    // Final result: spread its words over the voiced frames since the previous result.
    place(text) {
      const now = performance.now();
      for (const p of D.placeWords(text.split(/\s+/).filter(Boolean), this.voicedSince(this.lastT))) this.labels.push(p);
      this.lastT = now; this.interim = [];
      while (this.labels.length > 60) this.labels.shift();
    },
    // Reading practice: label the passage word the highlight has just moved to.
    readerWord(idx, words) {
      if (!this.on || idx === this.readerIdx) return;
      // if the highlight skipped ahead a few words, label them together
      const from = idx > this.readerIdx && idx - this.readerIdx <= 4 ? this.readerIdx + 1 : idx;
      const text = words.slice(from, idx + 1).map(x => x.text).join(' ');
      this.readerIdx = idx;
      const now = performance.now(), last = this.labels[this.labels.length - 1];
      if (last && last.open) { last.t1 = now; last.open = false; }
      this.labels.push({ w: text.replace(/^[^\w']+|[^\w']+$/g, ''), t0: now, t1: now + 1e9, open: true });
      while (this.labels.length > 60) this.labels.shift();
    },
    xAt(t, w, dx) { // clock time -> x on the pitch track, via the frame timestamps
      const n = pitchT.length; if (!n || t < pitchT[0]) return -1;
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pitchT[m] <= t) lo = m; else hi = m - 1; }
      return w - (n - lo) * dx;
    },
    draw(g, w, h, axisW, dx, y) {
      if (!this.on || (!this.labels.length && !this.interim.length)) return;
      const dpr = dprOf();
      g.textAlign = 'left'; g.textBaseline = 'top';
      // two staggered rows so short, quick words don't push each other off their place
      const lastEnd = [-1e9, -1e9];
      const one = (L, faded) => {
        if (!L.w) return;
        const x0 = this.xAt(L.t0, w, dx), x1 = this.xAt(L.t1, w, dx);
        if (x1 < axisW) return;
        g.font = `${faded ? 'italic 500' : '600'} ${12 * dpr}px ${C.font}`;
        const x = Math.max(axisW + 2 * dpr, x0), tw = g.measureText(L.w).width;
        const row = x >= lastEnd[0] + 4 * dpr ? 0 : x >= lastEnd[1] + 4 * dpr ? 1 : lastEnd[0] <= lastEnd[1] ? 0 : 1;
        const xs = Math.max(x, lastEnd[row] + 4 * dpr);
        g.strokeStyle = C.muted; g.globalAlpha = 0.25; g.beginPath(); g.moveTo(Math.max(axisW, x0), 34 * dpr); g.lineTo(Math.max(axisW, x0), h); g.stroke();
        g.globalAlpha = faded ? 0.55 : 1;
        g.fillStyle = C.ink; g.fillText(L.w, xs, (row ? 21 : 5) * dpr); g.globalAlpha = 1;
        lastEnd[row] = xs + tw;
      };
      for (const L of this.labels) one(L, false);
      for (const L of this.interim) one(L, true);
      g.textBaseline = 'alphabetic';
    },
  };

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
      $('reader-voice-wrap').hidden = this.voiceCount < 2;
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
    },
  };
  function playExample(def, mode) {
    ensureCtx();
    const fs = ctx.sampleRate;
    const fem = state.goal === 'fem';
    const x = def.type === 'prosody' ? prosodyExample(fs, def, fem) : mode === 'compare' ? Synth.comparison(fs, def, D.VOWELS, D.SIBILANTS) : Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS);
    playSamples(x, mode, def.type === 'prosody' ? 'as intended' : mode === 'compare' ? 'masculine, then feminine' : `typical ${fem ? 'feminine' : 'masculine'}`);
  }
  function playSamples(x, mode, label) {
    ensureCtx();
    stopExample();
    const fs = ctx.sampleRate;
    const ab = ctx.createBuffer(1, x.length, fs);
    ab.copyToChannel(x, 0);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    if (state.running !== 'file' && state.running !== 'demo') src.connect(analyser); // show it on the charts
    src.onended = () => { if (exSrc === src) finishExample(); };
    exSrc = src;
    meterFrames = []; an.reset();
    startDemoView(state.drill, label);
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
    const d = state.drill;
    if (d && d.demoOn) {
      if (d.def.type === 'prosody') updateProsody(d, true);
      updateDemo(d, true); renderCoach();
      const m = $('drill-msg'); if (m) m.textContent = 'That was the demo voice. It was not scored; make the sound yourself to carry on.';
    }
  }
  // While a demo sound plays, the exercise panel (live coach, gauges, vocal tract sketch, breath
  // gauge, control gauges, prosody line) shows the demo instead of you. Nothing it does is scored.
  // The demo reading stays up until your own voice comes in.
  let demoLabel = '';
  const demoName = () => exSrc ? 'demo voice' : Reader.synth || Reader.tts ? 'reading voice' : 'demo voice';
  function resetCoachBuf(co) {
    if (!co) return;
    co.vf = []; co.vft = []; co.f1 = []; co.f1t = []; co.sf = []; co.sft = [];
    co.vt = co.st = -1e9; co.eased = {}; co.hist = []; co.jawOff = false;
  }
  function startDemoView(d, label) {
    if (!d) return;
    demoLabel = label ? label[0].toLowerCase() + label.slice(1) : 'demo';
    d.demoOn = true; d.demoBr = []; d.demoIso = []; d.demoBase = null; d.demoPts = []; d.demoLast = null; d.demoStep = 0;
    d.eased = {}; if (d.cue) { d.cue.eased = {}; d.cue.key = null; }
    resetCoachBuf(state.coach); if (state.coach) state.coach.demo = true;
    d.offTarget = null; // a "sounds closer to..." note from before the demo no longer applies
    const m = $('drill-msg');
    if (m) { if (!m.classList.contains('demo-msg')) d.msgBefore = m.textContent; m.textContent = `Demo voice playing (${demoLabel}). The panel shows the demo; it is not scored as you.`; m.classList.add('demo-msg'); }
    if (d.def.type === 'prosody' && $('pr-cue')) { $('pr-cue').textContent = `Demo playing (${demoLabel}).`; $('pr-cue').classList.remove('ok'); $('pr-state').textContent = 'demo voice'; drawProsody(d); }
  }
  function endDemoView(d) {
    const m = $('drill-msg');
    if (m && m.classList.contains('demo-msg')) { m.classList.remove('demo-msg'); m.textContent = d.result ? (d.msgBefore || '') : state.running ? 'Listening...' : ''; }
    d.offTarget = null;
    d.demoOn = false; d.demoBr = []; d.demoIso = []; d.demoBase = null; d.demoPts = []; d.demoLast = null;
    d.eased = {}; if (d.cue) { d.cue.eased = {}; d.cue.key = null; }
    if (d.def.type === 'prosody' && $('pr-cue')) { $('pr-cue').textContent = ''; $('pr-state').textContent = ''; drawProsody(d); }
  }
  function updateDemo(d, force) {
    const t = d.def.type;
    if (t === 'breath') updateBreath(d, force);
    else if (t === 'iso') updateIso(d, force);
    else if (t === 'prosody' && !force) updateProsody(d);
  }
  function setExampleUi(mode) {
    if (!mode) document.querySelectorAll('.proof-play.playing').forEach(x => { if (!exSrc) { x.classList.remove('playing'); x.textContent = '▶'; } });
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
    Words.sync(); Wake.update();
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
    Words.sync(); Wake.update();
    setStatus('Not listening');
  }
  // While the microphone runs the screen is kept awake, so a phone doesn't dim mid-exercise.
  const Wake = {
    lock: null,
    async update() {
      const want = state.running === 'mic' && navigator.wakeLock && document.visibilityState === 'visible';
      if (want && !this.lock) { try { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } catch (e) { this.lock = null; } }
      else if (!want && this.lock) { try { await this.lock.release(); } catch (e) {} this.lock = null; }
    },
  };
  document.addEventListener('visibilitychange', () => Wake.update());
  const sheetUi = () => window.matchMedia('(max-width: 860px)').matches;
  // the browser's speech voice never reaches the analyser; only the microphone can hear it
  function paintVoiceNote() {
    const n = $('pitch-voice-note'); if (!n) return;
    let tts = false; try { tts = !!Reader.tts; } catch (e) {}
    n.hidden = !(tts && state.running !== 'mic');
  }
  function setMicButton(on) {
    paintVoiceNote();
    if (typeof Reader !== 'undefined' && Reader.open) Reader.paint();
    for (const b of [$('btn-mic')]) {
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
    let frRes = NaN, frSib = NaN; // this frame's scores, for the per-word reading report
    drawSpecColumn(fr, an.fsd);
    pitchBuf.push(fr.kind === 'voiced' ? fr.f0 : 0); pitchT.push(performance.now());
    if (pitchBuf.length > 360) { pitchBuf.shift(); pitchT.shift(); }
    // While a reference example plays (and briefly after), show it but don't score it as the user.
    const gated = !!exSrc || !!Reader.tts || !!Reader.synth || performance.now() - exampleEnd < 400;
    const d = !gated && state.drill && !state.drill.result ? state.drill : null;
    const dd = exSrc && state.drill && state.drill.demoOn ? state.drill : null; // a demo is playing for this exercise
    // your own voice takes the panel back from the demo
    if (!gated && state.drill && state.drill.demoOn && (fr.kind === 'voiced' || fr.kind === 'fricative')) endDemoView(state.drill);
    if (!gated && state.meterDemo && (fr.kind === 'voiced' || fr.kind === 'fricative')) {
      meterFrames = []; state.meter = NaN; state.meterDemo = false;
      $('res-desc').textContent = 'Hold a vowel or speak a sentence to see your own score.';
    }

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
          vowel = v; score = score100(fit.alpha);
          ok = fit.rms < 0.085 || cls.vowel.key === v.key;
          if (ok) d.vowelFr.push({ F, alpha: fit.alpha, per: fit.per });
          else d.offTarget = { key: cls.vowel.key, n: (d.offTarget && d.offTarget.n || 0) + 1 };
        } else if (cls.cost < 0.07) {
          vowel = cls.vowel; score = score100(cls.alpha); ok = true;
        }
        if (ok) {
          if (!gated) { addVowelToSession(vowel.key, score); frRes = score; }
          pushMeter(score, gated);
          $('ro-vowel').textContent = `${vowel.cue.split(' ')[0]} (${vowel.word})`;
          state.lastVowel = { v: vowel, at: Date.now() };
          if (!gated || exSrc) {
            if (tractLive.v !== vowel || tractLive.demo !== gated) tractLive.hist = [];
            tractLive.demo = gated;
            tractLive.hist = (tractLive.hist || []).concat([F]).slice(-90); // ~1.5 s
            tractLive.F = [0, 1, 2].map(i => D.median(tractLive.hist.map(f => f[i])));
            tractLive.v = vowel; tractLive.at = performance.now();
          }
          $('res-context').textContent = gated ? 'demo voice, ' + vowel.cue : d && d.def.vowel ? 'drill vowel ' + vowel.cue : 'vowel ' + vowel.cue;
        }
      }
    } else if (fr.kind === 'fricative') {
      const type = d && d.def.sib ? d.def.sib : fr.sib;
      const sib = D.SIBILANTS[type];
      const score = score100(D.sibilantAlpha(fr.cog, sib));
      if (!gated) {
        session.sibs[type].push(score); frSib = score;
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
      if (dd && dd.def.type === 'breath') dd.demoBr.push(fr.breath);
    }
    if (d && d.def.type === 'prosody') d.pts.push({ t: performance.now(), f0: fr.kind === 'voiced' ? fr.f0 : 0 });
    if (d && d.def.type === 'iso' && fr.kind === 'voiced' && fr.formants) d.isoFr.push({ F: fr.formants, f0: fr.f0, n: frameCount });
    if (dd && dd.def.type === 'prosody') dd.demoPts.push({ t: performance.now(), f0: fr.kind === 'voiced' ? fr.f0 : 0 });
    if (dd && dd.def.type === 'iso' && fr.kind === 'voiced' && fr.formants) dd.demoIso.push({ F: fr.formants, f0: fr.f0, n: frameCount });
    if (frameCount - breathShown > 120) { $('ro-breath').textContent = '--'; breathBuf.length = 0; }
    if (Reader.open) $('rh-breath').textContent = $('ro-breath').textContent;

    if (frameCount % 3 === 0) { drawVowelChart(); drawPitch(); renderMeter(); drawSpecAxis(); }
    if (!gated) coachFrame(fr, false);
    else if (dd) coachFrame(fr, true);
    if (!gated) Reader.frame(fr);
    if (Run.on && !gated) Run.frames.push({ i: Reader.idx, f0: fr.kind === 'voiced' ? fr.f0 : 0, res: frRes, sib: frSib });
    if (frameCount % 6 === 0) { renderCoach(); renderTractLive(); }
    if (d) updateDrill(d);
    else if (dd) updateDemo(dd);
    if (frameCount % 30 === 0) renderSession();
  }

  // Scores shown and saved stay on the 0 (masculine average) .. 100 (feminine average) scale.
  // Going past an average is not extra credit, so it reads as the end of the scale.
  function score100(alpha) { return clamp(alpha * 100, 0, 100); }
  function pushMeter(score, demo = false) {
    // average over the last ~1.5 s so the needle moves calmly; a demo voice and yours never mix
    const now = performance.now();
    if (!!state.meterDemo !== demo) { meterFrames = []; state.meterDemo = demo; state.meterName = demo ? demoName() : ''; }
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
      if (state.meterDemo) $('res-desc').textContent = `This is the ${state.meterName}, not you: ${inT ? 'inside' : 'outside'} your target range. It is not scored or saved.`;
      else $('res-desc').textContent = inT ? 'In your target range. Keep this shape.'
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
      const hist = practiceFor(def.id), last = hist.length ? hist.at(-1).score : state.lastScores[def.id];
      b.innerHTML = `<span class="cue"></span><span class="sub"></span><span class="last"></span>`;
      b.querySelector('.cue').textContent = def.cue;
      b.querySelector('.sub').textContent = def.sub;
      b.querySelector('.last').textContent = last != null ? 'last ' + (def.type === 'prosody' ? last.toFixed(1) + ' st' : Math.round(last)) : ' ';
      b.addEventListener('click', () => selectDrill(def));
      grid.appendChild(b);
    }
    for (const t of ['vowels', 'sibilants', 'words', 'breath', 'control', 'prosody']) $('tab-' + t).setAttribute('aria-selected', String(state.tab === t));
  }
  function selectDrill(def, fromPlan) {
    if (!fromPlan && state.plan && state.plan.status === 'active' && planStep() && planStep().def.id !== def.id) {
      state.plan.status = 'paused'; renderPlan();
    }
    state.drill = { def, vowelFr: [], sibFr: [], breathFr: [], isoFr: [], pts: [], inZone: 0, offTarget: null, result: null };
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
    if (d.def.type === 'prosody') return renderProsodyPanel(d);
    p.innerHTML = `
      <p class="eyebrow"><span>Drill</span><span>${d.def.type === 'word' ? 'consonant + vowel' : d.def.type === 'sib' ? 'sibilant' : 'vowel'}</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <div class="example-box">
        <div class="btn-row">
          <button type="button" class="btn" id="ex-compare">Compare masculine and feminine</button>
        </div>
        <p class="ex-note" id="ex-note"></p>
      </div>
      <div class="proof" id="proof" hidden></div>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div id="coach" class="coach" aria-live="polite">
        <p class="eyebrow"><span>Live coach</span><span id="coach-trend"></span></p>
        <p class="coach-cue" id="coach-cue"></p>
        <p class="coach-why" id="coach-why"></p>
        <details class="how" id="coach-how" hidden><summary>How do I do that?</summary><div class="how-body"></div></details>
        <div class="gauges" id="coach-gauges"></div>
        <figure class="tract-coach" hidden><canvas id="cv-tract-coach" height="230"></canvas>
          <figcaption class="tract-key"><span><i class="ln you"></i>you</span><span><i class="ln goal"></i>goal</span><span><i class="ln arrow"></i>change</span></figcaption></figure>
      </div>
      <div id="drill-result"></div>
      <div><button type="button" class="btn" id="drill-again" hidden>Try this sound again</button></div>`;
    p.querySelector('.drill-title').textContent = d.def.title;
    p.querySelector('.drill-help').textContent = drillInstruction(d.def);
    $('drill-msg').textContent = state.running ? 'Listening...' : 'Start the microphone (or analyze a recording) to begin.';
    $('drill-again').addEventListener('click', () => selectDrill(d.def));
    $('ex-compare').addEventListener('click', () => (exSrc && $('ex-compare').textContent.startsWith('Stop') ? stopExample() : playExample(d.def, 'compare')));
    renderProof($('proof'), d.def);
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
  function coachFrame(fr, demo) {
    const co = state.coach, d = state.drill;
    if (!co || !d) return;
    const now = performance.now();
    // switching between the demo and you starts the readings afresh, so the two never mix
    if (!!co.demo !== demo) { if (!demo && !(fr.kind === 'voiced' || fr.kind === 'fricative')) return; resetCoachBuf(co); co.demo = demo; co.key = null; }
    // keep about the last 1.5 s of frames; the gauges and tips use their median
    const keep = (arr, ts, v, win = AVG_MS) => { arr.push(v); ts.push(now); while (ts.length > 1 && now - ts[0] > win) { ts.shift(); arr.shift(); } };
    if (d.def.vowel && fr.kind === 'voiced' && fr.formants) {
      keep(co.vf, co.vft || (co.vft = []), fr.formants); co.vt = now;
      // the jaw reading (F1) is the noisiest, so it gets a longer, 3-second window
      keep(co.f1 || (co.f1 = []), co.f1t || (co.f1t = []), fr.formants[0], 3000);
    }
    if (d.def.sib && fr.kind === 'fricative') { keep(co.sf, co.sft || (co.sft = []), fr.cog); co.st = now; }
  }
  // what each gauge asks for in body terms: [to raise it, to lower it]
  const GAUGE_ACT = { jaw: ['open', 'close'], tongue: ['forward', 'back'], lips: ['smile', 'round'], larynx: ['larynx up', 'larynx down'], sib: ['brighter', 'darker'] };
  let gaugeKind = 'jaw';
  function gaugeRow(label, sub, pos, need, slack = 0, kind = 'sib') {
    gaugeKind = kind;
    const [b0, b1] = D.COACH_BAND[state.goal], lo = b0 - slack, hi = b1 + slack;
    // a wide zone (the jaw) is drawn at a compressed scale around its centre so it fits the track
    const c = (b0 + b1) / 2, sq = slack > 30 ? 0.45 : 1;
    const x = (v) => clamp((c + (v - c) * sq + 40) / 180 * 100, 0, 100);
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
      // tolerances in line with the coach zones: about +-30% for the jaw (F1), +-5% tongue, +-5% lips
      row('Jaw', t.height - y.height, fromStart ? 0.08 : 0.45, 'more open', 'more closed'),
      row('Tongue', y.back - t.back, fromStart ? 0.05 : 0.1, 'further back', 'further forward'),
      row('Lips', y.round - t.round, fromStart ? 0.07 : 0.12, 'more rounded', 'more spread'),
      row('Larynx', y.larynx - t.larynx, fromStart ? 0.15 : 0.25, 'higher (shorter throat)', 'lower (longer throat)'),
    ];
  }
  // Against the goal, the readout uses the coach's own zones so the sketch, the gauges and the tips agree.
  function coachReadout(F, v) {
    const c = D.coachVowel(F, v, state.goal), all = c.focus && c.focus.formant === 'all';
    const row = (part, need, up, down) => ({ part, ok: !need, text: !need ? 'about right' : need === 1 ? up : down });
    return [
      row('Jaw', c.need[0], 'open a little more', 'close a little'),
      row('Tongue', all ? 0 : c.need[1], 'further forward', 'further back'),
      row('Lips', all ? 0 : c.need[2], 'spread slightly (smile)', 'round slightly'),
      row('Larynx', all ? c.focus.dir : 0, 'higher (shorter throat)', 'lower (longer throat)'),
    ];
  }
  function renderTractRead(el, rows) {
    if (!el) return;
    if (!rows) { el.innerHTML = ''; return; }
    el.innerHTML = rows.map(r => `<li class="${r.ok ? 'ok' : 'off'}"><b>${r.part}</b> ${r.text}</li>`).join('');
  }
  function drawTract(cv, F, v, key, refF, note) {
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
      // no voice: show the moving parts at rest (jaw nearly closed, tongue relaxed, larynx in the middle)
      const rest = tractGeom({ height: 0.9, back: 0.5, round: 0, larynx: 0.5 });
      drawTractLayer(g, k, rest, { stroke: C.muted, width: 1.6 * dpr, fill: C.muted });
      g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'left';
      g.fillText('tongue', (rest.peak[0] - 14) * k, (rest.peak[1] + 22) * k);
      g.fillText('larynx', 228 * k, (rest.Ly + 14) * k);
      tractLabel(g, k, dpr, 'At rest. Hold a vowel to see yours', C.muted);
      g.restore(); return readout;
    }
    // dashed: the goal shape, or (in control exercises) the shape you started from
    const goalF = refF || (state.goal === 'fem' ? v.W : v.M);
    const sy = D.tractShape(F, v, state.goal), st = D.tractShape(goalF, v, state.goal);
    // differences are drawn twice as large (larynx 1.5x) so small changes are visible
    const amp = (key2, m) => st[key2] + m * (sy[key2] - st[key2]);
    const shown = { height: amp('height', 2), back: amp('back', 2), round: amp('round', 2), larynx: amp('larynx', 1.5) };
    const you = tractGeom(shown), tgt = tractGeom(st);
    readout = refF ? tractReadout(sy, st, true) : coachReadout(F, v);
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
      tractLabel(g, k, dpr, note || TRACT_REC[state.goal][key] || '', C.ink);
    } else if (key === 'ok') tractLabel(g, k, dpr, note || 'Close to the goal shape', C.good);
    else if (note) tractLabel(g, k, dpr, note, C.ink);
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
    const demo = fresh && t.demo;
    const rows = drawTract($('cv-tract'), fresh ? t.F : null, fresh ? t.v : null, t.key, null, demo ? 'Solid line: the demo voice (estimated)' : '');
    renderTractRead($('tract-read'), demo ? null : rows); // the adjustment tips are for your voice, not a demo
    const cap = $('tract-vowel'); if (cap) cap.textContent = fresh ? `${demo ? 'demo voice, ' : ''}vowel "${t.v.cue}" as in ${t.v.word}` : '';
  }
  // smooth a gauge position so the marker glides instead of jumping
  function ease(co, k, v, rate = 0.2) {
    const p = co.eased[k];
    return (co.eased[k] = p == null || !isFinite(p) ? v : p + rate * (v - p));
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
      if (co.f1 && co.f1.length) F[0] = D.median(co.f1);
      const c = D.coachVowel(F, v, state.goal);
      // jaw hysteresis: flag the jaw only once it is clearly outside its zone, and clear it once back inside
      const [b0, b1] = D.COACH_BAND[state.goal], jlo = b0 - D.F1_SLACK, jhi = b1 + D.F1_SLACK, p0 = c.pos[0];
      if (!co.jawOff && (p0 < jlo - 20 || p0 > jhi + 20)) co.jawOff = true;
      else if (co.jawOff && p0 >= jlo && p0 <= jhi) co.jawOff = false;
      c.need[0] = co.jawOff ? (p0 < jlo ? 1 : -1) : 0;
      if (c.focus && c.focus.formant === 0 && !c.need[0]) {
        const rest = [1, 2].filter(i => c.need[i]).sort((a, b) => c.miss[b] - c.miss[a]);
        c.focus = rest.length ? { formant: rest[0], dir: c.need[rest[0]] } : null;
      }
      // when all three are off together the fix is the larynx, so say that on each gauge it explains
      const allDir = c.focus && c.focus.formant === 'all' ? c.focus.dir : 0;
      rows += c.pos.map((p, i) => gaugeRow(FORMANT_ROLE[i][0], FORMANT_ROLE[i][1], ease(co, 'f' + i, p, i === 0 ? 0.1 : 0.2), c.need[i], i === 0 ? D.F1_SLACK : 0,
        allDir && c.need[i] === allDir ? 'larynx' : ['jaw', 'tongue', 'lips'][i])).join('');
      dist = c.distance;
      key = c.focus ? `${c.focus.formant}:${c.focus.dir}` : 'ok';
    }
    if (sRecent) {
      const cog = D.median(co.sf), c = D.coachSibilant(cog, D.SIBILANTS[def.sib], state.goal);
      rows += gaugeRow(def.sib === 's' ? '/s/' : '/ʃ/', `hiss ${(cog / 1000).toFixed(1)} kHz`, ease(co, 'sib', c.pos), c.dir);
      if (!vRecent || co.st > co.vt) { key = c.onTarget ? 'ok' : 'sib:' + c.dir; dist = c.distance; }
    }
    if (co.demo) return renderCoachDemo(co, def, key, rows, vRecent);
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
  // the coach while a demo plays: the same gauges and sketch, describing the demo voice
  function renderCoachDemo(co, def, key, rows, vRecent) {
    const cueEl = $('coach-cue'), what = def.vowel ? 'jaw, tongue, lips and larynx' : 'tongue (from its hiss)';
    const heard = vRecent || (def.sib && co.sf.length);
    let cue;
    if (!heard) cue = exSrc ? `Demo playing (${demoLabel}). Its reading appears here as it sounds.` : 'That was the demo voice. Make the sound yourself to see your own reading.';
    else cue = `Demo voice, ${demoLabel}: ${key === 'ok' ? 'on target' : 'off target'}${exSrc ? '' : ' (finished)'}.`;
    cueEl.textContent = cue;
    cueEl.classList.toggle('ok', !!heard && key === 'ok');
    $('coach-why').textContent = heard ? `The gauges and sketch show where the demo's ${what} likely sit${def.vowel ? ', and which way they would need to move' : ''}. Your own voice takes over when you next make a sound.` : '';
    renderHowto('idle');
    $('coach-gauges').innerHTML = rows;
    const ct = $('cv-tract-coach');
    if (ct) {
      ct.parentElement.hidden = !def.vowel;
      if (def.vowel) drawTract(ct, vRecent ? [0, 1, 2].map(i => D.median(co.vf.map(f => f[i]))) : null, D.VOWEL_BY_KEY[def.vowel], key, null, 'Solid line: the demo voice (estimated)');
    }
    const tr = $('coach-trend'); tr.textContent = 'demo voice'; tr.className = 'trend demo';
  }
  function renderExampleNote() {
    const n = $('ex-note'), d = state.drill; if (!n || !d) return;
    const fem = state.goal === 'fem', def = d.def;
    const parts = [];
    if (def.vowel) { const v = D.VOWEL_BY_KEY[def.vowel], F = fem ? v.W : v.M; parts.push(`jaw (F1) ${F[0]}, tongue (F2) ${F[1]}, lips/larynx (F3) ${F[2]} Hz`); }
    if (def.sib) parts.push(`/${def.sib === 's' ? 's' : 'ʃ'}/ centred near ${((fem ? D.SIBILANTS[def.sib].W : D.SIBILANTS[def.sib].M) / 1000).toFixed(1)} kHz`);
    n.textContent = `Synthesized at typical ${fem ? 'feminine' : 'masculine'} values (${parts.join('; ')}; pitch ${fem ? 'about 200' : 'about 110'} Hz). Shown on the charts, not scored. Compare plays masculine, then feminine.`;
  }
  function updateDrill(d) {
    const def = d.def;
    if (def.type === 'breath') return updateBreath(d);
    if (def.type === 'iso') return updateIso(d);
    if (def.type === 'prosody') return updateProsody(d);
    let prog;
    if (def.type === 'vowel') prog = d.vowelFr.length / NEED.vowel;
    else if (def.type === 'sib') prog = d.sibFr.length / NEED.sib;
    else prog = Math.min(d.vowelFr.length / NEED.wordVowel, d.sibFr.length / NEED.wordSib);
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    const msg = $('drill-msg');
    if (msg && frameCount % 6 === 0 && !d.demoOn) {
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
      <div><button type="button" class="btn" id="drill-again" hidden>Do this exercise again</button></div>
      <div class="proof" id="proof" hidden></div>`;
    renderProof($('proof'), def);
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
    const demo = !!d.demoOn;
    const recent = (demo ? d.demoBr : d.breathFr).slice(-90);
    const fresh = recent.length >= 5 && frameCount - breathShown < 90;
    const b = fresh ? D.median(recent) : NaN;
    const key = !fresh ? 'idle' : b > hi ? 'high' : b < lo ? 'low' : 'ok';
    // the same steadiness rules as the live coach: no flicker between tips
    const c = d.cue || (d.cue = { key: null, at: 0, pending: null, pendingAt: 0, eased: {} });
    if (key !== c.pending) { c.pending = key; c.pendingAt = now; }
    if (demo) { if (key !== 'idle' || !exSrc) c.key = key; } // a demo is short: show its reading straight away
    else if (key !== c.key && (c.key === null || (key === 'idle' && now - c.pendingAt > COACH_HOLD_MS - 1200) ||
      (key !== 'idle' && now - c.pendingAt >= (key === 'ok' ? 600 : 1000) && now - c.at >= (key === 'ok' ? 600 : COACH_MIN_SHOW_MS)))) { c.key = key; c.at = now; }
    const cue = $('br-cue'); if (!cue) return;
    if (demo) {
      const k = c.key || 'idle';
      cue.textContent = k === 'idle' ? (exSrc ? `Demo playing (${demoLabel}). Its reading appears here as it sounds.` : 'That was the demo voice. Make a sustained sound to see your own reading.')
        : `Demo voice, ${demoLabel}: ${k === 'ok' ? 'in the zone' : k === 'high' ? 'airier than the zone' : 'clearer and firmer than the zone'}.`;
    } else cue.textContent = c.key === 'idle' && !state.running ? 'Start the microphone to see your breathiness live.' : BREATH_CUES[c.key || 'idle'];
    cue.classList.toggle('ok', c.key === 'ok');
    const mark = $('br-mark');
    if (fresh) {
      const x = ease(c, 'b', b);
      mark.hidden = false; mark.style.left = clamp(x, 0, 100) + '%';
      mark.classList.toggle('ok', key === 'ok');
      $('br-num').textContent = `${demo ? 'demo voice · ' : ''}${Math.round(b)} · ${breathWord(b)}`;
      $('br-need').textContent = key === 'ok' ? '✓' : key === 'high' ? '← clearer' : 'airier →';
      $('br-need').className = 'g-need ' + (key === 'ok' ? 'ok' : 'off');
    } else if (c.eased.b == null) { mark.hidden = true; $('br-need').textContent = ''; $('br-num').textContent = ''; }
    if (demo || def.aim !== 'band' || d.result) return;
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
    recordPractice(session.drills[session.drills.length - 1]);
  }


  // ---------------- graded examples ("check the checker") ----------------
  // Each exercise can show demo sounds run through exactly the same scoring as your voice, so you
  // can hear the difference and see that the grade follows it. Analysis runs offline on the
  // synthesized samples, so it is the same on every device.
  const PROOF_FS = 48000, proofCache = new Map();
  function analyzeSamples(x, fs) {
    const a = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
    for (let end = a.needed, i = 0; end <= x.length; end += hop, i++) { const fr = a.analyze(x.subarray(0, end)); fr.t = i * 1000 / 60; out.push(fr); }
    return out;
  }
  // phrases are split where the voicing stops for half a second, as in the live prosody check
  function phrasesOf(frames) {
    const out = []; let cur = [], gap = 0;
    for (const f of frames) {
      const v = f.kind === 'voiced' ? f.f0 : 0;
      if (v) { cur.push({ t: f.t, f0: v }); gap = 0; } else if (cur.length) { gap++; cur.push({ t: f.t, f0: 0 }); if (gap > 30) { out.push(cur); cur = []; gap = 0; } }
    }
    if (cur.length) out.push(cur);
    return out.map(p => { while (p.length && !p[p.length - 1].f0) p.pop(); return p; }).filter(p => p.filter(q => q.f0).length * 16 >= 400);
  }
  function gradeSound(def, frames) {
    const fem = state.goal === 'fem', r = {};
    if (def.vowel) {
      const v = D.VOWEL_BY_KEY[def.vowel], al = [], Fs = [];
      for (const fr of frames) {
        if (fr.kind !== 'voiced' || !fr.formants || !fr.stable) continue;
        const fit = D.fitVowel(fr.formants, v);
        if (fit.rms < 0.085 || D.classifyVowel(fr.formants).vowel.key === v.key) { al.push(fit.alpha); Fs.push(fr.formants); }
      }
      if (al.length) { r.vowelScore = score100(D.median(al)); r.F = [0, 1, 2].map(i => D.median(Fs.map(f => f[i]))); }
    }
    if (def.sib) {
      const sc = frames.filter(fr => fr.kind === 'fricative').map(fr => score100(D.sibilantAlpha(fr.cog, D.SIBILANTS[def.sib])));
      if (sc.length) r.sibScore = D.median(sc);
    }
    r.score = def.type === 'word' ? (r.vowelScore != null && r.sibScore != null ? 0.6 * r.vowelScore + 0.4 * r.sibScore : null) : (r.vowelScore ?? r.sibScore ?? null);
    if (r.score == null) return { ok: false, text: 'could not be measured' };
    const parts = [];
    if (r.F) parts.push(`F1-F3 ${r.F.map(Math.round).join(' · ')} Hz`);
    if (def.type === 'word') parts.push(`vowel ${Math.round(r.vowelScore)}, consonant ${Math.round(r.sibScore)}`);
    const ok = onTarget(r.score);
    return { ok, big: Math.round(r.score), text: `${ok ? `in the ${fem ? 'feminine' : 'masculine'} target zone` : `outside the ${fem ? 'feminine' : 'masculine'} target zone`}${parts.length ? ' · ' + parts.join(' · ') : ''}` };
  }
  function gradeIso(def, frames) {
    const v = frames.filter(f => f.kind === 'voiced' && f.formants);
    if (v.length < NEED.isoBase + 30) return { ok: false, text: 'could not be measured' };
    const first = v.slice(0, NEED.isoBase);
    const base = { F: [0, 1, 2].map(i => D.median(first.map(f => f.formants[i]))), f0: D.median(first.map(f => f.f0)) };
    const tail = v.slice(-30), F = [0, 1, 2].map(i => D.median(tail.map(f => f.formants[i]))), f0 = D.median(tail.map(f => f.f0));
    const r = D.isolation(def.kind, base.F, F, base.f0, f0);
    const pc = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
    const text = `jaw ${pc(r.dev[0])}, tongue ${pc(r.dev[1])}, lips/larynx ${pc(r.dev[2])}${def.kind === 'pitch' ? `, pitch ${r.semis >= 0 ? '+' : ''}${r.semis.toFixed(1)} st` : ''}`;
    const any = Math.max(...r.dev.map(Math.abs)) >= 0.06;
    return { ok: r.ok, big: r.ok ? '✓' : '✗', text: (r.ok ? 'isolated · ' : r.moved ? 'not isolated · ' : any ? 'the wrong part moved · ' : 'did not move enough · ') + text };
  }
  function gradeBreath(frames) {
    const b = frames.filter(f => f.breath != null).map(f => f.breath);
    if (b.length < 10) return { ok: false, text: 'could not be measured' };
    const m = D.median(b), [lo, hi] = breathBand(), ok = m >= lo && m <= hi;
    return { ok, big: Math.round(m), text: `${breathWord(m)} · ${ok ? 'in' : 'outside'} the ${state.goal === 'fem' ? 'feminine' : 'masculine'} zone (${lo}-${hi})` };
  }
  function gradeProsody(def, frames) {
    const ph = phrasesOf(frames), fem = state.goal === 'fem';
    if (!ph.length) return { ok: false, text: 'could not be measured' };
    if (def.pair) {
      if (ph.length < 2) return { ok: false, text: 'could not be measured' };
      const a = D.prosodyStats(ph[0]), b = D.prosodyStats(ph[1]);
      const ra = def.check(a, 0, fem), rb = def.check(b, 1, fem);
      return { ok: ra.ok && rb.ok, big: ra.ok && rb.ok ? '✓' : '✗', text: `first ends ${a.end >= 0 ? '+' : ''}${a.end.toFixed(1)} st, second ends ${b.end >= 0 ? '+' : ''}${b.end.toFixed(1)} st` };
    }
    const s = D.prosodyStats(ph[0]), r = def.check(s, 0, fem);
    return { ok: r.ok, big: r.ok ? '✓' : '✗', text: r.text };
  }
  // The demo sounds for each kind of exercise: one that should pass and one that should not.
  function proofItems(def) {
    const fem = state.goal === 'fem', goalName = fem ? 'feminine' : 'masculine', other = fem ? 'masc' : 'fem';
    if (def.type === 'vowel' || def.type === 'sib' || def.type === 'word') return [
      { label: `Typical ${goalName}`, make: (fs) => Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS), grade: (fr) => gradeSound(def, fr) },
      { label: `Typical ${fem ? 'masculine' : 'feminine'}`, make: (fs) => Synth.example(fs, def, other, D.VOWELS, D.SIBILANTS), grade: (fr) => gradeSound(def, fr) },
    ];
    if (def.type === 'prosody') return [
      { label: 'As intended', make: (fs) => prosodyExample(fs, def, fem), grade: (fr) => gradeProsody(def, fr) },
      { label: 'Flat (monotone)', make: (fs) => prosodyExample(fs, { ...def, f0At: () => 1, flat: true }, fem), grade: (fr) => gradeProsody(def, fr) },
    ];
    if (def.type === 'breath') return [
      { label: 'Clear tone', make: (fs) => breathExample(fs, fem, fem ? 0.32 : 0.2), grade: gradeBreath },
      { label: 'Very breathy', make: (fs) => breathExample(fs, fem, 0.85), grade: gradeBreath },
      { label: 'Pressed', make: (fs) => breathExample(fs, fem, 0), grade: gradeBreath },
    ];
    if (def.type === 'iso') return [
      { label: 'Right movement', make: (fs) => isoExample(fs, def, fem, true), grade: (fr) => gradeIso(def, fr) },
      { label: ISO_WRONG[def.kind].label, make: (fs) => isoExample(fs, def, fem, false), grade: (fr) => gradeIso(def, fr) },
    ];
    return [];
  }
  function breathExample(fs, fem, breath) {
    const v = D.VOWEL_BY_KEY.a, F = fem ? v.W : v.M;
    return Synth.concat([Synth.silence(fs, 0.1), Synth.voiced(fs, 1.6, fem ? 205 : 115, fem ? 195 : 108, F, { breath, ramp: 0.06, seed: 7 }), Synth.silence(fs, 0.1)]);
  }
  // control exercises: hold the vowel, then make one movement (or the wrong one) and hold it
  const ISO_MOVES = {
    jaw: [1.3, 1, 1], tongue: [1, 1.2, 1], lips: [1, 0.95, 0.9], larynx: [1.1, 1.1, 1.1], pitch: [1, 1, 1],
  };
  const ISO_WRONG = {
    jaw: { label: 'Tongue moved instead', F: [1, 1.18, 1] }, tongue: { label: 'Jaw moved instead', F: [1.3, 1.04, 1] },
    lips: { label: 'Jaw moved instead', F: [1.3, 1, 1] }, larynx: { label: 'Only the tongue moved', F: [1, 1.18, 1] },
    pitch: { label: 'Resonance moved too', F: [1.12, 1.12, 1.12] },
  };
  function isoExample(fs, def, fem, right) {
    const v = D.VOWEL_BY_KEY[def.vowel], base = fem ? v.W : v.M, f0 = fem ? 200 : 115;
    const k = right ? ISO_MOVES[def.kind] : ISO_WRONG[def.kind].F, moved = base.map((f, i) => f * k[i]);
    const f1 = def.kind === 'pitch' ? f0 * Math.pow(2, 5 / 12) : f0;
    return Synth.concat([Synth.silence(fs, 0.1), Synth.voiced(fs, 1.0, f0, f0, base, { ramp: 0.05, seed: 3 }),
      Synth.voiced(fs, 1.8, f0, f1, moved, { from: base, trans: 0.6, ramp: 0.05, seed: 5 }), Synth.silence(fs, 0.1)]);
  }
  function renderProof(host, def) {
    if (!host) return;
    const items = proofItems(def); if (!items.length) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = `<p class="eyebrow"><span>Check the checker</span><span>demo sounds, graded by the app</span></p>
      <p class="proof-lead">Each demo is scored by exactly the same check as your voice. Listen, then compare the grades.</p>
      <div class="proof-rows">${items.map((it, i) => `<div class="proof-row" id="proof-${i}">
        <button type="button" class="btn proof-play" data-i="${i}" aria-label="Play: ${it.label}">▶</button>
        <span class="proof-label">${it.label}</span><b class="proof-big">…</b><span class="proof-text">grading…</span></div>`).join('')}</div>`;
    host.querySelectorAll('.proof-play').forEach(b => b.addEventListener('click', () => {
      const it = items[+b.dataset.i];
      if (exSrc && b.classList.contains('playing')) { stopExample(); return; }
      ensureCtx(); playSamples(it.make(ctx.sampleRate), null, it.label);
      host.querySelectorAll('.proof-play').forEach(x => { x.classList.remove('playing'); x.textContent = '▶'; });
      b.classList.add('playing'); b.textContent = '■';
    }));
    // grade after the panel has painted
    setTimeout(() => items.forEach((it, i) => {
      const key = `${def.id}|${state.goal}|${i}`;
      let g = proofCache.get(key);
      if (!g) { g = it.grade(analyzeSamples(it.make(PROOF_FS), PROOF_FS)); proofCache.set(key, g); }
      const row = $('proof-' + i); if (!row || !host.contains(row)) return;
      row.classList.toggle('ok', g.ok); row.classList.toggle('off', !g.ok);
      row.querySelector('.proof-big').textContent = g.big ?? (g.ok ? '✓' : '✗');
      row.querySelector('.proof-text').textContent = g.text;
    }), 30);
  }

  // ---------------- prosody exercises ----------------
  const NEED_PROS = 2; // passing phrases to finish an exercise (one statement+question for the pair)
  function prosodyExample(fs, def, fem) {
    const o = { pitch: fem ? 205 : 115, res: fem ? 100 : 0, bright: fem ? 65 : 40, rate: 0.95 };
    if (!def.pair) return Synth.readText(fs, def.say.split(/\s+/), D.VOWELS, { ...o, f0At: def.f0At }).x;
    const flat = def.flat ? () => 1 : null;
    const a = Synth.readText(fs, ["It's", 'raining.'], D.VOWELS, { ...o, f0At: flat || ((wi, u) => (wi === 0 ? 1.08 : 1.02 - 0.2 * u)) }).x;
    const b = Synth.readText(fs, ["It's", 'raining?'], D.VOWELS, { ...o, f0At: flat || ((wi, u) => (wi === 0 ? 1.0 : 0.98 + 0.45 * u * u)) }).x;
    const out = new Float32Array(a.length + b.length); out.set(a); out.set(b, a.length); return out;
  }
  function renderProsodyPanel(d) {
    const p = $('drill-panel'), def = d.def, fem = state.goal === 'fem';
    p.innerHTML = `
      <p class="eyebrow"><span>Prosody exercise</span><span>${def.sub}</span></p>
      <p class="drill-title"></p>
      <p class="pr-say"></p>
      <p class="drill-help"></p>
      <ol class="breath-steps"></ol>
      <div class="btn-row"><button type="button" class="btn" id="ex-play">Play example</button></div>
      <div class="proof" id="proof" hidden></div>
      <div class="coach" aria-live="polite">
        <p class="eyebrow"><span>Your last phrase</span><span id="pr-state" class="trend"></span></p>
        <p class="coach-cue" id="pr-cue"></p>
        <canvas id="cv-pros" height="150"></canvas>
        <p class="coach-why">The line is your pitch in semitones around your own middle pitch, so it works at any voice pitch. Pause briefly after each phrase so the app knows it ended.</p>
      </div>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div><button type="button" class="btn" id="drill-again" hidden>Do this exercise again</button></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    p.querySelector('.pr-say').textContent = def.say;
    p.querySelector('.drill-help').textContent = def.why;
    const ol = p.querySelector('.breath-steps');
    for (const t of (typeof def.steps === 'function' ? def.steps(fem) : def.steps)) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('ex-play').addEventListener('click', () => (exSrc ? stopExample() : playExample(def, 'play')));
    renderProof($('proof'), def);
    $('drill-again').addEventListener('click', () => selectDrill(def));
    d.passes = 0; d.step = 0; d.last = null; d.best = null;
    $('pr-cue').textContent = state.running ? `Say: ${def.say}` : 'Start the microphone, then say the phrase.';
    $('drill-msg').textContent = '';
    drawProsody(d);
  }
  // A phrase ends after half a second without voicing; then it is checked and drawn.
  function updateProsody(d, flush) {
    const demo = !!d.demoOn, pts = demo ? d.demoPts : d.pts; if (!pts.length) return;
    const now = performance.now();
    let lastV = -1; for (let i = pts.length - 1; i >= 0; i--) if (pts[i].f0 > 0) { lastV = i; break; }
    if (lastV < 0) { if (pts.length > 600) pts.length = 0; return; }
    const voicedMs = pts.filter(q => q.f0 > 0).length * 16;
    const ended = flush || now - pts[lastV].t > 500 || now - pts[0].t > 7000;
    if (!ended) return;
    const first = pts.findIndex(q => q.f0 > 0);
    const phrase = pts.slice(first, lastV + 1);
    pts.length = 0;
    if (voicedMs < 400) return; // too short to be a phrase
    const s = D.prosodyStats(phrase); if (!s) return;
    if (demo) {
      // the demo's phrase is drawn and graded like yours, but does not count
      const r = d.def.check(s, d.demoStep, state.goal === 'fem');
      if (d.def.pair) d.demoStep = d.demoStep ? 0 : 1;
      d.demoLast = { s, r };
      const cue = $('pr-cue'); if (!cue) return;
      cue.textContent = `Demo voice, ${demoLabel}: ${r.ok ? 'passes' : 'does not pass'}. ${r.text.split('. ')[0].replace(/\.$/, '')}.`;
      cue.classList.toggle('ok', r.ok);
      $('pr-state').textContent = `demo voice · ${s.dur.toFixed(1)} s · range ${s.span.toFixed(1)} st`;
      drawProsody(d);
      return;
    }
    if (d.result) return;
    const def = d.def, fem = state.goal === 'fem', r = def.check(s, d.step, fem);
    d.last = { s, r };
    if (def.pair) {
      if (d.step === 0) d.step = r.ok ? 1 : 0;
      else { d.step = 0; if (r.ok) d.passes = NEED_PROS; }
    } else if (r.ok) d.passes++;
    if (r.ok) d.best = d.best == null ? r.value : Math.max(d.best, r.value);
    const cue = $('pr-cue'); if (!cue) return;
    cue.textContent = r.text; cue.classList.toggle('ok', r.ok);
    $('pr-state').textContent = `${s.dur.toFixed(1)} s · range ${s.span.toFixed(1)} st`;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(d.passes / NEED_PROS * 100, 0, 100) + '%';
    if (!def.pair) $('drill-msg').textContent = `${d.passes} of ${NEED_PROS} phrases on target.`;
    drawProsody(d);
    if (d.passes >= NEED_PROS) finishProsody(d);
  }
  function drawProsody(d) {
    const cv = $('cv-pros'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, ax = 30 * dpr;
    const y = (st) => h / 2 - clamp(st, -10, 10) / 10 * (h / 2 - 8 * dpr);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = C.line; g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'right'; g.lineWidth = dpr;
    for (const st of [-6, 0, 6]) { g.beginPath(); g.moveTo(ax, y(st)); g.lineTo(w, y(st)); g.stroke(); g.fillText((st > 0 ? '+' : '') + st, ax - 5 * dpr, y(st) + 4 * dpr); }
    const last = d.demoOn ? d.demoLast : d.last;
    if (!last) { g.textAlign = 'center'; g.fillText(d.demoOn ? 'Demo playing: its line appears when the phrase ends' : 'Say the phrase, then pause', (w + ax) / 2, h / 2 - 6 * dpr); return; }
    if (d.demoOn) { g.textAlign = 'left'; g.fillText('demo voice', ax + 6 * dpr, 12 * dpr); }
    const c = last.s.contour, t0 = c[0].t, t1 = c[c.length - 1].t || t0 + 1;
    const x = (t) => ax + 6 * dpr + (t - t0) / Math.max(1, t1 - t0) * (w - ax - 12 * dpr);
    g.strokeStyle = last.r.ok ? C.good : C.ink; g.lineWidth = 2.4 * dpr; g.lineJoin = 'round';
    g.beginPath(); let pen = false, prevT = 0;
    for (const q of c) { if (pen && q.t - prevT > 120) pen = false; pen ? g.lineTo(x(q.t), y(q.s)) : g.moveTo(x(q.t), y(q.s)); pen = true; prevT = q.t; }
    g.stroke();
  }
  function finishProsody(d) {
    const def = d.def;
    d.result = { id: def.id, score: d.best, at: Date.now() };
    state.lastScores[def.id] = d.best;
    session.drills.push({ id: def.id, label: def.cue, score: Math.round(d.best * 10) / 10, at: d.result.at, kind: 'prosody' });
    renderDrillGrid(); renderSession();
    $('drill-msg').textContent = def.pair ? 'Done: a clear fall and a clear rise on the same words. Do it again, or try another exercise.' : `Done: ${NEED_PROS} phrases on target. Do it again, or try another exercise.`;
    $('drill-again').hidden = false;
    recordPractice(session.drills[session.drills.length - 1]);
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
      <div class="btn-row"><button type="button" class="btn" id="iso-reset">Set a new starting point</button><button type="button" class="btn" id="drill-again" hidden>Do this exercise again</button></div>
      <div class="proof" id="proof" hidden></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    p.querySelector('.drill-help').textContent = def.why;
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('drill-again').addEventListener('click', () => selectDrill(def));
    $('iso-reset').addEventListener('click', () => { d.base = null; d.isoFr = []; d.inZone = 0; d.best = 0; d.eased = {}; updateIso(d, true); });
    d.base = null; d.best = 0; d.eased = {};
    renderProof($('proof'), def);
    updateIso(d, true);
  }
  function updateIso(d, force) {
    if (!force && frameCount % 6) return;
    const def = d.def, cue = $('iso-cue'); if (!cue) return;
    // a demo gets its own starting point, so yours is kept for when you carry on
    const demo = !!d.demoOn, fr = demo ? d.demoIso : d.isoFr, bk = demo ? 'demoBase' : 'base';
    cue.classList.remove('ok');
    if (!d[bk]) {
      // the starting point: the median of the first steady stretch of voice
      if (fr.length >= NEED.isoBase) {
        const first = fr.slice(0, NEED.isoBase);
        d[bk] = { F: [0, 1, 2].map(i => D.median(first.map(f => f.F[i]))), f0: D.median(first.map(f => f.f0)) };
      } else {
        cue.textContent = demo ? (exSrc ? `Demo playing (${demoLabel}): it holds its starting sound first.` : 'That was the demo voice. Hold the starting sound to begin yourself.')
          : state.running ? `Hold the starting sound steadily (${Math.round(fr.length / NEED.isoBase * 100)}%).` : 'Start the microphone, then hold the starting sound.';
        $('iso-state').textContent = demo ? 'demo voice' : '';
        drawTract($('cv-tract-iso'), null, D.VOWEL_BY_KEY[def.vowel], null);
        return;
      }
    }
    const base = d[bk];
    const recent = fr.filter(f => frameCount - f.n < 30); // about the last half second
    const fresh = recent.length >= 6;
    $('iso-state').textContent = demo ? 'demo voice' : 'starting point set';
    if (!fresh) {
      if (demo && !exSrc) cue.textContent = 'That was the demo voice. Make the movement yourself to see your own reading.';
      else if (!demo) cue.textContent = 'Starting point set. Now make the movement slowly, keeping the sound going.';
      return;
    }
    const F = [0, 1, 2].map(i => D.median(recent.map(f => f.F[i]))), f0 = D.median(recent.map(f => f.f0));
    const r = D.isolation(def.kind, base.F, F, base.f0, f0);
    const vals = [...r.dev.map(x => x * 100), r.semis];
    vals.forEach((v, i) => {
      const scale = i === 3 ? 8 : 30; // full track = +-30% or +-8 semitones
      const x = ease(d, 'i' + i, v);
      const m = $('iso-m' + i); m.hidden = false; m.style.left = clamp(50 + x / scale * 50, 0, 100) + '%';
      m.classList.toggle('ok', ISO_MAIN[def.kind].includes(i) && r.moved);
      $('iso-v' + i).textContent = i === 3 ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : `${v >= 0 ? '+' : ''}${Math.round(v)}%`;
    });
    renderTractRead($('tract-read-iso'), drawTract($('cv-tract-iso'), F, D.VOWEL_BY_KEY[def.vowel], null, base.F, demo ? 'Solid line: the demo voice (estimated)' : ''));
    const main = ISO_MAIN[def.kind];
    if (demo) {
      cue.textContent = `Demo voice, ${demoLabel}: ${r.ok ? (def.kind === 'pitch' ? 'pitch moves while the formants hold still' : 'the right part moves on its own')
        : r.moved || Math.max(...r.dev.map(Math.abs)) >= 0.06 ? 'the wrong part moved, so the check would not count it' : 'holding its starting point'}.`;
      cue.classList.toggle('ok', r.ok);
      return;
    }
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
    recordPractice(session.drills[session.drills.length - 1]);
  }

  function finishDrill(d) {
    const def = d.def, res = { id: def.id, label: def.cue, type: def.type, at: Date.now() };
    if (d.vowelFr.length) {
      const v = D.VOWEL_BY_KEY[def.vowel];
      res.vowelScore = score100(D.median(d.vowelFr.map(f => f.alpha)));
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
    $('drill-msg').textContent = 'Done. Your result is below.';
    $('drill-again').hidden = false;
    planDrillFinished(def, res);
    recordPractice(session.drills[session.drills.length - 1]);
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
    // same advice as the live coach, so the result and the coach never disagree
    if (res.F && res.vowel) {
      const c = D.coachVowel(res.F, D.VOWEL_BY_KEY[res.vowel], state.goal);
      const cue = c.focus && COACH_CUES[state.goal][`${c.focus.formant}:${c.focus.dir}`];
      if (cue) return cue.join(' ');
    }
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
      ['Pitch in target', pitchInTarget(session.pitch)],
      ['Pitch range (10-90%)', st.pitch ? `${Math.round(st.pitch.p10)}-${Math.round(st.pitch.p90)} Hz` : '--'],
      ['Median breathiness', Number.isFinite(st.breath) ? `${Math.round(st.breath)} (${breathWord(st.breath)})` : '--'],
      ['Drills completed', session.drills.length],
    ];
    sum.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  // share of voiced frames inside the target pitch band (above it counts for a feminine goal, below it for a masculine one)
  function pitchInTarget(ps) {
    const [lo, hi] = pitchBand(), v = (ps || []).filter(p => p > 0);
    if (v.length < 10) return `-- <small class="muted">(${lo}-${hi} Hz)</small>`;
    const ok = v.filter(p => (state.goal === 'fem' ? p >= lo : p <= hi)).length;
    return `${Math.round(ok / v.length * 100)}% <small class="muted">(${lo}-${hi} Hz)</small>`;
  }
  function resetSessionViews() {
    $('sess-vowels').innerHTML = '<p class="empty">Vowels you use will appear here with their own score, so you can see which ones pull your resonance down.</p>';
    $('sess-sibs').innerHTML = '<p class="empty">Hold an "sss" or "shh" to measure how bright your sibilants are.</p>';
    renderSession();
  }

  // ---------------- saved data: Google Drive ----------------
  // Readings and practice history (plus settings and your own texts) live in one JSON file in the
  // user's Google Drive, as in petravanta's other apps. Until Drive is connected, and where Drive
  // can't be used (a file opened from disk, a claude.ai Artifact), the browser keeps the copy.
  const GOOGLE_CLIENT_ID = /^(petravanta\.github\.io|localhost)$/.test(location.hostname) ? '326863468616-4hf2conk0ks0s4qdva9tphphdo7ht7eh.apps.googleusercontent.com' : '';
  const PRIVACY = '<a href="https://petravanta.github.io/general/privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="https://petravanta.github.io/general/terms.html" target="_blank" rel="noopener">Terms</a>';
  const emptyData = () => ({ settings: {}, readings: [], practice: [], texts: [], deleted: [] });
  // Combine two copies (Drive and this browser, or two devices): every record from both minus
  // deletions, the more recently changed settings, and the newer edit of each text.
  function mergeData(a, b) {
    a = a || {}; b = b || {};
    const del = new Set([...(a.deleted || []), ...(b.deleted || [])]);
    const union = (k, newer) => {
      const by = new Map();
      for (const r of [...(b[k] || []), ...(a[k] || [])]) {
        if (!r || !r.id || del.has(r.id)) continue;
        const old = by.get(r.id);
        if (!old || !newer || (r.upd || '') >= (old.upd || '')) by.set(r.id, r);
      }
      return [...by.values()];
    };
    const sa = a.settings || {}, sb = b.settings || {};
    return {
      settings: (sa.upd || '') >= (sb.upd || '') ? sa : sb,
      readings: union('readings').sort((x, y) => (x.at < y.at ? -1 : 1)),
      practice: union('practice').sort((x, y) => (x.at < y.at ? -1 : 1)),
      texts: union('texts', true),
      deleted: [...del].slice(-2000),
    };
  }
  /* ===== Google sign-in shared by petravanta's apps =====
     Canonical copy: https://github.com/petravanta/general/blob/main/shared/google-token.js (see STANDARDS.md, "Staying connected to Google Drive").
     Every app lives on petravanta.github.io and uses the same OAuth client, so a Drive token one app gets works in all of them.
     This keeps that token where every app can see it (localStorage key petravanta.google), one per Google account, so
     reconnecting in one app reconnects them all, and an app only ever uses the token of the account it connected with.
     Google gives a static site no refresh token: a token lasts an hour, and getting a new one opens Google's window,
     which browsers only allow right after a tap. With the account's email as a hint, that window closes by itself. */
  const GoogleToken=(()=>{
    const KEY='petravanta.google', SCOPE='https://www.googleapis.com/auth/drive.file';
    const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{}}catch(e){return {}}};
    const write=v=>{try{localStorage.setItem(KEY,JSON.stringify(v))}catch(e){}};
    const subs=[];
    // Another tab or app on this site got a token: let this one pick it up without a tap
    window.addEventListener('storage',e=>{if(e.key===KEY) subs.forEach(f=>{try{f()}catch(_){}})});
    function gis(){return new Promise((res,rej)=>{
      if(window.google&&google.accounts&&google.accounts.oauth2) return res();
      const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.onload=res; s.onerror=()=>rej({code:'offline'}); document.head.appendChild(s)})}
    // A token for this account with time left on it, or null
    function get(email){const t=email&&(read().tokens||{})[email]; return t&&t.exp>Date.now()?t:null}
    // o: {clientId, hint:'email to suggest', prompt:'' | 'select_account' | 'consent'}. Call from a tap. Resolves {token, exp, email}.
    function request(o){return new Promise(async(res,rej)=>{
      try{await gis()}catch(e){return rej(e)}
      google.accounts.oauth2.initTokenClient({client_id:o.clientId,scope:SCOPE,login_hint:o.hint||undefined,error_callback:rej,
        callback:async r=>{
          if(r.error) return rej(r);
          const t={token:r.access_token,exp:Date.now()+(Number(r.expires_in||3600)-60)*1000};
          // Which account it is, so the token is filed under the right one
          let email='';
          try{const j=await (await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{headers:{Authorization:'Bearer '+t.token}})).json(); email=(j.user&&j.user.emailAddress)||''}catch(e){}
          if(!email) email=o.hint||'';
          if(email){
            const v=read(), now=Date.now(); v.tokens=v.tokens||{};
            for(const k in v.tokens) if(!(v.tokens[k].exp>now)) delete v.tokens[k];
            v.tokens[email]=t; v.last=email; write(v);
          }
          res({...t,email});
        }
      }).requestAccessToken({prompt:o.prompt||''});
    })}
    // Signing out on this browser. Google's permission stays, since the other apps and devices still use it.
    function forget(email){const v=read(); if(v.tokens&&email) delete v.tokens[email]; write(v)}
    return {get,request,forget,gis,onChange:f=>subs.push(f),get lastEmail(){return read().last||''}};
  })();
  /* ===== end Google sign-in ===== */
  /* ===== Drive store: petravanta's apps =====
     Canonical copy: https://github.com/petravanta/general/blob/main/shared/drive-store.js (see STANDARDS.md, "Data lives in Google Drive").
     Needs GoogleToken (shared/google-token.js) inlined above it.
     Keeps an app's data in one JSON file in the user's Google Drive (drive.file scope: the app only sees files it created).
     The browser keeps a copy of the last data, so the app opens straight away even when the hour-long Google sign-in has run out,
     and changes that haven't reached Drive yet (for example while offline). The first tap after that reconnects, merges with
     Drive's copy and saves. */
  function DriveStore(o){
    // o: {clientId, file:'App data.json', app:'app-id', key:'localStorage prefix', empty:()=>data, merge:(remote,local)=>data,
    //     onChange:()=>{}, onRemote:data=>{} (Drive's copy changed what the app shows)}
    const API='https://www.googleapis.com';
    const get=k=>{try{return JSON.parse(localStorage.getItem(o.key+'.'+k)||'null')}catch(e){return null}};
    const put=(k,v)=>{try{v==null?localStorage.removeItem(o.key+'.'+k):localStorage.setItem(o.key+'.'+k,JSON.stringify(v));return true}catch(e){return false}};
    const S={token:null,exp:0,email:get('email')||'',fileId:get('file'),known:!!get('known'),data:null,stale:false,busy:false,err:null,last:null,timer:null,ask:0};
    // The app's own token from before tokens were shared; good until it runs out
    const t=get('token'); if(t&&t.exp>Date.now()){S.token=t.token;S.exp=t.exp} put('token',null);
    if(S.known){const c=get('copy')||get('pending'); if(c){S.data=c; S.stale=true}}
    // Load Google's script now: if it only starts loading on the tap, the browser may block its window
    if(o.clientId&&S.known) GoogleToken.gis().catch(()=>{});
    const live=()=>{
      const g=GoogleToken.get(S.email); if(g&&g.exp>S.exp){S.token=g.token;S.exp=g.exp}
      return !!S.token&&Date.now()<S.exp;
    };
    const note=()=>{try{o.onChange&&o.onChange()}catch(e){}};
    // Opens Google's window, so call this from a tap. For an account that already agreed, the window closes by itself.
    // A first connect suggests the account the other apps use; after that, the account this app connected with.
    async function signIn(){
      const r=await GoogleToken.request({clientId:o.clientId,hint:S.email||(S.known?'':GoogleToken.lastEmail),prompt:S.known||GoogleToken.lastEmail?'':'consent'});
      S.token=r.token; S.exp=r.exp; S.known=true; put('known',true);
      if(r.email&&r.email!==S.email){S.email=r.email; put('email',r.email)}
    }
    async function call(path,opt={}){
      if(!live()) throw {code:'expired'};
      let r; try{r=await fetch(API+path,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+S.token}})}catch(e){throw {code:'offline'}}
      if(r.status===401){S.token=null; S.exp=0; GoogleToken.forget(S.email); throw {code:'expired'}}
      if(!r.ok) throw {code:'http',status:r.status};
      return r;
    }
    async function find(){
      if(S.fileId){try{const j=await (await call(`/drive/v3/files/${S.fileId}?fields=id,trashed`)).json(); if(!j.trashed) return S.fileId}catch(e){if(e.code!=='http') throw e}}
      const q=encodeURIComponent(`name='${o.file.replace(/'/g,"\\'")}' and trashed=false`);
      const j=await (await call(`/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id)`)).json();
      S.fileId=j.files&&j.files[0]?j.files[0].id:null; put('file',S.fileId); return S.fileId;
    }
    async function read(){const id=await find(); return id?(await call(`/drive/v3/files/${id}?alt=media`)).json():null}
    async function write(data){
      const body=JSON.stringify({app:o.app,saved:new Date().toISOString(),...data}), id=await find();
      if(id){await call(`/upload/drive/v3/files/${id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});return}
      const b='b'+Math.random().toString(36).slice(2), meta=JSON.stringify({name:o.file,mimeType:'application/json'});
      const j=await (await call('/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},
        body:`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`})).json();
      S.fileId=j.id; put('file',j.id);
    }
    // Data opened from this browser's copy may be behind Drive's: merge Drive's in before writing over it
    async function catchUp(){
      if(!S.stale) return;
      const remote=await read(); S.stale=false;
      if(!remote) return;
      const before=JSON.stringify(S.data); S.data=o.merge(remote,S.data); put('copy',S.data);
      if(JSON.stringify(S.data)!==before) try{o.onRemote&&o.onRemote(S.data)}catch(e){}
    }
    async function flush(){
      clearTimeout(S.timer); if(!S.data||S.busy) return;
      if(!live()){note();return}
      S.busy=true; note();
      try{await catchUp(); await write(S.data); S.err=null; S.last=new Date(); put('pending',null)}
      catch(e){S.err=e.code==='expired'?null:e.code==='offline'?'offline':'error'}
      finally{S.busy=false; note()}
    }
    // Load: Drive's copy, merged with any changes this browser hadn't saved yet. Creates the file on first use.
    async function load(interactive){
      if(!live()){ if(!interactive) throw {code:'expired'}; await signIn() }
      S.busy=true; note();
      const pending=get('pending');
      try{
        const remote=await read();
        let data=remote?o.merge(remote,o.empty()):o.empty();
        if(pending) data=o.merge(pending,data);
        S.data=data; S.stale=false; S.err=null; S.last=new Date(); put('copy',data);
        if(!remote||pending){await write(data); put('pending',null)}
        return data;
      }catch(e){
        // offline with unsaved changes: carry on from them; they go to Drive once the connection is back
        if(e.code==='offline'&&pending){S.data=o.merge(pending,o.empty()); S.stale=true; S.err='offline'; return S.data}
        S.err=e.code==='offline'?'offline':e.code==='expired'?null:'error'; throw e;
      }finally{S.busy=false; note()}
    }
    // Pick up changes made on another device
    async function refresh(){
      if(!live()||S.busy||!S.data) return false;
      try{const r=await read(); if(!r) return false; const before=JSON.stringify(S.data); S.data=o.merge(r,S.data); S.stale=false; put('copy',S.data); return JSON.stringify(S.data)!==before}
      catch(e){return false}
    }
    function save(data){S.data=data; put('copy',data); if(!put('pending',data)) {/* storage full or blocked: Drive still gets it */} clearTimeout(S.timer); S.timer=setTimeout(flush,1500); note()}
    function signOut(){
      GoogleToken.forget(S.email);
      S.token=null; S.exp=0; S.data=null; S.stale=false; S.email=''; ['known','file','pending','copy','email'].forEach(k=>put(k,null)); S.known=false; note();
    }
    // Tokens last an hour. Renew on a tap when it is close to running out or gone, then save anything waiting.
    document.addEventListener('click',e=>{
      if(!o.clientId||!S.known||e.target.closest('[data-drive]')) return;
      live(); if(S.exp-Date.now()>10*60000||Date.now()-S.ask<60000) return;
      S.ask=Date.now(); signIn().then(flush).catch(()=>note());
    },true);
    // Another app or tab reconnected this account: carry on with its token
    GoogleToken.onChange(()=>{if(S.known&&S.data&&live()) flush(); else note()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') flush()});
    window.addEventListener('online',()=>flush());
    function status(){
      if(!S.data) return '';
      if(S.busy) return 'Saving to Google Drive…';
      const waiting=!!get('pending');
      if(S.err==='offline') return 'Offline · changes save to Drive when you’re back online';
      if(S.err) return 'Couldn’t reach Google Drive · will retry';
      if(!live()) return waiting?'Tap anywhere to save to Google Drive':'Tap anywhere to reconnect Google Drive';
      if(waiting) return 'Saving to Google Drive…';
      return 'Saved to Google Drive'+(S.last?' · '+S.last.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'');
    }
    return {load,save,flush,refresh,signIn,signOut,status,live,
      get data(){return S.data}, get known(){return S.known}, get configured(){return !!o.clientId}, get file(){return o.file},
      get needsTap(){return !!S.data&&!live()}};
  }
  /* ===== end Drive store ===== */

  // Data: the one copy the app reads and writes. 'drive' once Drive is connected, else 'browser'.
  const LOCAL_KEY = 'vt.local';
  const Data = {
    d: emptyData(), where: 'browser', busy: false, err: '',
    store: null,
    init() {
      this.store = DriveStore({ clientId: GOOGLE_CLIENT_ID, file: 'VoiceTrainer data.json', app: 'voicetrainer', key: 'vt',
        empty: emptyData, merge: mergeData, onChange: () => this.paintStatus(),
        onRemote: d => { if (this.where === 'drive') { this.d = d; onDataChanged(); } } });
      let local = null;
      try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) {}
      this.d = mergeData(local || this.migrate(), emptyData());
      // Drive sign-ins last about an hour. After that, open with this browser's copy; the first tap reconnects and catches up with Drive
      if (this.store.configured && this.store.live()) this.connect(false);
      else if (this.store.configured && this.store.data) { this.d = mergeData(this.store.data, emptyData()); this.where = 'drive'; }
      this.paintStatus();
    },
    // Earlier versions kept your own texts and the goal in this browser; progress starts fresh (petravanta, 2026-10-16)
    migrate() {
      const d = emptyData();
      try { d.texts = JSON.parse(localStorage.getItem('voicetrainer.texts.v1') || '[]').map(t => Object.assign({ upd: '' }, t)); } catch (e) {}
      try { const g = localStorage.getItem('voicetrainer.goal'); if (g) d.settings.goal = g; } catch (e) {}
      return d;
    },
    async connect(interactive) {
      if (!this.store.configured) return;
      this.busy = true; this.err = ''; this.paintStatus();
      try {
        const remote = await this.store.load(interactive);
        this.d = mergeData(remote, this.d);
        this.where = 'drive';
        this.store.save(this.d);
        try { localStorage.removeItem(LOCAL_KEY); } catch (e) {}
        onDataChanged();
      } catch (e) {
        this.err = e && (e.code === 'expired' || e.type === 'popup_closed' || e.type === 'popup_failed_to_open' || e.error) ? '' : 'Couldn’t reach Google Drive. Check your connection and try again.';
      } finally { this.busy = false; this.paintStatus(); }
    },
    signOut() {
      // keep a browser copy so nothing disappears from this screen; Drive keeps its own copy
      this.store.signOut(); this.where = 'browser'; this.persist(); this.paintStatus();
    },
    persist() {
      if (this.where === 'drive') this.store.save(this.d);
      else { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.d)); } catch (e) {} }
      this.paintStatus();
    },
    add(list, rec) { this.d[list].push(rec); this.persist(); },
    remove(list, id) { this.d[list] = this.d[list].filter(r => r.id !== id); this.d.deleted.push(id); this.persist(); },
    setting(k, v) {
      if (v === undefined) return this.d.settings[k];
      this.d.settings = Object.assign({}, this.d.settings, { [k]: v, upd: new Date().toISOString() });
      this.persist();
    },
    statusText() {
      if (this.busy) return 'Connecting to Google Drive…';
      if (this.where === 'drive') return this.store.status();
      return this.store.configured ? 'Saved in this browser' : 'Saved in this browser';
    },
    paintStatus() {
      const s = $('save-state'); if (s) s.textContent = this.statusText();
      const b = $('drive-resume'); if (b) b.hidden = !(this.where === 'drive' && this.store.needsTap);
      paintDrive();
    },
  };
  function paintDrive() {
    const p = $('drive-panel'), h = $('home-drive'); if (!p || !Data.store) return;
    const st = Data.store;
    let html;
    if (!st.configured) html = `<p class="vd-note">This copy saves your readings and practice in this browser only. Open VoiceTrainer at petravanta.github.io/voicetrainer to keep them in your Google Drive.</p>`;
    else if (Data.where !== 'drive') html = `<p class="vd-note">VoiceTrainer can keep your readings, practice history, settings and texts in one file in your own Google Drive, so they follow you to any device. It can only see the file it creates. Until then they are saved in this browser.</p>
      ${Data.err ? `<p class="vd-note">${Data.err}</p>` : ''}
      <div class="btn-row"><button type="button" class="btn primary" data-act="drive-connect" data-drive="1">${st.known ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button></div>`;
    else html = `<p class="vd-note">${st.status()}. Everything is saved to <b>${st.file}</b> in your Drive a moment after each change.</p>
      <div class="btn-row"><button type="button" class="btn sm" data-act="drive-save" data-drive="1">Save now</button><button type="button" class="btn sm ghost" data-act="drive-signout" data-drive="1">Sign out of Google Drive</button></div>`;
    p.innerHTML = html + `<p class="vd-note">${PRIVACY}</p>`;
    if (h) {
      const show = st.configured && Data.where !== 'drive';
      h.hidden = !show;
      if (show) h.innerHTML = `<p>${st.known ? 'Your Google Drive sign-in has expired. Reconnect to keep saving there.' : 'Keep your readings and practice history in your own Google Drive, so they follow you to any device.'}</p>
        <button type="button" class="btn primary" data-act="drive-connect" data-drive="1">${st.known ? 'Reconnect' : 'Connect Google Drive'}</button>`;
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'drive-connect') Data.connect(true);
    else if (a === 'drive-save') Data.store.flush();
    else if (a === 'drive-signout') {
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Sign out: tap again'; return; }
      Data.signOut();
    }
  });
  // another device may have added readings: pick them up when the app comes back to the front
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || Data.where !== 'drive') return;
    if (await Data.store.refresh()) { Data.d = Data.store.data; onDataChanged(); }
  });
  function onDataChanged() {
    applyTheme(themeChoice());
    const g = Data.setting('goal'); if (g && g !== state.goal) setGoal(g, true);
    renderPitchTarget();
    Texts.sync();
    renderReadings(); renderPracticeHistory(); renderDrillGrid(); renderHome();
  }

  // ---------------- theme ----------------
  // A choice made on this device (in any of petravanta's apps) wins over the one saved in Drive
  function themeChoice() {
    let t = null;
    try { t = localStorage.getItem('petravanta.theme'); } catch (e) {}
    return t === 'system' || t === 'light' || t === 'dark' ? t : Data.setting('theme') || 'system';
  }
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    for (const k of ['system', 'light', 'dark']) { const b = $('theme-' + k); if (b) b.setAttribute('aria-checked', String(k === t)); }
    // The key is shared by all of petravanta's apps; the head snippet applies it before Drive loads on the next visit
    try { localStorage.setItem('petravanta.theme', t); } catch (e) {}
  }

  // ---------------- practice history ----------------
  const unitOf = (kind) => (kind === 'prosody' ? ' st' : kind === 'control' ? '' : '');
  function recordPractice(entry) {
    if (!entry) return;
    Data.add('practice', { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date(entry.at || Date.now()).toISOString(), goal: state.goal, drill: entry.id, label: entry.label, kind: entry.kind || 'sound', score: entry.score });
    renderPracticeHistory(); renderHome();
  }
  const practiceFor = (id) => Data.d.practice.filter(p => p.drill === id && p.goal === state.goal);
  function sparkline(vals, lo, hi) {
    if (vals.length < 2) return '';
    const w = 72, h = 20, n = vals.length, mn = Math.min(lo, ...vals), mx = Math.max(hi, ...vals), span = mx - mn || 1;
    const pts = vals.map((v, i) => `${(i / (n - 1) * (w - 4) + 2).toFixed(1)},${(h - 2 - (v - mn) / span * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }
  function renderPracticeHistory() {
    const ul = $('pr-list'); if (!ul) return;
    const by = new Map();
    for (const p of Data.d.practice) if (p.goal === state.goal) { if (!by.has(p.drill)) by.set(p.drill, []); by.get(p.drill).push(p); }
    $('pr-hist-empty').hidden = by.size > 0;
    $('pr-hist-note').textContent = by.size ? `${state.goal === 'fem' ? 'Feminine' : 'Masculine'} goal` : '';
    const rows = [...by.entries()].sort((a, b) => (a[1].at(-1).at < b[1].at(-1).at ? 1 : -1));
    ul.innerHTML = '';
    for (const [id, list] of rows) {
      const def = drillById(id), vals = list.map(p => p.score).filter(Number.isFinite);
      const kind = list[0].kind, u = unitOf(kind), f = (v) => (kind === 'prosody' ? v.toFixed(1) : Math.round(v)) + u;
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="pr-name"></button><span class="pr-n">${list.length}×</span><span class="pr-last">last ${vals.length ? f(vals.at(-1)) : '--'}</span><span class="pr-best">best ${vals.length ? f(Math.max(...vals)) : '--'}</span>${kind === 'sound' ? sparkline(vals.slice(-20), 0, 100) : sparkline(vals.slice(-20), Math.min(...vals), Math.max(...vals))}`;
      const nb = li.querySelector('.pr-name'); nb.textContent = def ? def.cue : list[0].label;
      nb.addEventListener('click', () => { if (def) openDrill(def); });
      ul.appendChild(li);
    }
  }
  function drillById(id) { for (const [tab, list] of Object.entries(DRILLS)) { const d = list.find(x => x.id === id); if (d) return Object.assign(d, { tab }); } return null; }
  function openDrill(def) {
    const t = drillById(def.id); if (t) state.tab = t.tab;
    setMode('practice');
    selectDrill(def);
    setTimeout(() => $('drill-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ---------------- readings ----------------
  const Run = { on: false, text: null, maxIdx: 0, start: 0, frames: [] };
  function startReading(id) {
    Reader.show();
    Reader.pick(id);
    Reader.setFull(true);
    beginRun();
  }
  function beginRun() {
    const t = Reader.current; if (!t) return;
    Run.on = true; Run.text = t; Run.maxIdx = 0; Run.start = Date.now(); Run.frames = [];
    session = newSession();
    $('reader').classList.add('run');
    $('reader-finish').hidden = false;
    Reader.restart();
    if (state.running !== 'mic') startMic();
  }
  function endRun() {
    Run.on = false; Run.frames = [];
    $('reader').classList.remove('run');
    $('reader-finish').hidden = true;
  }
  function finishReading() {
    if (!Run.on) return;
    const t = Run.text, st = sessionStats(session);
    const cover = Reader.words.length ? clamp((Run.maxIdx + 1) / Reader.words.length, 0, 1) : 0;
    const round = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
    const rec = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      at: new Date().toISOString(), goal: state.goal, text: t.id, title: t.title,
      cover: Math.round(cover * 100), partial: cover < 0.7, seconds: Math.round((Date.now() - Run.start) / 1000),
      resonance: round(st.resonance),
      vowels: Object.fromEntries(Object.entries(st.vowels).map(([k, v]) => [k, round(v.score)])),
      sibS: st.sib.s ? round(st.sib.s.score) : null, sibSh: st.sib.sh ? round(st.sib.sh.score) : null,
      pitchMedian: st.pitch ? Math.round(st.pitch.median) : null, pitchP10: st.pitch ? Math.round(st.pitch.p10) : null, pitchP90: st.pitch ? Math.round(st.pitch.p90) : null,
      breath: round(st.breath),
      // word by word: [word, pitch Hz, resonance, sibilant score], for the report after the reading
      byWord: D.wordReport(Run.frames, Reader.words.length).map((w, i) => [Reader.words[i].text, w.p != null ? Math.round(w.p) : null, round(w.r), round(w.s)]),
    };
    endRun();
    Reader.hide();
    if (state.running === 'mic') stop();
    if (rec.resonance == null && rec.sibS == null) {
      showReadingResult(null, 'Not enough voice was heard to score that reading, so nothing was saved. Check that the microphone is on and read a little louder.');
    } else {
      Data.add('readings', rec);
      // the weakest sounds become suggested exercises in Practice
      const steps = buildPlan(st);
      if (steps.length) { state.plan = { status: 'offer', source: 'reading', steps, idx: 0 }; renderPlan(); }
      showReadingResult(rec);
    }
    session = newSession(); resetSessionViews();
    renderReadings(); renderHome();
    $('rd-hist-pick').value = t.id; renderReadingHistory();
  }
  function cancelRun() { if (Run.on) { endRun(); session = newSession(); resetSessionViews(); } }
  const fullReadings = (id) => Data.d.readings.filter(r => r.text === id && r.goal === state.goal && !r.partial);
  function showReadingResult(rec, msg) {
    const box = $('rd-result'); box.hidden = false; box.rec = rec;
    if (!rec) { box.innerHTML = `<p>${msg}</p><div class="btn-row"><button type="button" class="btn sm" id="rd-close">Close</button></div>`; $('rd-close').onclick = () => { box.hidden = true; }; return; }
    const prev = fullReadings(rec.text).filter(r => r.id !== rec.id && r.at < rec.at);
    const last = prev.at(-1), best = prev.reduce((m, r) => (r.resonance != null && (m == null || better(r.resonance, m)) ? r.resonance : m), null);
    const delta = (v, o) => (v == null || o == null ? '' : `<small class="${better(v, o) ? 'up' : v === o ? '' : 'down'}">${v - o > 0 ? '+' : ''}${Math.round(v - o)} vs last</small>`);
    const [lo, hi] = target();
    const weak = Object.entries(rec.vowels || {}).filter(([, s]) => Math.round(s) < lo || Math.round(s) > hi).sort((a, b) => gapOf(b[1]) - gapOf(a[1])).slice(0, 3);
    const stat = (label, v, extra = '') => `<div class="stat"><b>${v}</b><span>${label}</span>${extra}</div>`;
    box.innerHTML = `<div class="section-head"><h3>${escapeHtml(rec.title)}</h3><span class="muted small">${rec.partial ? `Partial reading (${rec.cover}% read), kept out of the trend` : `${rec.cover}% read in ${Math.round(rec.seconds / 6) / 10} min`}</span></div>
      <div class="stats">
        ${stat('Resonance', rec.resonance != null ? Math.round(rec.resonance) : '--', delta(rec.resonance, last && last.resonance))}
        ${stat('/s/ brightness', rec.sibS != null ? Math.round(rec.sibS) : '--', delta(rec.sibS, last && last.sibS))}
        ${stat('Pitch', rec.pitchMedian != null ? rec.pitchMedian + ' Hz' : '--', `${rec.pitchP10 != null ? `<small>${rec.pitchP10}-${rec.pitchP90} Hz</small>` : ''}<small>target ${pitchBand().join('-')} Hz</small>`)}
        ${stat('Breathiness', rec.breath != null ? Math.round(rec.breath) : '--', rec.breath != null ? `<small>${breathWord(rec.breath)}</small>` : '')}
      </div>
      <p class="small muted">${rec.partial ? 'Read at least 70% of the passage for a reading to count in the trend.' : best != null ? (better(rec.resonance, best) || rec.resonance === best ? 'Your best resonance on this passage so far.' : `Your best on this passage is ${Math.round(best)}.`) : 'Your first full reading of this passage. Read it again another day to see the trend.'}</p>
      ${weak.length ? `<p class="small"><b>Furthest from your target:</b> ${weak.map(([k, s]) => `<button type="button" class="chip" data-weak="${k}">${D.VOWEL_BY_KEY[k].cue.split(' ')[0]} ${Math.round(s)}</button>`).join(' ')} <span class="muted">Tap one to practise it.</span></p>` : ''}
      ${wordReportHtml(rec)}
      <div class="btn-row"><button type="button" class="btn sm" id="rd-again">Read it again</button><button type="button" class="btn sm ghost" id="rd-discard">Discard this reading</button><button type="button" class="btn sm ghost" id="rd-close">Close</button></div>`;
    wireWordReport(box, rec);
    box.querySelectorAll('[data-weak]').forEach(b => b.addEventListener('click', () => { const def = DRILLS.vowels.find(d => d.vowel === b.dataset.weak); if (def) openDrill(def); }));
    $('rd-again').onclick = () => { box.hidden = true; startReading(rec.text); };
    $('rd-close').onclick = () => { box.hidden = true; };
    $('rd-discard').onclick = (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Discard: tap again'; return; }
      Data.remove('readings', rec.id); box.hidden = true; renderReadings(); renderHome();
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // ---- word by word: pitch and resonance under each word of the passage ----
  // The highlight follows the voice by counting syllables, so a word's numbers can spill into its neighbours.
  function wordReportHtml(rec) {
    const ws = rec.byWord;
    if (!ws || !ws.some(w => w[1] != null || w[2] != null)) return '';
    const [lo, hi] = target(), [plo, phi] = pitchBand();
    const resOff = (r) => r != null && (Math.round(r) < lo || Math.round(r) > hi);
    // pitch is off when it is on the far side of the goal band (above the band is fine for a feminine goal)
    const pitchOff = (p) => p != null && (state.goal === 'fem' ? p < plo : p > phi);
    // one slot per word, wide enough for its label
    const xs = [], wd = []; let acc = 6;
    for (const w of ws) { const sw = Math.max(30, w[0].length * 7.4 + 12); xs.push(acc + sw / 2); wd.push(sw); acc += sw; }
    const W = Math.ceil(acc + 6);
    const ps = ws.map(w => w[1]).filter(v => v != null);
    // octave slips can throw a word far off, so the scale follows most words and the rest sit on its edge
    const pmin = Math.max(50, Math.min(plo, D.quantile(ps, 0.05)) - 15), pmax = Math.max(phi, D.quantile(ps, 0.95)) + 15;
    const PT = 22, PH = 84, RT = PT + PH + 30, RH = 70, LT = RT + RH + 18, H = LT + 8;
    const py = (v) => PT + (1 - (clamp(v, pmin, pmax) - pmin) / (pmax - pmin)) * PH, ry = (v) => RT + (1 - clamp(v, 0, 100) / 100) * RH;
    const f1 = (v) => v.toFixed(1);
    let svg = `<rect class="wr-band" x="0" y="${f1(py(phi))}" width="${W}" height="${f1(py(plo) - py(phi))}"/>`
      + `<rect class="wr-band" x="0" y="${f1(ry(hi))}" width="${W}" height="${f1(ry(lo) - ry(hi))}"/>`
      + `<line class="wr-axis" x1="0" x2="${W}" y1="${RT + RH}" y2="${RT + RH}"/>`;
    // phrase highlights, shown when a stretch below is picked
    const phrases = D.readingPhrases(ws.map(w => w[0]), ws.map(w => ({ p: w[1], r: w[2] })));
    phrases.forEach((ph, k) => { svg += `<rect class="wr-hl" data-ph="${k}" x="${f1(xs[ph.a] - wd[ph.a] / 2)}" y="2" width="${f1(xs[ph.b] + wd[ph.b] / 2 - xs[ph.a] + wd[ph.a] / 2)}" height="${H - 4}" rx="6"/>`; });
    // pitch line, broken where no pitch was heard
    let run = [];
    const flush = () => { if (run.length > 1) svg += `<polyline class="wr-pline" points="${run.join(' ')}"/>`; run = []; };
    ws.forEach((w, i) => { if (w[1] != null) run.push(`${f1(xs[i])},${f1(py(w[1]))}`); else flush(); });
    flush();
    ws.forEach(([t, p, r], i) => {
      const tip = `${t}: ${p != null ? p + ' Hz' : 'no pitch'}, ${r != null ? 'resonance ' + Math.round(r) : 'no vowel scored'}`;
      svg += `<g class="wr-w" data-i="${i}" tabindex="0" role="button" aria-label="${escapeHtml(tip)}"><title>${escapeHtml(tip)}</title>`
        + `<rect class="wr-hit" x="${f1(xs[i] - wd[i] / 2)}" y="0" width="${f1(wd[i])}" height="${H}"/>`
        + (p != null ? `<circle class="wr-dot${pitchOff(p) ? ' off' : ''}" cx="${f1(xs[i])}" cy="${f1(py(p))}" r="3.5"/>` : '')
        + (r != null ? `<rect class="wr-bar${resOff(r) ? ' off' : ''}" x="${f1(xs[i] - 6)}" y="${f1(ry(r))}" width="12" height="${f1(Math.max(1.5, RT + RH - ry(r)))}" rx="2"/>` : '')
        + `<text class="wr-word${resOff(r) ? ' off' : ''}" x="${f1(xs[i])}" y="${LT}" text-anchor="middle">${escapeHtml(t)}</text></g>`;
    });
    svg += `<text class="wr-lane" x="6" y="${PT - 8}">Pitch, goal ${plo}-${phi} Hz</text><text class="wr-lane" x="6" y="${RT - 8}">Resonance, goal ${lo}-${hi}</text>`;
    // the stretches furthest from the goal
    const quote = (ph) => escapeHtml(ws.slice(ph.a, ph.b + 1).map(w => w[0]).join(' ').replace(/[.,;:!?]+$/, ''));
    const weakRes = phrases.map((ph, k) => ({ ph, k, gap: ph.nr >= 2 ? gapOf(ph.r) : -1 })).filter(x => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3);
    const pGap = (p) => (p == null ? -1 : state.goal === 'fem' ? plo - p : p - phi);
    const weakP = phrases.map((ph, k) => ({ ph, k, gap: pGap(ph.p) })).filter(x => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 2);
    const item = (x, what) => `<li><button type="button" class="wr-jump" data-ph="${x.k}">“${quote(x.ph)}”</button> <span class="muted">${what}</span></li>`;
    const list = weakRes.map(x => item(x, `resonance ${Math.round(x.ph.r)}`)).concat(weakP.map(x => item(x, `pitch ${Math.round(x.ph.p)} Hz`)));
    return `<div class="wr"><div class="section-head"><h4>Word by word</h4><span class="muted small"><span class="wr-key off"></span>off your goal</span></div>
      ${list.length ? `<p class="small"><b>Stretches furthest from your goal</b> (tap one to find it):</p><ul class="wr-list small">${list.join('')}</ul>` : '<p class="small">Every phrase was on your goal for resonance and pitch.</p>'}
      <p class="small muted">Top line: pitch of each word (goal ${plo}-${phi} Hz). Bars: resonance of each word (goal ${lo}-${hi}). The shaded bands are your goal.</p>
      <div class="wr-scroll"><svg class="wr-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="Pitch and resonance for each word of the passage">${svg}</svg></div>
      <p class="small" id="wr-read" aria-live="polite">Tap a word for its numbers.</p>
      <p class="small muted">The highlight follows your voice by counting syllables, so a word's numbers can spill a little into its neighbours. Only steady vowels get a resonance score, so short words often have none.</p></div>`;
  }
  function wireWordReport(box, rec) {
    const svg = box.querySelector('.wr-svg'); if (!svg) return;
    const scroll = box.querySelector('.wr-scroll'), read = box.querySelector('#wr-read');
    const pick = (g) => {
      svg.querySelectorAll('.wr-w.sel').forEach(x => x.classList.remove('sel'));
      g.classList.add('sel');
      const [t, p, r, s] = rec.byWord[+g.dataset.i];
      read.innerHTML = `<b>${escapeHtml(t)}</b>: pitch ${p != null ? p + ' Hz' : '--'} · resonance ${r != null ? Math.round(r) : '--'}${s != null ? ` · /s/ ${Math.round(s)}` : ''}`;
    };
    svg.querySelectorAll('.wr-w').forEach(g => {
      g.addEventListener('click', () => pick(g));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g); } });
    });
    box.querySelectorAll('.wr-jump').forEach(b => b.addEventListener('click', () => {
      svg.querySelectorAll('.wr-hl.on').forEach(x => x.classList.remove('on'));
      const hl = svg.querySelector(`.wr-hl[data-ph="${b.dataset.ph}"]`); if (!hl) return;
      hl.classList.add('on');
      scroll.scrollTo({ left: Math.max(0, +hl.getAttribute('x') - 24), behavior: 'smooth' });
      scroll.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  }
  // a higher score is better for the feminine goal and a lower one for the masculine goal
  const better = (a, b) => (state.goal === 'fem' ? a > b : a < b);
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function renderReadings() {
    const ul = $('rd-library'); if (!ul) return;
    ul.innerHTML = '';
    for (const t of Texts.all()) {
      const list = fullReadings(t.id), last = list.at(-1);
      const li = document.createElement('li');
      li.className = 'rd-item';
      li.innerHTML = `<div class="rd-text"><b></b><span class="small muted"></span></div><div class="rd-actions"><button type="button" class="btn primary sm">Read</button></div>`;
      li.querySelector('b').textContent = t.title;
      li.querySelector('.small').textContent = list.length ? `${list.length} reading${list.length > 1 ? 's' : ''} · last ${last.resonance != null ? Math.round(last.resonance) : '--'} on ${new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : `${t.body.split(/\s+/).length} words · not read yet`;
      li.querySelector('.btn').addEventListener('click', () => startReading(t.id));
      if (t.id.startsWith('u-')) {
        const e = document.createElement('button'); e.type = 'button'; e.className = 'btn sm ghost'; e.textContent = 'Edit';
        e.addEventListener('click', () => { Reader.show(); Reader.setFull(true); Reader.editForm(Texts.user.find(x => x.id === t.id)); });
        li.querySelector('.rd-actions').appendChild(e);
      }
      ul.appendChild(li);
    }
    const pick = $('rd-hist-pick'), cur = pick.value;
    pick.innerHTML = '';
    const readIds = new Set(Data.d.readings.filter(r => r.goal === state.goal).map(r => r.text));
    for (const t of Texts.all().filter(x => readIds.has(x.id))) { const o = document.createElement('option'); o.value = t.id; o.textContent = t.title; pick.appendChild(o); }
    pick.hidden = !pick.options.length;
    if ([...pick.options].some(o => o.value === cur)) pick.value = cur;
    else { const last = Data.d.readings.filter(r => r.goal === state.goal).at(-1); if (last && readIds.has(last.text)) pick.value = last.text; }
    renderReadingHistory();
  }
  function renderReadingHistory() {
    const id = $('rd-hist-pick').value;
    const items = Data.d.readings.filter(r => r.text === id && r.goal === state.goal);
    const full = items.filter(r => !r.partial);
    $('rd-hist-title').textContent = 'History';
    $('rd-hist-empty').hidden = items.length > 0;
    $('rd-hist-empty').textContent = Data.d.readings.length ? 'No readings of this passage yet.' : 'No readings yet. Each reading you finish appears here, with one trend per passage.';
    $('rd-chart-wrap').hidden = full.length < 1;
    $('rd-table-wrap').hidden = !items.length;
    const tb = document.querySelector('#hist-table tbody');
    tb.innerHTML = '';
    for (const r of items.slice().reverse()) {
      const tr = document.createElement('tr');
      const date = new Date(r.at);
      const cells = [date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        r.resonance != null ? Math.round(r.resonance) : '--', r.sibS != null ? Math.round(r.sibS) : '--',
        r.pitchMedian != null ? r.pitchMedian + ' Hz' : '--', r.breath != null ? Math.round(r.breath) : '--', r.cover + '%' + (r.partial ? ' (partial)' : '')];
      cells.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (i >= 1) td.className = 'num'; tr.appendChild(td); });
      const td = document.createElement('td');
      if (r.byWord) {
        const rep = document.createElement('button');
        rep.type = 'button'; rep.textContent = 'Report'; rep.className = 'hist-report';
        rep.addEventListener('click', () => showReadingResult(r));
        td.appendChild(rep);
      }
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if (!del.dataset.confirm) { del.dataset.confirm = '1'; del.textContent = 'Confirm delete'; return; }
        Data.remove('readings', r.id); renderReadings(); renderHome();
      });
      td.appendChild(del); tr.appendChild(td); tb.appendChild(tr);
    }
    drawHistory(full);
  }
  function drawHistory(items) {
    const cv = $('cv-hist'); if (!cv || !C.ink || $('rd-chart-wrap').hidden || !cv.clientWidth) return;
    items = items || Data.d.readings.filter(r => r.text === $('rd-hist-pick').value && r.goal === state.goal && !r.partial);
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height;
    const pad = { l: 36 * dpr, r: 12 * dpr, t: 10 * dpr, b: 26 * dpr };
    g.clearRect(0, 0, w, h);
    const y = (v) => pad.t + (1 - clamp(v, 0, 100) / 100) * (h - pad.t - pad.b);
    const n = items.length, x = (i) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * (w - pad.l - pad.r);
    g.font = `${10 * dpr}px ${C.font}`; g.fillStyle = C.muted; g.strokeStyle = C.line; g.lineWidth = dpr;
    const [lo, hi] = target();
    g.fillStyle = state.goal === 'fem' ? C.fem : C.masc; g.globalAlpha = 0.1;
    g.fillRect(pad.l, y(Math.min(hi, 100)), w - pad.l - pad.r, y(lo) - y(Math.min(hi, 100))); g.globalAlpha = 1;
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

  // ---------------- modes ----------------
  let mode = 'home';
  function setMode(m) {
    if (!['home', 'readings', 'freestyle', 'practice', 'settings'].includes(m)) m = 'home';
    mode = m;
    document.body.dataset.mode = m;
    for (const el of document.querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(m);
    for (const b of document.querySelectorAll('#modes [data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === m));
    if (m !== 'readings' && Reader.open) { cancelRun(); Reader.hide(); }
    if (m === 'home') renderHome();
    if (m === 'settings') { paintDrive(); paintPitchRange(); }
    window.scrollTo(0, 0);
    // canvases in a section that was hidden have no size until now
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    paintDots();
  }
  function renderHome() {
    const r = Data.d.readings.filter(x => x.goal === state.goal && !x.partial), last = r.at(-1);
    const rm = $('home-readings-meta'); if (rm) rm.textContent = last ? `Last: ${escapeTitle(last.title)}, resonance ${last.resonance != null ? Math.round(last.resonance) : '--'}` : 'No readings yet';
    const p = Data.d.practice.filter(x => x.goal === state.goal);
    const pm = $('home-practice-meta'); if (pm) pm.textContent = state.plan && state.plan.status === 'offer' ? `${state.plan.steps.length} exercises suggested by your last reading` : p.length ? `${new Set(p.map(x => x.drill)).size} exercises practised` : 'Start with a vowel';
    const hg = $('home-goal'); if (hg) hg.textContent = state.goal === 'fem' ? 'feminine' : 'masculine';
  }
  const escapeTitle = (s) => (s.length > 40 ? s.slice(0, 38) + '…' : s);
  // Freestyle on a phone: the dials sit side by side and you swipe between them; dots show where you are
  function paintDots() {
    const live = $('live'), dots = $('dial-dots'); if (!live || !dots) return;
    const figs = [...live.children].filter(c => c.tagName === 'FIGURE');
    if (dots.childElementCount !== figs.length) dots.innerHTML = figs.map(() => '<i></i>').join('');
    const i = Math.round(live.scrollLeft / Math.max(1, live.clientWidth));
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }

  // ---------------- wiring ----------------
  function setGoal(goal, fromData) {
    state.goal = goal;
    document.body.dataset.goal = goal;
    $('goal-fem').setAttribute('aria-checked', String(goal === 'fem'));
    $('goal-masc').setAttribute('aria-checked', String(goal === 'masc'));
    document.body.classList.toggle('goal-masc', goal === 'masc');
    if (!fromData && Data.setting('goal') !== goal) Data.setting('goal', goal);
    try { if (!localStorage.getItem(DemoVoice.KEY)) DemoVoice.v = null; } catch (e) {}
    renderMeter(); renderPitchTarget(); drawHistory(); renderSpecGoalHelp(); if (state.coach) { state.coach.key = null; renderCoach(); } if (C.ink) { drawSpecAxis(); drawVowelChart(); renderTractLive(); }
    // an open exercise was set up for the other goal (zones, examples, checker): start it again for this one
    if (state.drill) selectDrill(state.drill.def, true); else renderDrillGrid();
    if (state.plan) renderPlan();
    renderSession(); renderReadings(); renderPracticeHistory(); renderHome();
    const rd = $('rd-result'); if (rd && !rd.hidden && rd.rec && rd.rec.goal !== goal) rd.hidden = true;
  }
  // everything that shows the target pitch band
  function renderPitchTarget() {
    const [lo, hi] = pitchBand();
    $('pitch-band-label').textContent = `target band ${lo} to ${hi} Hz${customBand() ? ' (yours)' : ''}`;
    drawPitch(); paintPitchRange();
    if (Data.d) renderSession();
    const rd = $('rd-result'); if (rd && !rd.hidden && rd.rec) showReadingResult(rd.rec);
  }
  // Settings: your own target pitch range, kept per goal; empty means the goal's typical band
  function paintPitchRange() {
    const lo = $('pr-lo'), hi = $('pr-hi'); if (!lo || !Data.d) return;
    const [d0, d1] = D.PITCH_BANDS[state.goal], [b0, b1] = pitchBand(), own = customBand();
    const goalName = state.goal === 'fem' ? 'feminine' : 'masculine';
    $('pr-note').textContent = `The pitch band on the pitch track, in the session summary and in reading reports. The typical ${goalName} speaking range is ${d0}-${d1} Hz. ${own ? 'You are using your own range for this goal.' : 'Set your own if your voice or your aim differs.'}`;
    if (document.activeElement !== lo) lo.value = b0;
    if (document.activeElement !== hi) hi.value = b1;
    $('pr-reset').disabled = !own;
  }
  function savePitchRange() {
    const lo = Math.round(Number($('pr-lo').value)), hi = Math.round(Number($('pr-hi').value)), msg = $('pr-msg');
    const b = [lo, hi];
    if (!validBand(b)) {
      msg.textContent = `Use whole numbers from ${PITCH_RANGE[0]} to ${PITCH_RANGE[1]} Hz, with "To" at least ${PITCH_MIN_SPAN} Hz above "From".`;
      msg.classList.add('err'); return;
    }
    msg.textContent = ''; msg.classList.remove('err');
    const all = Object.assign({}, Data.setting('pitchRange') || {});
    const [d0, d1] = D.PITCH_BANDS[state.goal];
    if (lo === d0 && hi === d1) delete all[state.goal]; else all[state.goal] = b;
    Data.setting('pitchRange', all);
    renderPitchTarget();
  }
  function resetPitchRange() {
    const all = Object.assign({}, Data.setting('pitchRange') || {});
    delete all[state.goal];
    Data.setting('pitchRange', all);
    const msg = $('pr-msg'); msg.textContent = 'Back to the typical range for this goal.'; msg.classList.remove('err');
    $('pr-lo').blur(); $('pr-hi').blur();
    renderPitchTarget();
  }
  function renderSpecGoalHelp() {
    const fem = state.goal === 'fem';
    $('spec-help-goal').innerHTML = `<b>The small triangles on the left edge are your goal.</b> While you hold a vowel they mark where the jaw, tongue and lips/larynx resonances (F1, F2, F3) sit for a typical ${fem ? 'feminine' : 'masculine'} voice on that vowel. Try to bring each dash level with its triangle. ${fem ? 'Moving the tongue forward, spreading the lips and raising the larynx lifts the upper two dashes and brightens the voice.' : 'More throat space, slight lip rounding and a lower larynx bring the upper two dashes down and darken the voice.'}`;
  }
  // the "?" next to the vocal tract title opens its explanation
  function initTractHelp() {
    const btn = $('tract-info'), help = $('tract-help');
    const setOpen = (open) => { help.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(help.hidden); });
    document.addEventListener('click', (e) => { if (!help.hidden && !help.contains(e.target) && e.target !== btn) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
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
  const BUILTIN_TEXTS = DATA.texts.map(t => ({ id: t.id, title: t.title, body: t.body }));
  const ADD_PRESETS = [
    { id: 'add-own', title: '', note: 'Paste or type anything you want to practise: a script for a phone call, a poem, a paragraph from a book. Blank lines start new paragraphs.' },
  ];
  // Your own texts are part of the saved data (Drive or this browser)
  const Texts = {
    user: [],
    sync() { this.user = Data.d.texts.slice(); if (Reader.open) Reader.fillPicker(); },
    async save() {
      const now = new Date().toISOString(), ids = new Set(this.user.map(t => t.id));
      for (const t of Data.d.texts) if (!ids.has(t.id)) Data.d.deleted.push(t.id);
      const old = new Map(Data.d.texts.map(t => [t.id, t]));
      Data.d.texts = this.user.map(t => { const o = old.get(t.id); return o && o.title === t.title && o.body === t.body ? o : Object.assign({}, t, { upd: now }); });
      Data.persist();
      renderReadings();
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
      if (Run.on) Run.maxIdx = Math.max(Run.maxIdx, i);
      if (!fromVoice) { this.base = this.cum[i] - this.tracker.count; }
      this.paint();
    },
    paint() {
      const els = this.words;
      if (els[this.idx] && (state.running === 'mic' || this.synth || this.tts)) Words.readerWord(this.idx, els);
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
      $('reader-voice-wrap').hidden = list.length < 2;
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
      if (!S || !window.SpeechSynthesisUtterance) { $('rh-hint').textContent = 'This browser has no speech voice to read the text aloud.'; return; }
      // the microphone stays on if it is running, so the meters can follow the voice from the speakers
      S.cancel();
      if (state.running !== 'mic') { $('ro-pitch').textContent = '--'; $('ro-vowel').textContent = '--'; state.meter = NaN; } // no stale readings of your voice
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
      paintVoiceNote();
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
      $('reader-form').hidden = true; $('reader-text').hidden = false; $('reader').classList.remove('editing'); this.fromLibrary = false;
      this.render(t);
      this.fillPicker(id);
      $('reader-edit').hidden = !id.startsWith('u-');
    },
    editForm(existing, preset) {
      this.stopListen();
      $('reader-text').hidden = true; $('reader-form').hidden = false; $('reader-edit').hidden = true;
      // the form replaces the passage, so hide the focus line, live readout and reading controls too
      $('reader').classList.add('editing');
      if (preset) $('reader-pick').value = preset.id;
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
    // Side pane (bottom sheet on narrow screens) or full screen; "Hide pane" tucks it into a tab.
    layout() {
      const r = $('reader'), shown = this.open && !this.collapsed, sheet = sheetUi();
      r.hidden = !shown;
      // phones (and phone view) get a compact panel along the bottom; More shows the rest of the controls
      document.body.classList.toggle('sheet-ui', sheet);
      $('reader-more').hidden = !sheet || !!this.full;
      if (!sheet) this.more(false);
      r.classList.toggle('full', !!this.full);
      $('reader-tab').hidden = !(this.open && this.collapsed);
      document.body.classList.toggle('reading', shown && !this.full);
      document.body.classList.toggle('reading-full', shown && !!this.full);
      // short labels in the compact panel so every button fits on one row
      $('reader-full').textContent = this.full ? (sheet ? 'Panel' : 'Side pane') : sheet ? 'Expand' : 'Full screen';
      $('reader-restart').textContent = sheet ? 'Restart' : 'Back to start';
      $('reader-collapse').textContent = sheet ? 'Hide' : 'Hide pane';
      $('reader-collapse').setAttribute('aria-label', 'Hide reading practice');
      $('reader-close').textContent = sheet ? '✕' : 'Close';
      $('reader-close').setAttribute('aria-label', 'Close reading practice');
      $('reader-full').setAttribute('aria-pressed', String(!!this.full));
      // full screen sits below the audio bar so the main microphone button stays reachable
      if (shown && this.full) document.documentElement.style.setProperty('--sbh', $('sourcebar-wrap').offsetHeight + 'px');
      this.fitSheet();
      Words.sync();
      window.dispatchEvent(new Event('resize')); // charts re-fit to the narrower page
    },
    // the page leaves room at the bottom for the compact panel, so nothing hides behind it
    fitSheet() {
      const r = $('reader'), on = sheetUi() && this.open && !this.collapsed && !this.full;
      document.documentElement.style.setProperty('--rsheet-h', on ? r.offsetHeight + 'px' : '0px');
    },
    more(on) {
      const r = $('reader'); r.classList.toggle('more', on);
      $('reader-more').textContent = on ? 'Less' : 'More';
      $('reader-more').setAttribute('aria-expanded', String(on));
      if (this.open) requestAnimationFrame(() => { this.fitSheet(); this.paintTrack(); });
    },
    setFull(on) { this.full = on; try { localStorage.setItem('voicetrainer.readerfull', on ? '1' : '0'); } catch (e) {} this.layout(); requestAnimationFrame(() => this.paintTrack()); },
    collapse(on) { this.collapsed = on; this.layout(); if (on) $('reader-tab').focus(); else { requestAnimationFrame(() => this.paintTrack()); $('reader-collapse').focus(); } },
    show() {
      if (this.open) { if (this.collapsed) this.collapse(false); return; }
      this.open = true; this.collapsed = false;
      if (sheetUi()) this.full = false; // on a phone it opens as the compact panel; Full screen is one tap away
      this.layout();
      let id = BUILTIN_TEXTS[0].id;
      try { id = localStorage.getItem('voicetrainer.readtext') || id; } catch (e) {}
      if (!Texts.all().some(t => t.id === id)) id = BUILTIN_TEXTS[0].id;
      this.fillPicker(id);
      this.pick(id);
      setMicButton(state.running === 'mic');
      requestAnimationFrame(() => this.paintTrack());
      this.tick();
      $('reader-stage').focus({ preventScroll: true });
    },
    hide() {
      this.stopListen();
      this.open = false;
      this.layout();
    },
    init() {
      let m = 'voice';
      try { m = localStorage.getItem('voicetrainer.readmode') || 'voice'; } catch (e) {}
      let fl = true;
      try { fl = localStorage.getItem('voicetrainer.focusline') !== '0'; } catch (e) {}
      this.setFocusLine(fl);
      $('reader-focus').addEventListener('click', () => this.setFocusLine(!this.focusLine));
      window.addEventListener('resize', () => { if (this.open) this.paintTrack(); });
      $('reader-close').addEventListener('click', () => { cancelRun(); this.hide(); });
      $('reader-finish').addEventListener('click', () => finishReading());
      try { this.full = localStorage.getItem('voicetrainer.readerfull') === '1'; } catch (e) {}
      $('reader-full').addEventListener('click', () => this.setFull(!this.full));
      $('reader-collapse').addEventListener('click', () => this.collapse(true));
      $('reader-more').addEventListener('click', () => this.more(!$('reader').classList.contains('more')));
      if (window.ResizeObserver) new ResizeObserver(() => this.fitSheet()).observe($('reader'));
      const mq = window.matchMedia('(max-width: 860px)');
      (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => this.layout());
      $('reader-tab').addEventListener('click', () => this.collapse(false));
      $('reader-listen').addEventListener('click', () => this.listen());
      if (window.speechSynthesis) {
        this.fillVoices();
        window.speechSynthesis.addEventListener('voiceschanged', () => this.fillVoices());
      } else $('reader-listen').hidden = true;
      $('reader-restart').addEventListener('click', () => this.restart());
      $('reader-pick').addEventListener('change', (e) => { this.pick(e.target.value); if (Run.on) { if (this.current && this.current.id === e.target.value) beginRun(); else cancelRun(); } });
      for (const k of ['voice', 'pace', 'tap']) $('rmode-' + k).addEventListener('click', () => this.setMode(k));
      $('reader-wpm').addEventListener('input', (e) => { $('reader-wpm-out').textContent = e.target.value; });
      const size = (d) => { this.size = clamp(this.size + d, 1.2, 3.6); $('reader-text').style.setProperty('--rsize', this.size + 'rem'); };
      $('reader-smaller').addEventListener('click', () => size(-0.25));
      $('reader-bigger').addEventListener('click', () => size(0.25));
      $('reader-text').addEventListener('click', () => { if (this.mode === 'tap') this.go(this.idx + 1, false); });
      $('reader-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveForm(); });
      $('rf-cancel').addEventListener('click', () => {
        this.editing = null;
        if (this.fromLibrary) { this.fromLibrary = false; cancelRun(); this.hide(); return; }
        this.pick((this.current && this.current.id) || BUILTIN_TEXTS[0].id); });
      $('rf-delete').addEventListener('click', async () => {
        const b = $('rf-delete');
        if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Confirm delete'; return; }
        delete b.dataset.confirm; b.textContent = 'Delete this text';
        Texts.user = Texts.user.filter(t => t !== this.editing); this.editing = null;
        await Texts.save(); this.fillPicker(BUILTIN_TEXTS[0].id); this.pick(BUILTIN_TEXTS[0].id);
        // back to the Readings library, where the text is now gone
        this.fromLibrary = false; cancelRun(); this.hide(); setMode('readings');
      });
      $('reader-edit').addEventListener('click', () => { if (this.current && this.current.id.startsWith('u-')) this.editForm(Texts.user.find(t => t.id === this.current.id)); });
      document.addEventListener('keydown', (e) => {
        if (!this.open || this.collapsed) return;
        // With the pane docked the rest of the app is usable, so keys only steer the reader
        // when focus is in it (or nowhere in particular).
        const inPane = e.target === document.body || e.target.closest('#reader');
        if (!this.full && !inPane) return;
        if (e.key === 'Escape') { if (!$('reader-form').hidden) $('rf-cancel').click(); else if (this.full) this.setFull(false); else this.collapse(true); return; }
        if (e.target.closest('input, textarea, select, button')) return;
        if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); this.go(this.idx + 1, false); }
        else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.idx - 1, false); }
      });
      this.setMode(m === 'pace' || m === 'tap' ? m : 'voice');
    },
  };

  function init() {
    let th = 'system';
    try { th = localStorage.getItem('petravanta.theme') || localStorage.getItem('vt.theme') || 'system'; } catch (e) {}
    applyTheme(th);
    Data.init();
    applyTheme(themeChoice());
    const g = Data.setting('goal') || 'fem';
    $('goal-fem').addEventListener('click', () => setGoal('fem'));
    $('goal-masc').addEventListener('click', () => setGoal('masc'));
    for (const k of ['system', 'light', 'dark']) $('theme-' + k).addEventListener('click', () => { applyTheme(k); Data.setting('theme', k); });
    // The shared theme switch in the header (general/shared/theme-switch.js)
    document.addEventListener('petravanta:themechange', (e) => { applyTheme(e.detail.mode); Data.setting('theme', e.detail.mode); });
    $('settings-voice').addEventListener('click', () => $('btn-demo-set').click());
    $('home-goal').addEventListener('click', () => setMode('settings'));
    for (const id of ['pr-lo', 'pr-hi']) $(id).addEventListener('change', savePitchRange);
    $('pr-reset').addEventListener('click', resetPitchRange);
    $('drive-resume').addEventListener('click', () => Data.connect(true));
    for (const b of document.querySelectorAll('#modes [data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
    for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => setMode(b.dataset.go));
    $('brand-home').addEventListener('click', () => setMode('home'));
    $('rd-hist-pick').addEventListener('change', renderReadingHistory);
    $('rd-add').addEventListener('click', () => { Reader.show(); Reader.setFull(true); Reader.pick('add-own'); Reader.fromLibrary = true; });
    $('live').addEventListener('scroll', () => paintDots(), { passive: true });
    // on a phone the drill panel opens below the grid, so bring it into view
    $('drill-grid').addEventListener('click', (e) => { if (sheetUi() && e.target.closest('button')) setTimeout(() => $('drill-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); });
    Words.init();
    $('btn-mic').addEventListener('click', () => (state.running === 'mic' ? stop() : (Reader.synth && Reader.stopListen(), startMic())));
    $('btn-demo').addEventListener('click', () => playDemo(false));
    DemoVoice.init(); DemoVoice.paint();
    $('btn-stop').addEventListener('click', stop);
    $('file-in').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) playFile(f); e.target.value = ''; });
    $('btn-reset').addEventListener('click', () => { session = newSession(); resetSessionViews(); });
    for (const t of ['vowels', 'sibilants', 'words', 'breath', 'control', 'prosody']) $('tab-' + t).addEventListener('click', () => { state.tab = t; renderDrillGrid(); });
    initSpecHelp(); initTractHelp();
    readTheme();
    setGoal(g === 'masc' ? 'masc' : 'fem', true);
    renderDrillGrid();
    renderSession();
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { clearSpec(); drawVowelChart(); drawPitch(); drawHistory(); renderTractLive(); paintDots(); if (state.coach) renderCoach(); }, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawVowelChart(); drawPitch(); clearSpec(); });
    Reader.init();
    Texts.sync();
    renderReadings(); renderPracticeHistory(); renderDrillGrid();
    setMode('home');
  }
  init();

  // test hook for automated checks
  window.__vt = { onFrame, state, sessionStats, get analyzer() { return an; }, setAnalyzer(a) { an = a; } };
})();
