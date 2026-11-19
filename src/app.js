(function () {
  'use strict';
  const D = window.VTDSP, Synth = window.VTSynth;
  // Practice words, breath and control exercises and reading texts live in data/*.json (see CONTRIBUTING.md); build.js inlines them here
  const DATA = window.VTDATA;
  const PRON = D.pronIndex(DATA.pron); // word -> its stressed vowels, so a reading checks vowels against the text
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '--');

  // ---------------- drills ----------------
  const DRILLS = {
    vowels: D.VOWELS.map(v => ({ id: 'v-' + v.key, type: 'vowel', vowel: v.key, cue: v.cue, sub: `as in "${v.word}"`, title: `"${v.cue}" as in ${v.word}` })),
    sibilants: [
      { id: 's-s', type: 'sib', sib: 's', cue: 'sss', sub: 'as in "see"', title: 'Sustained "sss"' },
      { id: 's-sh', type: 'sib', sib: 'sh', cue: 'shh', sub: 'as in "she"', title: 'Sustained "shh"' },
      // brightness exercises (data/sibex.json): a glide, ladders and word pairs, read from the hiss's centre
      ...DATA.sibex.map(x => ({ ...x, type: 'sibex', steps: (fem) => x.steps.map(st => (typeof st === 'string' ? st : fem ? st.feminine : st.masculine)) })),
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
  // Whisper exercises: resonance with no voice, read from the formants of the whispered sound.
  DRILLS.whisper = DATA.whisper.map(w => ({ ...w, type: 'whisper', steps: (fem) => w.steps.map(s => (typeof s === 'string' ? s : fem ? s.feminine : s.masculine)) }));
  // Embodied voice: say one sound while conveying a feeling dealt from data/emotions.json. Not scored.
  DRILLS.embody = DATA.embody.map(e => ({ ...e, type: 'embody', steps: (fem) => e.steps.map(s => (typeof s === 'string' ? s : fem ? s.feminine : s.masculine)) }));
  const ALL_DRILLS = [...DRILLS.vowels, ...DRILLS.sibilants, ...DRILLS.words];
  const NEED = { vowel: 50, sib: 24, wordVowel: 24, wordSib: 10, breathIn: 180, isoBase: 40, isoIn: 90, whIn: 120 }; // frames at ~60 per second

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
    return { start: Date.now(), vowels: {}, vf: {}, sibs: { s: [], sh: [] }, all: [], pitch: [], breath: [], drills: [] };
  }
  // Resonance target band for the goal, on the 0..100 scale (see D.RES_BANDS for where the numbers come from)
  const target = () => D.RES_BANDS[state.goal === 'fem' ? 'fem' : 'masc'];

  // ---------------- theme colours for canvases ----------------
  let C = {};
  const tlRedraws = new Set(); // redraw the open timelines (their spectrograms follow the theme)
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['bg', 'panel', 'ink', 'muted', 'line', 'masc', 'fem', 'accent', 'good', 'warn', 'spec-mid', 'f1', 'f2', 'f3']) C[k] = cs.getPropertyValue('--' + k).trim();
    C.font = cs.getPropertyValue('--font-mono').trim();
    buildLut();
    clearSpec();
    paintSpecSwatches(); SpecPreview.draw();
    for (const f of [...tlRedraws]) f();
    drawVowelChart(); drawPitch(); drawRes(); drawHistory(); renderTractLive();
    Sing.cols = null; Sing.draw();
    if (state.drill && state.drill.def.type === 'whisper') drawSiren(state.drill);
    if (state.drill && state.drill.def.type === 'sibex') drawGlide(state.drill);
    if (state.drill && state.drill.def.type === 'embody') drawEmbody(state.drill);
    if (typeof TvY !== 'undefined') { tvyDraw(TvY.drill); tvyDraw(TvY.spot); }
  }
  function parseColor(s) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = s; c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  let LUT = null;
  // Spectrogram colours (Settings › Spectrogram colours). Classic follows the app theme: background, teal, ink.
  // The others are fixed colour ramps that start from the background, so silence still matches the page. Ember and
  // Colour-blind safe run dark to bright, so on a light page they run the other way and loud stays the strongest
  // contrast. Colour-blind safe is viridis, which keeps its order in lightness for every kind of colour vision.
  const SPEC_THEMES = {
    classic: { name: 'Classic' },
    rainbow: { name: 'Rainbow', stops: ['#4b2a9a', '#2f63d8', '#1aa3c8', '#2fb35f', '#e6cf2e', '#f0882a', '#e2304a'] },
    viridis: { name: 'Colour-blind safe', stops: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'], flip: true },
    ember: { name: 'Ember', stops: ['#2a0b4a', '#7a1e6c', '#c73e4c', '#f2842a', '#fbe08a'], flip: true },
    mono: { name: 'Mono' },
  };
  const SPEC_FADE = 0.16; // the quietest share of the ramp, faded in from the background
  const specThemeKey = () => (SPEC_THEMES[state.specTheme] ? state.specTheme : 'classic');
  const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  function specLut(key) {
    const bg = parseColor(C.panel), ink = parseColor(C.ink), out = new Uint8ClampedArray(256 * 3);
    let stops, at;
    if (key === 'classic') { stops = [bg, parseColor(C['spec-mid']), ink]; at = [0, 0.55, 1]; }
    else if (key === 'mono') { stops = [bg, ink]; at = [0, 1]; }
    else {
      const th = SPEC_THEMES[key], light = lum(bg) > 0.5;
      const cols = th.stops.map(parseColor); if (th.flip && light) cols.reverse();
      stops = [bg].concat(cols); at = [0].concat(cols.map((_, i) => SPEC_FADE + (1 - SPEC_FADE) * i / (cols.length - 1)));
    }
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let j = 0;
      while (j < at.length - 2 && t > at[j + 1]) j++;
      const u = Math.min(1, Math.max(0, (t - at[j]) / (at[j + 1] - at[j]))), p = stops[j], q = stops[j + 1];
      for (let k = 0; k < 3; k++) out[i * 3 + k] = p[k] + (q[k] - p[k]) * u;
    }
    return out;
  }
  function buildLut() { LUT = specLut(specThemeKey()); }
  // The F1-F3 marks get a thin outline on the colourful ramps, dark round the dark theme's light marks and light
  // round the light theme's dark ones, so they stand out from whatever colour is under them.
  const fmHalo = () => (specThemeKey() === 'classic' ? null : lum(parseColor(C.f1)) > 0.45 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)');

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
  // Freestyle's live lanes (pitch, resonance, spectrogram) share one clock: the same left axis and one frame per step
  const LIVE_AXIS = 40;
  const liveStep = () => Math.max(1, Math.round(dprOf())); // device px per frame, the same in every lane
  function drawSpecColumn(fr, fsd, tick) {
    const cv = $('cv-spec'); const g = cv.getContext('2d');
    if (fitCanvas(cv)) clearSpec();
    const dpr = dprOf(), step = liveStep(), axisW = LIVE_AXIS * dpr;
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
    if (tick) { g.fillStyle = C.line; g.globalAlpha = 0.7; g.fillRect(w - step, 0, Math.max(1, Math.round(dpr / 2)), h); g.globalAlpha = 1; }
    if (fr.formants) {
      const halo = fmHalo();
      ['f1', 'f2', 'f3'].forEach((k, i) => {
        const y = (1 - fr.formants[i] / fmax) * h;
        if (halo) { g.fillStyle = halo; g.fillRect(w - step, y - 2.5 * dpr, step, 5 * dpr); }
        g.fillStyle = C[k];
        g.fillRect(w - step, y - 1.5 * dpr, step, 3 * dpr);
      });
    }
  }
  function drawSpecAxis() {
    const cv = $('cv-spec'), g = cv.getContext('2d'), dpr = dprOf(), axisW = LIVE_AXIS * dpr;
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
  // per frame: pitch (0 = none), when it was read, the resonance then (smoothed, null = no vowel), and whether a new second began
  const pitchBuf = [], pitchT = [], resBuf = [], tickBuf = [];
  const LIVE_KEEP = 2400; // frames kept for the live lanes: wider than any screen at one step a frame
  const PITCH_RANGE = [60, 400];
  // the goal's typical band, unless you set your own range for this goal in Settings
  const PITCH_MIN_SPAN = 10;
  const validBand = (b) => Array.isArray(b) && b.length === 2 && b.every(Number.isFinite) && b[0] >= PITCH_RANGE[0] && b[1] <= PITCH_RANGE[1] && b[1] - b[0] >= PITCH_MIN_SPAN;
  function customBand(goal = state.goal) { const c = typeof Data !== 'undefined' && Data.d ? (Data.setting('pitchRange') || {})[goal] : null; return validBand(c) ? c : null; }
  function pitchBand() { return customBand() || D.PITCH_BANDS[state.goal === 'fem' ? 'fem' : 'masc']; }
  // the live lanes' colour for a resonance: from the darker average (masc) to the brighter one (fem), in five steps as in the timeline
  let resCols = null;
  function resColor(r) {
    if (!resCols || resCols.k !== C.masc + C.fem) {
      const a = parseColor(C.masc), b = parseColor(C.fem);
      resCols = { k: C.masc + C.fem, c: [0, 1, 2, 3, 4].map(u => `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * u / 4)).join(',')})`) };
    }
    return resCols.c[Math.round(clamp((r - D.RES_AVG.masc) / (D.RES_AVG.fem - D.RES_AVG.masc), 0, 1) * 4)];
  }
  // a faint line where each second began, the same in all three lanes
  function drawTicks(g, w, h, axisW, dx) {
    const n = tickBuf.length;
    g.strokeStyle = C.line; g.setLineDash([2 * dprOf(), 4 * dprOf()]);
    for (let i = 0; i < n; i++) if (tickBuf[i]) { const x = w - (n - i) * dx; if (x < axisW) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.setLineDash([]);
  }
  function drawPitch() {
    const cv = $('cv-pitch'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, axisW = LIVE_AXIS * dpr;
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
    const n = pitchBuf.length, dx = liveStep();
    drawTicks(g, w, h, axisW, dx);
    for (let i = 0; i < n; i++) {
      const f = pitchBuf[i]; if (!f) continue;
      const x = w - (n - i) * dx; if (x < axisW) continue;
      const r = resBuf[i];
      g.fillStyle = r != null ? resColor(r) : C.muted;
      g.beginPath(); g.arc(x, y(clamp(f, 60, 400)), (r != null ? 2 : 1.5) * dpr, 0, 7); g.fill();
    }
    Words.draw(g, w, h, axisW, dx, y);
  }
  // resonance on the same clock: the smoothed score as a line against the goal band
  function drawRes() {
    const cv = $('cv-res'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, axisW = LIVE_AXIS * dpr, pad = 4 * dpr;
    const y = (v) => pad + (1 - clamp(v, 0, 100) / 100) * (h - 2 * pad);
    g.clearRect(0, 0, w, h);
    const [lo, hi] = target();
    g.fillStyle = state.goal === 'fem' ? C.fem : C.masc;
    g.globalAlpha = 0.14; g.fillRect(axisW, y(Math.min(hi, 100)), w - axisW, y(lo) - y(Math.min(hi, 100))); g.globalAlpha = 1;
    g.strokeStyle = C.line; g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'right';
    for (const v of [D.RES_AVG.masc, D.RES_AVG.fem]) {
      g.setLineDash([3 * dpr, 3 * dpr]); g.beginPath(); g.moveTo(axisW, y(v)); g.lineTo(w, y(v)); g.stroke(); g.setLineDash([]);
    }
    for (const v of [0, 50, 100]) g.fillText(v, axisW - 6 * dpr, clamp(y(v) + 4 * dpr, 10 * dpr, h - 2 * dpr));
    const n = resBuf.length, dx = liveStep();
    drawTicks(g, w, h, axisW, dx);
    g.strokeStyle = C.accent; g.fillStyle = C.accent; g.lineWidth = 2 * dpr; g.lineJoin = 'round'; g.lineCap = 'round';
    let on = false, len = 0, lx = 0, ly = 0;
    const end = () => { if (on) { if (len === 1) { g.beginPath(); g.arc(lx, ly, 1.5 * dpr, 0, 7); g.fill(); } else g.stroke(); } on = false; len = 0; };
    for (let i = 0; i < n; i++) {
      const r = resBuf[i], x = w - (n - i) * dx;
      if (r == null || x < axisW) { end(); continue; }
      if (!on) { g.beginPath(); g.moveTo(x, y(r)); on = true; } else g.lineTo(x, y(r));
      len++; lx = x; ly = y(r);
    }
    end();
    g.lineWidth = 1;
  }

  // ---- recognised words over the pitch track (browser speech recognition, mic only) ----
  const Words = {
    KEY: 'voicetrainer.pitchwords', CONSENT: 'voicetrainer.speechconsent', on: false, rec: null, labels: [], lastT: 0, interim: [], note: '', readerIdx: -1,
    // Check words (reading practice): the same recognition, writing down what was said so missed passage words can be marked
    READ_KEY: 'voicetrainer.readwords', readOn: false, heard: [], heardLive: '', ran: false, pending: 'show',
    supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
    init() {
      const box = $('pitch-words'); if (!box) return;
      try { this.on = localStorage.getItem(this.KEY) === '1' && this.consented(); } catch (e) {}
      try { this.readOn = localStorage.getItem(this.READ_KEY) === '1' && this.consented(); } catch (e) {}
      box.checked = this.on;
      const rb = $('reader-words');
      if (rb) { rb.hidden = !this.supported(); rb.addEventListener('click', () => { if (!this.readOn && !this.consented()) { this.pending = 'read'; this.ask(); } else this.setRead(!this.readOn); }); }
      this.paintRead();
      box.addEventListener('change', () => {
        // recognition sends audio off the device, so it needs an explicit opt-in first
        if (box.checked && !this.consented()) { box.checked = false; this.pending = 'show'; this.ask(); return; }
        this.set(box.checked);
      });
      const dlg = $('speech-consent');
      dlg.addEventListener('close', () => {
        if (dlg.returnValue !== 'yes') return;
        try { localStorage.setItem(this.CONSENT, '1'); } catch (e) {}
        this.consentNow = true;
        if (this.pending === 'read') this.setRead(true); else this.set(true);
      });
      $('pw-withdraw').addEventListener('click', () => {
        try { localStorage.removeItem(this.CONSENT); } catch (e) {}
        this.consentNow = false;
        this.readOn = false; try { localStorage.setItem(this.READ_KEY, '0'); } catch (e) {} this.paintRead();
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
    setRead(on) {
      this.readOn = on && this.consented();
      try { localStorage.setItem(this.READ_KEY, this.readOn ? '1' : '0'); } catch (e) {}
      this.paintRead(); this.sync();
    },
    paintRead() { const b = $('reader-words'); if (b) { b.textContent = this.readOn ? 'Check words on' : 'Check words off'; b.setAttribute('aria-pressed', String(this.readOn)); b.title = 'Mark passage words you skipped, using your browser\'s speech recognition (online)'; } },
    // a new reading starts: forget what was heard before it
    resetHeard() { this.heard = []; this.heardLive = ''; this.ran = !!this.rec; },
    // what was heard during this reading, as words, or null when the word check wasn't running
    said() {
      if (!this.readOn || !this.ran) return null;
      return (this.heard.join(' ') + ' ' + this.heardLive).split(/\s+/).filter(Boolean);
    },
    setNote(t) { const n = $('pitch-words-note'); if (n) { n.textContent = t; n.hidden = !t; } const pv = $('pitch-words-privacy'); if (pv) pv.hidden = !this.on; },
    // Run recognition only while the switch is on and the microphone is live.
    sync() {
      // In reading practice the words come from the passage itself (the highlighted word), so
      // recognition is not needed there.
      const reading = typeof Reader !== 'undefined' && Reader.open && !Reader.collapsed;
      const want = (reading ? this.readOn : this.on) && this.consented() && state.running === 'mic' && this.supported();
      if (want && !this.rec) this.start();
      else if (!want && this.rec) this.stop();
      if (!reading) this.readerIdx = -1;
      if (!this.on) this.setNote('');
      else if (reading) this.setNote('In reading practice the words come from the passage as the highlight moves.');
      else if (!this.supported()) this.setNote('This browser can\'t recognise speech (Chrome, Edge and Safari can; Firefox can\'t), so no words show here.');
      else if (state.running !== 'mic') this.setNote('Words appear while the microphone is on.');
    },
    start() {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new R();
      r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
      this.rec = r; this.lastT = performance.now(); this.interim = '';
      r.onresult = (e) => {
        let interim = '';
        const reading = Reader.open && !Reader.collapsed;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i], text = res[0].transcript.trim();
          if (reading) { if (!Run.on) continue; this.ran = true; if (res.isFinal) this.heard.push(text); else interim += ' ' + text; continue; }
          if (res.isFinal) this.place(text, res[0].confidence); else interim += ' ' + text;
        }
        if (reading) { this.heardLive = interim.trim(); return; }
        // words still being recognised show straight away (faded) and firm up when final
        this.interim = D.placeWords(interim.trim().split(/\s+/).filter(Boolean), this.voicedSince(this.lastT));
        if (this.tail) this.tail.interim = this.interim;
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.setNote('Speech recognition was blocked, so no words are shown.'); this.on = false; const b = $('pitch-words'); if (b) b.checked = false; }
        else if (e.error === 'network') this.setNote('Speech recognition needs an internet connection in this browser.');
      };
      r.onend = () => { if (this.rec === r) { if (this.on && state.running === 'mic') { try { r.start(); } catch (err) { this.rec = null; } } else this.rec = null; } };
      try { r.start(); this.setNote(''); if (Run.on) this.ran = true; if (this.take) this.take.ran = true; } catch (err) { this.rec = null; }
    },
    stop() {
      const r = this.rec; this.rec = null; this.interim = [];
      if (!r) return;
      // a Freestyle take just ended: let the recogniser finish its last words rather than throwing them away
      const tail = this.tail;
      if (tail) { r.onend = () => tail.done(); try { r.stop(); } catch (e) { tail.done(); } return; }
      r.onend = null; try { r.abort(); } catch (e) {}
    },
    // ---- a Freestyle take's words, for its timeline ----
    // take: the words heard since the take began ({ w, t0, t1, conf }, page clock), or null outside a take.
    take: null, tail: null,
    beginTake() { this.take = []; this.take.ran = !!this.rec; },
    // The take is over: resolves with its words (null when recognition never ran during it) once the last result
    // is in, or after 1.5 s; words still unconfirmed by then are kept, marked tentative.
    endTake(quiet) {
      const list = this.take; this.take = null;
      if (!list || quiet) return Promise.resolve(null);
      if (!list.ran) return Promise.resolve(null);
      return new Promise((resolve) => {
        let tm = 0;
        const tail = {
          list, interim: this.interim.slice(), fin: false,
          done: () => {
            if (tail.fin) return; tail.fin = true; clearTimeout(tm);
            if (this.tail === tail) this.tail = null;
            for (const L of tail.interim) list.push(Object.assign({}, L, { tent: 1 }));
            resolve(list);
          },
        };
        this.tail = tail;
        tm = setTimeout(tail.done, 1500);
        if (!this.rec) tail.done();
      });
    },
    voicedSince(t) { const times = []; for (let i = 0; i < pitchT.length; i++) if (pitchBuf[i] && pitchT[i] > t) times.push(pitchT[i]); return times; },
    // Final result: spread its words over the voiced frames since the previous result.
    place(text, conf) {
      const now = performance.now();
      for (const p of D.placeWords(text.split(/\s+/).filter(Boolean), this.voicedSince(this.lastT))) {
        this.labels.push(p);
        const h = Object.assign({}, p, { conf: Number.isFinite(conf) ? conf : 0 });
        if (this.take) this.take.push(h);
        if (this.tail) { this.tail.list.push(h); }
      }
      if (this.tail) this.tail.interim = [];
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
  async function startMic(opts = {}) {
    Player.pause(); // the microphone would hear a replay
    stop();
    try {
      ensureCtx();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('no api'), { name: 'NoApi' });
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !!opts.aec, noiseSuppression: false, autoGainControl: false } });
      node = ctx.createMediaStreamSource(stream);
      node.connect(analyser);
      Tap.attach(node);
      begin('mic', 'Listening to your microphone');
      if (Run.on && !Spot.cur) startRunAudio(stream);
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
  // The microphone's last few seconds, as samples, so a good exercise take can be kept as your own reference
  // (Target vs you). Only the analyser's frames are read otherwise, and those can't be stitched back into sound.
  const TAP_KEEP_S = 12;
  const Tap = {
    ring: null, proc: null, mute: null,
    attach(src) {
      this.detach();
      try {
        if (!this.ring || this.ring.fs !== ctx.sampleRate) { this.ring = new D.SampleRing(Math.round(ctx.sampleRate * TAP_KEEP_S)); this.ring.fs = ctx.sampleRate; }
        const p = ctx.createScriptProcessor(2048, 1, 1), m = ctx.createGain(), ring = this.ring;
        m.gain.value = 0;
        p.onaudioprocess = (e) => ring.push(e.inputBuffer.getChannelData(0));
        src.connect(p); p.connect(m); m.connect(ctx.destination);
        this.proc = p; this.mute = m;
      } catch (e) { this.proc = null; this.mute = null; }
    },
    detach() {
      if (this.proc) { this.proc.onaudioprocess = null; try { this.proc.disconnect(); } catch (e) {} try { this.mute.disconnect(); } catch (e) {} }
      this.proc = null; this.mute = null;
    },
    get n() { return this.proc && this.ring ? this.ring.total : NaN; },
  };
  async function playBuffer(audioBuf, kind, label) {
    stop();
    ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(analyser);
    src.connect(ctx.destination);
    // the natural demo voice gets the same soft room as the examples, on the speakers only
    if (kind === 'demo' && Synth.getStyle() === 'natural') {
      const r = roomFor(ctx.sampleRate); src.connect(r.input); r.output.connect(ctx.destination);
      setTimeout(() => { try { r.output.disconnect(); } catch (e) {} }, audioBuf.duration * 1000 + 1500);
    }
    src.onended = () => { if (node === src) { stop(); setStatus(kind === 'demo' ? 'Demo finished' : 'Recording finished'); } };
    node = src;
    src.start();
    Free.pendingBuf = audioBuf; // Freestyle replays it on the take's timeline
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
    const said = Synth.getStyle() === 'natural' ? '"see, spa, sue, said"' : 's and four vowels';
    playBuffer(ab, 'demo', sweep ? `Demo voice: ${said}, moving from masculine to feminine resonance`
      : `Demo voice: ${said} at ${v.pitch} Hz, resonance ${Math.round(D.resScore(v.res / 100))}, brightness ${v.bright}`);
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
        // rv 2 added the neural voice; it replaces the demo voice as the reading voice once (speech stays speech)
        if (saved && !saved.rv && saved.read === 'demo') saved.read = 'neural';
        this.v = Object.assign({ type, rate: 0.95, read: 'neural', style: 'natural', rv: 2 }, DEMO_PRESETS[type], saved || {});
        Synth.setStyle(this.v.style);
      }
      return this.v;
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.v)); } catch (e) {} },
    setType(t) { Object.assign(this.get(), { type: t }, DEMO_PRESETS[t]); this.save(); this.paint(); },
    paint() {
      const v = this.get();
      for (const t of ['fem', 'masc']) $('vd-' + t).setAttribute('aria-checked', String(v.type === t));
      for (const t of ['natural', 'classic']) $('vd-' + t).setAttribute('aria-checked', String(v.style === t));
      $('vd-pitch').value = v.pitch; $('vd-pitch-out').textContent = v.pitch + ' Hz';
      $('vd-res').value = v.res; $('vd-res-out').textContent = Math.round(D.resScore(v.res / 100)); // stored as alpha x 100, shown on the meter's scale
      $('vd-bright').value = v.bright; $('vd-bright-out').textContent = v.bright;
      $('vd-rate').value = v.rate; $('vd-rate-out').textContent = (+v.rate).toFixed(2) + '×';
      for (const t of ['neural', 'demo', 'speech']) $('vd-read-' + t).setAttribute('aria-checked', String(v.read === t));
      $('reader-voice-wrap').hidden = v.read !== 'speech' || this.voiceCount < 2;
      const nv = Clips.idx && Clips.idx.voices && Clips.idx.voices[v.type];
      $('vd-read-note').textContent = v.read === 'neural'
        ? `The built-in passages are read by a neural voice (${nv ? nv.voice + ', ' : ''}Kokoro), made ahead of time in the ${v.type === 'fem' ? 'feminine' : 'masculine'} voice type above. It sounds far more human than the demo voice, and the app measures it the same way it measures you: the meters follow it live, Reference under Readings shows its pitch and resonance word by word, and your readings can show it as a dashed line. Its pitch, resonance and speed are its own, so the sliders above don't change it. Your own passages${Clips.idx ? '' : ', and this copy of the page (it cannot load the neural voice),'} use the demo voice instead. It never counts toward your progress.`
        : v.read === 'speech'
        ? "Passages are read by your browser's own speech voice, following the voice type, pitch and speed. Browsers do not let apps measure that voice, so it does not appear on the pitch chart or meters, and it never counts toward your progress."
        : 'Passages are read by the demo voice above, at its pitch, resonance and brightness. It sounds more like a machine than the speech voice, but the app can measure it: the meters follow it live, Demo voice under Readings shows its pitch and resonance word by word, and your own readings can show it as a dashed reference line. It never counts toward your progress.';
    },
    open() { this.paint(); Reader.fillVoices(); $('voice-dlg').showModal(); },
    // Target vs you showing the demo voice follows new settings when the dialog closes
    closed() {
      const T = TvY.drill; if (T.el && tvyDemoOn(T)) { tvyMakeDemo(T); tvyFrozenCmp(T); tvyDraw(T); }
      const pf = $('proof'); if (pf && state.drill && pf.proofDef === state.drill.def && !pf.hidden) renderProof(pf, state.drill.def);
    },
    init() {
      for (const t of ['fem', 'masc']) $('vd-' + t).addEventListener('click', () => this.setType(t));
      for (const t of ['natural', 'classic']) $('vd-' + t).addEventListener('click', () => { this.get().style = t; Synth.setStyle(t); this.save(); this.paint(); });
      for (const t of ['neural', 'demo', 'speech']) $('vd-read-' + t).addEventListener('click', () => { Reader.stopListen(); this.get().read = t; this.save(); this.paint(); });
      this.get(); // sets the synth style before anything is played or graded
      $('voice-dlg').addEventListener('close', () => this.closed());
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
  // Sustain: Hear target (and Play example) hold the sound steady until Stop, instead of a short clip.
  // Only single sounds have a held version (Synth.canSustain); the choice is kept on this device.
  const Sustain = {
    KEY: 'voicetrainer.sustain', on: (() => { try { return localStorage.getItem('voicetrainer.sustain') === '1'; } catch (e) { return false; } })(),
    MAX_S: 120, // a held sound stops by itself after two minutes
    set(on) { this.on = !!on; try { localStorage.setItem(this.KEY, this.on ? '1' : '0'); } catch (e) {} },
    applies: (def) => Synth.canSustain(def),
  };
  function playHeld(def, voice) {
    ensureCtx();
    const fem = state.goal === 'fem', h = Synth.sustain(ctx.sampleRate, def, state.goal, D.VOWELS, D.SIBILANTS, { shift: D.WHISPER_SHIFT, voice });
    const what = def.type === 'sib' ? `"${def.cue}"` : def.type === 'whisper' ? 'whisper' : def.type === 'word' ? `"${def.cue}" (vowel)` : `"${D.VOWEL_BY_KEY[def.vowel].cue}"`;
    playSamples(h.x, 'hold', `${what} held, ${voice ? 'in the demo voice' : `typical ${fem ? 'feminine' : 'masculine'}`}`, h);
  }
  function playExample(def, mode) {
    ensureCtx();
    if (mode === 'play' && Sustain.on && Sustain.applies(def)) return playHeld(def);
    const fs = ctx.sampleRate;
    const fem = state.goal === 'fem';
    if (def.type === 'embody') return playSamples(Synth.uwu(fs, state.goal, D.VOWELS), mode, `plain "${def.say}", typical ${fem ? 'feminine' : 'masculine'}`);
    if (def.type === 'sibex') return playSamples(Synth.sibExercise(fs, def, state.goal, D.VOWELS, D.SIBILANTS), mode, SX_DEMO[def.kind]);
    if (def.type === 'whisper') return playSamples(Synth.whisperExample(fs, def, state.goal, D.VOWELS, D.WHISPER_SHIFT), mode, def.kind === 'siren' ? 'whisper sliding up and down' : `typical ${fem ? 'feminine' : 'masculine'} whisper`);
    const x = def.type === 'prosody' ? prosodyExample(fs, def, fem) : mode === 'compare' ? Synth.comparison(fs, def, D.VOWELS, D.SIBILANTS) : Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS);
    playSamples(x, mode, def.type === 'prosody' ? 'as intended' : mode === 'compare' ? 'masculine, then feminine' : `typical ${fem ? 'feminine' : 'masculine'}`);
  }
  // loop: {loopStart, loopEnd} (seconds) plays the start once, then repeats that stretch until stopped
  function playSamples(x, mode, label, loop, dry) {
    ensureCtx();
    stopExample();
    const fs = ctx.sampleRate;
    const ab = ctx.createBuffer(1, x.length, fs);
    ab.copyToChannel(x, 0);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    if (loop) { src.loop = true; src.loopStart = loop.loopStart; src.loopEnd = loop.loopEnd; }
    // the speakers get it through a gain, so Stop can fade it out instead of clicking
    const out = ctx.createGain(); src.connect(out); out.connect(ctx.destination); exOut = out;
    // the natural voice gets a touch of room sound on the speakers only; the charts see it dry
    if (!dry && Synth.getStyle() === 'natural') { const r = roomFor(fs); out.connect(r.input); r.output.connect(ctx.destination); exRoom = r; }
    clearTimeout(exCap); if (loop) exCap = setTimeout(() => { if (exSrc === src) stopExample(); }, Sustain.MAX_S * 1000);
    if (state.running !== 'file' && state.running !== 'demo') src.connect(analyser); // show it on the charts
    src.onended = () => { if (exSrc === src) finishExample(); };
    exSrc = src; exMode = mode;
    meterFrames = []; an.reset();
    startDemoView(state.drill, label);
    src.start();
    ensureLoop();
    setExampleUi(mode);
  }
  // A small, soft room: a quiet decaying noise tail (about 0.3 s) mixed in under the dry voice.
  let exRoom = null, roomIR = null, exOut = null, exCap = 0, exMode = null;
  function roomFor(fs) {
    if (!roomIR || roomIR.sampleRate !== fs) {
      const n = Math.round(fs * 0.45), ir = ctx.createBuffer(2, n, fs);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let s = 12345 + ch * 777, lp = 0;
        for (let i = 0; i < n; i++) {
          s = (s * 48271) % 2147483647;
          lp += 0.35 * ((s / 2147483647) * 2 - 1 - lp); // darker tail, like soft furnishings
          d[i] = lp * Math.exp(-i / (fs * 0.07)) * Math.min(1, i / (fs * 0.004));
        }
        let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
        const g = 1 / Math.sqrt(e || 1); for (let i = 0; i < n; i++) d[i] *= g; // unit energy
      }
      roomIR = ir;
    }
    const conv = ctx.createConvolver(), wet = ctx.createGain();
    conv.buffer = roomIR; wet.gain.value = 0.28; // about 11 dB under the dry voice
    conv.connect(wet);
    return { input: conv, output: wet };
  }
  function stopExample() {
    if (!exSrc) return;
    const s = exSrc, g = exOut;
    s.onended = null;
    // a short fade (about 60 ms) so a held sound doesn't end in a click
    try { const t = ctx.currentTime; g.gain.setValueAtTime(1, t); g.gain.linearRampToValueAtTime(0, t + 0.06); s.stop(t + 0.07); }
    catch (e) { try { s.stop(); } catch (e2) {} }
    try { s.disconnect(analyser); } catch (e) {} // the charts let go at once
    setTimeout(() => { try { s.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} }, 120);
    finishExample();
  }
  function finishExample() {
    exSrc = null; exOut = null; exMode = null; clearTimeout(exCap); exampleEnd = performance.now();
    if (exRoom) { const r = exRoom; exRoom = null; setTimeout(() => { try { r.output.disconnect(); } catch (e) {} }, 600); }
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
    d.demoOn = true; d.demoBr = []; d.demoIso = []; d.demoWh = []; d.demoSx = []; d.demoEmb = []; d.demoBase = null; d.demoPts = []; d.demoLast = null; d.demoStep = 0;
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
    d.demoOn = false; d.demoBr = []; d.demoIso = []; d.demoWh = []; d.demoSx = []; d.demoEmb = []; d.demoBase = null; d.demoPts = []; d.demoLast = null;
    d.eased = {}; if (d.cue) { d.cue.eased = {}; d.cue.key = null; }
    if (d.def.type === 'prosody' && $('pr-cue')) { $('pr-cue').textContent = ''; $('pr-state').textContent = ''; drawProsody(d); }
  }
  function updateDemo(d, force) {
    const t = d.def.type;
    if (t === 'breath') updateBreath(d, force);
    else if (t === 'iso') updateIso(d, force);
    else if (t === 'whisper') updateWhisper(d, force);
    else if (t === 'sibex') updateSibex(d, force);
    else if (t === 'embody') updateEmbody(d, force);
    else if (t === 'prosody' && !force) updateProsody(d);
  }
  function tvyHearNow() { try { return tvyRef(TvY.drill).hear; } catch (e) { return '▶ Hear target'; } } // safe before Target vs you is set up
  function setExampleUi(mode) {
    if (!mode) document.querySelectorAll('.proof-play.playing').forEach(x => { if (!exSrc) { x.classList.remove('playing'); x.textContent = '▶'; } });
    const p = $('ex-play'), c = $('ex-compare');
    if (p) p.textContent = mode === 'play' || mode === 'hold' ? 'Stop example' : 'Play example';
    if (c) c.textContent = mode === 'compare' ? 'Stop comparison' : 'Compare masculine and feminine';
    if (p && !mode && state.drill && Sustain.on && Sustain.applies(state.drill.def)) p.textContent = 'Play example (held)';
    document.querySelectorAll('.tvy-play').forEach(b => {
      const on = !!mode && mode !== 'compare' && !b.dataset.spot;
      b.textContent = on ? '■ Stop' : !b.dataset.spot ? tvyHearNow() : '▶ Hear target'; b.setAttribute('aria-pressed', String(on));
    });
  }
  function begin(kind, label) {
    state.running = kind;
    take = newSession(); take.kind = kind;
    if (mode === 'freestyle' && !Run.on && !Sing.on) Free.start(kind); else Free.pendingBuf = null;
    setStatus(label, true);
    $('btn-stop').hidden = kind === 'mic'; // the mic button itself becomes Stop
    setMicButton(kind === 'mic');
    Words.sync(); Wake.update();
    an.reset();
    ensureLoop();
  }
  function stop() {
    if (state.drill && state.drill.ready && !state.drill.result) state.drill.ready(); // the take you were in the middle of
    Free.end();
    if (Sing.on) { take = null; Sing.finish(true); }
    const hadRun = !!state.running;
    if (take) { offerPlanFrom(take); take = null; }
    Tap.detach();
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
    an.pitchMax = Sing.on ? D.SING_PITCH_MAX : D.PITCH_MAX; // singing reads notes up to about C6
    const fr = an.analyze(buf);
    onFrame(fr);
  }

  // ---------------- per-frame logic ----------------
  const AVG_MS = 1500; // averaging window for the resonance meter and the coach gauges
  let liveSec = null, liveRes = [];
  let frameCount = 0, meterFrames = [], sibShown = 0, exampleEnd = -1e9, breathBuf = [], breathShown = -1e9;
  function onFrame(fr) {
    frameCount++;
    let frRes = NaN, frSib = NaN, frVowel = null; // this frame's scores, for the per-word reading report
    let frU = NaN, frMiss = false, frLoose = false; // ± of frRes in score points; a vowel heard but not measurable (for Sing's per-line reasons)
    const frWord = Reader.idx; // the word this frame's vowel was checked against (the highlight may move on below)
    let frAny = NaN; // this frame's resonance, demo voice included (for the embody view)
    const now = performance.now(), sec = Math.floor(now / 1000), tick = liveSec !== null && sec !== liveSec; liveSec = sec;
    drawSpecColumn(fr, an.fsd, tick);
    pitchBuf.push(fr.kind === 'voiced' ? fr.f0 : 0); pitchT.push(now); tickBuf.push(tick);
    if (pitchBuf.length > LIVE_KEEP) { pitchBuf.shift(); pitchT.shift(); tickBuf.shift(); }
    // While a reference example plays (and briefly after), show it but don't score it as the user.
    const gated = !!exSrc || !!Reader.tts || !!Reader.synth || performance.now() - exampleEnd < 400;
    if (!gated && state.drill && state.drill.result && mode !== 'sing') watchRetake(state.drill, fr, now);
    const d = !gated && state.drill && !state.drill.result && mode !== 'sing' ? state.drill : null; // an open exercise doesn't grade your singing
    const dd = exSrc && state.drill && state.drill.demoOn ? state.drill : null; // a demo is playing for this exercise
    // your own voice takes the panel back from the demo
    if (!gated && state.drill && state.drill.demoOn && (fr.kind === 'voiced' || fr.kind === 'fricative' || (fr.whisperF && state.drill.def.type === 'whisper'))) endDemoView(state.drill);
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
      // a drill wants a held vowel; running speech (readings, freestyle, singing) only glides through its vowels
      if (fr.stable || (fr.steady && !d)) {
        let unmeasured = false;
        let score = NaN, vowel = null, ok = false, mapIt = true, fit = null;
        const cls = D.classifyVowel(F, D.VOWELS, fr.f0);
        const wv = Run.on && !gated && !d ? readingWordVowels() : null;
        const lv = !wv && Sing.on && !gated && !d ? Sing.lineVowels() : null; // a sung line's vowels (empty without lyrics)
        if (d && d.def.vowel) {
          const v = D.VOWEL_BY_KEY[d.def.vowel];
          fit = D.scoreVowel(F, v, fr.f0);
          vowel = v; score = score100(fit.alpha);
          ok = fit.ok && (fit.rms < 0.085 || cls.vowel.key === v.key);
          if (ok) d.vowelFr.push({ F, alpha: fit.alpha, per: fit.per, f0: fr.f0 });
          else if (fit.ok) d.offTarget = { key: cls.vowel.key, n: (d.offTarget && d.offTarget.n || 0) + 1 };
          else unmeasured = true;
        } else if (wv && wv.why === 'ok') {
          // reading: only the vowels this word should have count, so a vowel is never pinned on the wrong word
          const m = D.matchWordVowel(F, wv.keys, cls, fr.f0);
          if (m) { vowel = m.vowel; score = score100(m.alpha); ok = true; fit = m; }
          // not one of this word's vowels (the highlight can sit a syllable off, or the word is said another way):
          // a clear vowel still counts towards the word and the overall score, but not per vowel
          else if (cls.cost < 0.07 && cls.ok) { vowel = cls.vowel; score = score100(cls.alpha); ok = true; fit = cls; mapIt = false; }
          else if (cls.cost < 0.07) unmeasured = true;
          else if (Run.gates) Run.gates.nomatch = (Run.gates.nomatch || 0) + 1;
        } else if (wv && wv.why === 'function') {
          if (Run.gates) Run.gates.fnword = (Run.gates.fnword || 0) + 1;
          // "the", "of", "with": reduced in running speech, so not scored at all
        } else if (!wv && !d && fr.stable && state.held && frameCount - state.held.n <= HOLD_GAP && (fit = D.heldVowelFit(F, state.held.v, fr.f0))) {
          vowel = fit.vowel; score = score100(fit.alpha); ok = true; // still the vowel you were holding (see D.heldVowelFit)
        } else if (lv && lv.length && (fit = D.matchWordVowel(F, lv, cls, fr.f0))) {
          // singing: checked against the vowels of the line's words, like a reading word, so a vowel whose F1 alone
          // is off (a soft, wide "ah", a very closed "ee") is read from F2 and F3 instead of not at all
          vowel = fit.vowel; score = score100(fit.alpha); ok = true;
        } else if (cls.cost < 0.07 && !cls.ok) {
          unmeasured = true;
        } else if (cls.cost < 0.07) {
          vowel = cls.vowel; score = score100(cls.alpha); ok = true; fit = cls;
          mapIt = !wv; // a glide ("sign") or a word we can't look up still counts towards overall resonance, but not per vowel
        }
        if (!d && !wv) state.held = ok && fr.stable ? { v: vowel, n: frameCount } : state.held;
        if (ok) {
          frAny = score;
          if (!gated) { addVowelToSession(vowel.key, score, F, mapIt); frRes = score; frVowel = mapIt ? vowel.key : null; frU = fit ? fit.spread * D.RES_PER_ALPHA / 100 : NaN; }
          pushMeter(score, gated, fit ? fit.spread * D.RES_PER_ALPHA / 100 : NaN);
          $('ro-vowel').textContent = `${vowel.cue.split(' ')[0]} (${vowel.word})`;
          state.lastVowel = { v: vowel, at: Date.now() };
          if (!gated || exSrc) {
            if (tractLive.v !== vowel || tractLive.demo !== gated) tractLive.hist = tractLive.f0s = [];
            tractLive.demo = gated;
            tractLive.hist = (tractLive.hist || []).concat([F]).slice(-90); // ~1.5 s
            tractLive.f0s = (tractLive.f0s || []).concat([fr.f0]).slice(-90);
            tractLive.F = [0, 1, 2].map(i => D.median(tractLive.hist.map(f => f[i])));
            tractLive.v = vowel; tractLive.at = performance.now();
          }
          $('res-context').textContent = (gated ? 'demo voice, ' + vowel.cue : d && d.def.vowel ? 'drill vowel ' + vowel.cue : 'vowel ' + vowel.cue)
            + (fit && fit.pitchLimited ? ' · high pitch: F2 and F3 only' : fit && fit.f1Off ? ' · F1 set aside: F2 and F3 only' : '');
        } else if (unmeasured && !gated) {
          frMiss = true;
          // a reading far off any voice (a nasal sound, a harmonic taken for a formant): not shown as 0 or 100
          $('res-context').textContent = "couldn't measure that sound";
        }
      }
      // a reading's vowel too short to hold still: this frame alone, if it fits one of the word's vowels.
      // Only for the word bars and a thin reading (see D.wordReport); the meter and the session stay on steady frames.
      else if (Run.on && !gated && !d && fr.rawF) {
        const wv = readingWordVowels();
        if (wv && wv.why !== 'function') {
          const cls = D.classifyVowel(fr.rawF, D.VOWELS, fr.f0);
          const m = wv.why === 'ok' ? D.matchWordVowel(fr.rawF, wv.keys, cls, fr.f0) : null;
          const fit = m || (cls.cost < 0.07 && cls.ok ? cls : null);
          if (fit) { frRes = score100(fit.alpha); frU = fit.spread * D.RES_PER_ALPHA / 100; frLoose = true; }
        }
      }
    } else if (fr.kind === 'fricative') {
      const type = d && d.def.sib ? d.def.sib : fr.sib;
      const sib = D.SIBILANTS[type];
      const score = score100(D.sibilantAlpha(fr.cog, sib));
      if (!gated && !(state.drill && state.drill.def.type === 'whisper')) { // a whispered vowel can read as a fricative
        session.sibs[type].push(score); frSib = score;
        if (take) take.sibs[type].push(score);
        if (session.sibs[type].length > 5000) session.sibs[type].splice(0, 1000);
      }
      if (d && d.def.sib) d.sibFr.push({ cog: fr.cog, score });
      sibShown = frameCount;
      $('ro-sib').textContent = `/${type === 's' ? 's' : 'ʃ'}/ ${fmt(score)} · ${(fr.cog / 1000).toFixed(1)} kHz`;
    }
    if (frameCount - sibShown > 120) $('ro-sib').textContent = '--';

    // Breathiness shown = readings from the last ~1.5 s only (not the last N readings: a very airy voice gives few
    // readings, and those used to sit under a pile of older clear ones, so the display said "clear" while you breathed).
    // Frames with too little tone to read at all count as air; when they outnumber the readings, say so.
    if (fr.breath != null || isAiryFrame(fr)) {
      breathBuf.push({ n: frameCount, b: fr.breath != null ? fr.breath : null });
      while (breathBuf.length && breathBuf[0].n <= frameCount - BREATH_WIN) breathBuf.shift();
      const r = recentBreath(breathBuf);
      if (r.air) { breathShown = frameCount; $('ro-breath').textContent = 'mostly air · no clear tone'; }
      else if (Number.isFinite(r.b)) { breathShown = frameCount; $('ro-breath').textContent = `${Math.round(r.b)} · ${breathWord(r.b)}`; }
    }
    if (fr.breath != null) {
      if (!gated) {
        session.breath.push(Math.round(fr.breath));
        if (session.breath.length > 30000) session.breath.splice(0, 10000);
      }
      if (d && d.def.type === 'breath') { d.breathFr.push(fr.breath); d.breathLog.push({ n: frameCount, b: fr.breath }); }
      if (dd && dd.def.type === 'breath') dd.demoBr.push(fr.breath);
    }
    if (d && d.def.type === 'breath' && fr.breath == null && isAiryFrame(fr)) d.breathLog.push({ n: frameCount, b: null });
    if (d && d.def.type === 'breath') while (d.breathLog.length && d.breathLog[0].n <= frameCount - BREATH_WIN) d.breathLog.shift();
    if (d && d.def.type === 'prosody') d.pts.push({ t: performance.now(), f0: fr.kind === 'voiced' ? fr.f0 : 0 });
    if (d && d.def.type === 'iso' && fr.kind === 'voiced' && fr.formants) d.isoFr.push({ F: fr.formants, f0: fr.f0, n: frameCount });
    if (dd && dd.def.type === 'prosody') dd.demoPts.push({ t: performance.now(), f0: fr.kind === 'voiced' ? fr.f0 : 0 });
    if (dd && dd.def.type === 'iso' && fr.kind === 'voiced' && fr.formants) dd.demoIso.push({ F: fr.formants, f0: fr.f0, n: frameCount });
    if (d && d.def.type === 'whisper' && d.whFr) { d.whFr.push({ F: fr.whisperF || null, voiced: fr.kind === 'voiced', n: frameCount }); if (d.whFr.length > 3600) d.whFr.shift(); }
    if (dd && dd.def.type === 'whisper' && dd.demoWh) dd.demoWh.push({ F: fr.whisperF || null, voiced: fr.kind === 'voiced', n: frameCount });
    if (d && d.def.type === 'sibex' && d.sxFr) { d.sxFr.push({ cog: fr.kind === 'fricative' ? fr.cog : null, voiced: fr.kind === 'voiced' }); if (d.sxFr.length > 7200) d.sxFr.shift(); }
    if (dd && dd.def.type === 'sibex' && dd.demoSx) dd.demoSx.push({ cog: fr.kind === 'fricative' ? fr.cog : null, voiced: fr.kind === 'voiced' });
    if ((d || dd) && (d || dd).def.type === 'embody') {
      const e = d ? d.emb : dd.demoEmb;
      if (e) { e.push({ n: frameCount, v: fr.kind === 'voiced', f0: fr.kind === 'voiced' ? fr.f0 : 0, res: frAny }); if (e.length > 900) e.shift(); }
    }
    if (frameCount - breathShown > 120) $('ro-breath').textContent = '--'; // old entries leave breathBuf by age
    if (Reader.open) $('rh-breath').textContent = $('ro-breath').textContent;

    // the resonance lane: this frame's score smoothed over about a quarter second, broken where no vowel was read
    const rNow = Number.isFinite(frAny) ? frAny : frRes;
    if (Number.isFinite(rNow)) liveRes.push({ n: frameCount, s: rNow });
    while (liveRes.length && liveRes[0].n < frameCount - 15) liveRes.shift();
    resBuf.push(liveRes.length && frameCount - liveRes[liveRes.length - 1].n <= 4 ? liveRes.reduce((a, b) => a + b.s, 0) / liveRes.length : null);
    if (resBuf.length > LIVE_KEEP) resBuf.shift();
    if (Free.on && !gated) Free.frame(fr, now, frRes);
    if (frameCount % 3 === 0) { drawVowelChart(); drawPitch(); drawRes(); renderMeter(); drawSpecAxis(); }
    if (!gated) coachFrame(fr, false);
    else if (dd) coachFrame(fr, true);
    if (!gated) Reader.frame(fr);
    if (Sing.on && !gated) Sing.frame(fr, frLoose ? NaN : frRes, frU, frMiss);
    if (Run.on && !gated && Run.gates) {
      const g = Run.gates;
      if (fr.kind === 'voiced') g.voiced++;
      if (fr.kind === 'voiced' && fr.formants) { g.formants++; if (fr.steady) g.steady++; }
      if (Number.isFinite(frRes)) g[frLoose ? 'loose' : 'scored']++; else if (frMiss) g.refused++;
    }
    if (!gated && Run.on && Spot.cur) tvyPush(TvY.spot, fr);
    else if (d && TvY.drill.el) tvyPush(TvY.drill, fr);
    if (Run.on && !gated) Run.frames.push({ i: Reader.idx, f0: fr.kind === 'voiced' ? fr.f0 : 0, res: frRes, u: frU, miss: frMiss, loose: frLoose || undefined, sib: frSib, k: Reader.idx === frWord ? frVowel : null,
      t: performance.now(), kd: fr.kind === 'voiced' ? 'v' : fr.kind === 'fricative' ? 's' : fr.kind === 'silence' ? '.' : 'o', e: fr.ve, a: Math.round(200 * Math.log10(fr.rms + 1e-9)) / 10, F: fr.kind === 'voiced' ? fr.formants : null, rawF: fr.kind === 'voiced' ? fr.rawF : null, st: !!fr.steady, w: frWord });
    if (frameCount % 6 === 0) { renderCoach(); renderTractLive(); }
    if (d) updateDrill(d);
    if (d && d.ready && !d.result) watchTakeEnd(d, fr, now);
    else if (dd) updateDemo(dd);
    if (frameCount % 30 === 0) renderSession();
  }

  // Scores shown and saved stay on the 0 (masculine average) .. 100 (feminine average) scale.
  // Going past an average is not extra credit, so it reads as the end of the scale.
  function score100(alpha) { return clamp(D.resScore(alpha), 0, 100); } // 0..100 is the plausible range, so the clamp only catches sibilants and whispers
  function pushMeter(score, demo = false, spread = NaN) {
    // average over the last ~1.5 s so the needle moves calmly; a demo voice and yours never mix
    const now = performance.now();
    if (!!state.meterDemo !== demo) { meterFrames = []; state.meterDemo = demo; state.meterName = demo ? demoName() : ''; }
    meterFrames.push({ t: now, s: score, u: spread });
    while (meterFrames.length > 1 && now - meterFrames[0].t > AVG_MS) meterFrames.shift();
    state.meter = D.median(meterFrames.map(m => m.s));
    const us = meterFrames.map(m => m.u).filter(Number.isFinite);
    state.meterSpread = us.length ? D.median(us) : NaN; // rough ± of a reading; grows with pitch
  }
  // perVowel false: the frame counts towards overall resonance only (in a reading, a vowel the text can't confirm)
  function addVowelToSession(key, score, F, perVowel = true) {
    if (perVowel) (session.vowels[key] = session.vowels[key] || []).push(score);
    if (perVowel && session.vowels[key].length > 3000) session.vowels[key].splice(0, 1000);
    if (F && perVowel) { // formants too, for the vowel map
      const vf = (session.vf[key] = session.vf[key] || []);
      vf.push([F[0], F[1], F[2], score]);
      if (vf.length > 3000) vf.splice(0, 1000);
    }
    session.all.push(score);
    if (session.all.length > 20000) session.all.splice(0, 5000);
    if (take) { if (perVowel) (take.vowels[key] = take.vowels[key] || []).push(score); take.all.push(score); }
  }
  // the vowels of the word the reading highlight is on, looked up once per word
  function readingWordVowels() {
    const w = Reader.words[Reader.idx];
    return w ? (w.vk = w.vk || D.wordVowels(w.text, PRON)) : null;
  }

  function renderMeter() {
    const v = state.meter;
    if (Reader.open) {
      $('rh-res').textContent = Number.isFinite(v) ? Math.round(v) : '--';
      $('rh-vowel').textContent = $('ro-vowel').textContent;
      $('rh-pitch').textContent = $('ro-pitch').textContent;
    }
    $('res-num').textContent = Number.isFinite(v) ? Math.round(v) : '--';
    const u = state.meterSpread, pm = $('res-pm');
    pm.hidden = !(Number.isFinite(v) && Number.isFinite(u));
    if (!pm.hidden) pm.textContent = `±${Math.round(Math.min(u, 99))}`;
    const nd = $('meter-needle');
    nd.hidden = !Number.isFinite(v);
    if (Number.isFinite(v)) nd.style.left = clamp(v, 0, 100) + '%';
    const [lo, hi] = target();
    const t = $('meter-target');
    t.style.left = clamp(lo, 0, 100) + '%';
    t.style.width = clamp(hi, 0, 100) - clamp(lo, 0, 100) + '%';
    t.parentElement.classList.toggle('in', Number.isFinite(v) && onTarget(Math.round(v))); // rainbow band (Rainbow colours)
    if (Number.isFinite(v)) {
      const inT = onTarget(v), mid = (D.RES_AVG.masc + D.RES_AVG.fem) / 2;
      if (state.meterDemo) $('res-desc').textContent = `This is the ${state.meterName}, not you: ${inT ? 'inside' : 'outside'} your target range. It is not scored or saved.`;
      else $('res-desc').textContent = inT ? (state.goal === 'fem' ? v > hi : v < lo) ? `${state.goal === 'fem' ? 'Brighter' : 'Darker'} than most ${state.goal === 'fem' ? 'women' : 'men'}: past the target band, which is fine. No need to push further.` : 'In your target range. Keep this shape.'
        : state.goal === 'fem' ? (v < mid ? 'Darker than typical feminine resonance. Try a smaller, brighter mouth space.' : 'Getting brighter. A little more forward and lighter to reach the target.')
          : (v > mid ? 'Brighter than typical masculine resonance. Try more space in the throat and slightly rounded lips.' : 'Getting darker. A little more depth to reach the target.');
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
    for (const t of ['vowels', 'sibilants', 'words', 'breath', 'control', 'whisper', 'embody', 'prosody']) $('tab-' + t).setAttribute('aria-selected', String(state.tab === t));
  }
  function selectDrill(def, fromPlan) {
    if (!fromPlan && state.plan && state.plan.status === 'active' && planStep() && planStep().def.id !== def.id) {
      state.plan.status = 'paused'; renderPlan();
    }
    if (exMode === 'hold') stopExample(); // a held sound belongs to the exercise it was started from
    state.drill = { def, vowelFr: [], sibFr: [], breathFr: [], breathLog: [], isoFr: [], pts: [], inZone: 0, offTarget: null, result: null };
    meterFrames = []; state.meter = NaN;
    TvY.drill.el = null; TvY.drill.cfg = null;
    renderDrillGrid();
    renderDrillPanel();
    drawVowelChart();
  }
  // After a take the microphone stays live: pause, then make the sound again, and the next take starts by itself
  // (there's no "try again" button to press). The pause is what separates takes, so a sound you're still holding
  // when a take finishes doesn't start the next one. The last take's result stays up until the new one replaces it.
  const RETAKE_QUIET_MS = 500;
  const takeSound = (def, fr) => def.type === 'whisper' ? !!fr.whisperF || fr.kind === 'voiced'
    : def.type === 'sibex' ? fr.kind === 'fricative' || (def.kind === 'pairs' && fr.kind === 'voiced')
    : def.type === 'sib' ? fr.kind === 'fricative' : def.type === 'word' ? fr.kind === 'voiced' || fr.kind === 'fricative' : fr.kind === 'voiced';
  function watchRetake(d, fr, now) {
    if (d.demoOn) return;
    if (!takeSound(d.def, fr)) { if (d.quietAt == null) d.quietAt = now; return; }
    if (d.quietAt != null && now - d.quietAt >= RETAKE_QUIET_MS) newTake(d);
    else d.quietAt = null;
  }
  function newTake(d) {
    const box = $('drill-result'), last = box && box.querySelector('.result') ? box.innerHTML : '';
    selectDrill(d.def, true);
    state.drill.prev = d.result;
    const nb = $('drill-result');
    if (nb && last) { nb.innerHTML = '<p class="eyebrow"><span>Last take</span></p>' + last; nb.classList.add('prev'); }
    const pl = state.plan, s = planStep();
    if (pl && pl.status === 'active' && s && s.def.id === d.def.id && s.after != null) addPlanNext(pl);
  }
  // A take has enough once its goal is met (time in the zone, frames of a held sound, slides), but it keeps
  // listening, and keeps scoring, for as long as you keep going: it ends when you stop (TAKE_END_MS of quiet) or
  // stop the microphone. Ending the moment the goal was met cut you off part way through a sound.
  const TAKE_END_MS = 600;
  const TAKE_READY_MSG = 'Got it. Keep going as long as you like: your result shows when you stop.';
  function takeReady(d, finish) {
    if (d.ready || d.result) return;
    d.ready = finish; d.readyQuiet = null;
    const m = $('drill-msg'); if (m && !d.demoOn) m.textContent = TAKE_READY_MSG;
  }
  function watchTakeEnd(d, fr, now) {
    if (takeSound(d.def, fr)) { d.readyQuiet = null; return; }
    if (d.readyQuiet == null) d.readyQuiet = now;
    else if (now - d.readyQuiet >= TAKE_END_MS) { const q = d.readyQuiet; d.ready(); d.quietAt = q; } // the quiet so far counts towards the next take's pause
  }
  const againNote = () => Object.assign(document.createElement('span'), { className: 'again-note', textContent: ' Pause, then go again any time: the next take starts by itself.' });
  function drillInstruction(def) {
    if (def.type === 'vowel') {
      const v = D.VOWEL_BY_KEY[def.vowel];
      return `Hold "${v.cue}" as in "${v.word}" steadily at a comfortable pitch, or repeat "${v.word}" slowly.`;
    }
    if (def.type === 'sib') return def.sib === 's' ? 'Hold a steady "sss" as in "see" for about a second.' : 'Hold a steady "shh" as in "she" for about a second.';
    return `Say "${def.cue}" naturally, a few times in a row, stretching the vowel slightly.`;
  }
  function renderDrillPanel() {
    const d = state.drill;
    if (!d) return;
    const t = d.def.type;
    (t === 'breath' ? renderBreathPanel : t === 'iso' ? renderIsoPanel : t === 'whisper' ? renderWhisperPanel : t === 'sibex' ? renderSibexPanel
      : t === 'embody' ? renderEmbodyPanel : t === 'prosody' ? renderProsodyPanel : renderSoundPanel)(d);
    arrangeDrillPanel($('drill-panel'));
  }
  // Wide screens show a drill in columns: the title across the top, then what to do (steps, demo, checker,
  // progress, result) | the live coach | Target vs you. The wrappers are display:contents on narrow screens,
  // where --o puts every part back in the order the panel was written, one under the other.
  function arrangeDrillPanel(p) {
    const kids = [...p.children], col = (c) => Object.assign(document.createElement('div'), { className: 'dp-col ' + c });
    const head = col('dp-head'), a = col('dp-a'), b = col('dp-b'), c = col('dp-c');
    kids.forEach((el, i) => {
      el.style.setProperty('--o', i);
      (el.matches('.eyebrow, .drill-title') ? head : el.matches('.coach') && !b.children.length ? b : el.matches('.tvy') && el.childElementCount ? c : a).append(el);
    });
    p.append(head, a, b, c);
    p.classList.add('dp');
    // canvases were sized where they were first drawn; redraw them at their column's width
    window.dispatchEvent(new Event('resize'));
  }
  function renderSoundPanel(d) {
    const p = $('drill-panel');
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
        <div class="fo" id="fo-coach" data-live hidden></div>
        <figure class="tract-coach" hidden><canvas id="cv-tract-coach" height="230"></canvas>
          <figcaption class="tract-key"><span><i class="ln you"></i>you</span><span><i class="ln goal"></i>goal</span><span><i class="ln arrow"></i>change</span></figcaption></figure>
      </div>
      <figure class="tvy" id="tvy"></figure>
      <div id="drill-result"></div>
      <div id="drill-actions"></div>`;
    p.querySelector('.drill-title').textContent = d.def.title;
    p.querySelector('.drill-help').textContent = drillInstruction(d.def);
    $('drill-msg').textContent = state.running ? 'Listening...' : 'Start the microphone (or analyze a recording) to begin.';
    $('ex-compare').addEventListener('click', () => (exSrc && $('ex-compare').textContent.startsWith('Stop') ? stopExample() : playExample(d.def, 'compare')));
    renderProof($('proof'), d.def);
    renderExampleNote();
    state.coach = { vf: [], vt: -1e9, sf: [], st: -1e9, hist: [], key: null, pendingKey: null, pendingAt: 0, shownAt: 0, eased: {}, trendAt: 0 };
    renderCoach();
    tvyMountDrill($('tvy'), d.def);
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
    sibBright: { title: 'Brightening a hiss', steps: [
      'The hiss is made where the air stream hits the front teeth; a smaller space in front of the tongue makes it higher and brighter.',
      'Bring the tongue tip forward: just behind the top teeth for "s", and only a small step back from there for "sh".',
      'Bring the teeth lightly closer together, without clenching.',
      'Spread the lips into a slight smile instead of pushing them forward. The s to sh glide and the two ladders in this tab practise exactly these moves.'] },
    sibDark: { title: 'Darkening a hiss', steps: [
      'A bigger space in front of the tongue makes a lower, darker hiss.',
      'Let the tongue tip ease back a little from the teeth, and open the teeth slightly.',
      'Round the lips and push them forward a little, as in "shoe".'] },
    jawClose: { title: 'Closing the jaw slightly', steps: [
      'Bring your teeth a little closer together without clenching.',
      'Keep the tongue position the same. The jaw marker moves left as the mouth closes.'] },
  };
  const CUE_HOWTO = {
    fem: { 'sib:1': ['sibBright'], 'sib:-1': ['sibDark'], '0:1': ['jawOpen', 'throatLight'], '0:-1': ['jawClose'], '1:1': ['tongueForward', 'smile'], '1:-1': ['tongueBack'], '2:1': ['smile', 'larynxUp'], '2:-1': ['smile'], 'all:1': ['larynxUp', 'smile'], 'all:-1': ['larynxDown'] },
    masc: { 'sib:1': ['sibBright'], 'sib:-1': ['sibDark'], '0:1': ['jawOpen'], '0:-1': ['larynxDown'], '1:1': ['tongueForward'], '1:-1': ['tongueBack'], '2:1': ['round'], '2:-1': ['round', 'larynxDown'], 'all:1': ['larynxUp'], 'all:-1': ['larynxDown', 'round'] },
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
      keep(co.f0 || (co.f0 = []), co.f0t || (co.f0t = []), fr.f0);
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

  // ---------------- one formant at a time ----------------
  // F1, F2 and F3 each on the resonance scale (0..100, average man 37.5, average woman 62.5 for the vowel), with the
  // goal zone, and which way and how far each one must move (D.formantOffsets). The focus pick lets feedback
  // concentrate on one formant (F1, F2, F3, or whichever is furthest off), so they can be dialled in one at a time.
  const FO_KEY = 'voicetrainer.formantfocus';
  const FO_PICKS = [['all', 'All'], ['0', 'F1'], ['1', 'F2'], ['2', 'F3'], ['worst', 'Worst']];
  const FO_ROLE = ['jaw', 'tongue', 'lips, larynx'];
  const FO_MOVE = [['open the jaw a little', 'close the jaw slightly, or open the throat'], ['tongue further forward', 'tongue further back'],
    ['less lip rounding, larynx up', 'round the lips slightly, larynx lower']];
  const FO_HELP = 'Each bar is one formant on the same 0-100 scale as the resonance score, read against the averages for the vowel you are on: the dashed box is your goal zone and the marker is you. F1 follows mostly the jaw and throat, F2 the tongue (front or back), F3 the lips and larynx height. The numbers say how much that formant would need to move to reach the zone, in % and Hz. F1 gets a wider zone because it swings with jaw opening and is the hardest to measure: above about 195-210 Hz of pitch (on "ee" and "oo"; higher on open vowels) it is set aside, and when it alone disagrees with F2 and F3 it is marked with a ? (usually jaw opening rather than size) and left out of the score and the first pick, but still shown. Pick F1, F2 or F3 to work on just that one; Worst follows whichever is furthest off.';
  let foFocus = 'all';
  try { const f = localStorage.getItem(FO_KEY); if (FO_PICKS.some(p => p[0] === f)) foFocus = f; } catch (e) {}
  // the formant the feedback is about: one picked, the worst when asked for, or null for all three
  function foChosen(off) {
    if (foFocus === 'worst') return off ? off.worst : null;
    return foFocus === 'all' ? null : +foFocus;
  }
  const foPctN = (r) => Math.max(1, Math.round(Math.abs(r.pct) * 100));
  const foHz = (r) => `${r.dHz > 0 ? '+' : '−'}${Math.round(Math.abs(r.dHz))} Hz`;
  function foVal(r, live) {
    if (r.skip === 'pitch') return r.pitchWhy === 'high' ? `set aside: pitch ${r.f0} Hz (over ${r.limitHz})` : r.pitchWhy === 'onpitch' ? `set aside: on your pitch (${r.f0} Hz)` : 'set aside (pitch)';
    if (r.skip) return r.skip === 'none' ? '--' : "couldn't measure";
    if (!r.need) return live ? `✓ ${Math.round(r.hz)} Hz` : '✓ in zone';
    const q = r.unsure ? '?' : '';
    return `${r.need > 0 ? '↑' : '↓'} ${foPctN(r)}%${q}${live ? ' · ' + foHz(r) : r.nVowels ? ` · ${r.nOff} of ${r.nVowels}` : ''}`;
  }
  const foName = (i) => `F${i + 1} (${FO_ROLE[i]})`;
  // one sentence on what to change, for the chosen formant (or the furthest off, or the whole tract)
  function foSay(off, live) {
    if (!off || off.rows.every(r => r.skip)) return live ? 'Hold a vowel to see F1, F2 and F3 one by one.' : '';
    const one = (r) => r.skip === 'pitch' ? (r.pitchWhy === 'high' ? `${foName(r.i)} is set aside: your pitch (${r.f0} Hz) is over ${r.limitHz} Hz, half this vowel's typical F1, where the harmonics are too far apart to show F1. Go a little lower to have it read.` : r.pitchWhy === 'onpitch' ? `${foName(r.i)} is set aside: what was found sits on your pitch (${r.f0} Hz), so it's the voice's own tone, not the jaw.` : `${foName(r.i)} is set aside: at this pitch it can't be read reliably.`)
      : r.skip ? `${foName(r.i)} couldn't be measured${live ? ' on this vowel' : ''}.`
      : !r.need ? `${foName(r.i)} is in the goal zone${live ? '. Keep it there' : ''}.`
      : `${foName(r.i)} needs to go ${r.need > 0 ? 'up' : 'down'} about ${foPctN(r)}%${live ? ` (${foHz(r)})` : ''}: ${FO_MOVE[r.i][r.need > 0 ? 0 : 1]}.${r.unsure ? ' F1 alone disagrees with F2 and F3. That is usually how open your jaw is, not your size (a tight, high "ee" lowers F1 in any voice, and the published averages disagree on it), so it is left out of the score but is yours to work on.' : ''}`;
    const ch = foChosen(off);
    if (ch != null) return one(off.rows[ch]);
    if (foFocus === 'worst') return 'Every formant measured is in the goal zone.';
    if (off.focus && off.focus.formant === 'all') return `F2 and F3 are both ${off.focus.dir > 0 ? 'low' : 'high'} by a similar amount: that is throat length, so ${off.focus.dir > 0 ? 'raise the larynx a little' : 'let the larynx drop a little'}.`;
    if (off.worst != null) return 'Furthest off: ' + one(off.rows[off.worst]);
    const u = off.rows.find(r => r.unsure && r.need);
    return u ? one(u) : 'All the formants measured are in the goal zone.';
  }
  function foRowHtml(r) {
    return `<div class="fo-row" data-i="${r.i}"><span class="fo-lab"><b>F${r.i + 1}</b> <small>${FO_ROLE[r.i]}</small></span>`
      + '<span class="fo-track"><i class="fo-avg m"></i><i class="fo-avg w"></i><span class="fo-zone"></span><span class="fo-mark"></span></span><span class="fo-val"></span></div>';
  }
  function foPaintRow(el, r, live, hide) {
    el.hidden = !!hide;
    el.className = 'fo-row ' + (r.skip ? 'na' : r.need ? (r.unsure ? 'off unsure' : 'off') : 'ok');
    const z = el.querySelector('.fo-zone'), m = el.querySelector('.fo-mark');
    const a = clamp(r.zone[0], 0, 100), b = clamp(r.zone[1], 0, 100);
    z.style.left = a + '%'; z.style.width = (b - a) + '%';
    m.hidden = r.score == null;
    if (r.score != null) m.style.left = clamp(r.score, 0, 100) + '%';
    el.querySelector('.fo-val').textContent = foVal(r, live);
    el.title = r.skip ? '' : `${foName(r.i)}${live ? ' ' + Math.round(r.hz) + ' Hz' : ''}, ${Math.round(r.score)} on the scale (goal zone ${Math.round(r.zone[0])}-${Math.round(r.zone[1])})`;
  }
  // A live panel: off from D.formantOffsets (null while nothing is heard). Built once, then only updated, so the
  // markers glide.
  function paintFo(el, off, opt = {}) {
    if (!el) return;
    el._fo = off; el._foOpt = opt;
    if (!el.firstChild) {
      el.innerHTML = `<div class="fo-top"><p class="fo-say"></p><div class="seg fo-pick" role="radiogroup" aria-label="Focus on one formant">${FO_PICKS.map(([k, l]) => `<button type="button" role="radio" data-fo="${k}" aria-checked="false">${l}</button>`).join('')}</div></div>`
        + `<div class="fo-rows">${[0, 1, 2].map(i => foRowHtml({ i })).join('')}</div>`;
    }
    for (const b of el.querySelectorAll('[data-fo]')) b.setAttribute('aria-checked', String(b.dataset.fo === foFocus));
    el.querySelector('.fo-say').textContent = opt.demo && off ? 'Demo voice: ' + foSay(off, true) : foSay(off, true);
    const ch = foChosen(off), rows = el.querySelectorAll('.fo-row');
    const blank = (i) => ({ i, skip: 'none', score: null, zone: zoneOf(i), need: 0 });
    rows.forEach((row, i) => foPaintRow(row, off ? off.rows[i] : blank(i), true, ch != null && i !== ch));
    el.classList.toggle('fo-one', ch != null);
    el.classList.toggle('fo-idle', !off);
  }
  // goal zone of formant i on the score scale, with nothing heard yet
  function zoneOf(i) { const [a, b] = D.COACH_BAND[state.goal], s = i === 0 ? D.F1_SLACK : 0; return [D.resScore((a - s) / 100), D.resScore((b + s) / 100)]; }
  function foRefresh() { for (const el of document.querySelectorAll('.fo[data-live]')) if (el.firstChild) paintFo(el, el._fo, el._foOpt); }
  function setFoFocus(k) {
    foFocus = k;
    try { localStorage.setItem(FO_KEY, k); } catch (e) {}
    foRefresh();
    if (state.coach) { state.coach.key = null; renderCoach(); }
  }
  // the summary of a reading or a session: sum from D.formantSummary, nV vowels heard
  function foSummaryHtml(sum, title = 'Formant by formant') {
    if (!sum || sum.rows.every(r => r.score == null)) return '';
    const w = sum.worst, r = w != null ? sum.rows[w] : null;
    let say = r ? `Furthest off: ${foName(w)}, ${r.need > 0 ? 'low' : 'high'} on ${r.nOff} of ${r.nVowels} vowel${r.nVowels > 1 ? 's' : ''}, about ${foPctN(r)}% from the goal zone where it is off: ${FO_MOVE[w][r.need > 0 ? 0 : 1]}.`
      : 'All three formants sit in the goal zone on average.';
    const tg = '';
    if (sum.together) {
      const [a, b] = [sum.rows[1], sum.rows[2]];
      say = `F2 and F3 are both ${sum.together > 0 ? 'low' : 'high'} (about ${foPctN(a)}% and ${foPctN(b)}%): that points to throat length, so ${sum.together > 0 ? 'a slightly higher larynx' : 'a slightly lower larynx'} moves both at once.`;
    }
    const aside = sum.rows[0].skip === 'pitch' ? ' F1 was set aside: your pitch was too high to read it reliably.' : '';
    const rows = sum.rows.map(x => {
      const cls = x.skip ? 'na' : x.need ? 'off' : 'ok';
      const a = clamp(x.zone[0], 0, 100), b = clamp(x.zone[1], 0, 100);
      return `<div class="fo-row ${cls}${x.i === w ? ' worst' : ''}"><span class="fo-lab"><b>F${x.i + 1}</b> <small>${FO_ROLE[x.i]}</small></span>`
        + `<span class="fo-track"><i class="fo-avg m"></i><i class="fo-avg w"></i><span class="fo-zone" style="left:${a}%;width:${b - a}%"></span>${x.score != null ? `<span class="fo-mark" style="left:${clamp(x.score, 0, 100)}%"></span>` : ''}</span>`
        + `<span class="fo-val">${foVal(x, false)}</span></div>`;
    }).join('');
    return `<div class="fo fo-sum"><div class="section-head"><h4>${title}${infoHtml('How the formants are compared', FO_HELP + ' Here each vowel is compared with its own averages, then the vowels are pooled, weighted by how long each was heard; "3 of 5" counts the vowels where that formant was off.')}</h4></div>
      <p class="fo-say">${say}${tg}${aside}</p><div class="fo-rows">${rows}</div></div>`;
  }
  // ---------------- voice dimensions panel ----------------
  // One panel for every summary (a reading's result, Freestyle's session, a drill's result): what was measured,
  // grouped by the knob it belongs to, each with its value, a bar with the goal zone, and where it sits against
  // the goal. The model comes from D.voiceDims; the knobs the app can't read yet are named once at the foot.
  const DIM_INFO = {
    pitch: 'The middle of your speaking pitch, with the range most of it sat in underneath (10th to 90th percentile). The dashed box is your target band from Settings; for a feminine goal anything above it counts too, for a masculine one anything below.',
    share: 'How much of the time your voice was in the target pitch band (or past it on the goal side).',
    res: 'How your vowels\' formants sit between the average man (37.5) and the average woman (62.5), each vowel against its own averages. The dashed box is your goal band; past its far end still counts. The three rows under it are the formants it is made from.',
    fo: FO_HELP,
    breath: 'How much air comes through with the tone, from 0 (firm, pressed) to 100 (mostly air). The dashed box is the zone the Breath exercises use for your goal. A rough guide: it notices a lot of air but can miss mild airiness.',
    spread: 'How far your pitch moves from low to high (10th to 90th percentile), in semitones. There is no target: a wider spread usually sounds livelier, and feminine speech tends to move more, but melody is a style, not a size. The Prosody exercises practise rises and falls.',
    s: 'Where the hiss of /s/ has its energy, on the same 0-100 scale as the resonance score: higher reads brighter. It uses the resonance goal band, a rough choice, as there is no published data for hiss bands. Practice > Sibilants has exercises for it.',
    sh: 'Where the hiss of /ʃ/ ("sh") has its energy, on the same 0-100 scale as the resonance score: higher reads brighter. It uses the resonance goal band, a rough choice, as there is no published data for hiss bands. Practice > Sibilants has exercises for it.',
    none: 'Larynx height shows only as a hint, when F2 and F3 move together (the note under Resonance). Vocal weight (how heavy or light the folds vibrate), twang, loudness and rhythm need measures the app doesn\'t have yet, so they are left out rather than guessed.',
  };
  const DIM_RB = new Set(['res', 's', 'sh']); // rows on the resonance scale: the rainbow marker when on target
  const dimPct = (x) => clamp(x, 0, 100).toFixed(1);
  function dimTrack(pos, zone, avgs, plain) {
    return `<span class="fo-track dim-track${plain ? ' plain' : ''}">${avgs ? '<i class="fo-avg m"></i><i class="fo-avg w"></i>' : ''}`
      + `${zone ? `<span class="fo-zone" style="left:${dimPct(zone[0])}%;width:${(clamp(zone[1], 0, 100) - clamp(zone[0], 0, 100)).toFixed(1)}%"></span>` : ''}`
      + `${pos != null ? `<span class="fo-mark" style="left:${dimPct(pos)}%"></span>` : ''}</span>`;
  }
  // model: D.voiceDims(...); opt.extra: { rowKey: html } shown under a row's verdict (a change since last time,
  // the reference voice's number); opt.more: { rowKey: text } under its value; opt.live: formants in Hz (one take);
  // opt.F: the take's F1-F3 (Hz) for opt.live; opt.title
  function dimsHtml(model, opt = {}) {
    if (!model || !model.groups.length) return '';
    const ex = opt.extra || {}, more = opt.more || {};
    const row = (r) => {
      const m = more[r.key] != null ? more[r.key] : r.more || '';
      return `<div class="dim-row ${r.status}${DIM_RB.has(r.key) ? ' rb' : ''}" data-dim="${r.key}">`
        + `<span class="dim-lab">${r.label}${r.sub ? ` <small>${r.sub}</small>` : ''}${DIM_INFO[r.key] ? infoHtml(`About ${r.label.toLowerCase()}`, DIM_INFO[r.key]) : ''}</span>`
        + `<span class="dim-val"><b>${r.value}</b>${m ? `<small>${m}</small>` : ''}</span>`
        + dimTrack(r.pos, r.zone, DIM_RB.has(r.key), r.key === 'breath' || r.key === 'spread' || r.key === 'share')
        + `<span class="dim-vs"><span class="dim-verdict">${r.status === 'ok' ? '✓ ' : ''}${r.verdict}</span>${r.goal ? `<small class="dim-goal">goal ${r.goal}</small>` : ''}${ex[r.key] ? `<span class="dim-ex">${ex[r.key]}</span>` : ''}</span></div>`;
    };
    const foRow = (x, worst) => {
      const cls = x.skip ? 'na' : x.unsure ? 'unsure' : x.need ? 'off' : 'ok', i = x.i;
      const val = opt.live && opt.F ? `${Math.round(opt.F[i])} Hz` : x.score != null ? String(Math.round(x.score)) : '--';
      return `<div class="dim-row dim-fo ${cls}${i === worst ? ' worst' : ''}${cls === 'ok' ? ' rb' : ''}" data-dim="F${i + 1}">`
        + `<span class="dim-lab"><b>F${i + 1}</b> <small>${FO_ROLE[i]}</small></span><span class="dim-val">${val}</span>`
        + dimTrack(x.score, x.zone, true, false) + `<span class="dim-vs"><span class="dim-verdict">${!x.skip && !x.need ? '✓ in zone' : foVal(x, !!opt.live)}</span></span></div>`;
    };
    const groups = model.groups.map(g => {
      let body = g.rows.map(row).join('');
      if (g.fo) body += `<div class="dim-sub" role="group" aria-label="The three formants">${g.fo.rows.map(x => foRow(x, g.fo.worst)).join('')}</div>`
        + (g.note ? `<p class="dim-note small">${g.note}</p>` : '');
      return `<section class="dim-g" data-g="${g.key}"><h5 class="dim-h">${g.title}${g.fo ? infoHtml('How the formants are compared', DIM_INFO.fo) : ''}</h5>${body}</section>`;
    }).join('');
    return `<div class="dims"><div class="section-head"><h4>${opt.title || 'Voice dimensions'}</h4><span class="muted small">goal: ${model.goal === 'fem' ? 'feminine' : 'masculine'}</span></div>
      <div class="dims-grid">${groups}</div>
      <p class="dims-nm small muted">Not measured yet: ${model.notMeasured.join(', ')}.${infoHtml('What the app does not measure yet', DIM_INFO.none)}</p></div>`;
  }
  // the off formants of one vowel, as a short line for its row in the vowel list
  function foVowelLine(off) {
    if (!off) return '';
    const parts = off.rows.filter(r => r.need && !r.skip).map(r => `F${r.i + 1} ${r.need > 0 ? '↑' : '↓'}${foPctN(r)}%${r.unsure ? '?' : ''}`);
    return parts.length ? `<span class="vm-fo${off.worst != null ? ' off' : ''}">${parts.join(' · ')}</span>` : '<span class="vm-fo ok">F1-F3 ✓</span>';
  }

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
    const fo = $('fo-live');
    if (fo) {
      paintFo(fo, fresh ? D.formantOffsets(t.F, t.v, state.goal, { f0: D.median(t.f0s || [0]) }) : null, { demo });
      const fc = $('fo-vowel'); if (fc) fc.textContent = cap ? cap.textContent : '';
    }
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
    let key = 'idle', cue, why = '', dist = null, rows = '', off = null;
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
      // F1, F2 and F3 each against the goal (the panel below); the jaw keeps the coach's steadier reading
      off = D.formantOffsets(F, v, state.goal, { f0: co.f0 && co.f0.length ? D.median(co.f0) : 0 });
      if (!off.rows[0].skip) { off.rows[0].need = c.need[0]; if (!c.need[0]) { off.rows[0].pts = 0; off.rows[0].dHz = 0; off.rows[0].pct = 0; } }
      dist = c.distance;
      key = c.focus ? `${c.focus.formant}:${c.focus.dir}` : 'ok';
      // one formant picked (or the worst): the tip is about that one only
      const ch = foChosen(off);
      if (ch != null) {
        const r = off.rows[ch];
        key = r.skip ? 'skip:' + ch : r.need ? `${ch}:${r.need}` : 'one-ok:' + ch;
        dist = r.pts;
      } else if (foFocus === 'worst') key = 'ok';
    }
    if (sRecent) {
      const cog = D.median(co.sf), c = D.coachSibilant(cog, D.SIBILANTS[def.sib], state.goal);
      rows += gaugeRow(def.sib === 's' ? '/s/' : '/ʃ/', `hiss ${(cog / 1000).toFixed(1)} kHz`, ease(co, 'sib', c.pos), c.dir);
      if (!vRecent || co.st > co.vt) { key = c.onTarget ? 'ok' : 'sib:' + c.dir; dist = c.distance; }
    }
    const foEl = $('fo-coach');
    if (foEl) { foEl.hidden = !def.vowel; if (def.vowel) paintFo(foEl, off, { demo: co.demo }); }
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
    } else if (k.startsWith('one-ok:')) {
      cue = `${foName(+k.slice(7))} is in the goal zone. Hold it there and notice how it feels.`;
    } else if (k.startsWith('skip:')) {
      cue = `${foName(+k.slice(5))} can't be read right now${+k.slice(5) === 0 ? ' (your pitch is too high for F1)' : ''}. Pick another formant to work on.`;
    } else {
      [cue, why] = COACH_CUES[state.goal][k] || ['', ''];
    }
    cueEl.textContent = cue;
    cueEl.classList.toggle('ok', k === 'ok' || k.startsWith('one-ok:'));
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
    n.textContent = 'Plays masculine, then feminine. Not scored.';
    n.append(infoBadge('About the demo sounds', `Synthesized at typical ${fem ? 'feminine' : 'masculine'} values (${parts.join('; ')}; pitch ${fem ? 'about 200' : 'about 110'} Hz). Shown on the charts, not scored. Compare plays masculine, then feminine.`));
  }
  function updateDrill(d) {
    const def = d.def;
    if (def.type === 'breath') return updateBreath(d);
    if (def.type === 'iso') return updateIso(d);
    if (def.type === 'whisper') return updateWhisper(d);
    if (def.type === 'sibex') return updateSibex(d);
    if (def.type === 'embody') return updateEmbody(d);
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
      if (d.ready) msg.textContent = TAKE_READY_MSG;
    }
    if (prog >= 1) takeReady(d, () => finishDrill(d));
  }

  // ---------------- breath exercises ----------------
  const HOLD_GAP = 10; // frames (~170 ms) a held vowel's name survives an unsteady moment
  const BREATH_WIN = 90; // frames, ~1.5 s
  // a sound with too little tone for a breathiness reading: a whisper or a breath (not a hiss: /s/ and /sh/ are fricatives)
  const isAiryFrame = (fr) => fr.breath == null && !fr.breathUneven && (fr.kind === 'other' || !!fr.whisperF);
  // { b: median reading, n: readings, air: true when tone-less frames clearly outnumber the readings }
  function recentBreath(log) {
    const b = log.filter(e => e.b != null).map(e => e.b), air = log.length - b.length;
    return { b: b.length >= 5 ? D.median(b) : NaN, n: b.length, air: air >= 20 && air >= 2 * b.length };
  }
  function breathWord(b) { return b < 36 ? 'firm' : b < 51 ? 'clear' : b < 66 ? 'light, airy' : b < 81 ? 'breathy' : 'mostly air'; } // breathiness scale 2 (D.BREATH_SCALE)
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
      <div id="drill-actions"></div>
      <div class="proof" id="proof" hidden></div>`;
    renderProof($('proof'), def);
    p.querySelector('.drill-title').textContent = def.title;
    shortWithInfo(p.querySelector('.drill-help'), def.why, 'More about this exercise');
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps(state.goal === 'fem')) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
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
    const r = demo ? { b: d.demoBr.length >= 5 ? D.median(d.demoBr.slice(-90)) : NaN, air: false } : recentBreath(d.breathLog.filter(e => e.n > frameCount - BREATH_WIN));
    const fresh = r.air || (Number.isFinite(r.b) && frameCount - breathShown < 90);
    const b = r.air ? 100 : fresh ? r.b : NaN; // too little tone to read: as airy as the gauge goes
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
      $('br-num').textContent = r.air ? 'mostly air · no clear tone to read' : `${demo ? 'demo voice · ' : ''}${Math.round(b)} · ${breathWord(b)}`;
      $('br-need').textContent = key === 'ok' ? '✓' : key === 'high' ? '← clearer' : 'airier →';
      $('br-need').className = 'g-need ' + (key === 'ok' ? 'ok' : 'off');
    } else if (c.eased.b == null) { mark.hidden = true; $('br-need').textContent = ''; $('br-num').textContent = ''; }
    if (demo || def.aim !== 'band' || d.result) return;
    if (fresh && key === 'ok') d.inZone += 6;
    const prog = d.inZone / NEED.breathIn;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    $('drill-msg').textContent = d.ready ? TAKE_READY_MSG : prog > 0 ? `In the zone for ${(d.inZone / 60).toFixed(1)} of ${(NEED.breathIn / 60).toFixed(1)} seconds.` : state.running ? 'Listening...' : '';
    if (prog >= 1) takeReady(d, () => finishBreath(d));
  }
  function finishBreath(d) {
    const def = d.def, score = D.median(d.breathFr);
    d.result = { id: def.id, score, at: Date.now() };
    state.lastScores[def.id] = score;
    session.drills.push({ id: def.id, label: def.cue, score: Math.round(score), at: d.result.at, kind: 'breath' });
    renderDrillGrid(); renderSession();
    $('drill-msg').textContent = `Done: three seconds in the zone. Your median breathiness was ${Math.round(score)} (${breathWord(score)}). Or try another exercise.`;
    $('drill-msg').append(againNote());
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
        const fit = D.scoreVowel(fr.formants, v, fr.f0);
        if (fit.ok && (fit.rms < 0.085 || D.classifyVowel(fr.formants).vowel.key === v.key)) { al.push(fit.alpha); Fs.push(fr.formants); }
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
    const text = `jaw ${pc(r.dev[0])}, tongue ${pc(r.dev[1])}, lips/larynx ${pc(r.dev[2])}${def.kind === 'pitch' || def.kind === 'slide' ? `, pitch ${r.semis >= 0 ? '+' : ''}${r.semis.toFixed(1)} st` : ''}`;
    const any = Math.max(...r.dev.map(Math.abs)) >= 0.06;
    const pitchSlid = def.kind === 'slide' && Math.abs(r.semis) > D.ISO_RULES.slide.hold;
    return { ok: r.ok, big: r.ok ? '✓' : '✗', text: (r.ok ? 'isolated · ' : pitchSlid ? 'pitch moved too · ' : r.moved ? 'not isolated · ' : any ? 'the wrong part moved · ' : 'did not move enough · ') + text };
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
  function proofItems(def, mine) {
    const items = proofBase(def);
    if (!items.length || !(TVY_TYPES.has(def.type) && def.type !== 'iso')) return items;
    // the demo voice from Settings, and a take you kept in Target vs you, graded the same way
    const v = DemoVoice.get(), voice = { pitch: v.pitch, res: v.res, bright: v.bright }, grade = items[0].grade;
    if (def.kind !== 'siren') items.push({ label: 'Your demo voice', ck: ['demo', voice.pitch, voice.res, voice.bright, Synth.getStyle()].join(':'), grade,
      make: (fs) => def.type === 'whisper' ? Synth.whisperExample(fs, def, state.goal, D.VOWELS, D.WHISPER_SHIFT, { voice }) : Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS, { voice }) });
    if (mine) items.push({ label: 'Your kept take', ck: 'mine:' + mine.at, grade, dry: true, make: (fs) => D.resample(D.fromPcm16(mine.pcm), mine.fs, fs) });
    return items;
  }
  function proofBase(def) {
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
    if (def.type === 'whisper') return whisperProofItems(def);
    if (def.type === 'sibex') return sibexProofItems(def);
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
    jaw: [1.3, 1, 1], tongue: [1, 1.2, 1], lips: [1, 0.95, 0.9], larynx: [1.1, 1.1, 1.1], pitch: [1, 1, 1], slide: null,
  };
  const ISO_WRONG = {
    jaw: { label: 'Tongue moved instead', F: [1, 1.18, 1] }, tongue: { label: 'Jaw moved instead', F: [1.3, 1.04, 1] },
    lips: { label: 'Jaw moved instead', F: [1.3, 1, 1] }, larynx: { label: 'Only the tongue moved', F: [1, 1.18, 1] },
    pitch: { label: 'Resonance moved too', F: [1.12, 1.12, 1.12] },
    slide: { label: 'Pitch climbed with it', semis: 4 },
  };
  function isoExample(fs, def, fem, right) {
    const v = D.VOWEL_BY_KEY[def.vowel], f0 = fem ? 200 : 115;
    // the slide goes from the typical masculine vowel to the typical feminine one; the wrong one lets pitch climb with it
    const slide = def.kind === 'slide', base = slide ? v.M : fem ? v.W : v.M;
    const moved = slide ? v.W : base.map((f, i) => f * (right ? ISO_MOVES[def.kind] : ISO_WRONG[def.kind].F)[i]);
    const f1 = def.kind === 'pitch' ? f0 * Math.pow(2, 5 / 12) : slide && !right ? f0 * Math.pow(2, ISO_WRONG.slide.semis / 12) : f0;
    return Synth.concat([Synth.silence(fs, 0.1), Synth.voiced(fs, 1.0, f0, f0, base, { ramp: 0.05, seed: 3 }),
      Synth.voiced(fs, 1.8, f0, f1, moved, { from: base, trans: 0.6, ramp: 0.05, seed: 5 }), Synth.silence(fs, 0.1)]);
  }
  function renderProof(host, def, mine) {
    if (!host) return;
    const items = proofItems(def, mine); if (!items.length) { host.hidden = true; return; }
    host.proofDef = def;
    // a kept take joins the list once it has been read from storage
    if (mine === undefined && TVY_TYPES.has(def.type) && def.type !== 'iso') Mine.get(Mine.key(def)).then(r => { if (r && host.proofDef === def && host.isConnected) renderProof(host, def, r); });
    host.hidden = false;
    host.innerHTML = `<p class="eyebrow"><span>Check the checker</span><span>demo sounds, graded by the app</span></p>
      <p class="proof-lead">Listen, then compare the grades.</p>
      <div class="proof-rows">${items.map((it, i) => `<div class="proof-row" id="proof-${i}">
        <button type="button" class="btn proof-play" data-i="${i}" aria-label="Play: ${it.label}">▶</button>
        <span class="proof-label">${it.label}</span><b class="proof-big">…</b><span class="proof-text">grading…</span></div>`).join('')}</div>`;
    host.querySelector('.proof-lead').append(infoBadge('About these demo sounds', `Each demo is scored by exactly the same check as your voice. Listen, then compare the grades.${items.some(it => it.ck) ? ' Your demo voice is this sound made by the demo voice set in Settings, at its pitch, resonance and brightness; change them there and this row follows.' : ''}${mine ? ' Your kept take is the take you kept under Target vs you, graded again here.' : ''}`));
    host.querySelectorAll('.proof-play').forEach(b => b.addEventListener('click', () => {
      const it = items[+b.dataset.i];
      if (exSrc && b.classList.contains('playing')) { stopExample(); return; }
      ensureCtx(); playSamples(it.make(ctx.sampleRate), null, it.label, null, it.dry);
      host.querySelectorAll('.proof-play').forEach(x => { x.classList.remove('playing'); x.textContent = '▶'; });
      b.classList.add('playing'); b.textContent = '■';
    }));
    // grade after the panel has painted
    setTimeout(() => items.forEach((it, i) => {
      const key = `${def.id}|${state.goal}|${it.ck || i}`;
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
      <div id="drill-actions"></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    p.querySelector('.pr-say').textContent = def.say;
    shortWithInfo(p.querySelector('.drill-help'), def.why, 'More about this exercise');
    const ol = p.querySelector('.breath-steps');
    for (const t of (typeof def.steps === 'function' ? def.steps(fem) : def.steps)) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('ex-play').addEventListener('click', () => (exSrc ? stopExample() : playExample(def, 'play')));
    renderProof($('proof'), def);
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
    $('drill-msg').textContent = def.pair ? 'Done: a clear fall and a clear rise on the same words. Or try another exercise.' : `Done: ${NEED_PROS} phrases on target. Or try another exercise.`;
    $('drill-msg').append(againNote());
    recordPractice(session.drills[session.drills.length - 1]);
  }

  // ---------------- control exercises ----------------
  const ISO_ROWS = [['Jaw', 'opening (F1)'], ['Tongue', 'front/back (F2)'], ['Lips, larynx', '(F3)'], ['Pitch', 'semitones']];
  const ISO_MAIN = { jaw: [0], tongue: [1], lips: [2], larynx: [0, 1, 2], pitch: [3], slide: [1, 2] };
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
      <figure class="tvy" id="tvy"></figure>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div class="btn-row"><button type="button" class="btn" id="iso-reset">Set a new starting point</button></div>
      <div class="proof" id="proof" hidden></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    shortWithInfo(p.querySelector('.drill-help'), def.why, 'More about this exercise');
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('iso-reset').addEventListener('click', () => { d.base = null; d.isoFr = []; d.inZone = 0; d.best = 0; d.eased = {}; tvyReset(TvY.drill); updateIso(d, true); });
    d.base = null; d.best = 0; d.eased = {};
    renderProof($('proof'), def);
    tvyMountDrill($('tvy'), def);
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
      cue.textContent = `Demo voice, ${demoLabel}: ${r.ok ? (def.kind === 'pitch' ? 'pitch moves while the formants hold still' : def.kind === 'slide' ? 'resonance slides while the pitch holds' : 'the right part moves on its own')
        : def.kind === 'slide' && Math.abs(r.semis) > D.ISO_RULES.slide.hold ? 'the pitch moved with it, so the check would not count it'
        : r.moved || Math.max(...r.dev.map(Math.abs)) >= 0.06 ? 'the wrong part moved, so the check would not count it' : 'holding its starting point'}.`;
      cue.classList.toggle('ok', r.ok);
      return;
    }
    if (main[0] < 3) d.best = Math.max(d.best, ...main.map(i => Math.abs(r.dev[i])));
    else d.best = Math.max(d.best, Math.abs(r.semis));
    if (r.ok) cue.textContent = def.kind === 'pitch' ? 'Pitch moved and the formants held still. That is the separation you want.'
      : def.kind === 'slide' ? 'Resonance moved and the pitch held. That is the separation you want.' : 'Isolated: the right formant is moving on its own.';
    else if (def.kind === 'slide' && Math.abs(r.semis) > D.ISO_RULES.slide.hold) {
      cue.textContent = `Pitch ${r.semis > 0 ? 'climbed' : 'dropped'} ${Math.abs(r.semis).toFixed(1)} semitones. Go back to your note and change only the brightness.`;
    } else if (r.moved) {
      const a = r.dev.map(Math.abs), names = ['The jaw (F1)', 'The tongue (F2)', 'The lips or larynx (F3)'];
      const extra = def.kind === 'pitch' ? names[a.indexOf(Math.max(...a))]
        : def.kind === 'larynx' || def.kind === 'slide' ? null : names[[0, 1, 2].filter(i => !main.includes(i)).sort((x, y) => a[y] - a[x])[0]];
      cue.textContent = def.kind === 'larynx' || def.kind === 'slide' ? 'Only some formants moved. Keep the mouth still and let the whole throat do the work.'
        : `${extra} moved too. Keep it still and move more slowly.`;
    } else cue.textContent = 'Starting point set. Now make the movement slowly, keeping the sound going.';
    if (d.result) return;
    if (r.ok) d.inZone += 6;
    const prog = d.inZone / NEED.isoIn;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    $('drill-msg').textContent = d.ready ? TAKE_READY_MSG : prog > 0 ? `Isolated for ${(d.inZone / 60).toFixed(1)} of ${(NEED.isoIn / 60).toFixed(1)} seconds.` : '';
    if (prog >= 1) takeReady(d, () => finishIso(d));
  }
  function finishIso(d) {
    const def = d.def, pct = def.kind === 'pitch' ? null : Math.round(d.best * 100);
    d.result = { id: def.id, at: Date.now() };
    tvyFreeze(TvY.drill);
    state.lastScores[def.id] = def.kind === 'pitch' ? d.best : pct;
    session.drills.push({ id: def.id, label: def.cue, score: def.kind === 'pitch' ? Math.round(d.best) : pct, at: d.result.at, kind: 'control' });
    renderDrillGrid(); renderSession();
    $('drill-msg').textContent = def.kind === 'pitch'
      ? `Done. Your pitch moved by up to ${d.best.toFixed(1)} semitones while the formants held still: the resonance reading follows your mouth and throat, not your pitch.`
      : def.kind === 'larynx' ? `Done. The jaw, tongue and lips readings all moved together, by up to ${pct}%: the feedback is tracking your larynx.`
        : def.kind === 'slide' ? `Done. Your resonance moved by up to ${pct}% while your pitch stayed within ${D.ISO_RULES.slide.hold} semitones of where you started.`
        : `Done. The ${def.kind} reading (${['F1', 'F2', 'F3'][ISO_MAIN[def.kind][0]]}) moved by up to ${pct}% while the others held steadier: the feedback is tracking your ${def.kind}.`;
    $('drill-msg').append(againNote());
    recordPractice(session.drills[session.drills.length - 1]);
  }

  // ---------------- whisper exercises ----------------
  // No voice, so pitch is out of the way: the analyzer reads the formants of the whisper's airflow
  // noise (dsp whisperFormants, frames carry whisperF). A siren counts slides of the whisper's
  // brightness (F2 and F3 together); a hold scores a whispered vowel on the usual 0-100 scale.
  const NEED_LEGS = 4; // up, down, up, down
  function renderWhisperPanel(d) {
    const p = $('drill-panel'), def = d.def, [lo, hi] = target(), siren = def.kind === 'siren';
    p.innerHTML = `
      <p class="eyebrow"><span>Whisper exercise</span><span>${siren ? 'slide up and down' : 'hold in the zone'}</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <ol class="breath-steps"></ol>
      <div class="btn-row"><button type="button" class="btn" id="ex-play">Play example</button></div>
      <div class="coach" aria-live="polite">
        <p class="eyebrow"><span>${siren ? 'Whisper brightness' : 'Whispered resonance'}</span><span id="wh-num" class="trend"></span></p>
        <p class="coach-cue" id="wh-cue"></p>
        ${siren ? '<canvas id="cv-siren" height="150"></canvas>' : `<div class="gauge">
          <span class="g-label">darker <small>to brighter</small></span>
          <span class="g-track"><span class="g-band" style="left:${lo}%;width:${hi - lo}%"></span><span class="g-mark" id="wh-mark" hidden></span></span>
          <span class="g-need" id="wh-need"></span></div>`}
        <p class="coach-why">${siren
          ? 'The line is how bright your whisper is (tongue F2 and lips/larynx F3 together), in percent around its middle. Only whispering counts; a sound with tone in it is left out.'
          : `Zone ${lo}-${hi} on the same scale as voiced vowels (0 typical masculine, 100 typical feminine), read from the tongue (F2) and lips/larynx (F3) of the whisper. A whisper raises the formants a little and the app allows for that, but speakers differ, so compare within one setup.`}</p>
      </div>
      <figure class="tvy" id="tvy"></figure>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div id="drill-actions"></div>
      <div class="proof" id="proof" hidden></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    shortWithInfo(p.querySelector('.drill-help'), def.why, 'More about this exercise');
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps(state.goal === 'fem')) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    $('ex-play').addEventListener('click', () => (exSrc ? stopExample() : playExample(def, 'play')));
    d.whFr = []; d.demoWh = []; d.legs = 0; d.span = 0; d.whScores = []; d.eased = {}; d.whc = null;
    renderProof($('proof'), def);
    tvyMountDrill($('tvy'), def);
    $('drill-msg').textContent = '';
    updateWhisper(d, true);
  }
  // a new tip has to hold for a moment before it replaces the old one (no flicker)
  function whisperCueKey(d, key) {
    const now = performance.now(), c = d.whc || (d.whc = { key: null, pending: null, at: 0 });
    if (key !== c.pending) { c.pending = key; c.at = now; }
    if (c.key === null || d.demoOn || now - c.at >= 800) c.key = key;
    return c.key;
  }
  const whisperLike = (fit) => fit.rms < 0.12 && fit.alpha > -1.5 && fit.alpha < 2.5;
  function updateWhisper(d, force) {
    if (!force && frameCount % 6) return;
    const def = d.def, cue = $('wh-cue'); if (!cue) return;
    const demo = !!d.demoOn, fr = (demo ? d.demoWh : d.whFr) || [], fem = state.goal === 'fem';
    const recent = fr.filter(f => frameCount - f.n < 30); // about the last half second
    const wh = recent.filter(f => f.F), toned = recent.filter(f => f.voiced).length;
    const who = demo ? `Demo voice, ${demoLabel}: ` : '';
    const idle = demo ? (exSrc ? `Demo playing (${demoLabel}). Its reading appears here as it sounds.` : 'That was the demo voice. Whisper yourself to carry on.')
      : !state.running ? `Start the microphone, then whisper ${def.kind === 'siren' ? 'a long "hoo"' : '"kee"'}.` : `Whisper ${def.kind === 'siren' ? 'a long "hoo", then slide it up and down' : '"kee" and hold the "ee"'}.`;
    let key = wh.length >= 5 ? 'on' : toned >= 5 ? 'voiced' : 'idle';
    if (def.kind === 'siren') {
      const b = fr.filter(f => f.F).map(f => D.whisperBrightness(f.F)), s = D.sirenLegs(b);
      d.sirenB = b;
      drawSiren(d);
      if (key === 'on') key = s.legs === 0 ? 'start' : s.dir > 0 ? 'up' : 'down';
      const text = {
        idle, voiced: `${who}that has tone in it. Whisper with no voice at all, so only the resonance moves.`,
        start: `${who}${demo ? 'a whisper, getting ready to slide.' : 'Good, that is a whisper. Now slide it up: larynx rising, tongue drifting forward toward "ee".'}`,
        up: `${who}${demo ? 'sliding up.' : 'Going up. Now let it slide back down.'}`,
        down: `${who}${demo ? 'sliding down.' : 'Coming down. Now slide it up again.'}`,
      }[whisperCueKey(d, key)];
      cue.textContent = text.charAt(0).toUpperCase() + text.slice(1);
      cue.classList.toggle('ok', s.legs > 0 && key !== 'voiced' && key !== 'idle');
      $('wh-num').textContent = b.length ? `${demo ? 'demo voice · ' : ''}${Math.min(s.legs, NEED_LEGS)} of ${NEED_LEGS} slides · range ${Math.round((Math.exp(s.span) - 1) * 100)}%` : '';
      if (demo || d.result) return;
      d.legs = Math.max(d.legs, s.legs); d.span = Math.max(d.span, s.span);
      const bar = $('drill-prog'); if (bar) bar.style.width = clamp(d.legs / NEED_LEGS * 100, 0, 100) + '%';
      // The last slide counts once it has moved far enough; the take ends when you stop (see takeReady).
      if (d.legs >= NEED_LEGS) takeReady(d, () => finishWhisper(d, Math.round((Math.exp(d.span) - 1) * 100), 'whisper'));
      return;
    }
    // hold: the whispered vowel on the 0-100 scale
    const v = D.VOWEL_BY_KEY[def.vowel], [lo, hi] = target();
    let score = NaN;
    if (key === 'on') {
      const F = [0, 1, 2].map(i => D.median(wh.map(f => f.F[i]))), fit = D.whisperFit(F, v);
      if (!whisperLike(fit)) key = 'vowel';
      else { score = score100(fit.alpha); key = onTarget(score) ? 'ok' : score < lo ? 'dark' : 'bright'; }
    }
    const shown = whisperCueKey(d, key);
    const text = {
      idle, voiced: `${who}that has tone in it. Whisper with no voice at all.`,
      vowel: `${who}${demo ? `not a clear whispered "${v.cue}".` : `That does not sound like a whispered "${v.cue}" (as in "${v.word}") yet. Keep the tongue high and forward.`}`,
      ok: `${who}${demo ? 'in the zone.' : fem ? 'In the zone. Keep this small, bright space.' : 'In the zone. Keep this relaxed, darker space.'}`,
      dark: `${who}${demo ? 'darker than the zone.' : 'Darker than the zone. Smile slightly, bring the tongue forward and let the larynx lift a little.'}`,
      bright: `${who}${demo ? 'brighter than the zone.' : 'Brighter than the zone. Relax the lips, let the larynx ease down and the tongue sit a little lower.'}`,
    }[shown];
    cue.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    cue.classList.toggle('ok', shown === 'ok');
    const mark = $('wh-mark');
    if (Number.isFinite(score)) {
      const x = ease(d, 'w', score);
      mark.hidden = false; mark.style.left = clamp(x, 0, 100) + '%'; mark.classList.toggle('ok', key === 'ok');
      $('wh-num').textContent = `${demo ? 'demo voice · ' : ''}${Math.round(score)}`;
      $('wh-need').textContent = key === 'ok' ? '✓' : key === 'dark' ? 'brighter →' : '← darker';
      $('wh-need').className = 'g-need ' + (key === 'ok' ? 'ok' : 'off');
    } else if (key === 'idle' && d.eased.w == null) { mark.hidden = true; $('wh-need').textContent = ''; $('wh-num').textContent = ''; }
    if (demo || d.result) return;
    if (Number.isFinite(score)) d.whScores.push(score);
    if (key === 'ok') d.inZone += 6;
    const prog = d.inZone / NEED.whIn;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    $('drill-msg').textContent = d.ready ? TAKE_READY_MSG : prog > 0 ? `In the zone for ${(d.inZone / 60).toFixed(1)} of ${(NEED.whIn / 60).toFixed(1)} seconds.` : '';
    if (prog >= 1) takeReady(d, () => finishWhisper(d, Math.round(D.median(d.whScores)), 'sound'));
  }
  function finishWhisper(d, score, kind) {
    const def = d.def;
    d.result = { id: def.id, score, at: Date.now() };
    tvyFreeze(TvY.drill);
    state.lastScores[def.id] = score;
    session.drills.push({ id: def.id, label: def.cue, score, at: d.result.at, kind });
    renderDrillGrid(); renderSession();
    $('drill-msg').textContent = def.kind === 'siren'
      ? `Done: two full slides up and down, across ${score}% of brightness, with no voice. Try it again a little wider, or move on to the whispered "kee".`
      : `Done: two seconds in the zone, whispered. Your median was ${score}. Now say "kee" with a light voice and keep the same space.`;
    $('drill-msg').append(againNote());
    recordPractice(session.drills[session.drills.length - 1]);
  }
  // the siren's brightness line, in percent around the middle of what you have whispered so far
  function drawSiren(d) {
    const cv = $('cv-siren'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, ax = 34 * dpr;
    const b = (d.sirenB || []).slice(-480), mid = b.length ? D.median(b) : 0;
    const y = (pc) => h / 2 - clamp(pc, -30, 30) / 30 * (h / 2 - 8 * dpr);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = C.line; g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'right'; g.lineWidth = dpr;
    for (const pc of [-20, 0, 20]) { g.beginPath(); g.moveTo(ax, y(pc)); g.lineTo(w, y(pc)); g.stroke(); g.fillText((pc > 0 ? '+' : '') + pc + '%', ax - 5 * dpr, y(pc) + 4 * dpr); }
    if (b.length < 2) { g.textAlign = 'center'; g.fillText(d.demoOn ? 'Demo playing' : 'Whisper a long "hoo"', (w + ax) / 2, h / 2 - 6 * dpr); return; }
    if (d.demoOn) { g.textAlign = 'left'; g.fillText('demo voice', ax + 6 * dpr, 12 * dpr); }
    const x = (i) => ax + 6 * dpr + i / (b.length - 1) * (w - ax - 12 * dpr);
    g.strokeStyle = C.accent; g.lineWidth = 2.4 * dpr; g.lineJoin = 'round';
    g.beginPath(); b.forEach((v, i) => { const py = y((Math.exp(v - mid) - 1) * 100); i ? g.lineTo(x(i), py) : g.moveTo(x(i), py); }); g.stroke();
  }
  // graded demos: the same checks as above, run on synthesized whispers
  function gradeWhisper(def, frames) {
    const wh = frames.filter(f => f.whisperF), toned = frames.filter(f => f.kind === 'voiced').length;
    if (wh.length < 20) return toned > 20 ? { ok: false, big: '✗', text: 'voiced, not whispered: not counted' } : { ok: false, text: 'could not be measured' };
    if (def.kind === 'siren') {
      const s = D.sirenLegs(wh.map(f => D.whisperBrightness(f.whisperF))), ok = s.legs >= NEED_LEGS;
      return { ok, big: Math.min(s.legs, NEED_LEGS), text: `${Math.min(s.legs, NEED_LEGS)} of ${NEED_LEGS} slides · range ${Math.round((Math.exp(s.span) - 1) * 100)}%` };
    }
    const v = D.VOWEL_BY_KEY[def.vowel], sc = [], Fs = [];
    for (const f of wh) { const fit = D.whisperFit(f.whisperF, v); if (whisperLike(fit)) { sc.push(score100(fit.alpha)); Fs.push(f.whisperF); } }
    if (sc.length < 20) return { ok: false, big: '✗', text: `not a clear whispered "${v.cue}"` };
    const m = D.median(sc), ok = onTarget(m), goalName = state.goal === 'fem' ? 'feminine' : 'masculine';
    return { ok, big: Math.round(m), text: `${ok ? 'in' : 'outside'} the ${goalName} target zone · F2, F3 ${[1, 2].map(i => Math.round(D.median(Fs.map(f => f[i])))).join(' · ')} Hz` };
  }
  function whisperProofItems(def) {
    const fem = state.goal === 'fem', mk = (goal, o) => (fs) => Synth.whisperExample(fs, def, goal, D.VOWELS, D.WHISPER_SHIFT, o), grade = (fr) => gradeWhisper(def, fr);
    if (def.kind === 'siren') return [
      { label: 'Up and down twice', make: mk(state.goal), grade },
      { label: 'Flat whisper', make: mk(state.goal, { wrong: 'flat' }), grade },
      { label: 'Voiced, not whispered', make: mk(state.goal, { wrong: 'voiced' }), grade },
    ];
    return [
      { label: `Typical ${fem ? 'feminine' : 'masculine'} whisper`, make: mk(state.goal), grade },
      { label: `Typical ${fem ? 'masculine' : 'feminine'} whisper`, make: mk(fem ? 'masc' : 'fem'), grade },
      { label: 'Voiced, not whispered', make: mk(state.goal, { wrong: 'voiced' }), grade },
    ];
  }

  // ---------------- sibilant brightness exercises ----------------
  // From data/sibex.json, under Practice > Sibilants after the sustained hisses. All read the hiss's spectral centre
  // (frames carry cog) and score it on the resonance scale and bands, like the sustained drills: a glide between /s/
  // and /ʃ/ (its /ʃ/ ends scored), a ladder (one held hiss per rung, darkest to brightest, or back for a masculine
  // goal) and pairs (every hiss sorted into /s/ or /ʃ/). The checks are D.glideCheck, D.ladderCheck, D.pairsCheck.
  const SX_LEGS = 4; // down, up, down, up
  const SX_PAIRS_NEED = 5; // hisses of each kind
  const SX_DEMO = { glide: 'a hiss gliding between "sss" and "shh"', ladder: 'three steps of the ladder', pairs: '"sip, ship" three times' };
  const SX_KIND = { glide: 'slide and listen', ladder: 'step by step', pairs: 'words with both hisses' };
  const SX_TIP = {
    s: { 1: 'Teeth a little closer and the tongue tip close behind the top teeth.', '-1': 'Open the teeth a little and let the tongue tip ease back.' },
    sh: { 1: 'Lips less rounded, a slight smile, tongue a touch further forward.', '-1': 'Round the lips forward and let the tongue sit a little further back.' },
  };
  const sibName = (k) => (k === 's' ? '/s/' : '/ʃ/');
  const sxRungs = (def) => (state.goal === 'fem' ? def.rungs : def.rungs.slice().reverse());
  // where a score sits against the goal band: 1 needs brighter, -1 darker, 0 in the zone (past the far end counts)
  const sxDir = (score) => (onTarget(score) ? 0 : score < target()[0] ? 1 : -1);
  function sxGauge(id, label, sub) {
    const [lo, hi] = target();
    return `<div class="gauge sx-g" id="${id}"><span class="g-label">${label} <small>${sub}</small></span>
      <span class="g-track"><span class="g-band" style="left:${lo}%;width:${hi - lo}%"></span><span class="sx-dots"></span><span class="g-mark" hidden></span></span>
      <span class="g-need"></span></div>`;
  }
  function sxPaint(el, score, dots) {
    if (!el) return;
    const mark = el.querySelector('.g-mark'), need = el.querySelector('.g-need');
    if (dots) el.querySelector('.sx-dots').innerHTML = dots.map(v => `<i style="left:${clamp(v, 0, 100).toFixed(1)}%"></i>`).join('');
    if (!Number.isFinite(score)) { mark.hidden = true; need.textContent = ''; return; }
    const dir = sxDir(score);
    mark.hidden = false; mark.style.left = clamp(score, 0, 100) + '%'; mark.classList.toggle('ok', !dir);
    need.textContent = `${Math.round(score)} ${dir ? (dir > 0 ? '→' : '←') : '✓'}`;
    need.className = 'g-need ' + (dir ? 'off' : 'ok');
  }
  function renderSibexPanel(d) {
    const p = $('drill-panel'), def = d.def, fem = state.goal === 'fem';
    const live = def.kind === 'glide' ? '<canvas id="cv-glide" height="170" role="img" aria-label="Your hiss gliding between /s/ (top) and /ʃ/ (bottom), with the goal zones shaded"></canvas>'
      : def.kind === 'ladder' ? `<div class="gauges">${sxRungs(def).map((r, i) => sxGauge('sx-r' + i, `${i + 1}. ${r.name}`, '')).join('')}</div>`
      : `<div class="gauges">${sxGauge('sx-s', '/s/', 'sss')}${sxGauge('sx-sh', '/ʃ/', 'shh')}</div>`;
    const why = def.kind === 'glide' ? `Up is a higher, brighter hiss. Shaded: the goal zones for /s/ (top) and /ʃ/ (bottom); dots: each "shh" end, scored.`
      : def.kind === 'ladder' ? `Each row is one held ${def.sib === 's' ? '"sss"' : '"shh"'} on the ${sibName(def.sib)} scale; the dashed box is your goal zone.`
      : 'Every hiss is sorted into /s/ or /ʃ/ by where it sits. Dots: each hiss; bar: their middle.';
    p.innerHTML = `
      <p class="eyebrow"><span>Sibilant exercise</span><span>${SX_KIND[def.kind]}</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <ol class="breath-steps"></ol>
      ${def.kind === 'pairs' ? '<ul class="sx-say"></ul>' : ''}
      <div class="btn-row"><button type="button" class="btn" id="ex-play">Play example</button></div>
      <div class="coach" aria-live="polite">
        <p class="eyebrow"><span>Hiss brightness</span><span id="sx-num" class="trend"></span></p>
        <p class="coach-cue" id="sx-cue"></p>
        ${live}
        <p class="coach-why" id="sx-why"></p>
      </div>
      <figure class="tvy" id="tvy"></figure>
      <div class="progress" aria-hidden="true"><div id="drill-prog"></div></div>
      <p class="drill-msg" id="drill-msg"></p>
      <div id="drill-actions"></div>
      <div class="proof" id="proof" hidden></div>`;
    p.querySelector('.drill-title').textContent = def.title;
    shortWithInfo(p.querySelector('.drill-help'), def.why, 'More about this exercise');
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps(fem)) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    const say = p.querySelector('.sx-say');
    if (say) for (const t of def.say) { const li = document.createElement('li'); li.textContent = t; say.appendChild(li); }
    const w = $('sx-why'); w.textContent = why;
    w.append(infoBadge('About hiss brightness', `The app reads where the hiss has its energy (its spectral centre) and puts it on the same 0-100 scale as the resonance score: 0 typical masculine, 100 typical feminine for that hiss (${(D.SIBILANTS.s.M / 1000).toFixed(1)} to ${(D.SIBILANTS.s.W / 1000).toFixed(1)} kHz for /s/, ${(D.SIBILANTS.sh.M / 1000).toFixed(1)} to ${(D.SIBILANTS.sh.W / 1000).toFixed(1)} kHz for /ʃ/). Those typical values are rough midpoints of published averages and speakers vary a lot; the goal zone reuses the resonance band, and for /ʃ/ there is no data of its own behind it. Treat the zone as a direction to move in, not a line to cross. A hiss centred above ${(D.SIB_SPLIT / 1000).toFixed(1)} kHz counts as /s/, below as /ʃ/; mics and rooms shift it, so compare within one setup.`));
    $('ex-play').addEventListener('click', () => (exSrc ? stopExample() : playExample(def, 'play')));
    d.sxFr = []; d.demoSx = [];
    renderProof($('proof'), def);
    // Target vs you: the hiss the exercise aims at, held (Sustain works on it), against your take. Not for the glide,
    // whose own chart shows the slide: a whole slide set against one steady hiss compares nothing useful.
    tvyMountDrill($('tvy'), def.kind === 'glide' ? def : { id: def.id, type: 'sib', sib: def.kind === 'ladder' ? def.sib : 'sh', cue: def.cue });
    $('drill-msg').textContent = '';
    updateSibex(d, true);
  }
  function updateSibex(d, force) {
    if (!force && frameCount % 6) return;
    const def = d.def, cue = $('sx-cue'); if (!cue) return;
    const demo = !!d.demoOn, fr = (demo ? d.demoSx : d.sxFr) || [], fem = state.goal === 'fem';
    const who = demo ? `Demo voice, ${demoLabel}: ` : '';
    const hissNow = fr.slice(-9).some(f => f.cog);
    let text = '', ok = false, num = '', prog = 0, ready = null;
    if (!state.running && !demo && !fr.length) text = 'Start the microphone to begin.';
    if (def.kind === 'glide') {
      const r = D.glideCheck(fr);
      d.sxGlide = r; drawGlide(d);
      const done = r.dir === -1 ? r.ends.slice(0, -1) : r.ends, last = done[done.length - 1];
      if (!text) {
        if (!r.legs) text = fr.some(f => f.cog) ? 'Good, a hiss. Now slide slowly from "sss" back toward "shh".' : 'Start with a steady "sss".';
        else if (r.dir === -1) text = 'Sliding toward "shh". Stop as soon as it turns into "shh".';
        else if (last && !last.sh) text = 'That end stayed an /s/. Slide a little further back, until it really turns into "shh".';
        else if (last) text = sxDir(last.score) === 0 ? `That "shh" end read ${Math.round(last.score)}: in the zone. Back up to "sss" and do it again.`
          : sxDir(last.score) > 0 ? `That "shh" end read ${Math.round(last.score)}, darker than the zone. Stop the slide sooner and keep the lips spread.`
          : `That "shh" end read ${Math.round(last.score)}, brighter than the zone. Let the slide go a little further back and round the lips.`;
        else text = 'Going up to "sss". Now slide back down to "shh".';
      }
      ok = !!last && last.sh && sxDir(last.score) === 0;
      num = r.legs ? `${Math.min(r.legs, SX_LEGS)} of ${SX_LEGS} slides` : '';
      prog = r.legs / SX_LEGS;
      if (r.legs >= SX_LEGS) ready = () => {
        const ends = r.ends.filter(e => e.sh), sc = Number.isFinite(r.score) ? Math.round(r.score) : null;
        finishSibex(d, sc, sc == null ? 'Done, but no slide reached "shh". Slide further back next time, until the hiss really turns into "shh".'
          : `Done: your "shh" ends read ${ends.map(e => Math.round(e.score)).join(', ')} (middle ${sc}, goal ${target().join('-')}).${r.missed ? ` ${r.missed} end${r.missed > 1 ? 's' : ''} stayed /s/.` : ''} ${sxDir(sc) === 0 ? 'Carry that "shh" into "she", "shine", "wish".' : sxDir(sc) > 0 ? 'Next time stop each slide a little sooner, while it has only just turned into "shh".' : 'Next time let each slide go a little further back.'}`);
      };
    } else if (def.kind === 'ladder') {
      const rungs = sxRungs(def), all = D.ladderCheck(fr, def.sib);
      const holding = hissNow && all.length && all[all.length - 1].b >= fr.length - 9;
      const doneN = Math.min(rungs.length, all.length - (holding ? 1 : 0));
      const recent = fr.slice(-30).filter(f => f.cog).map(f => f.cog);
      const liveSc = hissNow && recent.length >= 5 ? D.sibScore(D.median(recent), def.sib) : NaN;
      rungs.forEach((r, i) => {
        const el = $('sx-r' + i); if (!el) return;
        el.classList.toggle('cur', i === doneN && doneN < rungs.length);
        sxPaint(el, i < doneN ? all[i].score : i === doneN ? liveSc : NaN);
      });
      const cur = rungs[Math.min(doneN, rungs.length - 1)];
      if (!text) {
        if (doneN >= rungs.length) {
          const v = all.slice(0, rungs.length).map(b => b.score), moved = (v[v.length - 1] - v[0]) * (fem ? 1 : -1);
          text = moved >= 8 ? `${v.map(Math.round).join(' → ')}: your ${def.sib === 's' ? '"sss"' : '"shh"'} moved ${Math.round(Math.abs(v[v.length - 1] - v[0]))} points.` : `${v.map(Math.round).join(' → ')}: not much change yet. Make each shape bigger.`;
          ok = moved >= 8;
        } else text = `Step ${doneN + 1} of ${rungs.length}, ${cur.name}: ${cur.say} ${hissNow ? (all.length && all[all.length - 1].n >= D.RUNG_MIN ? 'Got it: pause, then the next step.' : 'Hold it about a second.') : `Hold a ${def.sib === 's' ? '"sss"' : '"shh"'} for about a second.`}`;
      }
      num = `${doneN} of ${rungs.length}`;
      prog = doneN / rungs.length;
      if (doneN >= rungs.length) ready = () => {
        const v = all.slice(0, rungs.length).map(b => Math.round(b.score)), moved = (v[v.length - 1] - v[0]) * (fem ? 1 : -1), last = v[v.length - 1];
        const best = v.reduce((b, x, i) => (sxDir(x) === 0 && b < 0 ? i : b), -1);
        finishSibex(d, last, `Done: ${rungs.map((r, i) => `${r.name} ${v[i]}`).join(', ')} (goal ${target().join('-')}). ${moved >= 8 ? `Your ${fem ? 'brightest' : 'darkest'} shape moved it ${Math.abs(v[v.length - 1] - v[0])} points.` : `It moved only ${Math.abs(v[v.length - 1] - v[0])} points; exaggerate the shapes and try again.`}${best >= 0 ? ` "${rungs[best].name}" already lands in the zone: use that shape in words.` : ''}`);
      };
    } else {
      const pr = D.pairsCheck(fr), med = (a) => (a.length ? D.median(a.map(b => b.score)) : NaN);
      sxPaint($('sx-s'), med(pr.s.slice(-12)), pr.s.slice(-12).map(b => b.score));
      sxPaint($('sx-sh'), med(pr.sh.slice(-12)), pr.sh.slice(-12).map(b => b.score));
      const n = pr.s.length + pr.sh.length;
      if (!text) {
        if (!n) text = `Say the ${def.say[0].split(' ').length > 3 ? 'phrases' : 'pairs'} below, with a small pause after each word.`;
        else {
          // the newest hiss: what it was and which way to move it
          const all = D.sibBursts(fr, { gap: 3, min: 5 }), k = all[all.length - 1].sib, b = pr[k][pr[k].length - 1], dir = sxDir(b.score);
          text = `Last hiss: ${sibName(k)} ${Math.round(b.score)}${dir ? `, ${dir > 0 ? 'darker' : 'brighter'} than the zone. ${SX_TIP[k][dir]}` : ', in the zone.'}`;
          ok = !dir;
        }
      }
      num = `/s/ ${Math.min(pr.s.length, SX_PAIRS_NEED)} of ${SX_PAIRS_NEED} · /ʃ/ ${Math.min(pr.sh.length, SX_PAIRS_NEED)} of ${SX_PAIRS_NEED}`;
      prog = (Math.min(pr.s.length, SX_PAIRS_NEED) + Math.min(pr.sh.length, SX_PAIRS_NEED)) / (2 * SX_PAIRS_NEED);
      if (pr.s.length >= SX_PAIRS_NEED && pr.sh.length >= SX_PAIRS_NEED) ready = () => {
        const ms = Math.round(med(pr.s)), mh = Math.round(med(pr.sh));
        // the score kept is the weaker of the two against the goal
        const weak = fem ? Math.min(ms, mh) : Math.max(ms, mh), wk = weak === ms ? 's' : 'sh';
        const gap = D.median(pr.s.map(b => b.cog)) / 1000, gsh = D.median(pr.sh.map(b => b.cog)) / 1000;
        finishSibex(d, weak, `Done: /s/ ${ms} and /ʃ/ ${mh} across ${pr.s.length} and ${pr.sh.length} hisses (goal ${target().join('-')}; centres ${gap.toFixed(1)} and ${gsh.toFixed(1)} kHz). ${sxDir(weak) === 0 ? 'Both in the zone.' : `${sibName(wk)} is the one to work on: ${SX_TIP[wk][sxDir(weak)].charAt(0).toLowerCase() + SX_TIP[wk][sxDir(weak)].slice(1)}`} The score kept is the weaker of the two.`);
      };
    }
    cue.textContent = who + (demo && !text ? 'playing.' : text);
    cue.classList.toggle('ok', ok);
    $('sx-num').textContent = (demo ? 'demo voice · ' : '') + num;
    if (demo || d.result) return;
    const bar = $('drill-prog'); if (bar) bar.style.width = clamp(prog * 100, 0, 100) + '%';
    // the finish is worked out afresh on every update, so a take that keeps going is scored on all of it
    d.sxFinish = ready;
    if (ready) { takeReady(d, () => d.sxFinish && d.sxFinish()); const m = $('drill-msg'); if (m) m.textContent = TAKE_READY_MSG; }
  }
  function finishSibex(d, score, text) {
    const def = d.def, ok = Number.isFinite(score);
    d.result = { id: def.id, score: ok ? score : null, at: Date.now() };
    tvyFreeze(TvY.drill);
    $('drill-msg').textContent = text;
    $('drill-msg').append(againNote());
    if (!ok) return;
    state.lastScores[def.id] = score;
    session.drills.push({ id: def.id, label: def.cue, score, at: d.result.at, kind: 'sound' });
    renderDrillGrid(); renderSession();
    recordPractice(session.drills[session.drills.length - 1]);
  }
  // the glide: your hiss's centre on a log scale (only the hiss frames, joined up), the two goal zones, the /ʃ/ ends
  function drawGlide(d) {
    const cv = $('cv-glide'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, ax = 40 * dpr, top = 8 * dpr, bot = h - 8 * dpr;
    const fr = (d.demoOn ? d.demoSx : d.sxFr) || [], r = d.sxGlide || D.glideCheck(fr);
    const lo = Math.log(2600), hi = Math.log(10500), y = (hz) => bot - (clamp(Math.log(hz), lo, hi) - lo) / (hi - lo) * (bot - top);
    const hzAt = (score, sib) => { const S = D.SIBILANTS[sib]; return S.M * Math.pow(S.W / S.M, D.resAlpha(score)); };
    g.clearRect(0, 0, w, h);
    const [blo, bhi] = target(), col = state.goal === 'fem' ? C.fem : C.masc;
    g.font = `${10 * dpr}px ${C.font}`;
    for (const sib of ['s', 'sh']) {
      const y1 = y(hzAt(bhi, sib)), y2 = y(hzAt(blo, sib));
      g.globalAlpha = 0.16; g.fillStyle = col; g.fillRect(ax, y1, w - ax, y2 - y1); g.globalAlpha = 1;
      g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText(sib === 's' ? '/s/ zone' : '/ʃ/ zone', w - 4 * dpr, y1 + 11 * dpr);
    }
    g.strokeStyle = C.line; g.lineWidth = dpr; g.textAlign = 'right'; g.fillStyle = C.muted;
    for (const k of [3, 4, 6, 8]) { const yy = y(k * 1000); g.beginPath(); g.moveTo(ax, yy); g.lineTo(w, yy); g.stroke(); g.fillText(k + ' kHz', ax - 5 * dpr, yy + 4 * dpr); }
    g.setLineDash([4 * dpr, 4 * dpr]); g.strokeStyle = C.muted; const ys = y(D.SIB_SPLIT); g.beginPath(); g.moveTo(ax, ys); g.lineTo(w, ys); g.stroke(); g.setLineDash([]);
    g.textAlign = 'left'; g.fillText('s ↑ · sh ↓', ax + 6 * dpr, ys - 4 * dpr);
    const v = r.smooth || [], n = v.length, show = Math.min(n, 480), off = n - show;
    if (show < 2) { g.textAlign = 'center'; g.fillStyle = C.muted; g.fillText(d.demoOn ? 'Demo playing' : 'Start with a steady "sss"', (w + ax) / 2, top + 14 * dpr); return; }
    const x = (i) => ax + 6 * dpr + (i - off) / Math.max(1, show - 1) * (w - ax - 12 * dpr);
    g.strokeStyle = C.accent; g.lineWidth = 2.4 * dpr; g.lineJoin = 'round';
    g.beginPath(); for (let i = off; i < n; i++) { const py = y(Math.exp(v[i])); i > off ? g.lineTo(x(i), py) : g.moveTo(x(i), py); } g.stroke();
    g.textAlign = 'center';
    for (const e of r.ends) {
      if (e.at < off) continue;
      const good = e.sh && sxDir(e.score) === 0;
      g.fillStyle = good ? C.good : C.warn;
      g.beginPath(); g.arc(x(e.at), y(e.cog), 4.5 * dpr, 0, 2 * Math.PI); g.fill();
      g.fillText(e.sh ? String(Math.round(e.score)) : 's', x(e.at), Math.min(bot, y(e.cog) + 16 * dpr));
    }
    if (d.demoOn) { g.textAlign = 'left'; g.fillStyle = C.muted; g.fillText('demo voice', ax + 6 * dpr, top + 10 * dpr); }
  }
  // graded demos: the same checks, run on synthesized hisses
  function gradeSibex(def, frames) {
    const fr = frames.map(f => ({ cog: f.kind === 'fricative' ? f.cog : null })), fem = state.goal === 'fem';
    if (def.kind === 'glide') {
      const r = D.glideCheck(fr);
      if (r.legs < SX_LEGS) return { ok: false, big: Math.min(r.legs, SX_LEGS), text: `${Math.min(r.legs, SX_LEGS)} of ${SX_LEGS} slides` };
      if (!Number.isFinite(r.score)) return { ok: false, big: '✗', text: 'no end reached /ʃ/' };
      return { ok: sxDir(r.score) === 0, big: Math.round(r.score), text: `"shh" ends ${r.ends.filter(e => e.sh).map(e => Math.round(e.score)).join(', ')} · ${sxDir(r.score) === 0 ? 'in' : 'outside'} the zone` };
    }
    if (def.kind === 'ladder') {
      const v = D.ladderCheck(fr, def.sib).map(b => Math.round(b.score)), k = def.rungs.length;
      if (v.length < k) return { ok: false, big: '✗', text: `${v.length} of ${k} steps held` };
      const moved = (v[k - 1] - v[0]) * (fem ? 1 : -1);
      return { ok: moved >= 8, big: v[k - 1], text: `${v.slice(0, k).join(' → ')} · ${moved >= 8 ? 'moved' : 'barely moved'}` };
    }
    const pr = D.pairsCheck(fr), med = (a) => Math.round(D.median(a.map(b => b.score)));
    if (pr.s.length < SX_PAIRS_NEED || pr.sh.length < SX_PAIRS_NEED) return { ok: false, big: '✗', text: `${pr.s.length} /s/, ${pr.sh.length} /ʃ/ heard` };
    const ms = med(pr.s), mh = med(pr.sh), weak = fem ? Math.min(ms, mh) : Math.max(ms, mh);
    return { ok: sxDir(weak) === 0, big: weak, text: `/s/ ${ms} · /ʃ/ ${mh}` };
  }
  function sibexProofItems(def) {
    const fem = state.goal === 'fem', g = fem ? 'W' : 'M', grade = (fr) => gradeSibex(def, fr);
    const mk = (o) => (fs) => Synth.sibExercise(fs, def, state.goal, D.VOWELS, D.SIBILANTS, o);
    // the "off" demo: a /ʃ/ (and /s/) at the other goal's typical values
    const other = { s: D.SIBILANTS.s[fem ? 'M' : 'W'], sh: D.SIBILANTS.sh[fem ? 'M' : 'W'] * (fem ? 0.92 : 1.05) };
    if (def.kind === 'glide') return [
      { label: `Glide, ${fem ? 'bright' : 'full'} "shh" ends`, make: mk({}), grade },
      { label: `Glide, ${fem ? 'dark' : 'bright'} "shh" ends`, make: mk({ sh: other.sh }), grade },
    ];
    if (def.kind === 'ladder') return [
      { label: 'Each step moves it', make: mk({}), grade },
      { label: 'All steps the same', make: mk({ flat: true }), grade },
    ];
    return [
      { label: `Typical ${fem ? 'feminine' : 'masculine'}`, make: mk({}), grade },
      { label: `${fem ? 'Dark' : 'Bright'} "sh"`, make: mk({ sh: other.sh, s: D.SIBILANTS.s[g] }), grade },
    ];
  }

  // ---------------- embodied voice ----------------
  // "Uwu with feeling": one sound, a feeling dealt at random, a gentle view of where the voice sits
  // (pitch across, resonance up) and a question to notice what the body did. Nothing is scored or saved
  // to the history; the takes this visit leave small labelled marks on the view.
  const Feelings = {
    KEY: 'voicetrainer.feelings.recent', RECENT: 20,
    recent() { try { const r = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } },
    deal() {
      const r = this.recent(), f = D.dealFeeling(DATA.emotions, r);
      r.push(f.id);
      try { localStorage.setItem(this.KEY, JSON.stringify(r.slice(-this.RECENT))); } catch (e) {}
      return f;
    },
  };
  const EMB = { hz: [80, 420], trail: 75, hold: 30 }; // view range, trail frames (~1.25 s), resonance carried over gaps
  function renderEmbodyPanel(d) {
    const p = $('drill-panel'), def = d.def, fem = state.goal === 'fem';
    p.innerHTML = `
      <p class="eyebrow"><span>Embodied voice</span><span>no score</span></p>
      <p class="drill-title"></p>
      <p class="drill-help"></p>
      <div class="emo-card" aria-live="polite">
        <p class="emo-lead">Say <b class="emo-say"></b> feeling</p>
        <p class="emo-name" id="emo-name"></p>
        <p class="emo-scene" id="emo-scene"></p>
        <div class="btn-row">
          <button type="button" class="btn primary" id="emo-next">Another feeling</button>
          <button type="button" class="btn" id="ex-play">Hear a plain "${def.say}"</button>
        </div>
      </div>
      <ol class="breath-steps"></ol>
      <div class="coach">
        <p class="eyebrow"><span>Where your voice is</span><span id="emo-count" class="trend"></span></p>
        <canvas id="cv-embody" height="200" role="img" aria-label="Your pitch (across) and resonance (up) with the ${fem ? 'high, bright' : 'low, darker'} home zone shaded"></canvas>
        <p class="emo-where" id="emo-where"></p>
        <p class="coach-why">Across is pitch, up is resonance (darker to brighter, on the same scale as the meter). The shaded corner is home for your goal. The dot is your voice now with a short tail; each finished take leaves a small mark named after its feeling. Wandering is part of it: nothing here is scored or saved.</p>
      </div>
      <div class="emo-reflect">
        <p class="eyebrow"><span>Notice</span><span id="emo-after" class="trend"></span></p>
        <p class="emo-q" id="emo-q"></p>
        <div><button type="button" class="btn sm" id="emo-q-next">Another question</button></div>
      </div>`;
    p.querySelector('.drill-title').textContent = def.title;
    shortWithInfo(p.querySelector('.drill-help'), def.why, 'More about this exercise');
    p.querySelector('.emo-say').textContent = `"${def.say}"`;
    const ol = p.querySelector('.breath-steps');
    for (const t of def.steps(fem)) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    d.emb = []; d.demoEmb = []; d.marks = []; d.takes = 0; d.takeEnd = frameCount; d.felt = new Set(); d.eased = {};
    d.q = Math.floor(Math.random() * def.reflect.length);
    $('emo-next').addEventListener('click', () => { dealFeeling(d); });
    $('emo-q-next').addEventListener('click', () => { d.q = (d.q + 1) % def.reflect.length; showReflect(d, false); });
    $('ex-play').addEventListener('click', () => (exSrc ? stopExample() : playExample(def, 'play')));
    dealFeeling(d);
    showReflect(d, false);
    updateEmbody(d, true);
  }
  function dealFeeling(d) {
    d.feeling = Feelings.deal();
    $('emo-name').textContent = d.feeling.name;
    $('emo-scene').textContent = d.feeling.scene;
    const c = document.querySelector('.emo-card');
    if (c) { c.classList.remove('dealt'); void c.offsetWidth; c.classList.add('dealt'); }
  }
  function showReflect(d, after) {
    const q = $('emo-q'); if (!q) return;
    q.textContent = d.def.reflect[d.q];
    $('emo-after').textContent = after && d.lastTake ? `after "${d.def.say}" as ${d.lastTake}` : '';
  }
  // the smoothed point for each frame: pitch is the median of the last few voiced frames (tames octave
  // slips on "oo"), resonance carries over short gaps since the glide is rarely steady enough to read
  function embodyPoints(frames) {
    const out = [], f0s = [];
    let res = NaN, resN = -1e9;
    for (const f of frames) {
      if (Number.isFinite(f.res)) { res = f.res; resN = f.n; }
      if (!f.v) { out.push(null); continue; }
      f0s.push(f.f0); if (f0s.length > 7) f0s.shift();
      out.push({ n: f.n, f0: D.median(f0s), res: f.n - resN <= EMB.hold ? res : NaN });
    }
    return out;
  }
  function inHome(pt) {
    const [plo, phi] = pitchBand(), [rlo, rhi] = target();
    return pt && pt.f0 >= plo && pt.f0 <= phi && Number.isFinite(pt.res) && pt.res >= rlo && pt.res <= rhi;
  }
  function updateEmbody(d, force) {
    if (!force && frameCount % 3) return;
    const where = $('emo-where'); if (!where) return;
    const demo = !!d.demoOn, frames = (demo ? d.demoEmb : d.emb) || [], fem = state.goal === 'fem';
    const pts = embodyPoints(frames.slice(-EMB.trail - 10));
    d.view = { pts, demo };
    // a finished take: a voiced stretch followed by a pause
    if (!demo && frameCount % 6 === 0 && frames.length) {
      for (const [a, b] of D.voicedTakes(frames.map(f => f.v))) {
        if (frames[b].n <= d.takeEnd) continue;
        d.takeEnd = frames[b].n;
        const all = embodyPoints(frames).slice(a, b + 1).filter(Boolean), r = all.filter(q => Number.isFinite(q.res));
        if (all.length >= 10) {
          d.takes++; d.felt.add(d.feeling.id); d.lastTake = d.feeling.name;
          // one mark per feeling, at the middle of its takes; the latest feelings stay on the view
          let m = d.marks.find(k => k.id === d.feeling.id);
          if (m) d.marks.splice(d.marks.indexOf(m), 1); else m = { id: d.feeling.id, name: d.feeling.name, f0s: [], rs: [] };
          m.f0s.push(D.median(all.map(q => q.f0))); if (r.length >= 3) m.rs.push(D.median(r.map(q => q.res)));
          m.f0 = D.median(m.f0s); m.res = m.rs.length ? D.median(m.rs) : NaN;
          d.marks.push(m); if (d.marks.length > 10) d.marks.shift();
          d.q = (d.q + 1) % d.def.reflect.length;
          showReflect(d, true);
        }
      }
    }
    drawEmbody(d);
    const last = pts.filter(Boolean).at(-1), now = last && frameCount - last.n < 20 ? last : null;
    const who = demo ? 'Demo voice: ' : '';
    let text;
    if (!now) text = demo ? (exSrc ? `Demo playing (${demoLabel}).` : `That was the demo voice. Say "${d.def.say}" yourself to carry on.`)
      : !state.running ? `Start the microphone, then say "${d.def.say}" feeling ${d.feeling.name}.` : `Say "${d.def.say}" when you're ready.`;
    else if (inHome(now)) text = `${who}home: ${fem ? 'high and bright' : 'low and darker'}.`;
    else {
      const [plo, phi] = pitchBand(), [rlo, rhi] = target(), bits = [];
      if (now.f0 < plo) bits.push('lower pitch'); else if (now.f0 > phi) bits.push('higher pitch');
      if (Number.isFinite(now.res)) { if (now.res < rlo) bits.push('darker'); else if (now.res > rhi) bits.push('brighter'); }
      text = bits.length ? `${who}wandered: ${bits.join(', ')} than home.${demo ? '' : ' That is fine; see if the feeling can come home with you.'}` : `${who}listening for the vowel...`;
    }
    where.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    where.classList.toggle('ok', !!now && inHome(now));
    $('emo-count').textContent = d.takes ? `${d.takes} take${d.takes > 1 ? 's' : ''} · ${d.felt.size} feeling${d.felt.size > 1 ? 's' : ''}` : '';
  }
  function drawEmbody(d) {
    const cv = $('cv-embody'); if (!cv || !C.ink) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, fem = state.goal === 'fem';
    const pad = { l: 26 * dpr, r: 10 * dpr, t: 16 * dpr, b: 22 * dpr };
    const lh0 = Math.log(EMB.hz[0]), lh1 = Math.log(EMB.hz[1]);
    const X = (hz) => pad.l + clamp((Math.log(hz) - lh0) / (lh1 - lh0), 0, 1) * (w - pad.l - pad.r);
    const Y = (r) => h - pad.b - clamp(r, 0, 100) / 100 * (h - pad.t - pad.b);
    const view = d.view || { pts: [] }, pts = view.pts, last = pts.filter(Boolean).at(-1);
    const now = last && frameCount - last.n < 20 ? last : null, home = !!now && inHome(now);
    g.clearRect(0, 0, w, h);
    // frame and light grid
    g.strokeStyle = C.line; g.lineWidth = dpr; g.strokeRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
    g.fillStyle = C.muted; g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'center';
    for (const hz of [100, 150, 200, 300]) {
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(hz), pad.t); g.lineTo(X(hz), h - pad.b); g.stroke(); g.globalAlpha = 1;
      g.fillText(hz + ' Hz', X(hz), h - 7 * dpr);
    }
    g.save(); g.translate(11 * dpr, (pad.t + h - pad.b) / 2); g.rotate(-Math.PI / 2); g.fillText('darker · brighter', 0, 0); g.restore();
    // home zone
    const [plo, phi] = pitchBand(), [rlo, rhi] = target(), col = fem ? C.fem : C.masc;
    g.fillStyle = col; g.globalAlpha = home ? 0.32 : 0.14;
    g.fillRect(X(plo), Y(rhi), X(phi) - X(plo), Y(rlo) - Y(rhi));
    g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = (home ? 2 : 1) * dpr; g.setLineDash(home ? [] : [4 * dpr, 4 * dpr]);
    g.strokeRect(X(plo), Y(rhi), X(phi) - X(plo), Y(rlo) - Y(rhi)); g.setLineDash([]);
    g.fillStyle = col; g.textAlign = 'left'; g.fillText('home', X(plo) + 5 * dpr, Y(rlo) - 6 * dpr);
    // marks left by finished takes
    g.font = `${10 * dpr}px ${C.font}`;
    const placed = [], lh = 12 * dpr; // labels step down past each other when takes land close together
    for (const m of d.marks || []) {
      const x = X(m.f0), y = Number.isFinite(m.res) ? Y(m.res) : h - pad.b - 6 * dpr, right = x > w * 0.7;
      g.strokeStyle = C.muted; g.lineWidth = 1.2 * dpr; g.beginPath(); g.arc(x, y, 4 * dpr, 0, 6.283); g.stroke();
      const label = m.name + (m.f0s.length > 1 ? ' ×' + m.f0s.length : ''), tw = g.measureText(label).width;
      const x0 = right ? x - 7 * dpr - tw : x + 7 * dpr;
      let ly = y + 3.5 * dpr;
      while (placed.some(b => Math.abs(b.y - ly) < lh && b.x0 < x0 + tw && x0 < b.x0 + b.w)) ly += lh;
      placed.push({ x0, y: ly, w: tw });
      if (Math.abs(ly - (y + 3.5 * dpr)) > 1) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(right ? x0 + tw : x0 - 2 * dpr, ly - 3.5 * dpr); g.stroke(); g.globalAlpha = 1; }
      g.fillStyle = C.muted; g.textAlign = 'left'; g.fillText(label, x0, ly);
    }
    // the tail and the dot
    const tail = pts.slice(-EMB.trail);
    g.strokeStyle = C.accent; g.lineCap = 'round'; g.lineWidth = 2.4 * dpr;
    for (let i = 1; i < tail.length; i++) {
      const a = tail[i - 1], b = tail[i];
      if (!a || !b || !Number.isFinite(a.res) || !Number.isFinite(b.res)) continue;
      g.globalAlpha = 0.1 + 0.6 * i / tail.length;
      g.beginPath(); g.moveTo(X(a.f0), Y(a.res)); g.lineTo(X(b.f0), Y(b.res)); g.stroke();
    }
    g.globalAlpha = 1;
    if (now) {
      g.beginPath();
      if (Number.isFinite(now.res)) { g.fillStyle = home ? C.good : C.accent; g.arc(X(now.f0), Y(now.res), 7 * dpr, 0, 6.283); g.fill(); }
      else { g.strokeStyle = C.accent; g.lineWidth = 2 * dpr; g.arc(X(now.f0), h - pad.b - 7 * dpr, 6 * dpr, 0, 6.283); g.stroke(); } // pitch only, resonance not read yet
    }
    if (view.demo) { g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText('demo voice', w - pad.r - 6 * dpr, pad.t + 13 * dpr); }
  }

  function finishDrill(d) {
    const def = d.def, res = { id: def.id, label: def.cue, type: def.type, at: Date.now() };
    if (d.vowelFr.length) {
      const v = D.VOWEL_BY_KEY[def.vowel];
      res.vowelScore = score100(D.median(d.vowelFr.map(f => f.alpha)));
      res.F = [0, 1, 2].map(i => D.median(d.vowelFr.map(f => f.F[i])));
      res.per = [0, 1, 2].map(i => D.median(d.vowelFr.map(f => f.per[i])) * 100);
      res.f0 = D.median(d.vowelFr.map(f => f.f0 || 0));
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
    tvyFreeze(TvY.drill);
    renderDrillGrid();
    renderSession();
    const bar = $('drill-prog'); if (bar) bar.style.width = '100%';
    $('drill-msg').textContent = 'Done. Your result is below.';
    $('drill-msg').append(againNote());
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
    addPlanNext(pl);
  }
  function addPlanNext(pl) {
    const box = $('drill-actions');
    if (box && !$('plan-next')) {
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

  // past the band's far end (brighter than most women for a feminine goal, darker than most men for a masculine one) is on target too
  function onTarget(score) { const [lo, hi] = target(); return state.goal === 'fem' ? score >= lo : score <= hi; }
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
    box.classList.remove('prev');
    const parts = [];
    const v = res.vowelScore != null ? D.VOWEL_BY_KEY[res.vowel] : null, fo = v ? D.formantOffsets(res.F, v, state.goal, { f0: res.f0 || 0 }) : null;
    const s = res.sibScore != null ? D.SIBILANTS[res.sib] : null;
    // the take's dimensions: the scored sound's resonance score and formants, its hiss, and the pitch it was held at
    const model = D.voiceDims({ goal: state.goal, pitchBand: pitchBand(),
      pitch: res.f0 > 0 ? { median: res.f0 } : null,
      res: v ? { score: res.vowelScore } : null, fo,
      sib: s ? { [res.sib]: res.sibScore } : {} });
    const label = v ? `vowel "${v.cue}" resonance score` : s ? `/${res.sib === 's' ? 's' : 'ʃ'}/ brightness` : 'score';
    const sc = res.score != null && Number.isFinite(res.score) ? res.score : (res.vowelScore ?? res.sibScore);
    parts.push(`<div class="result">
      <div class="result-score"><strong>${Math.round(sc)}</strong><span>${res.type === 'word' ? 'word score (vowel and hiss)' : label}</span><span class="pill ${onTarget(sc) ? 'good' : 'warn'}">${onTarget(sc) ? 'on target' : 'off target'}</span></div>
      ${dimsHtml(model, { title: 'This take', live: true, F: res.F, more: { s: s && res.sib === 's' ? `${(res.cog / 1000).toFixed(1)} kHz` : '', sh: s && res.sib === 'sh' ? `${(res.cog / 1000).toFixed(1)} kHz` : '' } })}
      ${fo && fo.worst != null ? `<p class="fo-say small">Furthest off: ${foName(fo.worst)}, ${FO_MOVE[fo.worst][fo.rows[fo.worst].need > 0 ? 0 : 1]}.</p>` : ''}
      ${v ? `<details class="dim-hz"><summary>Formants in Hz, against the averages</summary><table class="formant-table"><thead><tr><th></th><th>You</th><th>Masc avg</th><th>Fem avg</th></tr></thead><tbody>
        ${fo.rows.map((r, i) => `<tr class="${r.skip ? 'na' : r.need ? 'off' : 'ok'}${i === fo.worst ? ' worst' : ''}"><td>${['Jaw', 'Tongue', 'Lips, larynx'][i]} <small>F${i + 1}</small></td><td>${Math.round(res.F[i])}</td><td>${v.M[i]}</td><td>${v.W[i]}</td></tr>`).join('')}
        </tbody></table></details>` : ''}
      ${s ? `<p class="small muted">Hiss centre ${(res.cog / 1000).toFixed(1)} kHz; masc avg ${(s.M / 1000).toFixed(1)}, fem avg ${(s.W / 1000).toFixed(1)}.</p>` : ''}
      ${v ? `<p class="tip">${vowelTip(res)}</p>` : ''}${s ? `<p class="tip">${sibTip(res)}</p>` : ''}</div>`);
    box.innerHTML = parts.join('');
  }

  // ---------------- target vs you ----------------
  // Two short spectrograms side by side on one frequency axis and one time scale: the target (the exercise's own
  // demo sound, or the reference voice reading a focus spot) and you (live while you practise, then the stretch
  // that was scored). Both are made from analyzer frames the same way (D.specStrip), with F1-F3 (or a hiss's centre)
  // marked and, for a single sound, dashed lines where your goal puts them, running across both.
  const TVY_KEEP = 360; // frames of you kept while live (~6 s at 60 a second)
  const TVY_TYPES = new Set(['vowel', 'sib', 'word', 'whisper', 'iso']);
  const TvY = { drill: { kind: 'drill' }, spot: { kind: 'spot' }, cache: new Map() };
  const TVY_NAMES = { F1: 'jaw opening (F1)', F2: 'tongue front/back (F2)', F3: 'lips and larynx (F3)', cog: "the hiss's centre" };
  function tvyReset(T) { T.live = []; T.quiet = 0; T.you = null; T.youX = null; T.kept = false; T.frozen = false; T.cmp = null; tvyDraw(T); }
  // ---- your own take as a third reference (beside the demo sound and the goal lines) ----
  // One kept take per exercise and goal, in this browser only (IndexedDB; in memory where there is none). It is
  // your voice, so it is never synced. Kept as 16-bit samples with its sample rate, read back like the demo sound.
  const Mine = {
    mem: new Map(), db: null,
    key: (def) => `${def.id}|${state.goal}`,
    open() {
      if (this.db) return this.db;
      this.db = new Promise((res) => {
        try {
          const rq = indexedDB.open('voicetrainer-mine', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('m', { keyPath: 'key' });
          rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
      return this.db;
    },
    async get(k) {
      if (this.mem.has(k)) return this.mem.get(k);
      const db = await this.open(); if (!db) return null;
      const r = await new Promise((res) => { try { const rq = db.transaction('m').objectStore('m').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); } });
      this.mem.set(k, r); return r;
    },
    async put(rec) {
      this.mem.set(rec.key, rec);
      const db = await this.open(); if (!db) return;
      try { db.transaction('m', 'readwrite').objectStore('m').put(rec); } catch (e) {}
    },
    async forget(k) {
      this.mem.set(k, null);
      const db = await this.open(); if (!db) return;
      try { db.transaction('m', 'readwrite').objectStore('m').delete(k); } catch (e) {}
    },
  };
  // Which reference the left picture shows: 'typ' (typical for your goal), 'demo' (the demo voice from Settings,
  // at its pitch, resonance and brightness) or 'mine' (your kept take). Remembered on this device.
  const REF_PREF = 'voicetrainer.tvyref';
  const refPref = () => { try { return localStorage.getItem(REF_PREF) || ''; } catch (e) { return ''; } };
  const setRefPref = (w) => { try { localStorage.setItem(REF_PREF, w); } catch (e) {} };
  const tvyDemoOk = (T) => !!(T.cfg && T.cfg.def && T.cfg.def.type !== 'iso');
  const tvyMineOn = (T) => !!(T.mine && T.which === 'mine');
  const tvyDemoOn = (T) => T.which === 'demo' && tvyDemoOk(T);
  function tvyRef(T) {
    if (tvyMineOn(T)) return { st: T.mine.st, x: T.mine.x, label: tvyMineLabel(T), short: 'Your take', hear: '▶ Hear your take', of: 'your kept take', dry: true };
    if (tvyDemoOn(T)) {
      const v = DemoVoice.get();
      return { st: T.demo && T.demo.st, x: T.demo && T.demo.x, label: `Demo voice: ${v.pitch} Hz, score ${Math.round(D.resScore(v.res / 100))}`, short: 'Demo voice', hear: '▶ Hear demo voice', of: 'the demo voice', voice: v };
    }
    return { st: T.tgt, x: T.cfg && T.cfg.x, label: T.cfg ? T.cfg.tLabel : '', short: 'Target', hear: '▶ Hear target', of: null };
  }
  const tvyTgt = (T) => tvyRef(T).st;
  // the exercise's sound in the demo voice, made (and measured) when first shown
  function tvyMakeDemo(T) {
    if (!tvyDemoOk(T)) return;
    const v = DemoVoice.get(), def = T.cfg.def, cfg = T.cfg, voice = { pitch: v.pitch, res: v.res, bright: v.bright };
    const key = ['demo', def.id, state.goal, Synth.getStyle(), voice.pitch, voice.res, voice.bright, ctx.sampleRate].join('|');
    if (T.demo && T.demo.key === key) return;
    const hit = TvY.cache.get(key);
    if (hit) { T.demo = hit; return; }
    T.demo = null;
    setTimeout(() => {
      if (T.cfg !== cfg) return;
      const fs = ctx.sampleRate;
      const x = def.type === 'whisper' ? Synth.whisperExample(fs, def, state.goal, D.VOWELS, D.WHISPER_SHIFT, { voice }) : Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS, { voice });
      const e = { key, x, st: tvyStrip(T, analyzeSamples(x, fs), true) };
      TvY.cache.set(key, e); if (TvY.cache.size > 24) TvY.cache.delete(TvY.cache.keys().next().value);
      T.demo = e; tvyFrozenCmp(T); tvyDraw(T);
    }, 30);
  }
  function tvySetWhich(T, w) {
    T.which = w === 'mine' && T.mine ? 'mine' : w === 'demo' && tvyDemoOk(T) ? 'demo' : 'typ';
    if (T.which === 'demo') tvyMakeDemo(T);
  }
  function tvyLoadMine(T, r) {
    if (!r) { T.mine = null; if (T.which === 'mine') T.which = 'typ'; return; }
    const x = D.resample(D.fromPcm16(r.pcm), r.fs, ctx.sampleRate);
    T.mine = { r, x, st: tvyStrip(T, analyzeSamples(x, ctx.sampleRate), true) };
  }
  // the row under the pictures: which target to show, and keeping this take
  function tvyPaintMine(T) {
    const row = T.el && T.el.querySelector('.tvy-mine'); if (!row) return;
    const seg = row.querySelector('.seg'), keep = row.querySelector('.tvy-keep'), fg = row.querySelector('.tvy-forget');
    const canKeep = T.frozen && T.youX && T.youX.length > 0;
    seg.hidden = !tvyDemoOk(T) && !T.mine; fg.hidden = !tvyMineOn(T); keep.hidden = !canKeep;
    seg.querySelectorAll('button').forEach(b => {
      b.hidden = (b.dataset.w === 'mine' && !T.mine) || (b.dataset.w === 'demo' && !tvyDemoOk(T));
      b.setAttribute('aria-checked', String(b.dataset.w === T.which));
    });
    const kt = T.kept ? 'Kept ✓' : T.mine ? '☆ Keep this one instead' : '☆ Keep this take';
    if (keep.textContent !== kt) keep.textContent = kt;
    keep.disabled = !!T.kept;
    row.hidden = seg.hidden && keep.hidden;
  }
  function tvyMineLabel(T) {
    const r = T.mine.r, d = new Date(r.at);
    return `Target: your take${Number.isFinite(r.score) ? ` (${r.score})` : ''}, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  // what to draw for an exercise: chart top, which spectrum, where the goal sits, and the target sound itself
  function tvyDrillCfg(def) {
    const fem = state.goal === 'fem', v = def.vowel && D.VOWEL_BY_KEY[def.vowel], goalF = v && (fem ? v.W : v.M), lines = [];
    const sibGoal = def.sib && (fem ? D.SIBILANTS[def.sib].W : D.SIBILANTS[def.sib].M);
    if ((def.type === 'vowel' || def.type === 'word') && goalF) goalF.forEach((f, i) => lines.push({ f, k: 'f' + (i + 1) }));
    if (def.type === 'whisper' && def.kind !== 'siren' && goalF) [1, 2].forEach(i => lines.push({ f: goalF[i] * D.WHISPER_SHIFT[i], k: 'f' + (i + 1) }));
    if (sibGoal) lines.push({ f: sibGoal, k: 'cog' });
    const wide = def.type === 'sib' || def.type === 'word';
    return {
      fmax: def.type === 'sib' ? 11000 : def.type === 'word' ? 9000 : 5000, wide, lines, goalish: def.type !== 'iso' && def.kind !== 'siren',
      tLabel: def.type === 'iso' ? 'Target: the movement' : def.kind === 'siren' ? 'Target: a whisper sliding' : `Target: typical ${fem ? 'feminine' : 'masculine'}`,
      play: (x) => playSamples(x, 'play', def.type === 'iso' ? 'the movement' : `typical ${fem ? 'feminine' : 'masculine'}`),
      make: (fs) => def.type === 'whisper' ? Synth.whisperExample(fs, def, state.goal, D.VOWELS, D.WHISPER_SHIFT)
        : def.type === 'iso' ? isoExample(fs, def, fem, true) : Synth.example(fs, def, state.goal, D.VOWELS, D.SIBILANTS),
      key: [def.id, state.goal, Synth.getStyle()].join('|'), def,
    };
  }
  function tvyStrip(T, frames, trim) { return D.specStrip(frames, { fmax: T.cfg.fmax, wide: T.cfg.wide, trim }); }
  // An exercise opens: work out its target (once per sound, goal and voice style) and start listening
  function tvyMountDrill(host, def) {
    const T = TvY.drill;
    if (!host || !TVY_TYPES.has(def.type)) { T.el = null; return; }
    ensureCtx();
    T.cfg = tvyDrillCfg(def); T.tgt = null; T.note = 'Making the target…'; T.el = host; T.tries = 0; T.mine = null;
    tvySetWhich(T, refPref());
    tvyReset(T); tvyAttach(T);
    const key = T.cfg.key + '|' + ctx.sampleRate, hit = TvY.cache.get(key), cfg = T.cfg;
    Mine.get(Mine.key(def)).then(r => {
      if (T.cfg !== cfg || !r) return;
      tvyLoadMine(T, r); const p = refPref(); tvySetWhich(T, p === '' || p === 'mine' ? 'mine' : p); tvyFrozenCmp(T); tvyDraw(T);
    });
    const done = (e) => { if (T.cfg !== cfg) return; T.cfg.x = e.x; T.tgt = e.st; T.note = ''; tvyDraw(T); };
    if (hit) return done(hit);
    setTimeout(() => {
      if (T.cfg !== cfg) return;
      const x = cfg.make(ctx.sampleRate), e = { x, st: tvyStrip(T, analyzeSamples(x, ctx.sampleRate), true) };
      TvY.cache.set(key, e); if (TvY.cache.size > 24) TvY.cache.delete(TvY.cache.keys().next().value);
      done(e);
    }, 30);
  }
  // A focus spot opens: the reference voice (neural or demo, as in Readings) reading just those words is the target
  function tvySetSpot(S, sp) {
    const T = TvY.spot, cfg = { fmax: 5000, wide: false, lines: [], goalish: false, tLabel: 'Target: the reference voice', spot: true };
    T.cfg = cfg; T.tgt = null; T.note = 'Loading the reference voice…'; T.tries = 0; tvyReset(T);
    const t = Texts.all().find(x => x.id === S.textId);
    if (!t) { T.note = 'No reference for this text'; return; }
    ensureCtx();
    RefRead.audio(t, ctx.sampleRate).then(c => {
      if (T.cfg !== cfg) return;
      if (c.words.length !== S.texts.length || !(c.starts[sp.a] >= 0) || !(c.ends[sp.b] > 0)) { T.note = 'The reference reads a different text'; return tvyDraw(T); }
      const a = Math.max(0, Math.round((c.starts[sp.a] - 0.06) * c.fs)), b = Math.min(c.x.length, Math.round((c.ends[sp.b] + 0.12) * c.fs));
      cfg.x = c.x.slice(a, b); cfg.fs = c.fs;
      cfg.tLabel = `Target: the ${RefRead.who(c)}`;
      setTimeout(() => { if (T.cfg !== cfg) return; T.tgt = tvyStrip(T, analyzeSamples(cfg.x, c.fs), true); T.note = ''; tvyFrozenCmp(T); tvyDraw(T); }, 30);
    }, () => { if (T.cfg === cfg) { T.note = "The reference voice couldn't be loaded"; tvyDraw(T); } });
  }
  // In an exercise the live picture holds still while nothing is coming in: a short stretch of quiet is kept
  // (it shows where one try ended and the next began, and lets a consonant's gap through), then it stops scrolling.
  const TVY_QUIET_KEEP = 12; // frames, ~0.2 s
  const tvyQuiet = (fr) => fr.kind === 'silence' || (fr.kind === 'other' && !fr.whisperF);
  function tvyPush(T, fr) {
    if (!T.el || !T.cfg || T.frozen) return;
    if (!T.cfg.spot) {
      T.quiet = tvyQuiet(fr) ? (T.quiet || 0) + 1 : 0;
      if (T.quiet > TVY_QUIET_KEEP || (T.quiet && !T.live.length)) return;
    }
    T.live.push({ kind: fr.kind, spec: fr.spec, wide: fr.wide, formants: fr.formants, whisperF: fr.whisperF, cog: fr.cog, fsd: fr.fsd, n: Tap.n });
    if (T.live.length > (T.cfg.spot ? 2 * TVY_KEEP : TVY_KEEP)) T.live.shift();
    if (frameCount % 3 === 0) tvyDraw(T);
  }
  // how much of you the live panel shows: a little more than the target, so a whole try fits beside it
  const tvyWin = (T) => { const t = tvyTgt(T); return clamp(Math.round((t ? t.cols : 90) * 1.3), 90, T.cfg && T.cfg.spot ? 2 * TVY_KEEP : 240); };
  // The try is over: keep the stretch that was scored (the last window, trimmed to the sound) and compare it
  function tvyFreeze(T) {
    if (!T.cfg || T.frozen) return;
    T.frozen = true; T.tries = (T.tries || 0) + 1;
    const win = T.cfg.spot ? T.live || [] : (T.live || []).slice(-tvyWin(T));
    T.you = tvyStrip(T, win, true);
    tvyFrozenCmp(T); tvyDraw(T);
    // the sound behind the scored stretch, so it can be kept as your reference (the newest samples land a block late)
    const span = !T.cfg.spot && Tap.ring && buf && D.takeSpan(win.filter(f => tvyQuiet(f) === false).map(f => f.n), buf.length, Tap.ring.fs);
    if (span) {
      const cfg = T.cfg, ring = Tap.ring;
      setTimeout(() => { if (T.cfg !== cfg || !T.frozen) return; T.youX = ring.slice(span.a, span.z); T.youFs = ring.fs; tvyPaintMine(T); }, 250);
    }
  }
  function tvyFrozenCmp(T) { const t = tvyTgt(T); T.cmp = T.frozen && t && T.you && T.you.cols ? D.compareStrips(t, T.you, { vowel: T.cfg.def && T.cfg.def.type === 'vowel' ? D.VOWEL_BY_KEY[T.cfg.def.vowel] : null }) : null; }
  // the line under the pictures: the formant that differs most, in plain words
  function tvySay(T) {
    if (!T.cfg) return '';
    if (!T.frozen) return T.cfg.spot ? (T.tgt ? 'Read the line: your try fills in on the right.' : '') : 'Make the sound: it scrolls in on the right and holds still while you are quiet.';
    const c = T.cmp;
    if (!c || !c.rows.length) return 'Too little of your sound was read to compare in numbers; the picture still shows it.';
    const of = !T.cfg.spot && tvyRef(T).of, mine = !!of;
    if (!c.big) return T.cfg.spot ? 'Across the phrase, your formants sit within 4% of the reference.' : tvyMineOn(T) ? 'Your formants sit within 4% of your kept take. Same sound again.' : of ? `Your formants sit within 4% of ${of}. Close match.` : 'Your formants sit within 4% of the target. Close match.';
    const b = c.big, fem = state.goal === 'fem', pc = Math.round(Math.abs(b.r - 1) * 100), up = b.r > 1;
    const past = T.cfg.goalish && !mine && (fem ? up : !up) ? ', past the typical voice, which still counts for your goal' : '';
    const all = c.rows.length > 1 ? ` (${c.rows.map(r => r.aside ? `F1 set aside at ${r.f0} Hz` : `${r.k === 'cog' ? 'hiss' : r.k} ${r.r >= 1 ? '+' : '−'}${Math.round(Math.abs(r.r - 1) * 100)}%`).join(', ')})` : '';
    return `${T.cfg.spot ? 'Across the phrase, the' : of ? `Biggest difference from ${of}:` : 'Biggest difference:'} ${TVY_NAMES[b.k]}${T.cfg.spot ? ' sits' : ','} ${Math.round(b.y)} Hz against ${Math.round(b.t)} Hz, ${pc}% ${up ? 'higher' : 'lower'}${past}.${all}`;
  }
  function tvyAttach(T, host) {
    if (host) T.el = host;
    const el = T.el; if (!el || !T.cfg) return;
    const spot = T.cfg.spot;
    const hold = !spot && T.cfg.def && Sustain.applies(T.cfg.def);
    el.innerHTML = `<div class="tvy-head"><b>Target vs you</b><span class="tvy-btns">${hold ? '<button type="button" class="btn sm ghost tvy-hold"></button>' : ''}<button type="button" class="btn sm ghost tvy-play"${spot ? ' data-spot="1"' : ''}>▶ Hear target</button></span></div>
      <canvas class="tvy-cv" height="170" role="img" aria-label="Spectrogram of the target and of you, side by side on one frequency scale"></canvas>
      <p class="small tvy-read"><span class="tvy-say"></span></p>${spot ? '' : `
      <div class="tvy-mine" hidden><span class="seg" role="radiogroup" aria-label="Compare with" hidden><button type="button" role="radio" data-w="typ">Typical</button><button type="button" role="radio" data-w="demo">Demo voice</button><button type="button" role="radio" data-w="mine">Your take</button></span><button type="button" class="btn sm ghost tvy-keep" hidden></button><button type="button" class="btn sm ghost tvy-forget" hidden title="Forget your kept take" aria-label="Forget your kept take">✕</button></div>`}`;
    el.querySelector('.tvy-read').append(infoBadge('About Target vs you', `Left: ${spot ? 'the reference voice reading these words' : "this exercise's demo sound"}. Right: you, ${spot ? 'from your latest try' : 'live while you practise, then the stretch that was scored'}. Both are drawn the same way, low to high (0-${T.cfg.fmax / 1000} kHz), on the same time scale, with the formants read marked: F1 amber (jaw), F2 rose (tongue), F3 blue (lips and larynx)${T.cfg.wide ? ', and the centre of a hiss in the accent colour' : ''}. ${T.cfg.lines.length ? 'Dashed lines run across both at your goal for this sound; a band of yours sitting under its line means that part is darker than the goal. ' : spot ? 'A phrase has many vowels, so there is no single goal line; compare the shape of the bands word by word. ' : ''}The target is ${spot ? 'a machine reading (neural or demo voice), a guide rather than the only right way' : 'synthetic, at typical values, so your bands can sit a little apart and still be on goal'}. Measured on synthetic voices; real voices vary more.`));
    const btn = el.querySelector('.tvy-play'), hb = el.querySelector('.tvy-hold');
    btn.onclick = () => {
      if (!spot && exSrc) return stopExample();
      if (tvyMineOn(T)) return playSamples(T.mine.x, 'play', 'your kept take', null, true);
      if (tvyDemoOn(T)) {
        const r = tvyRef(T);
        if (hold && Sustain.on) return playHeld(T.cfg.def, r.voice);
        return r.x && playSamples(r.x, 'play', 'the demo voice');
      }
      if (!spot && hold && Sustain.on) return playHeld(T.cfg.def);
      const x = T.cfg && T.cfg.x; if (!x) return;
      if (spot) { if (Run.on) return; tvyPlayRaw(x, T.cfg.fs); } else T.cfg.play(x);
    };
    if (hb) {
      const paint = () => { hb.textContent = Sustain.on ? 'Sustain on' : 'Sustain off'; hb.setAttribute('aria-pressed', String(Sustain.on)); hb.classList.toggle('ghost', !Sustain.on); hb.title = Sustain.on ? 'Hear target holds the sound until you press Stop' : 'Hear target plays a short example'; };
      hb.onclick = () => { Sustain.set(!Sustain.on); paint(); if (exSrc) stopExample(); setExampleUi(null); };
      paint();
      hb.after(infoBadge('About Sustain', `With Sustain on, Hear target holds the ${T.cfg.def.type === 'sib' ? 'hiss' : T.cfg.def.type === 'word' ? "word's vowel" : 'sound'} at one steady pitch and the same goal formants until you press Stop (or two minutes pass), so you can tune to it by ear and watch it on the charts. Like every demo, it is not scored as you while it plays: press Stop, then make the sound yourself. If you hum along anyway, use headphones so the microphone hears only you. Works in both the Natural and Classic practice voice.`));
    }
    btn.disabled = spot && Run.on;
    const row = el.querySelector('.tvy-mine');
    if (row) {
      row.querySelectorAll('.seg button').forEach(b => { b.onclick = () => {
        tvySetWhich(T, b.dataset.w); setRefPref(T.which);
        if (exSrc) stopExample();
        tvyFrozenCmp(T); tvyDraw(T);
      }; });
      row.querySelector('.tvy-keep').onclick = () => {
        if (!T.youX || !T.cfg || !T.cfg.def) return;
        const res = state.drill && state.drill.result, sc = res && Number(res.score);
        const rec = { key: Mine.key(T.cfg.def), pcm: D.toPcm16(T.youX), fs: T.youFs, at: Date.now(), score: Number.isFinite(sc) ? Math.round(sc) : null };
        Mine.put(rec); tvyLoadMine(T, rec); T.which = 'mine'; T.kept = true; setRefPref('mine');
        if ($('proof') && $('proof').proofDef === T.cfg.def) renderProof($('proof'), T.cfg.def, rec);
        tvyFrozenCmp(T); tvyDraw(T);
      };
      row.querySelector('.tvy-forget').onclick = () => {
        if (!T.mine || !T.cfg || !T.cfg.def) return;
        if (exSrc) stopExample();
        Mine.forget(Mine.key(T.cfg.def)); tvyLoadMine(T, null); T.kept = false;
        if ($('proof') && $('proof').proofDef === T.cfg.def) renderProof($('proof'), T.cfg.def, null);
        tvyFrozenCmp(T); tvyDraw(T);
      };
      row.append(infoBadge('About the references', "The switch picks the left picture. Typical: this exercise's sound at typical values for your goal. Demo voice: the same sound in the demo voice set in Settings, at its pitch, resonance and brightness (change them there). Your take: a take of yours you kept with Keep this take, so you can aim to repeat a sound you already made. Hear plays whichever is shown, and the line under the pictures compares your try with it. The dashed goal lines stay the same whatever you pick, and the score is always against the goal. A kept take is one per exercise and goal (keeping another replaces it, ✕ forgets it), stays in this browser only and is never synced, since it is your voice."));;
    }
    tvyDraw(T);
  }
  let tvySrc = null;
  function tvyPlayRaw(x, fs) {
    ensureCtx();
    if (tvySrc) { try { tvySrc.stop(); } catch (e) {} tvySrc = null; }
    const ab = ctx.createBuffer(1, x.length, fs); ab.copyToChannel(x, 0);
    const s = ctx.createBufferSource(); s.buffer = ab; s.connect(ctx.destination); s.onended = () => { if (tvySrc === s) tvySrc = null; }; s.start(); tvySrc = s;
  }
  function tvyImage(st) {
    if (st._cv && st._lut === LUT) return st._cv;
    const cv = document.createElement('canvas'); cv.width = Math.max(1, st.cols); cv.height = st.rows;
    if (st.cols) {
      const g = cv.getContext('2d'), im = g.createImageData(cv.width, cv.height);
      for (let c = 0; c < st.cols; c++) for (let r = 0; r < st.rows; r++) {
        const v = st.v[c * st.rows + r], o = ((st.rows - 1 - r) * cv.width + c) * 4;
        im.data[o] = LUT[v * 3]; im.data[o + 1] = LUT[v * 3 + 1]; im.data[o + 2] = LUT[v * 3 + 2]; im.data[o + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }
    st._cv = cv; st._lut = LUT;
    return cv;
  }
  function tvyDraw(T) {
    const el = T && T.el, cv = el && el.isConnected && el.querySelector('.tvy-cv');
    if (!cv || !C.ink || !LUT) return;
    fitCanvas(cv);
    const g = cv.getContext('2d'), dpr = dprOf(), W = cv.width, H = cv.height, cfg = T.cfg, fmax = cfg.fmax;
    const ax = 30 * dpr, gap = 8 * dpr, top = 18 * dpr, bot = 2 * dpr, pw = (W - ax - gap) / 2, ph = H - top - bot;
    const Y = (f) => top + (1 - f / fmax) * ph, X = [ax, ax + pw + gap];
    g.fillStyle = C.panel; g.fillRect(0, 0, W, H);
    g.font = `${10 * dpr}px ${C.font}`; g.textBaseline = 'alphabetic';
    // the frequency axis
    g.fillStyle = C.muted; g.textAlign = 'right';
    const step = fmax > 6000 ? 2000 : 1000;
    for (let f = step; f < fmax; f += step) g.fillText(f / 1000 + 'k', ax - 6 * dpr, Y(f) + 3.5 * dpr);
    const you = T.frozen ? T.you : T.live && T.live.length ? tvyStrip(T, T.live.slice(-tvyWin(T)), false) : null;
    const tgt = tvyTgt(T), span = Math.max(tvyWin(T), tgt ? tgt.cols : 0, T.frozen && you ? you.cols : 0), cw = pw / span;
    const halo = fmHalo();
    const strip = (st, x0, right) => {
      if (!st || !st.cols) return;
      const w = st.cols * cw, sx = right ? x0 + pw - w : x0;
      g.imageSmoothingEnabled = true; g.drawImage(tvyImage(st), 0, 0, st.cols, st.rows, sx, top, w, ph);
      for (let c = 0; c < st.cols; c++) {
        const x = sx + c * cw, mw = Math.max(1, cw + 0.5);
        (st.fm[c] || []).forEach((f, i) => {
          if (!(f > 0) || f >= fmax) return;
          if (halo) { g.fillStyle = halo; g.fillRect(x, Y(f) - 2.5 * dpr, mw, 5 * dpr); }
          g.fillStyle = C['f' + (i + 1)]; g.fillRect(x, Y(f) - 1.5 * dpr, mw, 3 * dpr);
        });
        const s = st.cog[c];
        if (s > 0 && s < fmax) { g.fillStyle = C.accent; g.fillRect(x, Y(s) - 1.5 * dpr, mw, 3 * dpr); }
      }
    };
    for (const x0 of X) { g.fillStyle = LUT ? `rgb(${LUT[0]},${LUT[1]},${LUT[2]})` : C.panel; g.fillRect(x0, top, pw, ph); }
    strip(tgt, X[0], false);
    strip(you, X[1], !T.frozen);
    // empty panels say why
    g.fillStyle = C.muted; g.textAlign = 'center';
    if (!tgt) g.fillText(tvyDemoOn(T) ? 'Making the demo voice…' : T.note || '', X[0] + pw / 2, top + ph / 2);
    if (!you || !you.cols) g.fillText(T.frozen ? 'Nothing heard' : cfg.spot && Run.on ? 'Listening…' : 'You appear here', X[1] + pw / 2, top + ph / 2);
    // the goal, dashed across both panels, with a mark on the axis
    g.lineWidth = 1.5 * dpr; g.setLineDash([5 * dpr, 4 * dpr]);
    for (const l of cfg.lines) {
      if (!(l.f < fmax)) continue;
      const y = Y(l.f), col = l.k === 'cog' ? C.accent : C[l.k];
      g.strokeStyle = col; g.globalAlpha = 0.9;
      g.beginPath(); g.moveTo(X[0], y); g.lineTo(X[0] + pw, y); g.moveTo(X[1], y); g.lineTo(X[1] + pw, y); g.stroke();
      g.globalAlpha = 1; g.fillStyle = col;
      g.beginPath(); g.moveTo(ax - 5 * dpr, y - 4 * dpr); g.lineTo(ax - 0.5, y); g.lineTo(ax - 5 * dpr, y + 4 * dpr); g.closePath(); g.fill();
    }
    g.setLineDash([]);
    // frames round the panels and their names
    g.strokeStyle = C.line; g.lineWidth = 1;
    for (const x0 of X) g.strokeRect(x0 + 0.5, top + 0.5, pw - 1, ph - 1);
    g.fillStyle = C.muted; g.textAlign = 'left';
    const yName = T.frozen ? (cfg.spot ? `You: try ${T.tries}` : 'You: the scored take') : cfg.spot ? 'You' : 'You: live';
    const fit = (long, short) => (g.measureText(long).width <= pw - 4 * dpr ? long : short);
    const ref = tvyRef(T), tl = ref.label;
    g.fillText(fit(tl, fit(tl.replace(/, [^,]+$/, ''), ref.short)), X[0], 12 * dpr);
    g.fillText(fit(yName, T.frozen && !cfg.spot ? 'You: scored' : yName.replace(': live', '')), X[1], 12 * dpr);
    const say = el.querySelector('.tvy-say'); if (say) say.textContent = tvySay(T);
    const btn = el.querySelector('.tvy-play'); if (btn) { btn.disabled = !(cfg.spot ? cfg.x : ref.x) || (cfg.spot && Run.on); const bt = cfg.spot ? '▶ Hear target' : ref.hear; if (!exSrc && btn.textContent !== bt) btn.textContent = bt; }
    tvyPaintMine(T);
  }

  // ---------------- session summary ----------------
  function barRow(label, sub, score) {
    const row = document.createElement('div');
    row.className = onTarget(Math.round(score)) ? 'bar in' : 'bar';
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
      vowels, sib, map: D.vowelMap(s.vf),
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
    const vm = $('sess-vmap');
    if (vm) { vm.hidden = !st.map.length; if (st.map.length) vm.innerHTML = vowelMapSvg(st.map.map(m => ({ k: m.k, F: m.F, s: m.s, n: m.n }))); }
    const dm = $('sess-dims');
    if (dm) {
      const vp = session.pitch.filter(p => p > 0), [plo, phi] = pitchBand();
      const share = vp.length >= 10 ? vp.filter(p => (state.goal === 'fem' ? p >= plo : p <= phi)).length / vp.length : NaN;
      const model = D.voiceDims({ goal: state.goal, pitchBand: pitchBand(),
        pitch: st.pitch ? { median: st.pitch.median, p10: st.pitch.p10, p90: st.pitch.p90, share } : null,
        res: Number.isFinite(st.resonance) ? { score: st.resonance } : null,
        fo: st.map.length ? D.formantSummary(st.map, state.goal, st.pitch ? st.pitch.median : 0) : null,
        breath: Number.isFinite(st.breath) ? st.breath : null, sib: { s: st.sib.s && st.sib.s.score, sh: st.sib.sh && st.sib.sh.score } });
      const html = model.groups.length ? dimsHtml(model, { title: 'This session so far', more: { breath: Number.isFinite(st.breath) ? breathWord(st.breath) : '' } })
        : '<p class="empty">Speak, hold a vowel or an "sss": pitch, resonance score, formants, breathiness and sibilants appear here, each against your goal.</p>';
      // redrawn twice a second while you speak: not while one of its info badges is open, nor when nothing changed
      const key = html.replace(/info-dyn-\d+/g, '');
      if (dm._key !== key && !dm.querySelector('.info-btn[aria-expanded="true"]')) { dm._key = key; dm.innerHTML = html; }
    }
    const dn = $('sess-drills'); if (dn) dn.textContent = session.drills.length ? `${session.drills.length} drill${session.drills.length > 1 ? 's' : ''} done ·` : '';
  }

  function resetSessionViews() {
    $('sess-vowels').innerHTML = '<p class="empty">Vowels you use will appear here with their own score, so you can see which ones pull your resonance down.</p>';
    renderSession();
  }

  // ---------------- saved data: Google Drive ----------------
  // Readings and practice history (plus settings and your own texts) live in one JSON file in the
  // user's Google Drive, as in petravanta's other apps. Until Drive is connected, and where Drive
  // can't be used (a file opened from disk, a claude.ai Artifact), the browser keeps the copy.
  const GOOGLE_CLIENT_ID = /^(petravanta\.github\.io|localhost)$/.test(location.hostname) ? '326863468616-4hf2conk0ks0s4qdva9tphphdo7ht7eh.apps.googleusercontent.com' : '';
  const PRIVACY = '<a href="https://petravanta.github.io/general/privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="https://petravanta.github.io/general/terms.html" target="_blank" rel="noopener">Terms</a>';
  const emptyData = () => ({ settings: {}, readings: [], practice: [], texts: [], songs: [], songsGone: {}, deleted: [] });
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
      // scores saved on the old resonance scale are moved to the current one (D.migrateRecord)
      readings: union('readings').map(r => D.migrateRecord(r, 'readings')).sort((x, y) => (x.at < y.at ? -1 : 1)),
      practice: union('practice').map(r => D.migrateRecord(r, 'practice')).sort((x, y) => (x.at < y.at ? -1 : 1)),
      texts: union('texts', true),
      ...D.songsMerge(a, b), // Your songs (Sing): newest change per song wins, removals included
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
     Keeps an app's data in one JSON file in the user's Google Drive, at petravanta/<App name>/<file> (drive.file scope: the apps
     only see files they created). A file saved before folders existed is moved there once, on the first connect.
     The browser keeps a copy of the last data, so the app opens straight away even when the hour-long Google sign-in has run out,
     and changes that haven't reached Drive yet (for example while offline). The first tap after that reconnects, merges with
     Drive's copy and saves. */
  function DriveStore(o){
    // o: {clientId, file:'App data.json', folder:'App name' (default: file without ' data.json'), app:'app-id', key:'localStorage prefix', empty:()=>data, merge:(remote,local)=>data,
    //     onChange:()=>{}, onRemote:data=>{} (Drive's copy changed what the app shows)}
    const API='https://www.googleapis.com';
    const get=k=>{try{return JSON.parse(localStorage.getItem(o.key+'.'+k)||'null')}catch(e){return null}};
    const put=(k,v)=>{try{v==null?localStorage.removeItem(o.key+'.'+k):localStorage.setItem(o.key+'.'+k,JSON.stringify(v));return true}catch(e){return false}};
    const S={token:null,exp:0,email:get('email')||'',fileId:get('file'),folderId:get('folder'),known:!!get('known'),data:null,stale:false,busy:false,err:null,last:null,timer:null,ask:0};
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
    // Files live in petravanta/<App name>/ in the user's Drive (STANDARDS.md, "Where it lives").
    // Every app shares one OAuth client, so they all see the one petravanta folder whichever app made it.
    const ROOT='petravanta', SUB=o.folder||o.file.replace(/ data\.json$/i,'');
    const FOLDER='application/vnd.google-apps.folder', qs=v=>"'"+String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
    async function folder(name,parent){
      const q=encodeURIComponent(`name=${qs(name)} and mimeType='${FOLDER}' and ${qs(parent)} in parents and trashed=false`);
      const j=await (await call(`/drive/v3/files?q=${q}&orderBy=createdTime&fields=files(id)`)).json();
      if(j.files&&j.files[0]) return j.files[0].id; // two apps racing may make two; the oldest wins from then on
      return (await (await call('/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name,mimeType:FOLDER,parents:[parent]})})).json()).id;
    }
    async function home(){
      if(S.folderId) return S.folderId;
      S.folderId=await folder(SUB,await folder(ROOT,'root')); put('folder',S.folderId); return S.folderId;
    }
    // One-time move of a file saved before folders (in My Drive's root) into the app's folder. Moving keeps the file's id,
    // so other devices that remember it carry on.
    async function tidy(id){
      if(get('moved')===id) return;
      const dir=await home(), f=await (await call(`/drive/v3/files/${id}?fields=parents`)).json(), from=(f.parents||[]).filter(p=>p!==dir);
      if((f.parents||[]).indexOf(dir)<0) await call(`/drive/v3/files/${id}?addParents=${dir}`+(from.length?`&removeParents=${from.join(',')}`:'')+'&fields=id',
        {method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
      put('moved',id);
    }
    async function find(){
      if(S.fileId){try{const j=await (await call(`/drive/v3/files/${S.fileId}?fields=id,trashed`)).json(); if(!j.trashed){await tidy(S.fileId); return S.fileId}}catch(e){if(e.code!=='http') throw e}}
      const dir=await home(), name=`name=${qs(o.file)} and trashed=false`, list=async q=>
        (await (await call(`/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&fields=files(id)`)).json()).files||[];
      // The app's folder first, then anywhere else this app can see (a copy saved before folders)
      const hit=(await list(`${name} and ${qs(dir)} in parents`))[0]||(await list(name))[0];
      S.fileId=hit?hit.id:null; put('file',S.fileId); if(S.fileId) await tidy(S.fileId); return S.fileId;
    }
    async function read(){const id=await find(); return id?(await call(`/drive/v3/files/${id}?alt=media`)).json():null}
    async function write(data){
      const body=JSON.stringify({app:o.app,saved:new Date().toISOString(),...data}), id=await find();
      if(id){await call(`/upload/drive/v3/files/${id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});return}
      const b='b'+Math.random().toString(36).slice(2), meta=JSON.stringify({name:o.file,mimeType:'application/json',parents:[await home()]});
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
      S.token=null; S.exp=0; S.data=null; S.stale=false; S.email=''; ['known','file','folder','moved','pending','copy','email'].forEach(k=>put(k,null)); S.known=false; note();
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
      this.migrateSongs();
      this.paintStatus();
    },
    // Earlier versions kept your own texts and the goal in this browser; progress starts fresh (petravanta, 2026-10-16)
    migrate() {
      const d = emptyData();
      try { d.texts = JSON.parse(localStorage.getItem('voicetrainer.texts.v1') || '[]').map(t => Object.assign({ upd: '' }, t)); } catch (e) {}
      try { const g = localStorage.getItem('voicetrainer.goal'); if (g) d.settings.goal = g; } catch (e) {}
      return d;
    },
    // Your songs used to live in their own browser key; they now travel with the rest of the data (and so to Drive)
    migrateSongs() {
      let old = null;
      try { old = localStorage.getItem(SING_SAVED_KEY); } catch (e) {}
      if (old == null) return;
      let list = [];
      try { list = D.lyricsCacheClean(JSON.parse(old)).map(r => ({ ...r, upd: r.at || 1 })); } catch (e) {}
      if (list.length) { this.d = mergeData({ songs: list }, this.d); this.persist(); }
      try { localStorage.removeItem(SING_SAVED_KEY); } catch (e) {}
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
    else if (Data.where !== 'drive') html = `<p class="vd-note">VoiceTrainer can keep your readings, practice history, settings, texts and songs (lyrics and attached video links) in one file in your own Google Drive, so they follow you to any device. It can only see the file it creates. Until then they are saved in this browser.</p>
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
    if ((Data.setting('specTheme') || 'classic') !== state.specTheme) applySpecTheme(Data.setting('specTheme'));
    const g = Data.setting('goal'); if (g && g !== state.goal) setGoal(g, true);
    renderPitchTarget();
    Texts.sync();
    renderReadings(); renderPracticeHistory(); renderDrillGrid(); renderHome();
    if (Sing.ready) Sing.renderSaved();
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

  // ---------------- spectrogram colours ----------------
  // Saved with the other settings (so in Drive once it's connected); every spectrogram redraws when it changes.
  function applySpecTheme(k) {
    state.specTheme = SPEC_THEMES[k] ? k : 'classic';
    document.documentElement.dataset.spec = state.specTheme;
    for (const b of document.querySelectorAll('#spec-pick [data-spec]')) b.setAttribute('aria-checked', String(b.dataset.spec === state.specTheme));
    if (C.panel) readTheme();
  }
  // Settings: one button per theme with its ramp as a swatch, and a short sample (a hiss, then "ee", "ah", "oo" on a
  // rising note) drawn with the chosen colours and the formant marks, made once from the synthetic voice.
  const SpecPreview = {
    spec: null, fm: null,
    make() {
      const fs = 11025, V = (k) => D.VOWEL_BY_KEY[k].W, parts = [Synth.silence(fs, 0.08), Synth.sibilant(fs, 0.28, 3900, { seed: 4 }), Synth.silence(fs, 0.1)];
      const marks = [], at = () => parts.reduce((n, p) => n + p.length, 0) / fs * 1000;
      [['i', 190, 205], ['a', 205, 225], ['u', 225, 245]].forEach(([k, a, b], j) => {
        const t0 = at(); parts.push(Synth.voiced(fs, 0.55, a, b, V(k), { seed: 7 + j, classic: true }));
        marks.push([t0 + 60, at() - 60, V(k)]); parts.push(Synth.silence(fs, 0.1));
      });
      this.spec = D.spectrogram(Synth.concat(parts), fs); this.fm = marks;
    },
    draw() {
      const cv = $('spec-preview'); if (!cv || !cv.clientWidth || !C.panel) return;
      if (!this.spec) { try { this.make(); } catch (e) { return; } }
      fitCanvas(cv);
      const g = cv.getContext('2d'), sp = this.spec, W = cv.width, H = cv.height, dpr = dprOf();
      const tmp = document.createElement('canvas'); tmp.width = sp.cols; tmp.height = sp.rows;
      const tg = tmp.getContext('2d'), im = tg.createImageData(sp.cols, sp.rows);
      for (let c = 0; c < sp.cols; c++) for (let r = 0; r < sp.rows; r++) {
        // the synthetic voice has no room noise, so show its top 40 dB (of 65) to look like a real recording
        const v = clamp(Math.round((sp.v[c * sp.rows + r] - 98) * 255 / 157), 0, 255), o = ((sp.rows - 1 - r) * sp.cols + c) * 4;
        im.data[o] = LUT[v * 3]; im.data[o + 1] = LUT[v * 3 + 1]; im.data[o + 2] = LUT[v * 3 + 2]; im.data[o + 3] = 255;
      }
      tg.putImageData(im, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, W, H);
      const dur = sp.cols * sp.hop, fmax = sp.fmax || 5000, halo = fmHalo();
      for (const [a, b, F] of this.fm) ['f1', 'f2', 'f3'].forEach((k, i) => {
        const x0 = a / dur * W, x1 = b / dur * W, y = (1 - F[i] / fmax) * H;
        if (halo) { g.fillStyle = halo; g.fillRect(x0 - dpr, y - 2.5 * dpr, x1 - x0 + 2 * dpr, 5 * dpr); }
        g.fillStyle = C[k]; g.fillRect(x0, y - 1.5 * dpr, x1 - x0, 3 * dpr);
      });
    },
  };
  function initSpecPick() {
    const box = $('spec-pick'); if (!box) return;
    box.innerHTML = Object.entries(SPEC_THEMES).map(([k, t]) => `<button type="button" role="radio" data-spec="${k}" aria-checked="false"><i class="spec-sw" data-sw="${k}"></i>${t.name}</button>`).join('');
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-spec]'); if (b) { applySpecTheme(b.dataset.spec); Data.setting('specTheme', state.specTheme); } });
  }
  // the swatches show each ramp on the current page colours
  function paintSpecSwatches() {
    for (const el of document.querySelectorAll('.spec-sw[data-sw]')) {
      const L = specLut(el.dataset.sw), stops = [];
      for (let i = 0; i <= 8; i++) { const v = Math.round(i / 8 * 255); stops.push(`rgb(${L[v * 3]},${L[v * 3 + 1]},${L[v * 3 + 2]}) ${i * 12.5}%`); }
      el.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    }
  }

  // ---------------- practice history ----------------
  const unitOf = (kind) => (kind === 'prosody' ? ' st' : kind === 'whisper' ? '%' : kind === 'spotpitch' ? ' Hz' : '');
  function recordPractice(entry) {
    if (!entry) return;
    Data.add('practice', { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date(entry.at || Date.now()).toISOString(), goal: state.goal, drill: entry.id, label: entry.label, kind: entry.kind || 'sound', score: entry.score, rs: D.RES_SCALE, bs: D.BREATH_SCALE });
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
      nb.addEventListener('click', () => { if (def) openDrill(def); else if (id.startsWith('spot:')) openSpot(id, kind); });
      ul.appendChild(li);
    }
  }
  // a focus spot from Practice progress: the passage's words, and its numbers in the latest reading
  function openSpot(id, kind) {
    const m = /^spot:(.+):(\d+)-(\d+)$/.exec(id); if (!m) return;
    const t = Texts.all().find(x => x.id === m[1]); if (!t) return;
    const texts = t.body.split(/\s+/).filter(Boolean), a = +m[2], b = +m[3];
    if (b >= texts.length) return;
    const last = fullReadings(t.id).filter(r => r.byWord && r.byWord.length === texts.length).at(-1);
    const st = last ? D.clipStats(wordObjs(last.byWord.slice(a, b + 1))) : { r: null, p: null };
    const why = kind === 'spotpitch' ? 'pitch' : st.p != null && D.wordShortfall(st, focusOpts()).p > 0 ? 'both' : 'resonance';
    setMode('readings');
    startSpots(t.id, t.title, texts, [{ a, b, r: st.r, p: st.p, why }], 0, last ? wordObjs(last.byWord) : null);
  }
  function drillById(id) { for (const [tab, list] of Object.entries(DRILLS)) { const d = list.find(x => x.id === id); if (d) return Object.assign(d, { tab }); } return null; }
  function openDrill(def) {
    const t = drillById(def.id); if (t) state.tab = t.tab;
    setMode('practice');
    selectDrill(def);
    setTimeout(() => $('drill-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ---------------- readings ----------------
  const Run = { on: false, text: null, maxIdx: 0, start: 0, frames: [], gates: null };
  // The reading's own audio, kept in this browser only so it can be saved (to share for troubleshooting). Never uploaded.
  const RunAudio = { mr: null, chunks: [], blob: null, recId: null, t0: null };
  function startRunAudio(s) {
    RunAudio.blob = null; RunAudio.recId = null; RunAudio.chunks = []; RunAudio.t0 = null;
    if (!s || typeof MediaRecorder === 'undefined') return;
    try {
      const mr = new MediaRecorder(s, { audioBitsPerSecond: 128000 });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) RunAudio.chunks.push(e.data); };
      mr.onstop = () => {
        RunAudio.blob = RunAudio.chunks.length ? new Blob(RunAudio.chunks, { type: mr.mimeType || 'audio/webm' }) : null;
        const id = RunAudio.recId, box = $('rd-result');
        if (!RunAudio.blob || !id || !Replay.has(id)) return; // only a reading that was kept gets its recording kept
        Replay.put(id, { blob: RunAudio.blob });
        if (box.rec && box.rec.id === id && !box.hidden) wireTimeline(box, box.rec);
      };
      mr.start(1000); RunAudio.mr = mr; RunAudio.t0 = performance.now(); // the timeline counts from here
    } catch (e) { RunAudio.mr = null; }
  }
  function stopRunAudio(keepFor) {
    const mr = RunAudio.mr; RunAudio.mr = null; RunAudio.recId = keepFor || null;
    if (!keepFor) { RunAudio.blob = null; RunAudio.chunks = []; }
    if (mr && mr.state !== 'inactive') { if (!keepFor) mr.onstop = null; try { mr.stop(); } catch (e) {} }
  }
  function saveRunAudio(rec, b) {
    if (!b) return;
    const ext = /ogg/.test(b.type) ? 'ogg' : /mp4|aac/.test(b.type) ? 'm4a' : 'webm';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `voicetrainer-${(rec.title || 'reading').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${rec.at.slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // The analysis looks at the newest buffer, so a frame's sound sits half a buffer before the moment it's read.
  const FRAME_LAG_MS = () => (buf && ctx ? (buf.length / ctx.sampleRate) * 500 : 0);
  // ---- replay: each reading's recording and timeline, kept in this browser only (IndexedDB), never synced ----
  // Only the last REPLAY_KEEP readings keep theirs. When IndexedDB isn't there (private windows in some
  // browsers), they last until the page is closed.
  const REPLAY_KEEP = 10;
  const Replay = {
    mem: new Map(), db: null,
    open() {
      if (this.db) return this.db;
      this.db = new Promise((res) => {
        try {
          const rq = indexedDB.open('voicetrainer-replay', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('r', { keyPath: 'id' }).createIndex('at', 'at');
          rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
      return this.db;
    },
    has(id) { return this.mem.has(id); },
    async put(id, part) {
      const cur = Object.assign(this.mem.get(id) || { id }, part); this.mem.set(id, cur);
      const db = await this.open(); if (!db || !cur.at) return;
      try {
        const tx = db.transaction('r', 'readwrite'), st = tx.objectStore('r');
        st.put(cur);
        const cn = st.count();
        cn.onsuccess = () => {
          let extra = cn.result - REPLAY_KEEP; if (extra <= 0) return;
          st.index('at').openKeyCursor().onsuccess = (e) => { const c = e.target.result; if (!c || extra-- <= 0) return; st.delete(c.primaryKey); this.mem.delete(c.primaryKey); c.continue(); };
        };
      } catch (e) {}
    },
    async get(id) {
      if (this.mem.has(id)) return this.mem.get(id);
      const db = await this.open(); if (!db) return null;
      return new Promise((res) => {
        try { const rq = db.transaction('r').objectStore('r').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); }
      });
    },
    async forget(id) {
      this.mem.delete(id);
      const db = await this.open(); if (!db) return;
      try { db.transaction('r', 'readwrite').objectStore('r').delete(id); } catch (e) {}
    },
  };
  // ---- the demo voice reading a passage, measured: a reference to hear and to set your readings against ----
  // The audio is made here (Synth.readText, with each word's vowels from the pronunciation dictionary), so each
  // word's timing is known exactly; it is analysed offline the same way a live reading is (D.analyzeReadingSteps).
  // Kept in this page only and made again from the passage and the voice settings: nothing is saved.
  // The neural voice: each built-in passage read by Kokoro-82M ahead of time (scripts/make-refclips.py), in a
  // feminine and a masculine voice, with each word's start and end from the model itself. Served next to the page
  // (refclips/), so the standalone file and the Artifact, which can't fetch them, keep the demo voice.
  const Clips = {
    idx: undefined, // refclips/clips.json once asked for; null where there is none
    ask: null,
    index() {
      if (!this.ask) {
        this.ask = (/^https?:$/.test(location.protocol) && window.fetch ? fetch('refclips/clips.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)) : Promise.resolve(null))
          .catch(() => null).then(ix => (this.idx = ix && ix.clips ? ix : null));
      }
      return this.ask;
    },
    // the clip for passage t in the voice type set, when it still reads the passage's words (null: none)
    pickNow(t) {
      const ix = this.idx, c = ix && t && ix.clips[t.id + '.' + DemoVoice.get().type];
      return c && c.hash === D.textHash(t.body) && c.words.length === t.body.split(/\s+/).filter(Boolean).length ? c : null;
    },
    async pick(t) { await this.index(); return this.pickNow(t); },
    // the clip decoded at fs, its word times moved by however much the decoder delayed the sound
    async decode(c, fs) {
      const ab = await (await fetch('refclips/' + c.file)).arrayBuffer();
      const oc = new OfflineAudioContext(1, 1, fs);
      const buf = await new Promise((ok, no) => { const p = oc.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no); });
      const x = buf.getChannelData(0), shift = Math.max(-0.3, Math.min(0.3, D.soundOnset(x, buf.sampleRate) - c.onset));
      return { x, fs: buf.sampleRate, starts: c.words.map(w => w[0] + shift), ends: c.words.map(w => w[1] + shift) };
    },
  };
  const RefRead = {
    cache: [], // the last two passages' promises of { k, words, fs, x, starts, ends, voice, rec (a promise of the measured reading) }
    key(t, fs) { const v = DemoVoice.get(); return JSON.stringify([t.id, t.body, v.pitch, v.res, v.bright, v.rate, Synth.getStyle(), fs]); },
    // the neural voice reads it unless the demo voice is chosen, or there is no neural reading of these words
    useClip() { return DemoVoice.get().read !== 'demo'; },
    // who reads passage t as the reference, as far as is known now: 'neural voice' or 'demo voice'
    whoFor(t) { return this.useClip() && Clips.pickNow(t) ? 'neural voice' : 'demo voice'; },
    who(ref) { return ref && ref.voice && ref.voice.clip ? 'neural voice' : 'demo voice'; },
    // a promise of the reference audio of passage t at sample rate fs
    async audio(t, fs) {
      const clip = this.useClip() ? await Clips.pick(t) : null;
      const k = clip ? JSON.stringify(['clip', clip.file, clip.hash, fs]) : this.key(t, fs);
      const hit = this.cache.find(x => x.k === k);
      if (hit) return hit.p;
      const words = t.body.split(/\s+/).filter(Boolean), v = DemoVoice.get();
      const synth = () => {
        const r = Synth.readText(fs, words, D.VOWELS, { pitch: v.pitch, res: v.res, bright: v.bright, rate: v.rate, vowelsOf: (w) => D.wordVowelSeq(w, PRON) });
        return { k, t, words, fs, x: r.x, starts: r.starts, ends: r.ends, voice: { pitch: v.pitch, res: v.res, bright: v.bright, style: Synth.getStyle() } };
      };
      const e = { k, p: clip ? Clips.decode(clip, fs).then(d => ({ k, t, words, fs: d.fs, x: d.x, starts: d.starts, ends: d.ends, voice: { clip: true, name: clip.voice, type: v.type } }), () => { this.cache = this.cache.filter(x => x !== e); return synth(); })
        : Promise.resolve().then(synth) };
      this.cache = [e].concat(this.cache).slice(0, 2);
      return e.p;
    },
    // a promise of the reference voice's reading of passage t, measured; onStep(share done) while it works
    async measure(t, onStep) {
      ensureCtx();
      const c = await this.audio(t, ctx.sampleRate);
      if (!c.rec) {
        c.rec = new Promise((done) => {
          const it = D.analyzeReadingSteps(c.x, c.fs, c.words, c.starts.map((a, i) => [a, c.ends[i]]), PRON, 300);
          const step = () => {
            const t0 = performance.now();
            let r;
            do r = it.next(); while (!r.done && performance.now() - t0 < 40);
            if (!r.done) { if (c.onStep) c.onStep(r.value); return setTimeout(step, 0); }
            done(refRecord(c, r.value));
          };
          setTimeout(step, 20);
        });
      }
      c.onStep = onStep;
      return c.rec;
    },
    // the measured demo voice for a reading, when it read the same words (a text edited since doesn't match)
    fits(ref, rec) { return !!(ref && rec && rec.byWord && ref.byWord.length === rec.byWord.length && ref.byWord.every((w, i) => w[0] === rec.byWord[i][0])); },
  };
  // the measured demo voice reading, shaped like a saved reading (see finishReading) plus its timeline and audio
  function refRecord(c, out) {
    const round = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null), med = (a, n) => (a.length >= n ? D.median(a) : NaN);
    const pool = D.pooledResonance(out.frames), map = D.vowelMap(out.vf), nW = c.words.length, p = out.pitch;
    const tl = D.readingTimeline(out.frames, 0, nW);
    tl.ws = c.starts.map(a => Math.round(a * 1000)); // known exactly: the voice was made with them
    const vowels = {};
    for (const [k, a] of Object.entries(out.vf)) if (a.length >= 8) vowels[k] = round(D.median(a.map(f => f[3])));
    return {
      id: 'ref:' + c.k, ref: true, voice: c.voice, at: new Date().toISOString(), goal: state.goal, text: c.t.id, title: c.t.title, cover: 100, seconds: Math.round(c.x.length / c.fs),
      resonance: round(pool.res), resPm: pool.pm, resN: pool.n, resShaky: pool.shaky || undefined, resWhy: pool.why || undefined,
      vowels, sibS: round(med(out.sibs.s, 8)), sibSh: round(med(out.sibs.sh, 8)),
      pitchMedian: p.length >= 30 ? Math.round(D.median(p)) : null, pitchP10: p.length >= 30 ? Math.round(D.quantile(p, 0.1)) : null, pitchP90: p.length >= 30 ? Math.round(D.quantile(p, 0.9)) : null,
      breath: round(med(out.breath, 30)),
      vmap: readingVowelMap(map, out.frames, c.words.map(text => ({ text }))), vsrc: 'text',
      byWord: D.wordReport(out.frames, nW).map((w, i) => [c.words[i], w.p != null ? Math.round(w.p) : null, round(w.r), round(w.s)].concat(w.rough && w.r != null ? [1] : [])),
      tl, x: c.x, fs: c.fs,
    };
  }
  // Demo voice in the Readings library: hear the passage in the demo voice and see what the app measures
  function showRefResult(t) {
    const box = $('rd-result'); box.hidden = false; box.rec = null; box.cue = null; box.tlJump = null;
    Player.stop();
    const v = DemoVoice.get(), who = RefRead.whoFor(t);
    box.innerHTML = `<div class="section-head"><h3>${escapeHtml(t.title)}: the ${who}</h3></div><p class="small" id="ref-prog" role="status">${who === 'neural voice' ? 'Loading and measuring the neural voice' : `Making and measuring the demo voice (${v.pitch} Hz, resonance ${Math.round(D.resScore(v.res / 100))})`}…</p>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const token = box.refToken = {};
    setTimeout(() => RefRead.measure(t, (f) => { const el = $('ref-prog'); if (el && box.refToken === token) el.textContent = `Measuring the ${who}… ${Math.round(f * 100)}%`; })
      .then(ref => { if (box.refToken === token && !box.hidden) showReadingResult(ref); }), 30);
  }
  // ---- Freestyle takes: what you just did, replayable on the tall timeline ----
  // While Freestyle listens, each frame is kept (and the microphone recorded) so that when it stops the take
  // opens on the same timeline as a reading's. Kept in memory only: the next take replaces it, nothing is saved.
  const FREE_MAX_MS = 10 * 60 * 1000; // the timeline keeps the first ten minutes of a take
  const Free = {
    on: false, frames: [], t0: 0, mr: null, chunks: [], buf: null, pendingBuf: null, kind: null, n: 0, full: false, cur: null,
    start(kind) {
      this.end(true);
      Object.assign(this, { on: true, kind, frames: [], chunks: [], mr: null, full: false, buf: kind !== 'mic' ? this.pendingBuf : null, pendingBuf: null, t0: performance.now() });
      if (kind === 'mic') Words.beginTake(); // words the recogniser hears (Show words on) go on the take's timeline
      if (kind === 'mic' && stream && window.MediaRecorder) {
        try {
          // its own copy of the stream, so the last second still reaches the recording after the microphone is stopped
          const own = stream.clone(), mr = new MediaRecorder(own);
          mr.addEventListener('stop', () => own.getTracks().forEach(t => t.stop()));
          mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
          mr.start(1000); this.mr = mr; this.t0 = performance.now(); // the timeline counts from here
        } catch (e) { this.mr = null; }
      }
      showFreeLive();
    },
    frame(fr, now, res) {
      if (now - this.t0 > FREE_MAX_MS) { if (!this.full) { this.full = true; if (this.mr && this.mr.state !== 'inactive') this.mr.stop(); } return; }
      this.frames.push({ t: now - FRAME_LAG_MS(), f0: fr.kind === 'voiced' ? fr.f0 : 0, res, F: fr.kind === 'voiced' ? fr.formants : null });
    },
    // ends the take; it opens as a timeline when it held enough voice (quiet: drop it without showing anything)
    end(quiet) {
      if (!this.on) return;
      this.on = false;
      const frames = this.frames, mr = this.mr, chunks = this.chunks, buf = this.buf, t0 = this.t0, lag = FRAME_LAG_MS();
      this.frames = []; this.mr = null; this.chunks = []; this.buf = null;
      const thin = frames.filter(f => f.f0 > 0).length < 20; // under about a third of a second of voice
      const heard = Words.endTake(quiet || thin);
      if (quiet || thin) {
        if (mr && mr.state !== 'inactive') { mr.ondataavailable = null; try { mr.stop(); } catch (e) {} }
        return;
      }
      const tk = { id: 'free' + (++this.n), tl: D.readingTimeline(frames, t0, 0), kind: this.kind, at: new Date().toISOString(), full: this.full, buf, blob: null, heard: null };
      const rec = !mr ? Promise.resolve(null) : new Promise((res) => {
        const done = () => res(chunks.length ? new Blob(chunks, { type: mr.mimeType || 'audio/webm' }) : null);
        if (mr.state === 'inactive') done(); else { mr.addEventListener('stop', done); try { mr.stop(); } catch (e) { done(); } }
      });
      Promise.all([heard, rec]).then(([list, blob]) => {
        tk.blob = blob;
        if (list) { // the words heard, each over its own stretch of the take
          const h = D.heardWords(frames, t0, tk.tl.dur, list, lag);
          tk.heard = h; tk.tl.ws = h.ws; tk.tl.we = h.we;
        }
        showFreeReview(tk);
      });
    },
  };
  function showFreeLive() {
    Free.cur = null;
    if (Player.id && String(Player.id).startsWith('free')) Player.stop();
    const rv = $('ftl-review'); rv.hidden = true; rv.innerHTML = '';
    $('ftl-live').hidden = false;
    drawPitch(); drawRes(); // the canvases were hidden, so they size themselves again
  }
  function showFreeReview(tk) {
    if (Free.on || !tk.tl.f0.length) return; // a new take has already begun
    const el = $('ftl-review');
    Free.cur = tk;
    $('ftl-live').hidden = true; el.hidden = false;
    const audio = !!(tk.blob || tk.buf), src = tk.kind === 'mic' ? 'take' : tk.kind === 'demo' ? 'demo voice' : 'recording';
    const H = tk.heard && tk.heard.words.length ? tk.heard : null;
    const wordsAbout = H ? ' Words: what your browser\'s speech recognition heard, its guess and not a checked transcript. It gives no timings, so each word is spread over the stretch of voice just before it came back, and can sit a word or so off. Words it was unsure of are dotted and slanted. Each word shows its pitch as a level and its resonance as a bar.' : '';
    mountTimeline(el, {
      id: tk.id, tl: tk.tl, words: H ? H.words : null, unsure: H ? (i) => H.unsure[i] : null, gone: () => null,
      wordInfo: (i) => freeWordInfo(H, i), blob: tk.blob, buf: tk.buf, alive: () => Free.cur === tk, fitShort: true,
      heading: tk.kind === 'mic' ? 'Your last take' : tk.kind === 'demo' ? 'The demo voice' : 'The recording',
      about: `The ${src} from start to end, every lane on the same clock. Pitch: dots coloured from darker to brighter resonance. Resonance score: smoothed over a quarter second, broken where no vowel could be read. Spectrogram: the sound itself, low to high, with the formants read marked in colour (F1 <span class="k f1">amber</span>, F2 <span class="k f2">rose</span>, F3 <span class="k f3">blue</span>).${wordsAbout} Zoom with − and +, by pinching, or Ctrl and the mouse wheel.${audio ? ` Tap or click anywhere to cue that moment: its time, pitch, resonance and F1-F3 show under the timeline, and ▶ Play plays from there (Stop keeps the cue). With a mouse, drag to scrub the cue; on a phone, drag the cue's marker with a finger (elsewhere a finger scrolls the timeline as usual). Arrow keys nudge it.${H ? ' Tap a word to cue it and see its numbers.' : ''}` : ' Tap anywhere for the numbers at that moment.'}${tk.full ? ' Only the first ten minutes are kept.' : ''} Freestyle takes stay in this page only: the next one replaces this, and nothing is saved or sent anywhere.`,
      noAudio: "This browser couldn't record the take, so no spectrogram",
      hint: (tk.heard && !H ? 'Show words was on, but the speech recognition heard no words in this take. ' : '') + (audio ? `Tap the timeline${H ? ' (or a word)' : ''} to cue it and see the numbers there, then ▶ Play from it.` : 'Tap the timeline for the numbers there.'),
      extraBtns: `${tk.blob ? '<button type="button" class="btn sm ghost" id="ftl-save">Save audio</button>' : ''}<button type="button" class="btn sm ghost" id="ftl-back">Live view</button>`,
    });
    $('ftl-back').onclick = () => showFreeLive();
    const sv = $('ftl-save'); if (sv) sv.onclick = () => saveRunAudio({ title: 'freestyle', at: tk.at }, tk.blob);
  }
  // the line under a take's timeline for one heard word
  // a heard word's numbers for the timeline readout's slots (mountTimeline's cue line)
  function freeWordInfo(H, i) {
    const [t, p, r, s, rough] = H.words[i];
    const note = [H.unsure[i] ? 'Heard as this word, unsure.' : '', r == null ? `No resonance score: ${noResWhy(t, p)}.` : rough ? 'Resonance score from short vowels, rough.' : '', s != null ? `/s/ ${Math.round(s)}.` : ''];
    return { word: t, unsure: !!H.unsure[i], f0: p, res: r, rough, note: note.filter(Boolean).join(' ') };
  }
  // Plays a recording from any moment: decoded once into memory, so a jump is instant and exact
  // (a browser's own recordings often can't be seeked in an audio element).
  const Player = {
    ac: null, buf: null, src: null, id: null, at0: 0, off: 0, playing: false, raf: 0, onTick: null, onState: null,
    async load(id, blob) {
      if (this.id === id && this.buf) return true;
      this.stop(); this.id = id; this.buf = null;
      try {
        this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)();
        const data = await blob.arrayBuffer();
        const b = await new Promise((res, rej) => { const p = this.ac.decodeAudioData(data, res, rej); if (p && p.catch) p.catch(rej); });
        if (this.id !== id) return false;
        this.buf = b; this.off = 0; return true;
      } catch (e) { if (this.id === id) this.id = null; return false; }
    },
    useBuffer(id, b) { // a recording already decoded (a file or the demo voice in Freestyle)
      if (this.id === id && this.buf === b) return true;
      this.stop(); this.id = id; this.buf = b; this.off = 0;
      try { this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)(); return true; } catch (e) { this.id = null; this.buf = null; return false; }
    },
    get dur() { return this.buf ? this.buf.duration : 0; },
    pos() { return this.playing ? Math.min(this.dur, this.ac.currentTime - this.at0) : this.off; },
    play(from, until) { // until: seconds to stop at (one word), or play on to the end
      if (!this.buf) return;
      this.halt(); this.until = until || null;
      const at = clamp(from != null ? from : this.off >= this.dur - 0.05 ? 0 : this.off, 0, Math.max(0, this.dur - 0.01));
      if (this.ac.state === 'suspended') this.ac.resume();
      const s = this.ac.createBufferSource(); s.buffer = this.buf; s.connect(this.ac.destination);
      s.onended = () => { if (this.src === s) { this.off = this.pos(); this.src = null; this.playing = false; this.tick(); if (this.onState) this.onState(); } };
      s.start(0, at); this.src = s; this.at0 = this.ac.currentTime - at; this.playing = true;
      if (this.onState) this.onState();
      const loop = () => { if (!this.playing) return; if (this.until && this.pos() >= this.until) return this.pause(); this.tick(); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    },
    halt() { if (this.src) { const s = this.src; this.src = null; try { s.onended = null; s.stop(); } catch (e) {} } cancelAnimationFrame(this.raf); },
    pause() { if (!this.playing) return; this.off = this.pos(); this.halt(); this.playing = false; this.tick(); if (this.onState) this.onState(); },
    seek(t) { if (this.playing) this.play(t); else { this.off = clamp(t, 0, this.dur); this.tick(); } },
    tick() { if (this.onTick) this.onTick(this.pos()); },
    stop() { this.halt(); this.playing = false; this.off = 0; this.onTick = null; this.onState = null; },
  };
  const clockOf = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const TL_PX_S = 70; // the timeline's starting zoom, in pixels per second of reading: room for a word label most of the time
  const TL_ZOOM = [15, 320]; // how far it zooms out and in
  let tlPxs = null; // the zoom picked last, kept while the page is open
  // The tall timeline's lanes, top to bottom, each [top, height] in px. They all share one time axis.
  // A reading has two more lanes for its words; a Freestyle take has none.
  function tlLanes(words) {
    const y = {}; let at = 38;
    for (const [k, h] of [['p', 80], ['r', 56], ['s', 110]].concat(words ? [['wp', 40], ['wr', 44]] : [])) { y[k] = [at, h]; at += h + 24; }
    y.lab = at - 10; y.H = words ? y.lab + 22 : at - 12; return y;
  }
  const TL_LANES = tlLanes(true);
  // The spectrogram as an image, coloured like the live one; made again when the theme changes.
  function specImage(spec) {
    if (spec._img && spec._lut === LUT) return spec._img;
    const cv = document.createElement('canvas'); cv.width = Math.max(1, spec.cols); cv.height = spec.rows;
    const g = cv.getContext('2d'), im = g.createImageData(cv.width, cv.height);
    for (let c = 0; c < spec.cols; c++) for (let r = 0; r < spec.rows; r++) {
      const v = spec.v[c * spec.rows + r], o = ((spec.rows - 1 - r) * cv.width + c) * 4;
      im.data[o] = LUT[v * 3]; im.data[o + 1] = LUT[v * 3 + 1]; im.data[o + 2] = LUT[v * 3 + 2]; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    spec._img = cv.toDataURL('image/png'); spec._lut = LUT;
    return spec._img;
  }
  // A recording over time, in lanes on one time axis: pitch dots coloured by resonance (as in Sing), the resonance
  // line with its goal band, the spectrogram with the formants read, and (for a reading) each word across its own
  // stretch of time with its pitch and resonance. words is the reading's byWord, or null for a Freestyle take.
  // pxs is the zoom; spec the recording's spectrogram, or note says why there's none.
  // ref: the demo voice laid on this clock (D.warpTimeline, plus its words' byWord), drawn dashed.
  function timelineSvg(words, tl, pxs, spec, note, gone, ref, unsure) { // gone(i): 'miss' for a word the word check didn't hear; unsure(i): a heard word the recogniser wasn't sure of
    const [lo, hi0] = target(), hi = Math.min(hi0, 100), [plo, phi] = pitchBand(), Y = words ? TL_LANES : tlLanes(false);
    const L = 6, W = Math.ceil(L + tl.dur / 1000 * pxs + 40), x = (ms) => L + ms / 1000 * pxs;
    const ps = tl.f0.filter(v => v > 0);
    const pmin = Math.max(50, Math.min(plo, ps.length ? D.quantile(ps, 0.03) : plo) - 15), pmax = Math.max(phi, ps.length ? D.quantile(ps, 0.97) : phi) + 15;
    const lane = (k, v, a, b) => Y[k][0] + (1 - (clamp(v, a, b) - a) / (b - a)) * Y[k][1], bot = (k) => Y[k][0] + Y[k][1];
    const py = (v) => lane('p', v, pmin, pmax), ry = (v) => lane('r', v, 0, 100), wpy = (v) => lane('wp', v, pmin, pmax), wry = (v) => lane('wr', v, 0, 100);
    const f1 = (v) => v.toFixed(1);
    const band = (y0, y1) => `<rect class="wr-band" x="0" y="${f1(y0)}" width="${W}" height="${f1(y1 - y0)}"/>`;
    let g = band(py(phi), py(plo)) + band(ry(hi), ry(lo)) + `<line class="wr-axis" x1="0" x2="${W}" y1="${bot('r')}" y2="${bot('r')}"/>`;
    if (words) g += band(wpy(phi), wpy(plo)) + band(wry(hi), wry(lo)) + `<line class="wr-axis" x1="0" x2="${W}" y1="${bot('wr')}" y2="${bot('wr')}"/>`;
    // the spectrogram, stretched to the zoom, with F1-F3 where they were read
    const [S0, SH] = Y.s;
    g += `<rect class="tl-spbg" x="${L}" y="${S0}" width="${f1(W - L - 40)}" height="${SH}"/>`;
    if (spec) g += `<image class="tl-spec" href="${specImage(spec)}" x="${L}" y="${S0}" width="${f1(spec.cols * spec.hop / 1000 * pxs)}" height="${SH}" preserveAspectRatio="none"/>`;
    else if (note) g += `<text class="wr-lane" x="${L + 150}" y="${S0 + SH / 2 + 4}">${escapeHtml(note)}</text>`;
    const fmax = spec ? spec.fmax : 5000;
    (tl.fm || []).forEach((F, i) => {
      if (!F) return;
      F.forEach((f, j) => { if (f < fmax) g += `<rect class="tl-fm f${j + 1}" x="${f1(x(i * tl.bin))}" y="${f1(S0 + (1 - f / fmax) * SH - 1)}" width="${f1(Math.max(1.5, tl.bin / 1000 * pxs))}" height="2"/>`; });
    });
    // time ticks, closer together when zoomed in
    const step = [1, 2, 5, 10, 15, 30].find(s => s * pxs >= 110) || 60;
    for (let s = 0; s * 1000 <= tl.dur; s += step) g += `<line class="tl-tick" x1="${f1(x(s * 1000))}" x2="${f1(x(s * 1000))}" y1="16" y2="${Y.H - 4}"/><text class="wr-lane" x="${f1(x(s * 1000) + 3)}" y="12">${clockOf(s)}</text>`;
    // pitch, each dot coloured from the darker to the brighter average by the resonance heard there
    const dotR = pxs < 40 ? 1.8 : 2.4;
    tl.f0.forEach((f, i) => {
      if (!f) return;
      const r = tl.rs[i], u = r != null ? Math.round(clamp((r - D.RES_AVG.masc) / (D.RES_AVG.fem - D.RES_AVG.masc), 0, 1) * 4) : -1;
      g += `<circle class="tl-p ${u < 0 ? 'nr' : 'rz' + u}" cx="${f1(x((i + 0.5) * tl.bin))}" cy="${f1(py(f))}" r="${u < 0 ? 1.6 : dotR}"/>`;
    });
    // resonance, broken where no vowel was read
    let run = [];
    const flush = () => { if (run.length > 1) g += `<polyline class="tl-rline" points="${run.join(' ')}"/>`; else if (run.length) { const [cx, cy] = run[0].split(','); g += `<circle class="tl-rdot" cx="${cx}" cy="${cy}" r="2"/>`; } run = []; };
    tl.rs.forEach((r, i) => { if (r != null) run.push(`${f1(x((i + 0.5) * tl.bin))},${f1(ry(r))}`); else flush(); });
    flush();
    // the demo voice: its pitch and resonance as dashed lines, broken at gaps (between words, no vowel read)
    if (ref) {
      const line = (pts, y, cls) => {
        let out = '', seg = [], lastMs = -1e9;
        const end = () => { if (seg.length > 1) out += `<polyline class="${cls}" points="${seg.join(' ')}"/>`; seg = []; };
        for (const [ms, v] of pts) { if (v == null || ms - lastMs > 130) end(); if (v != null) { seg.push(`${f1(x(ms))},${f1(y(v))}`); lastMs = ms; } }
        end(); return out;
      };
      g += line(ref.f0, py, 'tl-ref') + line(ref.rs, ry, 'tl-ref');
    }
    // words, each across its own stretch: its pitch as a level, its resonance as a bar, its name under them.
    // Names go on two rows, and one is left out when it would overlap (zoom in to see them all).
    if (words) {
      const end = [-1e9, -1e9], spans = D.wordSpans(tl.ws, tl.dur, tl.we);
      const resOff = (r) => r != null && !onTarget(Math.round(r)), pitchOff = (p) => p != null && (state.goal === 'fem' ? p < plo : p > phi);
      spans.forEach((sp, k) => {
        if (!sp || !words[k]) return;
        let [t, p, r, , rough] = words[k]; const x0 = x(sp[0]), wd = Math.max(1.5, x(sp[1]) - x0 - 1), fn = D.wordVowels(t, PRON).why === 'function', cx = x0 + wd / 2, miss = !!gone && gone(k) === 'miss';
        if (miss) p = r = null;
        const un = !!unsure && unsure(k), heardAs = unsure ? `heard as “${t}”${un ? ' (unsure)' : ''}` : t;
        const tip = !miss && unsure ? `${heardAs}: ${p != null ? p + ' Hz' : 'no pitch'}, ${r != null ? 'resonance ' + (rough ? '≈' : '') + Math.round(r) : 'no resonance reading: ' + noResWhy(t, p)}` : miss ? `${t}: ${noResWhy(t, p, 'miss')}` : `${t}: ${p != null ? p + ' Hz' : 'no pitch'}, ${r != null ? 'resonance ' + (rough ? '≈' : '') + Math.round(r) + (rough ? ' (rough)' : '') : 'no resonance reading: ' + noResWhy(t, p, gone && gone(k))}`;
        g += `<line class="tl-wtick" x1="${f1(x0)}" x2="${f1(x0)}" y1="${Y.wp[0] - 6}" y2="${Y.lab - 9 + (k % 2) * 13}"/>`
          + `<g class="tl-w" data-i="${k}" tabindex="0" role="button" aria-label="${escapeHtml(tip)}"><title>${escapeHtml(tip)}</title>`
          + `<rect class="wr-hit" x="${f1(x0)}" y="${Y.wp[0] - 6}" width="${f1(wd + 1)}" height="${Y.H - Y.wp[0] + 6}"/>`
          + (p != null ? `<rect class="tl-wp${pitchOff(p) ? ' off' : ''}" x="${f1(x0 + 0.5)}" y="${f1(wpy(p) - 2)}" width="${f1(wd)}" height="4" rx="2"/>` : '')
          + (r != null ? `<rect class="wr-bar${resOff(r) ? ' off' : ''}${rough ? ' rough' : ''}" x="${f1(x0 + 0.5)}" y="${f1(wry(r))}" width="${f1(wd)}" height="${f1(Math.max(3, bot('wr') - wry(r)))}" rx="2"/>`
            : miss ? missGlyph(cx, bot('wr') - 11) : fn ? '' : `<g class="wr-none"><circle cx="${f1(cx)}" cy="${bot('wr') - 7}" r="4"/><line x1="${f1(cx - 3)}" y1="${bot('wr') - 4}" x2="${f1(cx + 3)}" y2="${bot('wr') - 10}"/></g>`)
          + (ref && ref.words[k] && ref.words[k][1] != null ? `<line class="tl-ref" x1="${f1(x0 + 0.5)}" x2="${f1(x0 + wd)}" y1="${f1(wpy(ref.words[k][1]))}" y2="${f1(wpy(ref.words[k][1]))}"/>` : '')
          + (ref && ref.words[k] && ref.words[k][2] != null ? `<line class="tl-ref" x1="${f1(x0 + 0.5)}" x2="${f1(x0 + wd)}" y1="${f1(wry(ref.words[k][2]))}" y2="${f1(wry(ref.words[k][2]))}"/>` : '')
          + '</g>';
        const row = k % 2, lw = t.length * 6.6 + 6;
        if (x0 > end[row]) { g += `<text class="wr-word${resOff(r) ? ' off' : ''}${miss ? ' miss' : fn && r == null ? ' fn' : ''}${un ? ' unsure' : ''}" x="${f1(x0 + 2)}" y="${Y.lab + 4 + row * 13}">${escapeHtml(t)}</text>`; end[row] = x0 + lw; }
      });
    }
    // the cued spot (moved with a transform) and the playhead
    g += `<g class="tl-cue" visibility="hidden"><line x1="0" x2="0" y1="16" y2="${Y.H}"/><path d="M-6 16h12l-6 7z"/></g>`;
    g += `<line class="tl-head" x1="${L}" x2="${L}" y1="16" y2="${Y.H}" visibility="hidden"/>`;
    return { svg: `<svg class="tl-svg" width="${W}" height="${Y.H}" viewBox="0 0 ${W} ${Y.H}" role="img" aria-label="Pitch, resonance, spectrogram${words ? ' and each word' : ''} through the ${words ? 'reading' : 'take'}, on one time line">${g}</svg>`, x, L, W };
  }
  // The numbers for one word of a reading, for the line under a chart.
  // a passage word's numbers for the timeline readout's slots (mountTimeline's cue line), with the reference's when one is laid over
  function wordReadout(rec, i, ref) {
    const [t, p, r, s, rough] = rec.byWord[i], gone = wordGone(rec, i), rw = ref && ref.byWord[i];
    const refN = ref ? { f0: rw ? rw[1] : null, res: rw ? rw[2] : null, rough: !!(rw && rw[4]) } : null;
    const off = gone === 'miss' || gone === 'end';
    const why = () => { const w = noResWhy(t, p, gone); return rec.ref ? w.replace('your voice', 'the voice') : w; };
    const note = off ? why()[0].toUpperCase() + why().slice(1) + '.'
      : [r == null ? `No resonance score: ${why()}.` : rough ? 'Resonance score from short vowels, rough.' : '', s != null ? `/s/ ${Math.round(s)}.` : ''].filter(Boolean).join(' ');
    return { word: t, miss: gone === 'miss', f0: off ? null : p, res: off ? null : r, rough, ref: refN, note };
  }
  // With a timeline on hand, Word by word says nothing it doesn't, so it's put away and focus spots' Show goes to
  // the timeline; readings with no timeline here (older ones, or from another device) keep Word by word.
  function timelineTakesOver(box, el, T) {
    const wr = box.querySelector('.wr'); if (wr) wr.hidden = true;
    box.tlJump = (a) => { T.pickWord(a); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  }
  const TLSpec = { id: null, spec: null }; // the last recording's spectrogram, so reopening it is instant
  // Fills the reading's timeline once its stored data is found, and the player and spectrogram when the recording is there too.
  async function wireTimeline(box, rec, ref) {
    const el = box.querySelector('#rd-tl'); if (!el) return;
    if (rec.ref) return wireRefTimeline(box, el, rec);
    const got = await Replay.get(rec.id);
    if (box.rec !== rec || !got || !got.tl || !got.tl.f0.length) return;
    const blob = got.blob || null;
    el.hidden = false;
    const T = mountTimeline(el, {
      id: rec.id, tl: got.tl, words: rec.byWord || [], blob, alive: () => box.rec === rec,
      heading: 'Timeline',
      about: `Your reading from start to end, every lane on the same clock. Pitch: dots coloured from darker to brighter resonance. Resonance score: smoothed over a quarter second, broken where no vowel could be read. Spectrogram: the sound itself, low to high, with the formants read marked in colour (F1 <span class="k f1">amber</span>, F2 <span class="k f2">rose</span>, F3 <span class="k f3">blue</span>). Words: each across its own stretch, its pitch as a level and its resonance as a bar, so busy bits are narrow and long words wide. Words sit where the highlight reached them, which can trail your voice a little. Zoom with − and +, by pinching, or Ctrl and the mouse wheel. ${blob ? `Tap or click anywhere to cue that moment: its time, pitch, resonance and F1-F3 show under the timeline, and ▶ Play plays from there (Stop keeps the cue). With a mouse, drag to scrub the cue; on a phone, drag the cue's marker with a finger (elsewhere a finger scrolls the timeline as usual). Arrow keys nudge it. Tap a word to cue it and see its numbers. The recording stays in this browser only (the last ${REPLAY_KEEP} readings), is never synced or sent anywhere, and goes when you delete the reading.` : 'This reading has no recording on this device (it was read on another device, or this browser couldn\'t record), so it can\'t be played and has no spectrogram.'}`,
      noAudio: 'No recording on this device, so no spectrogram',
      hint: blob ? 'Tap the timeline (or a word) to cue it and see the numbers there, then ▶ Play from it.' : 'Tap the timeline or a word for the numbers there.',
      wordInfo: (i) => wordReadout(rec, i, ref), gone: (i) => wordGone(rec, i),
      ref: ref ? Object.assign(D.warpTimeline(ref.tl, got.tl.ws, got.tl.dur), { words: ref.byWord }) : null, refWho: ref ? RefRead.who(ref) : null,
    });
    timelineTakesOver(box, el, T);
    if (!blob) return;
    const audio = $('rd-audio'); if (audio) { audio.hidden = false; audio.onclick = () => saveRunAudio(rec, blob); }
    if (!(await T.ready)) return;
    box.cue = {
      canPlay: (i) => got.tl.ws && got.tl.ws[i] != null && Player.id === rec.id,
      word: (i) => { T.pickWord(i, true); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
    };
  }
  // the demo voice's measured reading on the same timeline, playable from its own audio
  function wireRefTimeline(box, el, rec) {
    let buf = null;
    try { buf = new AudioBuffer({ length: rec.x.length, sampleRate: rec.fs, numberOfChannels: 1 }); } catch (e) { try { ensureCtx(); buf = ctx.createBuffer(1, rec.x.length, rec.fs); } catch (e2) { buf = null; } }
    if (buf) buf.copyToChannel(rec.x, 0);
    el.hidden = false;
    const T = mountTimeline(el, {
      id: rec.id, tl: rec.tl, words: rec.byWord, buf, alive: () => box.rec === rec,
      heading: 'Timeline',
      about: `The ${RefRead.who(rec)} reading the passage, every lane on the same clock, measured the way your readings are. Pitch: dots coloured from darker to brighter resonance. Resonance score: smoothed over a quarter second, broken where no vowel could be read. Spectrogram: the sound itself, low to high, with the formants read marked in colour (F1 <span class="k f1">amber</span>, F2 <span class="k f2">rose</span>, F3 <span class="k f3">blue</span>). Words: each across its own stretch, from the exact moment the voice started it. Tap or click anywhere to cue that moment: its time, pitch, resonance and F1-F3 show under the timeline, and ▶ Play plays from there (Stop keeps the cue). With a mouse, drag to scrub the cue; on a phone, drag the cue's marker with a finger (elsewhere a finger scrolls the timeline as usual). Arrow keys nudge it. Tap a word to cue it and see its numbers. Zoom with −, + or by pinching.`,
      noAudio: `This browser couldn't hold the ${RefRead.who(rec)}'s audio, so no spectrogram`,
      hint: buf ? 'Tap the timeline (or a word) to cue it and see the numbers there, then ▶ Play from it.' : 'Tap the timeline or a word for the numbers there.',
      wordInfo: (i) => wordReadout(rec, i), gone: () => null,
    });
    timelineTakesOver(box, el, T);
    T.ready.then(ok => {
      if (!ok || box.rec !== rec) return;
      box.cue = { canPlay: (i) => rec.tl.ws[i] != null && Player.id === rec.id, word: (i) => { T.pickWord(i, true); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } };
    });
  }
  // The tall timeline in el, for a reading (words) or a Freestyle take (no words): zoom, a playhead, tap to cue,
  // and the spectrogram worked out from the recording once it's decoded. o: { id, tl, words, blob or buf (the
  // recording, if any), alive() (false once el's owner has moved on), heading, about (the info text), noAudio
  // (said in the spectrogram lane without a recording), hint, wordInfo(i), gone(i) (a word's wordGone), extraBtns }.
  // Returns { ready: a promise of whether it can play, pickWord(i) }.
  // The timeline's cue readout: every number in a slot of its own that keeps its place whatever the values
  // (a grid: one line on wide screens, two fixed rows on a phone), "–" where nothing was read. The reference's
  // row, when one is laid over, lines its pitch and resonance up under yours. The note line is always there.
  // c: { t, word, unsure, miss, f0, res, rough, F, ref: { f0, res, rough }, refWho, note }
  function cueHtml(c) {
    const v = (x, w) => `<b class="tr-v" style="--w:${w}ch">${x != null && x !== 0 && !Number.isNaN(x) ? x : '–'}</b>`;
    const res = (r, rough) => r != null ? (rough ? '≈' : '') + Math.round(r) : null;
    const word = c.word != null ? `“${escapeHtml(c.word)}”` : '–';
    const fm = [0, 1, 2].map(k => `<span class="tr-f tr-f${k + 1}"><span class="k f${k + 1}">F${k + 1}</span>${v(c.F && c.F[k], 4)}${k === 2 ? '<small>Hz</small>' : ''}</span>`).join('');
    const ref = c.refWho ? `<span class="tr-rl ref-num" title="${escapeHtml(c.refWho)}">${escapeHtml(c.refWho)}</span>`
      + `<span class="tr-rp">${v(c.ref && c.ref.f0, 4)}<small>Hz</small></span><span class="tr-rr"><small>resonance score</small>${v(res(c.ref && c.ref.res, c.ref && c.ref.rough), 3)}</span>` : '';
    return `<span class="tr-t">${c.t || '–:–'}</span>`
      + `<span class="tr-w${c.unsure ? ' unsure' : ''}${c.miss ? ' miss' : ''}" title="${c.word != null ? escapeHtml(c.word) : ''}">${word}</span>`
      + `<span class="tr-p">${v(c.f0, 4)}<small>Hz</small></span>`
      + `<span class="tr-r"><small>resonance score</small>${v(res(c.res, c.rough), 3)}</span>`
      + `<span class="tr-fm">${fm}</span>${ref}<span class="tr-n">${c.note || ''}</span>`;
  }
  function mountTimeline(el, o) {
    const tl = o.tl, words = o.words || null, Y = words ? TL_LANES : tlLanes(false), [lo, hi] = target(), [plo, phi] = pitchBand();
    const hasAudio = !!(o.blob || o.buf), live = () => el.isConnected && o.alive();
    const V = { cue: null, info: null, pxs: tlPxs || TL_PX_S, spec: TLSpec.id === o.id ? TLSpec.spec : null, note: hasAudio ? 'Reading the recording…' : o.noAudio, view: null, sel: -1, on: -1, head: null, hold: false };
    const lab = (k, txt) => `<span style="top:${Y[k][0] - 17}px">${txt}</span>`;
    el.innerHTML = `<div class="section-head"><h4>${o.heading}${infoHtml('About the timeline', o.about)}</h4>
        <span class="muted small legend"><span><i class="dot masc-fill"></i>darker</span><span><i class="dot fem"></i>brighter</span><span><i class="dot you"></i>no vowel read</span>${words ? '<span><i class="wr-key off"></i>off your goal</span>' : ''}${o.unsure ? '<span><u class="unsure-key">word</u>unsure</span>' : ''}${o.ref ? '<span><i class="ref-key"></i>demo voice</span>' : ''}</span></div>
      <div class="tl-ctl">${hasAudio ? `<button type="button" class="btn sm primary" id="tl-play" disabled>▶ Play</button><span class="small muted tl-clock" id="tl-clock">loading…</span>` : ''}${o.extraBtns || ''}
        <span class="tl-zoom" role="group" aria-label="Zoom"><button type="button" class="btn sm ghost" data-z="out" aria-label="Zoom out">−</button><button type="button" class="btn sm ghost" data-z="fit">Fit</button><button type="button" class="btn sm ghost" data-z="in" aria-label="Zoom in">+</button></span></div>
      <div class="tl-wrap"><div class="tl-scroll" tabindex="0" aria-label="Timeline, scrolls sideways"></div>
        <div class="tl-lanes" aria-hidden="true">${lab('p', `Pitch · goal ${plo}-${phi} Hz`)}${lab('r', `Resonance score · goal ${lo}-${hi}`)}${lab('s', 'Spectrogram · 0-5 kHz')}${words ? lab('wp', o.unsure ? 'Words heard: pitch' : 'Each word: pitch') + lab('wr', o.unsure ? 'Words heard: resonance score' : 'Each word: resonance score') : ''}
          ${[4, 3, 2, 1].map(k => `<span class="tl-hz" style="top:${Y.s[0] + (1 - k / 5) * Y.s[1] - 7}px">${k}k</span>`).join('')}</div></div>
      <div class="tl-readbox"><div class="tl-read${o.ref ? ' has-ref' : ''}${words ? '' : ' no-words'}" id="tl-read" aria-live="polite">${cueHtml({ note: o.hint, refWho: o.ref ? (o.refWho || 'demo voice') : null })}</div></div>`;
    const scroll = el.querySelector('.tl-scroll'), read = el.querySelector('#tl-read');
    let svg = null, head = null, cueG = null, playable = false, drag = null, grab = null, noClick = false;
    const btn = el.querySelector('#tl-play');
    const msAtX = (cx) => { const r = svg.getBoundingClientRect(); return clamp(((cx - r.left) * (svg.viewBox.baseVal.width / r.width) - V.view.L) / V.pxs * 1000, 0, tl.dur); };
    const msAt = (ev) => msAtX(ev.clientX);
    const wordAt = (ms) => { let k = -1; if (words) (tl.ws || []).forEach((w, i) => { if (w != null && w <= ms) k = i; }); return k >= 0 && tl.we && tl.we[k] != null && ms > tl.we[k] + 60 ? -1 : k; };
    const clockMs = (ms) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
    const refWho = o.ref ? (o.refWho || 'demo voice') : null;
    // the readout under the timeline for one moment: the word there, pitch, resonance, F1-F3, and the reference's numbers when one is laid over it
    const say = (ms) => {
      const k = wordAt(ms), w = words && words[k], a = D.timelineAt(tl, ms, o.ref), miss = !!(w && o.gone && o.gone(k) === 'miss');
      const none = [!a.f0 ? 'no pitch' : '', a.res == null ? 'no vowel read' : ''].filter(Boolean).join(', ');
      return cueHtml({ t: clockMs(ms), word: w ? w[0] : null, unsure: !!(w && o.unsure && o.unsure(k)), miss, f0: a.f0 || null, res: a.res, F: a.F, ref: a.ref, refWho,
        note: [miss ? 'Possibly missed.' : '', w && o.unsure && o.unsure(k) ? 'Heard as this word, unsure.' : '', none ? `Here: ${none}.` : ''].filter(Boolean).join(' ') });
    };
    const mark = (cls, k) => { svg.querySelectorAll(`.tl-w.${cls}`).forEach(x => x.classList.remove(cls)); const g = k >= 0 && svg.querySelector(`.tl-w[data-i="${k}"]`); if (g) g.classList.add(cls); };
    // keep a spot in view: scroll when it's near or past an edge
    const follow = (hx) => { const px = hx * (svg.getBoundingClientRect().width / svg.viewBox.baseVal.width), v = scroll.clientWidth; if (px < scroll.scrollLeft + 20 || px > scroll.scrollLeft + v * 0.8) scroll.scrollLeft = Math.max(0, px - v * 0.25); };
    // the playhead, shown only while playing
    const place = (ms, fol) => {
      V.head = ms;
      const hx = V.view.x(ms); head.setAttribute('x1', hx.toFixed(1)); head.setAttribute('x2', hx.toFixed(1)); head.setAttribute('visibility', 'visible');
      if (fol) follow(hx);
    };
    const unplace = () => { V.head = null; if (head) head.setAttribute('visibility', 'hidden'); };
    const showCue = () => {
      if (!cueG) return;
      if (V.cue == null) { cueG.setAttribute('visibility', 'hidden'); return; }
      cueG.setAttribute('transform', `translate(${V.view.x(V.cue).toFixed(1)} 0)`); cueG.setAttribute('visibility', 'visible');
    };
    const mine = () => playable && Player.id === o.id;
    const restClock = () => { const clk = el.querySelector('#tl-clock'); if (clk && mine()) clk.textContent = `${clockMs(V.cue || 0)} / ${clockOf(Player.dur)}`; };
    // cue a spot: mark it and say what was heard there (info: the readout for a word instead). Play starts from it;
    // a playback already going carries on, and the readout stays on the cue until the next Play.
    const setCue = (ms, info) => {
      V.cue = ms; showCue();
      if (!info) { V.sel = -1; mark('sel', -1); }
      V.info = info || say(ms); read.innerHTML = V.info;
      V.hold = mine() && Player.playing;
      if (mine() && !Player.playing) { Player.off = ms / 1000; restClock(); }
    };
    const draw = () => {
      V.view = timelineSvg(words, tl, V.pxs, V.spec, V.note, o.gone, o.ref, o.unsure);
      scroll.innerHTML = V.view.svg; svg = scroll.firstElementChild; head = svg.querySelector('.tl-head'); cueG = svg.querySelector('.tl-cue');
      showCue();
      if (V.head != null) place(V.head, false);
      mark('sel', V.sel); mark('on', V.on);
    };
    const redraw = () => { const sl = scroll.scrollLeft; draw(); scroll.scrollLeft = sl; };
    // zoom about a point (px from the scroll's left edge): the playhead when it's in view, else the middle
    const zoomTo = (pxs, ax) => {
      pxs = clamp(pxs, TL_ZOOM[0], TL_ZOOM[1]); if (Math.abs(pxs - V.pxs) < 0.5) return;
      if (ax == null) { const at = V.head != null ? V.head : V.cue, hx = at != null ? V.view.x(at) - scroll.scrollLeft : -1; ax = hx >= 0 && hx <= scroll.clientWidth ? hx : scroll.clientWidth / 2; }
      const ms = (scroll.scrollLeft + ax - V.view.L) / V.pxs * 1000;
      V.pxs = tlPxs = pxs; draw();
      scroll.scrollLeft = Math.max(0, V.view.x(ms) - ax);
    };
    // a short take fills the width rather than sitting in a corner (a reading keeps the zoom picked last)
    if (o.fitShort && tl.dur > 0) V.pxs = clamp(Math.max(V.pxs, (scroll.clientWidth - 50) / (tl.dur / 1000)), TL_ZOOM[0], TL_ZOOM[1]);
    draw();
    const themed = () => { if (!live()) { tlRedraws.delete(themed); return; } redraw(); };
    tlRedraws.add(themed);
    el.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
      const z = b.dataset.z;
      zoomTo(z === 'in' ? V.pxs * 1.5 : z === 'out' ? V.pxs / 1.5 : (scroll.clientWidth - 50) / Math.max(1, tl.dur / 1000));
    }));
    // Ctrl + wheel (and a trackpad pinch, which arrives the same way) zooms about the pointer
    let wz = null;
    scroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return; e.preventDefault();
      const ax = e.clientX - scroll.getBoundingClientRect().left;
      wz = { f: (wz ? wz.f : 1) * Math.exp(-e.deltaY * 0.01), ax };
      if (!wz.raf) wz.raf = requestAnimationFrame(() => { const w = wz; wz = null; zoomTo(V.pxs * w.f, w.ax); });
    }, { passive: false });
    // two-finger pinch on a phone: stretch the picture while pinching, then draw it again at the new zoom
    let pin = null;
    const gap = (t) => Math.abs(t[0].clientX - t[1].clientX);
    scroll.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pin = { d: Math.max(20, gap(e.touches)), ax: (e.touches[0].clientX + e.touches[1].clientX) / 2 - scroll.getBoundingClientRect().left, f: 1 }; }, { passive: true });
    scroll.addEventListener('touchmove', (e) => {
      if (!pin || e.touches.length !== 2) return; e.preventDefault();
      pin.f = clamp(Math.max(20, gap(e.touches)) / pin.d, TL_ZOOM[0] / V.pxs, TL_ZOOM[1] / V.pxs);
      svg.style.transformOrigin = `${scroll.scrollLeft + pin.ax}px 0`; svg.style.transform = `scaleX(${pin.f})`;
    }, { passive: false });
    const pinEnd = () => { if (!pin) return; const p = pin; pin = null; svg.style.transform = ''; zoomTo(V.pxs * p.f, p.ax); };
    scroll.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinEnd(); });
    scroll.addEventListener('touchcancel', pinEnd);
    const paint = () => { if (!btn) return; const on = mine() && Player.playing; btn.textContent = on ? '■ Stop' : '▶ Play'; btn.setAttribute('aria-pressed', String(on)); btn.title = on ? 'Stop (the cue stays)' : V.cue != null ? `Play from ${clockMs(V.cue)}` : 'Play from the start'; };
    // stopped (by Stop, at the end, or at the end of a word): the playhead goes, the cue and its numbers stay
    const rest = () => {
      unplace(); if (V.on !== -1) { V.on = -1; mark('on', -1); }
      V.lastS = null; V.hold = false;
      if (mine()) Player.off = (V.cue || 0) / 1000;
      read.innerHTML = V.info || cueHtml({ note: o.hint, refWho }); restClock();
    };
    const hook = () => {
      Player.onTick = (s) => {
        if (!Player.playing) return;
        const ms = s * 1000; place(ms, !drag && !grab);
        const clk = el.querySelector('#tl-clock'); if (clk) clk.textContent = `${clockOf(s)} / ${clockOf(Player.dur)}`;
        const k = wordAt(ms); if (k !== V.on) { V.on = k; mark('on', k); }
        if (!V.hold && Math.abs(s - (V.lastS || -1)) > 0.1) { V.lastS = s; read.innerHTML = say(ms); }
      };
      Player.onState = () => { paint(); if (!Player.playing) rest(); };
    };
    // a word: cue its start and show its numbers; play (from the word-by-word chart) also plays just that word
    const pickWord = (i, play) => {
      if (!words) return;
      const sp = D.wordSpans(tl.ws, tl.dur, tl.we)[i];
      V.sel = i; mark('sel', i);
      const at = sp ? Math.max(0, sp[0] - 150) : (V.cue || 0);
      setCue(at, cueHtml(Object.assign({ t: clockMs(sp ? sp[0] : at), F: sp ? D.spanFormants(tl, sp[0], sp[1]) : null, refWho }, o.wordInfo(i))));
      if (sp) follow(V.view.x(sp[0]));
      if (play && sp && mine()) { hook(); V.hold = true; Player.play(at / 1000, (sp[1] + 250) / 1000); }
      paint();
    };
    // a tap or click cues the spot under it (or the word); nothing plays until Play
    scroll.addEventListener('click', (ev) => {
      if (!svg) return;
      if (noClick) { noClick = false; return; }
      const g = ev.target.closest('.tl-w');
      if (g) return pickWord(+g.dataset.i);
      setCue(msAt(ev)); paint();
    });
    const skipClick = () => { noClick = true; setTimeout(() => { noClick = false; }, 0); };
    // dragging nudges the view along when it reaches an edge
    const edge = (cx) => { const r = scroll.getBoundingClientRect(); if (cx < r.left + 28) scroll.scrollLeft -= 14; else if (cx > r.right - 28) scroll.scrollLeft += 14; };
    // with a mouse (or pen), drag across the timeline to scrub the cue
    scroll.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'touch' || ev.button !== 0 || !svg || ev.target.closest('.tl-w')) return;
      drag = { x: ev.clientX, id: ev.pointerId, moved: false };
    });
    scroll.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(ev.clientX - drag.x) < 4) return;
        drag.moved = true; el.classList.add('tl-scrub');
        try { scroll.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      ev.preventDefault(); edge(ev.clientX); setCue(msAt(ev)); paint();
    });
    const dragEnd = (ev) => { if (!drag || ev.pointerId !== drag.id) return; if (drag.moved) skipClick(); drag = null; el.classList.remove('tl-scrub'); };
    scroll.addEventListener('pointerup', dragEnd); scroll.addEventListener('pointercancel', dragEnd);
    // on a touch screen a finger still pans the timeline; one put down on the cue line drags the cue instead
    scroll.addEventListener('touchstart', (e) => {
      grab = null;
      if (e.touches.length !== 1 || V.cue == null || !svg) return;
      const r = svg.getBoundingClientRect(), cx = r.left + V.view.x(V.cue) * (r.width / svg.viewBox.baseVal.width);
      if (Math.abs(e.touches[0].clientX - cx) <= 22) grab = { moved: false };
    }, { passive: true });
    scroll.addEventListener('touchmove', (e) => {
      if (!grab || e.touches.length !== 1) { grab = null; return; }
      e.preventDefault(); grab.moved = true;
      const cx = e.touches[0].clientX; edge(cx); setCue(msAtX(cx)); paint();
    }, { passive: false });
    const grabEnd = () => { if (grab && grab.moved) skipClick(); grab = null; };
    scroll.addEventListener('touchend', grabEnd); scroll.addEventListener('touchcancel', grabEnd);
    // keyboard: arrows move the cue (Shift for a second at a time), Space plays or stops
    scroll.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('.tl-w');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return pickWord(+g.dataset.i); }
      if (e.target !== scroll) return;
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && V.cue != null) {
        e.preventDefault();
        const ms = clamp(V.cue + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1000 : 100), 0, tl.dur);
        setCue(ms); follow(V.view.x(ms)); paint();
      } else if (e.key === ' ' && btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    });
    const ready = (async () => {
      if (!hasAudio) return false;
      const clk = el.querySelector('#tl-clock');
      const ok = o.buf ? Player.useBuffer(o.id, o.buf) : await Player.load(o.id, o.blob);
      if (!live()) return false;
      if (!ok) { btn.remove(); clk.textContent = `This browser couldn't open the recording to play it.${o.blob ? ' Save audio still works.' : ''}`; V.note = "This browser couldn't open the recording, so no spectrogram"; draw(); return false; }
      playable = true;
      hook(); btn.disabled = false; restClock(); paint();
      btn.onclick = () => { if (Player.id !== o.id) return; hook(); if (Player.playing) return Player.pause(); V.hold = false; Player.play((V.cue || 0) / 1000); };
      // the spectrogram is worked out from the recording itself, after the page has had a moment to draw
      if (!V.spec) setTimeout(() => {
        if (!live() || Player.id !== o.id || !Player.buf) return;
        try { V.spec = D.spectrogram(Player.buf.getChannelData(0), Player.buf.sampleRate); TLSpec.id = o.id; TLSpec.spec = V.spec; } catch (e) { V.note = "The spectrogram couldn't be drawn"; }
        redraw();
      }, 30);
      return true;
    })();
    return { ready, pickWord };
  }
  function startReading(id) {
    endSpots();
    Reader.show();
    Reader.pick(id);
    Reader.setFull(true);
    beginRun();
  }
  function beginRun() {
    const t = Reader.current; if (!t) return;
    Player.stop();
    Run.on = true; Run.text = t; Run.maxIdx = 0; Run.start = Date.now(); Run.frames = [];
    if (Spot.cur) { const T = TvY.spot; T.live = []; T.frozen = false; T.cmp = null; T.you = null; }
    Words.resetHeard();
    Run.gates = { voiced: 0, formants: 0, steady: 0, scored: 0, loose: 0, refused: 0 };
    stopRunAudio(); if (stream && state.running === 'mic') startRunAudio(stream);
    session = newSession();
    $('reader').classList.add('run');
    $('reader-finish').hidden = false;
    Reader.restart();
    if (state.running !== 'mic') startMic();
  }
  function endRun() {
    if (RunAudio.mr) stopRunAudio();
    Run.on = false; Run.frames = [];
    $('reader').classList.remove('run');
    $('reader-finish').hidden = true;
  }
  const ALIGN_ROOM = 1.15; // how far past the live highlight's last word the reading may really have got
  function finishReading() {
    if (!Run.on) return;
    if (Spot.cur) return finishSpot();
    const t = Run.text, st = sessionStats(session), pool = D.pooledResonance(Run.frames);
    const round = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
    const live = D.missedWords(Run.frames, Reader.words.length), said = Words.said();
    const sm = said ? D.matchScript(Reader.words.map(w => w.text), said) : null;
    // the timeline counts from the recording's start, on the frames' clock moved back by the analysis lag
    const t0 = RunAudio.mr && RunAudio.t0 != null ? RunAudio.t0 : (Run.frames.length ? Run.frames[0].t : 0);
    let fl = Run.frames.map(f => (f.t != null ? Object.assign({}, f, { t: f.t - FRAME_LAG_MS() }) : f));
    // word edges placed again from the sound now the whole reading is there (D.alignByClass): each word's spelling
    // becomes a chain of sound classes matched against what each moment of the recording sounds like, with pauses and
    // noise given their own catch-all so they can't take words. The words read are the ones the speech check heard up
    // to, when it's on; otherwise the live highlight's last word, with room for it to have fallen behind (it can lag),
    // caps how far the alignment may go and it finds where you stopped itself. Coverage follows whichever reached further.
    const clip = Clips.pickNow(t), heardTo = sm && !sm.lost && sm.last >= 0 ? sm.last : -1, script = Reader.words.map(w => w.text);
    const fa = fl.filter(f => f.t >= t0);
    let al = null;
    if (live.reach >= 0 || heardTo >= 0) {
      const maxWords = heardTo >= 0 ? heardTo + 1 : Math.round((live.reach + 1) * ALIGN_ROOM) + 3;
      al = D.alignByClass(fa, heardTo >= 0 ? script.slice(0, heardTo + 1) : script, { maxWords })
        || D.alignWords(fa, heardTo >= 0 ? script.slice(0, heardTo + 1) : script, { ref: clip ? clip.words : null, free: heardTo < 0, guess: live.reach + 1 });
    }
    if (al) fl = D.retagFrames(fl, al.ws);
    // the vowel map from the re-placed words: live, the highlight was often a word off, so few vowels matched their word
    const rv = D.readingVowels(fl, script, PRON); fl = rv.frames;
    const vmap = D.vowelMap(rv.vf, D.READ_VMAP_MIN);
    const reach = al ? Math.max(al.last, heardTo) : Math.max(live.reach, sm ? sm.last : -1);
    const mw = al ? Object.assign(D.missedWords(fl, Reader.words.length), { reach }) : live;
    const cover = Reader.words.length ? clamp((Math.max(Run.maxIdx, reach) + 1) / Reader.words.length, 0, 1) : 0;
    const rec = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      at: new Date().toISOString(), goal: state.goal, text: t.id, title: t.title, rs: D.RES_SCALE, bs: D.BREATH_SCALE, // resonance and breathiness scale versions
      cover: Math.round(cover * 100), partial: cover < 0.7, seconds: Math.round((Date.now() - Run.start) / 1000),
      // the whole reading's resonance; under 20 vowel readings it's rough (resShaky), with none it says why (resWhy)
      resonance: round(pool.res), resPm: pool.pm, resN: pool.n, resShaky: pool.shaky || undefined, resWhy: pool.why || undefined,
      vowels: Object.fromEntries(Object.entries(st.vowels).map(([k, v]) => [k, round(v.score)])),
      sibS: st.sib.s ? round(st.sib.s.score) : null, sibSh: st.sib.sh ? round(st.sib.sh.score) : null,
      pitchMedian: st.pitch ? Math.round(st.pitch.median) : null, pitchP10: st.pitch ? Math.round(st.pitch.p10) : null, pitchP90: st.pitch ? Math.round(st.pitch.p90) : null,
      breath: round(st.breath),
      // word by word: [word, pitch Hz, resonance, sibilant score], for the report after the reading
      // vowel map: { vowel: [F1, F2, F3, score, frames, [words it was heard in]] }
      vmap: readingVowelMap(vmap.length ? vmap : st.map, vmap.length ? fl : Run.frames, Reader.words), vsrc: 'text', // vowels checked against the text's words
      gates: Run.gates || undefined, // how many voiced moments passed each step, for "How word by word works"
      // Check words: script words the speech recogniser didn't hear (indices); without it, none (missBy says which)
      miss: sm && sm.miss.length ? sm.miss : undefined, missBy: sm ? (sm.lost ? 'lost' : 'speech') : undefined,
      // words the highlight passed with no voice on them (a reason for no reading, not proof of a skip),
      // and the last word reached when the reading stopped early
      skip: mw.miss.length ? mw.miss : undefined, reach: reach >= 0 && reach < Reader.words.length - 1 ? reach : undefined,
      byWord: D.wordReport(fl, Reader.words.length).map((w, i) => [Reader.words[i].text, w.p != null ? Math.round(w.p) : null, round(w.r), round(w.s)].concat(w.rough && w.r != null ? [1] : [])),
    };
    // the timeline is cut from the frames before endRun clears them
    const tl = D.readingTimeline(fl, t0, Reader.words.length);
    if (al) { tl.ws = tl.ws.map((v, i) => (i < al.ws.length ? Math.max(0, al.ws[i] - t0) : null)); tl.we = tl.ws.map((v, i) => (i < al.we.length && al.we[i] != null ? Math.max(0, al.we[i] - t0) : null)); }
    stopRunAudio(rec.id);
    endRun();
    Reader.hide();
    if (state.running === 'mic') stop();
    if (rec.resonance == null && rec.sibS == null) {
      showReadingResult(null, 'Not enough voice was heard to score that reading, so nothing was saved. Check that the microphone is on and read a little louder.');
    } else {
      Data.add('readings', rec);
      Replay.put(rec.id, { at: rec.at, tl });
      // the weakest sounds become suggested exercises in Practice
      const steps = buildPlan(st);
      if (steps.length) { state.plan = { status: 'offer', source: 'reading', steps, idx: 0 }; renderPlan(); }
      showReadingResult(rec);
    }
    session = newSession(); resetSessionViews();
    renderReadings(); renderHome();
    $('rd-hist-pick').value = t.id; renderReadingHistory();
  }
  function cancelRun() { if (Run.on) { stopRunAudio(); endRun(); session = newSession(); resetSessionViews(); } }
  const fullReadings = (id) => Data.d.readings.filter(r => r.text === id && r.goal === state.goal && !r.partial);
  // under the reading's resonance: how sure it is, or why there isn't one (older readings have neither)
  function resNote(rec) {
    if (rec.resonance != null) return rec.resPm != null ? `<small>± ${rec.resPm}${rec.resShaky ? `, few vowels${infoHtml('A rough resonance', `Only ${rec.resN} steady vowel moments could be read, so this is a rough guide. Longer vowels and a steady volume give more to measure.`)}` : ''}</small>` : '';
    if (!rec.resWhy) return '';
    const more = {
      quiet: 'Too little voice reached the microphone to read your vowels.',
      high: 'Your voice sat above about 280 Hz, where the vowel shape can no longer be read from the voice reliably.',
      unclear: "Vowels were heard, but their shape didn't fit any vowel the app knows. A nasal or buzzy tone, room echo or a phone microphone's processing can cause this. The microphone and voice check in Settings can tell which.",
      unsteady: "The resonance score is read from vowels the mouth holds for a moment, and none held still long enough. Try reading a little slower and letting the long vowels last.",
    }[rec.resWhy];
    return `<small>${D.SING_WHY[rec.resWhy]}${more ? infoHtml('Why no resonance', more) : ''}</small>`;
  }
  // the formant summary of a reading (its vowel map pooled), or null for readings saved before the map
  function readingFoSum(rec) {
    if (!rec.vmap) return null;
    return D.formantSummary(Object.entries(rec.vmap).map(([k, a]) => ({ k, F: a.slice(0, 3), s: a[3], n: a[4] })), state.goal, rec.pitchMedian || 0);
  }
  function readingDims(rec) {
    return D.voiceDims({ goal: state.goal, pitchBand: pitchBand(),
      pitch: rec.pitchMedian != null ? { median: rec.pitchMedian, p10: rec.pitchP10, p90: rec.pitchP90 } : null,
      res: { score: rec.resonance, pm: rec.resPm, shaky: rec.resShaky, why: rec.resWhy || (rec.resonance == null ? 'none' : undefined) },
      fo: readingFoSum(rec), breath: rec.breath, sib: { s: rec.sibS, sh: rec.sibSh } });
  }
  const REF_KEY = 'voicetrainer.refcompare';
  const refOn = () => { try { return localStorage.getItem(REF_KEY) === '1'; } catch (e) { return false; } };
  // A reading's result, or (rec.ref) the demo voice's measured reading of a passage. opt.ref: the demo voice's
  // measured reading of the same words, drawn as a dashed reference; opt.keep: redrawn in place (no scroll).
  function showReadingResult(rec, msg, opt = {}) {
    const box = $('rd-result'); box.hidden = false; box.rec = rec; box.cue = null; box.tlJump = null; box.refToken = null;
    Player.stop();
    if (!rec) { box.innerHTML = `<p>${msg}</p><div class="btn-row"><button type="button" class="btn sm" id="rd-close">Close</button></div>`; $('rd-close').onclick = () => { box.hidden = true; }; return; }
    const isRef = !!rec.ref, ref = !isRef && RefRead.fits(opt.ref, rec) ? opt.ref : null;
    const prev = isRef ? [] : fullReadings(rec.text).filter(r => r.id !== rec.id && r.at < rec.at);
    const last = prev.at(-1), best = prev.reduce((m, r) => (r.resonance != null && (m == null || better(r.resonance, m)) ? r.resonance : m), null);
    const delta = (v, o) => (v == null || o == null ? '' : `<small class="${better(v, o) ? 'up' : v === o ? '' : 'down'}">${v - o > 0 ? '+' : ''}${Math.round(v - o)} vs last</small>`);
    const [lo, hi] = target();
    const weak = isRef ? [] : Object.entries(rec.vowels || {}).filter(([, s]) => !onTarget(Math.round(s))).sort((a, b) => gapOf(b[1]) - gapOf(a[1])).slice(0, 3);
    const spots = isRef ? [] : spotsFor(rec);
    const vv = rec.voice, clip = !!(vv && vv.clip), setRes = vv && !clip ? Math.round(D.resScore(vv.res / 100)) : null;
    const text = Texts.all().find(x => x.id === rec.text), refWho = ref ? RefRead.who(ref) : RefRead.whoFor(text);
    const refSet = !ref ? '' : ref.voice.clip ? ` A neural voice (${ref.voice.name}) made ahead of time; Voice settings picks feminine or masculine.` : `, set to ${ref.voice.pitch} Hz and resonance ${Math.round(D.resScore(ref.voice.res / 100))} in Voice settings.`;
    const refLine = isRef ? '' : `<div class="ref-line"><button type="button" class="btn sm ${ref ? '' : 'ghost'}" id="rd-ref" aria-pressed="${!!ref}">${ref ? `Hide the ${refWho}` : `Compare with the ${refWho}`}</button>`
      + `<span class="small" id="rd-ref-say">${ref ? `<i class="ref-key"></i>${refWho.charAt(0).toUpperCase() + refWho.slice(1)} (dashed): resonance ${ref.resonance != null ? Math.round(ref.resonance) : '--'}, pitch ${ref.pitchMedian != null ? ref.pitchMedian + ' Hz' : '--'}${ref.voice.clip ? '.' : ''}${refSet}` : ''}</span>`
      + infoHtml('About the reference voice', refWho === 'neural voice'
        ? "A neural text-to-speech voice (Kokoro) read this passage ahead of time, and the app measures it exactly the way it measures you. Its words are laid over yours word by word, so a different pace doesn't matter. It sounds like a person, with a person's melody, so it is a good target to aim at. It is one voice, though, not the only way to sound feminine or masculine. Pick Demo voice under Voice settings for the app's own synthetic voice, whose pitch and resonance you can set."
        : "The app's demo voice reads the same passage at the pitch, resonance and brightness set in Voice settings, and the app measures it exactly the way it measures you. Its words are laid over yours word by word, so a different pace doesn't matter. Use it as a target to aim at, and as a check: where the demo voice reads close to what it was set to, the measuring works for that bit of the passage. It is a machine voice, so its melody is simpler than real speech.") + '</div>';
    box.innerHTML = `<div class="section-head"><h3>${escapeHtml(rec.title)}${isRef ? `: the ${RefRead.who(rec)}` : ''}</h3><span class="muted small">${isRef ? `Not saved · ${clockOf(rec.seconds)} long` : rec.partial ? `Partial reading (${rec.cover}% read), kept out of the trend` : `${rec.cover}% read in ${Math.round(rec.seconds / 6) / 10} min`}</span></div>
      ${dimsHtml(readingDims(rec), { more: { breath: rec.breath != null ? breathWord(rec.breath) : '' }, extra: {
        res: (rec.resShaky || rec.resonance == null ? resNote(rec) : '') + (isRef ? (clip ? '' : `<small>set to ${setRes}</small>`) : delta(rec.resonance, last && last.resonance) + (ref && ref.resonance != null ? `<small class="ref-num">${ref.voice.clip ? 'neural' : 'demo'} ${Math.round(ref.resonance)}</small>` : '')),
        s: isRef ? '' : delta(rec.sibS, last && last.sibS),
        pitch: (isRef ? (clip ? '' : `<small>set to ${vv.pitch} Hz</small>`) : '') + (ref && ref.pitchMedian != null ? `<small class="ref-num">${ref.voice.clip ? 'neural' : 'demo'} ${ref.pitchMedian} Hz</small>` : ''),
      } })}
      ${isRef && clip ? `<p class="small">A neural voice (${escapeHtml(vv.name)}, Kokoro) reading this passage, made ahead of time and measured exactly the way your readings are. It sounds like a person, so its pitch moves and its vowels vary the way real speech does. Your own readings of this passage can show it as a dashed line: Compare with the neural voice.${infoHtml('About the neural voice reading', "Kokoro-82M, an open text-to-speech model, read each built-in passage once, and the model itself gave the moment each word starts, so the app knows where every word is. It reads in a feminine or a masculine voice, following the voice type in Voice settings; its pitch and resonance are its own. Your own passages use the demo voice, whose pitch and resonance you can set. Nothing here is saved.")}</p>`
        : isRef ? `<p class="small">The demo voice reading this passage at ${vv.pitch} Hz, resonance ${setRes} and brightness ${vv.bright} (${vv.style === 'natural' ? 'Natural' : 'Classic'}), measured exactly the way your readings are. Where a word reads far from what the voice was set to, the measuring falls short there, not the voice. Your own readings of this passage can show it as a dashed line: Compare with the demo voice.${infoHtml('About the demo voice reading', "The app makes this voice itself, from the passage's spelling and a pronunciation dictionary, so it knows exactly when each word starts and which vowels it should have. It is not a real speaker: its melody is simple and its consonants are rough, but its pitch and resonance are exactly what Voice settings asks for. Change those there and open this again to hear and measure another voice. Nothing here is saved.")}</p>`
        : `<p class="small muted">${rec.partial ? 'Read at least 70% of the passage for a reading to count in the trend.' : best != null ? (better(rec.resonance, best) || rec.resonance === best ? 'Your best resonance on this passage so far.' : `Your best on this passage is ${Math.round(best)}.`) : 'Your first full reading of this passage. Read it again another day to see the trend.'}</p>`}
      ${refLine}
      ${weak.length ? `<p class="small"><b>Furthest from your target:</b> ${weak.map(([k, s]) => `<button type="button" class="chip" data-weak="${k}">${D.VOWEL_BY_KEY[k].cue.split(' ')[0]} ${Math.round(s)}</button>`).join(' ')} <span class="muted">Tap one to practise it.</span></p>` : ''}
      ${isRef ? '' : focusHtml(rec, spots)}
      ${vowelMapHtml(rec, ref)}
      <div class="tl" id="rd-tl" hidden></div>
      ${wordReportHtml(rec, spots, ref)}
      <div class="btn-row"><button type="button" class="btn sm" id="rd-again">${isRef ? 'Read it yourself' : 'Read it again'}</button>${isRef ? '' : '<button type="button" class="btn sm ghost" id="rd-discard">Discard this reading</button><button type="button" class="btn sm ghost" id="rd-audio" hidden>Save audio</button>'}<button type="button" class="btn sm ghost" id="rd-close">Close</button></div>`;
    wireWordReport(box, rec, ref);
    wireTimeline(box, rec, ref);
    if (!isRef) wireFocus(box, rec, spots);
    box.querySelectorAll('[data-weak], [data-vm]').forEach(b => b.addEventListener('click', () => { const def = DRILLS.vowels.find(d => d.vowel === (b.dataset.weak || b.dataset.vm)); if (def) openDrill(def); }));
    $('rd-again').onclick = () => { box.hidden = true; Player.stop(); startReading(rec.text); };
    $('rd-close').onclick = () => { box.hidden = true; Player.stop(); };
    if (!isRef) $('rd-discard').onclick = (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Discard: tap again'; return; }
      Data.remove('readings', rec.id); Replay.forget(rec.id); Player.stop(); box.hidden = true; renderReadings(); renderHome();
    };
    const rb = $('rd-ref');
    if (rb) {
      const t = text;
      const fetchRef = () => {
        const say = $('rd-ref-say'), token = box.refToken = {};
        rb.disabled = true; say.textContent = `Measuring the ${refWho}…`;
        RefRead.measure(t, (f) => { if (box.refToken === token) say.textContent = `Measuring the ${refWho}… ${Math.round(f * 100)}%`; }).then(r => {
          if (box.refToken !== token || box.rec !== rec || box.hidden) return;
          if (!RefRead.fits(r, rec)) { rb.disabled = false; say.textContent = `This passage has been edited since this reading, so the ${RefRead.who(r)} reads different words.`; return; }
          showReadingResult(rec, null, { ref: r, keep: true });
        });
      };
      if (!t) rb.parentElement.remove();
      else {
        rb.onclick = () => {
          const on = !ref; try { localStorage.setItem(REF_KEY, on ? '1' : '0'); } catch (e) {}
          if (on) fetchRef(); else showReadingResult(rec, null, { keep: true });
        };
        if (!ref && refOn() && !opt.keep) fetchRef();
      }
    }
    if (!opt.keep) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // ---- vowel map: each vowel of the passage on its own, placed on the F1/F2 plane ----
  // The words each vowel was heard in come from the reading highlight, so they show where to look.
  function readingVowelMap(map, frames, words) {
    const r1 = (x) => Math.round(x * 10) / 10;
    return Object.fromEntries(map.map(m => {
      const cnt = new Map();
      for (const f of frames) if (f.k === m.k && words[f.i]) { const w = words[f.i].text.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '').toLowerCase(); if (w) cnt.set(w, (cnt.get(w) || 0) + 1); }
      const top = [...cnt.entries()].filter(e => e[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]); // a stray frame or two is not "heard in"
      return [m.k, [Math.round(m.F[0]), Math.round(m.F[1]), Math.round(m.F[2]), r1(m.s), m.n, top]];
    }));
  }
  // items: [{ k, F: [F1, F2, F3], s: score, n, words? }]
  // refItems: the demo voice's vowels, drawn as rings (same form as items)
  function vowelMapSvg(items, refItems, youLabel = 'you', refName = 'demo voice') {
    const refWho = refName.charAt(0).toUpperCase() + refName.slice(1);
    const W = 360, H = 250, L = 38, R = 12, T = 12, B = 26;
    const x = (f2) => L + (Math.log(VC.f2[1]) - Math.log(clamp(f2, VC.f2[0], VC.f2[1]))) / (Math.log(VC.f2[1]) - Math.log(VC.f2[0])) * (W - L - R);
    const y = (f1) => T + (Math.log(clamp(f1, VC.f1[0], VC.f1[1])) - Math.log(VC.f1[0])) / (Math.log(VC.f1[1]) - Math.log(VC.f1[0])) * (H - T - B);
    const f1 = (v) => v.toFixed(1), [lo, hi] = target(), fem = state.goal === 'fem';
    let g = '';
    for (const f of [800, 1000, 1500, 2000, 2500, 3000]) g += `<line class="vm-grid" x1="${f1(x(f))}" x2="${f1(x(f))}" y1="${T}" y2="${H - B}"/><text class="vm-tick" x="${f1(x(f))}" y="${H - 8}" text-anchor="middle">${f >= 1000 ? f / 1000 + 'k' : f}</text>`;
    for (const f of [300, 400, 500, 600, 800, 1000]) g += `<line class="vm-grid" x1="${L}" x2="${W - R}" y1="${f1(y(f))}" y2="${f1(y(f))}"/><text class="vm-tick" x="${L - 5}" y="${f1(y(f) + 4)}" text-anchor="end">${f}</text>`;
    // a point on the masculine-to-feminine line of vowel v, at score a (0..100), on the same log scale as the score
    const along = (v, a, i) => Math.exp(Math.log(v.M[i]) + D.resAlpha(a) * (Math.log(v.W[i]) - Math.log(v.M[i])));
    let refs = '', you = '';
    for (const it of items) {
      const v = D.VOWEL_BY_KEY[it.k], off = !onTarget(Math.round(it.s)), cue = v.cue.split(' ')[0];
      const mx = x(v.M[1]), my = y(v.M[0]), wx = x(v.W[1]), wy = y(v.W[0]);
      const gx0 = x(along(v, lo, 1)), gy0 = y(along(v, lo, 0)), gx1 = x(along(v, hi, 1)), gy1 = y(along(v, hi, 0));
      refs += `<line class="vm-axis" x1="${f1(mx)}" y1="${f1(my)}" x2="${f1(wx)}" y2="${f1(wy)}"/>`
        + `<line class="vm-goal" x1="${f1(gx0)}" y1="${f1(gy0)}" x2="${f1(gx1)}" y2="${f1(gy1)}"/>`
        + `<circle class="vm-m" cx="${f1(mx)}" cy="${f1(my)}" r="3.5"/><circle class="vm-w" cx="${f1(wx)}" cy="${f1(wy)}" r="3.5"/>`;
      const ux = x(it.F[1]), uy = y(it.F[0]), tx = fem ? wx : mx, ty = fem ? wy : my;
      const tip = `${cue} (${v.word}): resonance ${Math.round(it.s)}, F1 ${Math.round(it.F[0])} Hz, F2 ${Math.round(it.F[1])} Hz, F3 ${Math.round(it.F[2])} Hz${it.words && it.words.length ? ', heard in ' + it.words.join(', ') : ''}`;
      you += `<g class="vm-you${off ? ' off' : ''}" data-vm="${it.k}" tabindex="0" role="button" aria-label="${escapeHtml(tip)}"><title>${escapeHtml(tip)}</title>`
        + `<line class="vm-pull" x1="${f1(ux)}" y1="${f1(uy)}" x2="${f1(tx)}" y2="${f1(ty)}"/>`
        + `<circle class="vm-dot" cx="${f1(ux)}" cy="${f1(uy)}" r="6"/>`
        + `<text class="vm-lab" x="${f1(ux + 8)}" y="${f1(uy - 7)}">${escapeHtml(cue)}</text></g>`;
    }
    let demo = '';
    for (const it of refItems || []) {
      const v = D.VOWEL_BY_KEY[it.k]; if (!v || !it.F) continue;
      const tip = `${refWho} ${v.cue.split(' ')[0]} (${v.word}): resonance ${Math.round(it.s)}, F1 ${Math.round(it.F[0])} Hz, F2 ${Math.round(it.F[1])} Hz`;
      demo += `<circle class="vm-ref" cx="${f1(x(it.F[1]))}" cy="${f1(y(it.F[0]))}" r="7"><title>${escapeHtml(tip)}</title></circle>`;
    }
    return `<svg class="vm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your vowels on the vowel chart: tongue front to back across, jaw closed to open down">${g}<text class="vm-tick" x="${W - R}" y="${T + 10}" text-anchor="end">F2 (tongue front ← back)</text><text class="vm-tick" x="${L + 4}" y="${H - B - 4}">F1 (jaw) ↓</text>${refs}${demo}${you}</svg>
      <p class="small muted vm-key"><span class="dot masc"></span>typical masculine <span class="dot fem"></span>typical feminine <span class="vm-key-goal"></span>your goal zone <span class="vm-key-you"></span>${youLabel}${refItems && refItems.length ? ' <span class="vm-key-ref"></span>' + refName : ''}</p>`;
  }
  // the vowel section of a reading result: map plus one row per vowel, weakest first
  function vowelMapHtml(rec, ref) {
    const vm = rec.vmap, [lo, hi] = target();
    const refRows = ref && ref.vmap ? Object.entries(ref.vmap).map(([k, a]) => ({ k, F: a.slice(0, 3), s: a[3] })) : null;
    const rows = vm ? Object.entries(vm).map(([k, a]) => ({ k, F: a.slice(0, 3), s: a[3], n: a[4], words: a[5] || [] }))
      : Object.entries(rec.vowels || {}).map(([k, s]) => ({ k, s, words: [] }));
    if (!rows.length) return '';
    rows.sort((a, b) => gapOf(b.s) - gapOf(a.s) || a.s - b.s);
    const fsum = vm ? D.formantSummary(rows, state.goal, rec.pitchMedian || 0) : null;
    const list = rows.map(r => {
      const v = D.VOWEL_BY_KEY[r.k], off = !onTarget(Math.round(r.s));
      return `<li><button type="button" class="vm-row${off ? ' off' : ''}" data-vm="${r.k}"><span class="vm-cue"><b>${escapeHtml(v.cue.split(' ')[0])}</b> <small class="muted">${escapeHtml(v.word)}</small></span>`
        + `<span class="track"><span class="mark" style="left:${clamp(r.s, 0, 100)}%"></span></span><span class="val">${Math.round(r.s)}</span>`
        + `<span class="vm-words small muted">${fsum ? foVowelLine(fsum.byVowel[r.k]) : ''}${r.words.length ? 'in ' + r.words.map(escapeHtml).join(', ') : ''}</span></button></li>`;
    }).join('');
    return `<div class="vm"><div class="section-head"><h4>${rec.ref ? `The ${RefRead.who(rec)}'s vowels` : 'Your vowels'}${infoHtml('How your vowels are scored', `${rec.vsrc === 'text' ? 'Each vowel you held steadily on a word that has it, scored on its own. A vowel only counts when it sounds like the vowel the word should have; short words like "the" and "of", and gliding vowels like in "sign" or "round", are left out.' : vm ? 'Each vowel you held steadily, scored on its own. This reading was saved before vowels were checked against the text, so a vowel and the words listed under it may be mismatched.' : 'Each vowel you held steadily, scored on its own (consonants are left out).'} ${vm ? 'On the chart, each dot is your average for that vowel; the dashed line points to the typical value for your goal.' : 'This reading was saved before the vowel chart existed, so only the scores are shown.'}`)}</h4><span class="muted small">${rows.length} vowel${rows.length > 1 ? 's' : ''} heard · goal ${lo}-${hi}</span></div>
      ${vm ? `<div class="vm-chart">${vowelMapSvg(rows, refRows, rec.ref ? RefRead.who(rec) : 'you', ref ? RefRead.who(ref) : '')}</div>` : ''}
      <ul class="vm-list">${list}</ul>
      <p class="small muted">Tap a vowel to practise it.${infoHtml('Why some vowels are missing', 'Short vowels in quick speech are rarely held long enough to score, so some may be missing.')}</p></div>`;
  }
  // ---- word by word: pitch and resonance under each word of the passage ----
  // Word edges are placed from the recording after the reading (D.alignByClass), so a word's numbers can still spill a little into its neighbours.
  // why a word of a reading has no resonance, in a few words (a missing score is never drawn as a low one)
  function noResWhy(text, pitch, gone) {
    if (gone === 'miss') return 'possibly missed, the word check did not hear it';
    if (gone === 'skip' && pitch == null) return 'the highlight passed it without hearing your voice on it';
    if (gone === 'end') return 'not reached, the reading stopped before it';
    const wv = D.wordVowels(text, PRON);
    if (wv.why === 'function') return 'short linking word, not scored';
    if (pitch == null) return 'too little voice heard';
    return 'no vowel held long enough to read';
  }
  // one line on how many voiced moments made it through each step (readings since 2026-11)
  function gatesNote(g) {
    if (!g || !g.voiced) return '';
    const pc = (n) => Math.round(100 * n / g.voiced) + '%';
    return ` In this reading: ${g.voiced} voiced moments; ${pc(g.formants)} gave formants, ${pc(g.steady)} held still, ${pc(g.scored)} got a reading${g.loose ? ` (plus ${pc(g.loose)} from short vowels)` : ''}${g.refused ? `, ${pc(g.refused)} were refused as unmeasurable` : ''}. Few readings? The microphone and voice check in Settings shows whether the microphone or the voice is the limit.`;
  }
  // whether word i of a reading was possibly missed ('miss') or never reached ('end'); readings before 2026-11-15 have neither
  function wordGone(rec, i) {
    if (rec.miss && rec.miss.includes(i)) return 'miss';
    if (rec.reach != null && i > rec.reach) return 'end';
    return rec.skip && rec.skip.includes(i) ? 'skip' : null;
  }
  // the dashed empty slot drawn for a possibly missed word, centred on x with its top at y
  const missGlyph = (x, y) => `<rect class="wr-miss" x="${(x - 7).toFixed(1)}" y="${y}" width="14" height="9" rx="3"/>`;
  const MISS_KEY = '<svg class="wr-key-miss" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true"><rect x="1" y="1" width="12" height="8" rx="3"/></svg>';
  // one line naming the possibly missed words, with how they're found behind a badge
  const MISS_HOW = "With Check words on, your browser's speech recognition writes down what you said, and the app lines that up with the passage. A passage word with nothing in its place is marked possibly missed. A word heard as something else isn't marked, because recognisers often mishear names and unusual words, and the words after the last one heard count as not reached. Recognition can still drop a word you did say, so take it as a hint to check that bit.";
  function missLineHtml(rec) {
    if (rec.missBy === 'speech' && !(rec.miss && rec.miss.length)) return `<p class="small wr-missline">${MISS_KEY}Word check: every word of the passage was heard${rec.reach != null ? ' up to where you stopped' : ''}.${infoHtml('How missed words are found', MISS_HOW)}</p>`;
    if (rec.missBy === 'lost') return `<p class="small muted wr-missline">Word check: the speech recognition heard too little of the passage to compare, so no words are marked.${infoHtml('How missed words are found', MISS_HOW)}</p>`;
    const m = (rec.miss || []).filter(i => rec.byWord && rec.byWord[i]);
    if (!m.length) return '';
    const names = m.slice(0, 6).map(i => `“${escapeHtml(rec.byWord[i][0].replace(/[.,;:!?]+$/, ''))}”`).join(', ') + (m.length > 6 ? ` and ${m.length - 6} more` : '');
    return `<p class="small wr-missline">${MISS_KEY}Possibly missed: ${names}${infoHtml('How missed words are found', MISS_HOW)}</p>`;
  }
  function wordReportHtml(rec, spots, ref) {
    const ws = rec.byWord;
    if (!ws || !ws.some(w => w[1] != null || w[2] != null)) return '';
    const [lo, hi] = target(), [plo, phi] = pitchBand();
    // past the far end of the goal band counts as on target, as on the meter
    const resOff = (r) => r != null && !onTarget(Math.round(r));
    // pitch is off when it is on the far side of the goal band (above the band is fine for a feminine goal)
    const pitchOff = (p) => p != null && (state.goal === 'fem' ? p < plo : p > phi);
    // one slot per word, wide enough for its label
    const xs = [], wd = []; let acc = 6;
    for (const w of ws) { const sw = Math.max(30, w[0].length * 7.4 + 12); xs.push(acc + sw / 2); wd.push(sw); acc += sw; }
    const W = Math.ceil(acc + 6);
    const ps = ws.map(w => w[1]).filter(v => v != null);
    // octave slips can throw a word far off, so the scale follows most words and the rest sit on its edge
    const pmin = Math.max(50, Math.min(plo, D.quantile(ps, 0.05)) - 15), pmax = Math.max(phi, D.quantile(ps, 0.95)) + 15;
    const PT = 22, PH = 84, RT = PT + PH + 30, RH = 70, LT = RT + RH + 28, H = LT + 8;
    const py = (v) => PT + (1 - (clamp(v, pmin, pmax) - pmin) / (pmax - pmin)) * PH, ry = (v) => RT + (1 - clamp(v, 0, 100) / 100) * RH;
    const f1 = (v) => v.toFixed(1);
    let svg = `<rect class="wr-band" x="0" y="${f1(py(phi))}" width="${W}" height="${f1(py(plo) - py(phi))}"/>`
      + `<rect class="wr-band" x="0" y="${f1(ry(hi))}" width="${W}" height="${f1(ry(lo) - ry(hi))}"/>`
      + `<line class="wr-axis" x1="0" x2="${W}" y1="${RT + RH}" y2="${RT + RH}"/>`;
    // phrase highlights, shown when a stretch below is picked
    (spots || []).forEach((ph, k) => { svg += `<rect class="wr-hl" data-ph="${k}" x="${f1(xs[ph.a] - wd[ph.a] / 2)}" y="2" width="${f1(xs[ph.b] + wd[ph.b] / 2 - xs[ph.a] + wd[ph.a] / 2)}" height="${H - 4}" rx="6"/>`; });
    // pitch line, broken where no pitch was heard
    let run = [];
    const flush = () => { if (run.length > 1) svg += `<polyline class="wr-pline" points="${run.join(' ')}"/>`; run = []; };
    ws.forEach((w, i) => { if (w[1] != null && wordGone(rec, i) !== 'miss') run.push(`${f1(xs[i])},${f1(py(w[1]))}`); else flush(); });
    flush();
    // the demo voice's word values, dashed: a pitch line and a level across each word's resonance slot
    if (ref) {
      ref.byWord.forEach((w, i) => { if (w[1] != null) run.push(`${f1(xs[i])},${f1(py(w[1]))}`); else if (run.length > 1) { svg += `<polyline class="tl-ref" points="${run.join(' ')}"/>`; run = []; } else run = []; });
      if (run.length > 1) svg += `<polyline class="tl-ref" points="${run.join(' ')}"/>`;
      run = [];
    }
    ws.forEach(([t, p, r, , rough], i) => {
      const gone = wordGone(rec, i);
      if (gone === 'miss') p = r = null; // whatever the highlight caught there was a neighbouring word
      const tip = gone === 'miss' || gone === 'end' ? `${t}: ${noResWhy(t, p, gone)}` : `${t}: ${p != null ? p + ' Hz' : 'no pitch'}, ${r != null ? 'resonance ' + (rough ? '≈' : '') + Math.round(r) + (rough ? ' (rough)' : '') : 'no resonance reading: ' + noResWhy(t, p, gone)}`;
      svg += `<g class="wr-w" data-i="${i}" tabindex="0" role="button" aria-label="${escapeHtml(tip)}"><title>${escapeHtml(tip)}</title>`
        + `<rect class="wr-hit" x="${f1(xs[i] - wd[i] / 2)}" y="0" width="${f1(wd[i])}" height="${H}"/>`
        + (p != null ? `<circle class="wr-dot${pitchOff(p) ? ' off' : ''}" cx="${f1(xs[i])}" cy="${f1(py(p))}" r="3.5"/>` : '')
        + (r != null ? `<rect class="wr-bar${resOff(r) ? ' off' : ''}${rough ? ' rough' : ''}" x="${f1(xs[i] - 6)}" y="${f1(ry(r))}" width="12" height="${f1(Math.max(3, RT + RH - ry(r)))}" rx="2"/>`
          // possibly missed: a dashed empty slot; not reached: nothing, the word is muted
          : gone === 'miss' ? missGlyph(xs[i], RT + RH + 3) : gone === 'end' ? ''
          // no reading: a hollow, struck-through ring under the axis, never a bar (a very low score is a short filled bar)
          : D.wordVowels(t, PRON).why === 'function' ? '' // "the", "of", "a": never scored, shown as a muted word rather than a miss
          : `<g class="wr-none"><circle cx="${f1(xs[i])}" cy="${RT + RH + 7}" r="4"/><line x1="${f1(xs[i] - 3)}" y1="${RT + RH + 10}" x2="${f1(xs[i] + 3)}" y2="${RT + RH + 4}"/></g>`)
        + (ref && ref.byWord[i] && ref.byWord[i][2] != null ? `<line class="tl-ref" x1="${f1(xs[i] - 10)}" x2="${f1(xs[i] + 10)}" y1="${f1(ry(ref.byWord[i][2]))}" y2="${f1(ry(ref.byWord[i][2]))}"/>` : '')
        + `<text class="wr-word${resOff(r) ? ' off' : ''}${gone === 'miss' ? ' miss' : r == null && (gone === 'end' || D.wordVowels(t, PRON).why === 'function') ? ' fn' : ''}" x="${f1(xs[i])}" y="${LT}" text-anchor="middle">${escapeHtml(t)}</text></g>`;
    });
    svg += `<text class="wr-lane" x="6" y="${PT - 8}">Pitch, goal ${plo}-${phi} Hz</text><text class="wr-lane" x="6" y="${RT - 8}">Resonance, goal ${lo}-${hi}</text>`;
    return `<div class="wr"><div class="section-head"><h4>Word by word${infoHtml('How word by word works', "Once you finish, each word's edges are found again in the recording: its spelling is matched, sound by sound, against what each moment sounds like (vowel, hiss, other sound, quiet), with pauses and stray noise kept apart so they can't take words. It's an estimate, usually within a tenth or two of a second, so a word's numbers can still spill a little into its neighbours. Vowels that hold still for a moment give a word its resonance. A word whose vowels were too short to hold still is read from a few single moments instead; its bar is paler and rough. A crossed circle means no reading. Small linking words (the, of, a, is) are said too quickly to score at all, so they are shown in grey with no mark.${gatesNote(rec.gates)}")}</h4><span class="muted small"><span class="wr-key off"></span>off your goal${ws.some(w => w[4] && w[2] != null) ? ' <span class="wr-key rough"></span>rough' : ''}${rec.miss && rec.miss.length ? ` ${MISS_KEY}possibly missed` : ''}${ws.some((w, i) => w[2] == null && !['miss', 'end'].includes(wordGone(rec, i)) && D.wordVowels(w[0], PRON).why !== 'function') ? ' <svg class="wr-key-none" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4"/><line x1="3" y1="9" x2="9" y2="3"/></svg>no reading' : ''}${ref ? ` <i class="ref-key"></i>${RefRead.who(ref)}` : ''}</span></div>
      <p class="small muted">Top line: pitch of each word (goal ${plo}-${phi} Hz). Bars: resonance of each word (goal ${lo}-${hi}). The shaded bands are your goal.${ref ? ` Dashed: the ${RefRead.who(ref)} on the same words.` : ''}</p>${missLineHtml(rec)}
      <div class="wr-scroll"><svg class="wr-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="Pitch and resonance for each word of the passage">${svg}</svg></div>
      <p class="small" id="wr-read" aria-live="polite">Tap a word for its numbers.</p></div>`;
  }
  // ---- focus spots: the bits of a passage where practice pays off most ----
  // Each spot can be read on its own in the reader, again and again, with a score after every try.
  const focusOpts = (n = 3) => ({ goal: state.goal, res: target(), pitch: pitchBand(), n });
  const wordObjs = (bw) => bw.map(w => ({ p: w[1], r: w[2] }));
  const clipQuote = (texts, sp) => texts.slice(sp.a, sp.b + 1).join(' ').replace(/[.,;:!?]+$/, '');
  const spotId = (textId, sp) => `spot:${textId}:${sp.a}-${sp.b}`;
  const spotsFor = (rec, n) => (rec && rec.byWord ? D.focusSpots(rec.byWord.map(w => w[0]), wordObjs(rec.byWord), focusOpts(n)) : []);
  const overlaps = (x, y) => x.a <= y.b && x.b >= y.a;
  // earlier full readings of the same passage, with the same words, newest last
  const priorReadings = (rec, k = 5) => fullReadings(rec.text).filter(r => r.id !== rec.id && r.at < rec.at && r.byWord && r.byWord.length === rec.byWord.length).slice(-k);
  const timesWeak = (sp, recs) => recs.filter(r => spotsFor(r).some(x => overlaps(x, sp))).length;
  // what is off in a spot, with the goal beside it
  function spotWhat(sp) {
    const [lo, hi] = target(), [plo, phi] = pitchBand(), fem = state.goal === 'fem', out = [];
    if (sp.why !== 'pitch' && sp.r != null) out.push(`resonance score ${Math.round(sp.r)} (goal ${fem ? lo + '+' : 'under ' + hi})`);
    if (sp.why !== 'resonance' && sp.p != null) out.push(`pitch ${Math.round(sp.p)} Hz (goal ${fem ? plo + '+' : 'under ' + phi})`);
    return out.join(', ');
  }
  function spotItems(texts, spots, recs, showBtn) {
    return spots.map((sp, k) => {
      const n = recs.length ? timesWeak(sp, recs) : 0;
      return `<li class="fs-item"><div class="fs-text"><q>${escapeHtml(clipQuote(texts, sp))}</q><span class="small muted">${escapeHtml(spotWhat(sp))}${n ? ` · weak in ${n} of your last ${recs.length} reading${recs.length > 1 ? 's' : ''}` : ''}</span></div>`
        + `<div class="fs-btns">${showBtn ? `<button type="button" class="btn sm ghost wr-jump-btn" data-ph="${k}" data-a="${sp.a}" data-b="${sp.b}">Show</button>` : ''}<button type="button" class="btn sm" data-spot="${k}">Practise</button></div></li>`;
    }).join('');
  }
  function focusHtml(rec, spots) {
    if (!rec.byWord || !rec.byWord.some(w => w[1] != null || w[2] != null)) return '';
    if (!spots.length) return `<div class="fs"><h4>Focus spots</h4><p class="small">Every phrase was on your goal for resonance and pitch. Nothing to single out this time.</p></div>`;
    const texts = rec.byWord.map(w => w[0]);
    return `<div class="fs"><div class="section-head"><h4>Focus spots${infoHtml('What focus spots are', 'The bits of the passage where getting to your goal gains the most: how far each word was from it, added up over the phrase. Practise one on its own, a few times, and see the score after every try.')}</h4><button type="button" class="btn sm primary" data-spot="0">Practise ${spots.length > 1 ? 'all ' + spots.length : 'it'}</button></div>
      <ul class="fs-list">${spotItems(texts, spots, priorReadings(rec), true)}</ul></div>`;
  }
  function wireFocus(box, rec, spots) {
    const texts = rec.byWord ? rec.byWord.map(w => w[0]) : [];
    box.querySelectorAll('[data-spot]').forEach(b => b.addEventListener('click', () => startSpots(rec.text, rec.title, texts, spots, +b.dataset.spot, wordObjs(rec.byWord))));
  }
  // the weak spots of the last few readings of a passage together, for the History panel
  function renderUsualSpots(id) {
    const box = $('rd-usual'); if (!box) return;
    const recs = fullReadings(id).filter(r => r.byWord), last = recs.at(-1);
    const use = last ? recs.filter(r => r.byWord.length === last.byWord.length).slice(-5) : [];
    box.hidden = use.length < 2;
    if (box.hidden) { box.innerHTML = ''; return; }
    const merged = D.mergeWordReports(use.map(r => r.byWord)), texts = merged.map(w => w.text);
    const spots = D.focusSpots(texts, merged, focusOpts());
    box.innerHTML = `<div class="section-head"><h4>Spots that keep coming up</h4>${spots.length ? `<button type="button" class="btn sm" data-spot="0">Practise ${spots.length > 1 ? 'all' : 'it'}</button>` : ''}</div>`
      + (spots.length ? `<p class="small muted">Each word's middle value over your last ${use.length} readings of this passage, so one off day does not count for much.</p><ul class="fs-list">${spotItems(texts, spots, use, false)}</ul>`
        : `<p class="small">Over your last ${use.length} readings every phrase was on your goal.</p>`);
    box.querySelectorAll('[data-spot]').forEach(b => b.addEventListener('click', () => startSpots(id, last.title, texts, spots, +b.dataset.spot, merged)));
  }
  // A practice of one or more spots in the reader: Spot.cur = { textId, title, texts, words (the reading's
  // [{ p, r }] per word), spots, k, tries: [{ st, words }] }
  const Spot = { cur: null };
  function startSpots(textId, title, texts, spots, k, words) {
    if (!spots.length) return;
    cancelRun();
    Reader.show(); Reader.setFull(true);
    if (Texts.all().some(t => t.id === textId)) Reader.pick(textId);
    Spot.cur = { textId, title, texts, words: words || texts.map(() => ({ p: null, r: null })), spots, k: k || 0, tries: [] };
    loadSpot();
  }
  function loadSpot() {
    const S = Spot.cur, sp = S.spots[S.k];
    S.tries = []; S.msg = '';
    $('reader-form').hidden = true; $('reader-text').hidden = false; $('reader').classList.remove('editing');
    Reader.render({ id: S.textId, title: S.title, body: S.texts.slice(sp.a, sp.b + 1).join(' ') });
    $('reader').classList.add('spot');
    tvySetSpot(S, sp);
    beginRun();
    paintSpot();
  }
  function endSpots() {
    if (!Spot.cur) return;
    Spot.cur = null; TvY.spot.el = null; TvY.spot.cfg = null;
    $('reader').classList.remove('spot');
    $('reader-spot').hidden = true;
    if (Run.on) cancelRun();
  }
  function finishSpot() {
    const S = Spot.cur, sp = S.spots[S.k];
    const wr = D.wordReport(Run.frames, Reader.words.length), st = D.spotStats(sp, wr);
    tvyFreeze(TvY.spot);
    endRun(); session = newSession(); resetSessionViews();
    if (st.r == null && st.p == null) { S.msg = 'Not enough voice was heard to score that try. Read it again a little louder.'; paintSpot(); return; }
    S.tries.push({ st, words: wr });
    const pitchSpot = sp.why === 'pitch', score = pitchSpot ? st.p : st.r;
    if (score != null) recordPractice({ id: spotId(S.textId, sp), label: `“${clipQuote(S.texts, sp)}”`, kind: pitchSpot ? 'spotpitch' : 'spot', score: Math.round(score * 10) / 10 });
    S.msg = '';
    paintSpot();
  }
  // how a word is off, in plain words: resonance dark or bright, pitch low or high
  function offWord(w, why) {
    const fem = state.goal === 'fem', f = D.wordShortfall(w, focusOpts()), out = [];
    if (why !== 'pitch' && f.r > 0) out.push(`${fem ? 'dark' : 'bright'} (${Math.round(w.r)})`);
    if (why !== 'resonance' && f.p > 0) out.push(`${fem ? 'low' : 'high'} (${Math.round(w.p)} Hz)`);
    return out.join(' and ');
  }
  // the verdict after a try: overall, then which words moved, then what is left
  function spotVerdict(c, sp, texts) {
    const n = c.gaps.length - 1, last = c.gaps[n], first = c.gaps[0], q = (w, i) => `“${escapeHtml(texts[sp.a + i].replace(/[.,;:!?"]+$/g, '').replace(/^["“]/, ''))}”`;
    const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs.at(-1));
    let head;
    if (last == null) head = 'This try had no numbers for the words that were off. Read it again a little louder.';
    else if (last === 0) head = n > 1 && c.gaps.slice(1, -1).every(g => g === 0) ? 'On your goal again. That is how it sticks.' : 'All on your goal this time.';
    else if (first == null) head = 'Scored. There were no numbers for these words in the reading, so compare your tries with each other.';
    else if (last < first * 0.85) head = `Closer than in the reading${c.best === n - 1 && n > 1 ? ', and your closest try yet' : c.best !== n - 1 ? `, though try ${c.best + 1} was closer` : ''}.`;
    else if (last > first * 1.15) head = 'Further from your goal than in the reading. Tap Hear it read, then try again slowly.';
    else head = 'About the same as in the reading.';
    const reached = [], moved = [];
    c.words.forEach((w, i) => {
      if (w.state === 'reached') reached.push(q(w, i));
      else if (w.state === 'better') moved.push(`${q(w, i)} moved closer but is still ${offWord(w.last, sp.why)}`);
      else if (w.state === 'worse') moved.push(`${q(w, i)} moved away and is ${offWord(w.last, sp.why)}`);
      else if (w.gap1 > 0) moved.push(`${q(w, i)} is still ${offWord(w.last, sp.why)}`);
    });
    const parts = [head];
    if (reached.length) parts.push(`${list(reached)} reached your goal.`);
    if (moved.length) parts.push(moved.join('; ') + '.');
    return parts.join(' ');
  }
  // bars for the reading and each try: how far from the goal, shorter is better
  function spotBars(c) {
    const W = 28, G = 8, H = 56, T = 4, n = c.gaps.length, max = Math.max(5, ...c.gaps.filter(g => g != null));
    let svg = '';
    c.gaps.forEach((g, i) => {
      const x = i * (W + G), lab = i ? String(i) : 'R';
      const h = g == null ? 0 : Math.max(2, g / max * (H - T));
      const cls = i === 0 ? 'rd' : g === 0 ? 'ok' : g != null && c.gaps[0] != null && g < c.gaps[0] * 0.85 ? 'up' : g != null && c.gaps[0] != null && g > c.gaps[0] * 1.15 ? 'down' : '';
      svg += g === 0 ? `<text class="rs-check" x="${x + W / 2}" y="${H - 4}" text-anchor="middle">✓</text>` : `<rect class="rs-bar ${cls}" x="${x}" y="${(H - h).toFixed(1)}" width="${W}" height="${h.toFixed(1)}" rx="3"><title>${i ? 'Try ' + i : 'In the reading'}: ${g == null ? 'no number' : Math.round(g) + ' points from your goal'}</title></rect>`;
      svg += `<text class="rs-blab" x="${x + W / 2}" y="${H + 13}" text-anchor="middle">${lab}</text>`;
    });
    const w = n * (W + G) - G;
    return `<svg class="rs-bars" width="${w}" height="${H + 16}" viewBox="0 0 ${w} ${H + 16}" role="img" aria-label="Distance from your goal in the reading and each try"><line class="rs-base" x1="0" x2="${w}" y1="${H}" y2="${H}"/>${svg}</svg>`;
  }
  function paintSpot() {
    const S = Spot.cur, box = $('reader-spot'); if (!S) return;
    const sp = S.spots[S.k], why = sp.why, before = S.words.slice(sp.a, sp.b + 1);
    const c = D.compareTries(before, S.tries.map(t => t.words), why, focusOpts());
    const fmt = (w) => (w ? [why !== 'pitch' ? (w.r != null ? Math.round(w.r) : '–') : null, why !== 'resonance' ? (w.p > 0 ? Math.round(w.p) + ' Hz' : '–') : null].filter(v => v != null).join(' · ') : '–');
    const ARROW = { reached: '✓', better: '↑', worse: '↓', same: '=', on: '✓', none: '' };
    const chips = c.words.map((w, i) => `<li class="rs-w ${w.state}${w.gap1 > 0 ? ' off' : ''}"><b>${escapeHtml(S.texts[sp.a + i])}</b><span>${fmt(w.before)}${S.tries.length ? ` → ${fmt(w.last)} <i aria-hidden="true">${ARROW[w.state]}</i>` : ''}</span></li>`).join('');
    const showMsg = S.msg || (Run.on ? (S.tries.length ? `Try ${S.tries.length + 1}: read the line, then pause.` : 'Read the line aloud. It scores itself when you reach the end and pause, or press Finish.') : '');
    box.hidden = false;
    box.innerHTML = `<div class="rs-head"><b>Focus spot${S.spots.length > 1 ? ` ${S.k + 1} of ${S.spots.length}` : ''}</b><span class="muted small">${escapeHtml(spotWhat(sp))}</span></div>
      <div class="rs-body">${S.tries.length ? `<figure class="rs-fig">${spotBars(c)}<figcaption class="small muted">Distance from your goal: R is the reading, then each try. Shorter is better.</figcaption></figure>` : ''}
      <div class="rs-cmp"><p class="small muted rs-cap">${S.tries.length ? `Each word: in the reading → try ${S.tries.length}` : 'Each word in the reading'} (${why === 'pitch' ? 'pitch' : why === 'resonance' ? 'resonance' : 'resonance · pitch'})</p><ul class="rs-words">${chips}</ul></div></div>
      ${S.tries.length && !Run.on && !S.msg ? `<p class="rs-verdict">${spotVerdict(c, sp, S.texts)}</p>` : ''}
      <p class="small rs-msg">${escapeHtml(showMsg)}</p>
      <figure class="tvy" id="rs-tvy"></figure>
      <div class="btn-row">${Run.on ? '' : '<button type="button" class="btn sm primary" id="rs-again">Again</button>'}${S.spots.length > 1 ? `<button type="button" class="btn sm" id="rs-next">${S.k + 1 < S.spots.length ? 'Next spot' : 'First spot'}</button>` : ''}<button type="button" class="btn sm ghost" id="rs-done">Done</button></div>`;
    tvyAttach(TvY.spot, $('rs-tvy'));
    const again = $('rs-again'); if (again) again.onclick = () => { S.msg = ''; beginRun(); paintSpot(); };
    const next = $('rs-next'); if (next) next.onclick = () => { cancelRun(); S.k = (S.k + 1) % S.spots.length; loadSpot(); };
    $('rs-done').onclick = () => { $('reader-close').click(); };
  }
  function wireWordReport(box, rec, ref) {
    const svg = box.querySelector('.wr-svg'); if (!svg) return;
    const scroll = box.querySelector('.wr-scroll'), read = box.querySelector('#wr-read');
    const pick = (g) => {
      svg.querySelectorAll('.wr-w.sel').forEach(x => x.classList.remove('sel'));
      g.classList.add('sel');
      read.innerHTML = wordReadout(rec, +g.dataset.i, ref);
      // with the recording on hand, the word can be heard from the timeline
      if (box.cue && box.cue.canPlay(+g.dataset.i)) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost wr-play'; b.textContent = '▶ Hear this word';
        b.onclick = () => box.cue.word(+g.dataset.i); read.append(' ', b);
      }
    };
    svg.querySelectorAll('.wr-w').forEach(g => {
      g.addEventListener('click', () => pick(g));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g); } });
    });
    box.querySelectorAll('.wr-jump, .wr-jump-btn').forEach(b => b.addEventListener('click', () => {
      if (box.tlJump && b.dataset.a != null) return box.tlJump(+b.dataset.a);
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
      const dv = document.createElement('button'); dv.type = 'button'; dv.className = 'btn sm ghost'; dv.textContent = 'Reference';
      dv.title = `Hear the ${RefRead.whoFor(t)} read it, and see what the app measures`;
      dv.addEventListener('click', () => showRefResult(t));
      li.querySelector('.rd-actions').appendChild(dv);
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
    renderUsualSpots(id);
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
        Data.remove('readings', r.id); Replay.forget(r.id); renderReadings(); renderHome();
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
    // the two averages, dashed
    g.setLineDash([4 * dpr, 4 * dpr]);
    for (const [k, col] of [['masc', C.masc], ['fem', C.fem]]) { g.strokeStyle = col; g.beginPath(); g.moveTo(pad.l, y(D.RES_AVG[k])); g.lineTo(w - pad.r, y(D.RES_AVG[k])); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = C.line;
    g.textAlign = 'center';
    const every = Math.max(1, Math.ceil(n / 8));
    items.forEach((r, i) => { if (i % every === 0 || i === n - 1) g.fillText(new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), x(i), h - 8 * dpr); });
    const series = (key, color) => {
      const pts = items.map((r, i) => [i, r[key]]).filter(p => p[1] != null);
      if (!pts.length) return;
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2 * dpr;
      g.beginPath(); pts.forEach(([i, v], j) => (j ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)))); g.stroke();
      // hollow: converted from the old scale, which stopped at the averages, so the real value may have been further out
      pts.forEach(([i, v], j) => { g.beginPath(); g.arc(x(i), y(v), (j === pts.length - 1 ? 5 : 3) * dpr, 0, 7); if (items[i].rsFrom) { g.fillStyle = C.panel; g.fill(); g.stroke(); g.fillStyle = color; } else g.fill(); });
    };
    const old = $('rd-hist-old'); if (old) old.hidden = !items.some(r => r.rsFrom);
    series('resonance', C.accent);
    series('sibS', C.warn);
  }

  // ---------------- backing tracks ----------------
  // A karaoke or instrumental track for Sing along: a YouTube video in YouTube's own embedded player, or a file
  // from the user's device. Saved per song in IndexedDB (files can be megabytes, too big for localStorage):
  // key = the song's key in Your songs, value = { kind: 'yt', id, start, offset } or { kind: 'file', name, blob, offset }.
  const Backing = {
    dbp: null,
    open() {
      if (!this.dbp) this.dbp = new Promise((res) => {
        try { const r = indexedDB.open('vt-sing', 1); r.onupgradeneeded = () => r.result.createObjectStore('backing'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); }
        catch (e) { res(null); }
      });
      return this.dbp;
    },
    async op(mode, fn) {
      const db = await this.open(); if (!db) return null;
      return new Promise((res) => {
        try {
          const tx = db.transaction('backing', mode), rq = fn(tx.objectStore('backing'));
          tx.oncomplete = () => res(rq ? rq.result : true); tx.onerror = tx.onabort = () => res(null);
        } catch (e) { res(null); }
      });
    },
    get(k) { return this.op('readonly', st => st.get(k)); },
    put(k, v) { return this.op('readwrite', st => st.put(v, k)); },
    del(k) { return this.op('readwrite', st => st.delete(k)); },
    keys() { return this.op('readonly', st => st.getAllKeys()); },
  };
  // YouTube's IFrame Player API, loaded the first time a video is used.
  let ytApi = null;
  function loadYouTube() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!ytApi) ytApi = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch (e) {} res(window.YT); };
      const sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api'; sc.async = true;
      sc.onerror = () => { ytApi = null; rej(new Error('blocked')); };
      document.head.appendChild(sc);
      setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytApi = null; rej(new Error('timeout')); } }, 15000);
    });
    return ytApi;
  }
  // A YouTube player that looks like an <audio> element to Sing: currentTime, duration, play(), pause().
  // getCurrentTime() moves in coarse steps, so between steps the time runs on from the last one while playing.
  class YtTrack {
    constructor(id, start, box, on) {
      Object.assign(this, { id, start: start || 0, box, on, p: null, t: start || 0, at: 0, playing: false, dead: false });
      const el = document.createElement('div'); box.appendChild(el);
      this.ready = loadYouTube().then(YT => new Promise((res, rej) => {
        if (this.dead) return rej(new Error('gone'));
        this.p = new YT.Player(el, {
          videoId: id, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, start: Math.floor(this.start) },
          events: {
            onReady: () => res(this),
            onStateChange: (e) => this.state(e.data),
            onError: (e) => { this.on.error(e.data); rej(new Error('player ' + e.data)); },
          },
        });
      }));
      this.ready.catch(() => {});
    }
    state(s) { // 1 playing, 2 paused, 0 ended, 3 buffering
      this.sync(); this.playing = s === 1;
      if (s === 0) this.on.ended();
      if (this.on.state) this.on.state(s);
    }
    sync() { if (this.p && this.p.getCurrentTime) { this.t = this.p.getCurrentTime() || 0; this.at = performance.now(); } }
    get currentTime() {
      if (!this.p || !this.p.getCurrentTime) return this.t;
      const t = this.p.getCurrentTime() || 0, now = performance.now();
      if (t !== this.t) { this.t = t; this.at = now; return t; }
      return this.playing ? t + Math.min(1, (now - this.at) / 1000) : t;
    }
    set currentTime(v) { this.t = v; this.at = performance.now(); if (this.p && this.p.seekTo) this.p.seekTo(v, true); }
    get duration() { const d = this.p && this.p.getDuration ? this.p.getDuration() : 0; return d > 0 ? d : NaN; }
    play() { if (this.p && this.p.playVideo) this.p.playVideo(); return Promise.resolve(); }
    pause() { if (this.p && this.p.pauseVideo) this.p.pauseVideo(); }
    destroy() { this.dead = true; try { if (this.p && this.p.destroy) this.p.destroy(); } catch (e) {} this.box.innerHTML = ''; }
  }
  const YT_ERRORS = { 2: "That doesn't look like a valid video link.", 5: "YouTube's player couldn't play this video here.", 100: 'That video was removed or is private.', 101: "The video's owner only lets it play on YouTube itself.", 150: "The video's owner only lets it play on YouTube itself." };

  // ---------------- sing along ----------------
  // The music plays somewhere else (headphones) or from a backing track played here; the microphone is
  // analysed exactly as everywhere else and each frame is filed under the lyric line being sung.
  // Nothing is saved; the summary at the end is for this song only.
  const SING_SAVED_KEY = 'vt.sing.saved'; // lyrics loaded from a search, kept for reuse (see D.lyricsCachePut)
  const SING_KEY = 'vt.sing.lyrics', SING_SONG_KEY = 'vt.sing.song', SING_FOLLOW_KEY = 'vt.sing.follow', SING_SORT_KEY = 'vt.sing.sort', SING_VIEW_MS = 8000, SING_HZ = [70, 560], SING_HZ_HIGH = 1200; // the trace widens to SING_HZ_HIGH while high notes are on it
  const Sing = {
    on: false, paused: false, lyr: { timed: false, lines: [] }, cur: -1, frames: [], trace: [],
    audio: null, url: null, trackName: '', rec: null, recKey: null, backKeys: new Set(), started: false, base: 0, at: 0, offset: 0, t0: 0,
    lastResAt: -1e9, cols: null, empty: false, fol: null,
    init() {
      this.ready = true;
      let text = '', meta = null;
      try { text = localStorage.getItem(SING_KEY) || ''; meta = JSON.parse(localStorage.getItem(SING_SONG_KEY) || 'null'); } catch (e) {}
      $('sg-lyrics').addEventListener('input', () => this.edited());
      ['sg-title', 'sg-artist'].forEach(id => $(id).addEventListener('input', (e) => this.metaEdited(e)));
      $('sg-new').addEventListener('click', () => this.newSong());
      $('sg-song-close').addEventListener('click', () => this.closeSong());
      $('sg-song-save').addEventListener('click', () => this.saveOwn(false));
      $('sg-find').addEventListener('submit', (e) => { e.preventDefault(); this.search(); });
      $('sg-q').addEventListener('input', () => { this.syncWeb(); this.karaokeLink(); delete $('sg-saved-msg').dataset.keep; this.renderSaved(); });
      $('sg-saved-list').addEventListener('click', (e) => {
        const x = e.target.closest('button[data-x]'); if (x) { this.forget(+x.dataset.x); return; }
        const b = e.target.closest('button[data-s]'); if (b) this.useSaved(+b.dataset.s);
      });
      $('sg-saved-clear').addEventListener('click', () => this.forgetAll());
      let sort = 'used'; try { sort = localStorage.getItem(SING_SORT_KEY) || 'used'; } catch (e) {}
      $('sg-sort').value = D.LYRICS_SORTS.includes(sort) ? sort : 'used';
      $('sg-sort').addEventListener('change', (e) => {
        try { if (e.target.value === 'used') localStorage.removeItem(SING_SORT_KEY); else localStorage.setItem(SING_SORT_KEY, e.target.value); } catch (err) {}
        this.renderSaved();
      });
      $('sg-results').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-k]'); if (b) this.pick(+b.dataset.k);
      });
      $('sg-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) this.useFile(f); e.target.value = ''; });
      $('sg-yt-form').addEventListener('submit', (e) => { e.preventDefault(); this.useYouTube($('sg-yt-url').value); });
      $('sg-track-clear').addEventListener('click', () => this.removeTrack());
      $('sg-start').addEventListener('click', () => this.start());
      $('sg-tap').addEventListener('click', () => this.tap());
      $('sg-prev').addEventListener('click', () => this.back());
      let pref = false; try { pref = localStorage.getItem(SING_FOLLOW_KEY) === '1'; } catch (e) {}
      $('sg-follow').checked = pref;
      $('sg-follow').addEventListener('change', (e) => this.setFollowPref(e.target.checked));
      $('sg-follow-btn').addEventListener('click', () => { const on = !this.fol; this.setFollowPref(on); this.followLive(on); });
      $('sg-back').addEventListener('click', () => this.nudge(-0.5));
      $('sg-fwd').addEventListener('click', () => this.nudge(0.5));
      $('sg-pause').addEventListener('click', () => this.pause(!this.paused));
      $('sg-finish').addEventListener('click', () => this.finish());
      $('sg-lines').addEventListener('click', (e) => { // tap a line to jump there
        const li = e.target.closest('li[data-i]'); if (!li || !this.on) return;
        const i = +li.dataset.i;
        if (this.lyr.timed) this.setClock(this.lyr.lines[i].t + 0.02);
        this.setLine(i);
      });
      document.addEventListener('keydown', (e) => {
        if (mode !== 'sing' || !this.on || e.target.closest('input, textarea, button, select, a')) return;
        if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); this.tap(); }
        else if (e.key === 'Backspace') { e.preventDefault(); this.back(); }
      });
      this.restoreSong(text, meta);
      Backing.keys().then(async keys => { // drop song files of songs no longer in Your songs
        if (!keys) return;
        const have = new Set(this.savedList().map(r => r.key));
        for (const k of keys) {
          if (!have.has(k)) { Backing.del(k); continue; }
          const rec = await Backing.get(k);
          if (rec && rec.kind === 'yt') { // video links used to be kept here; they live in the song's entry in Your songs now
            const e = this.savedEntry(k);
            if (e && !e.video) this.storeSaved(D.lyricsCacheVideo(this.savedList(), k, rec));
            Backing.del(k);
          } else if (rec) this.backKeys.add(k);
        }
        this.renderSaved();
      });
    },
    // Lyrics search: LRCLIB first (timed lyrics), lyrics.ovh as the backup when LRCLIB is busy or finds nothing.
    // Only the typed query leaves the device; manual paste and a web search link always work.
    found: [], seq: 0, ctl: null,
    io(signal) {
      return { fetch: (u, o) => fetch(u, o), signal, online: navigator.onLine };
    },
    srcName(k) { return (D.LYRICS_SOURCES[k] || {}).name || k; },
    // One short phrase per failed source: "LRCLIB is busy (503)", "lyrics.ovh didn't answer in time".
    triedText(t) {
      const n = this.srcName(t.src);
      return t.outcome === 'busy' ? `${n} is busy${t.status ? ` (${t.status})` : ''}`
        : t.outcome === 'timeout' ? `${n} didn't answer in time`
        : t.outcome === 'empty' || t.outcome === 'notfound' ? `${n} found nothing`
        : t.outcome === 'error' ? `${n} answered with an error${t.status ? ` (${t.status})` : ''}`
        : `${n} couldn't be reached`;
    },
    webLink(q, lower) {
      const u = D.lyricsWebUrl(q);
      return u ? ` <a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${lower ? 's' : 'S'}earch the web for these lyrics</a> and paste them below.` : '';
    },
    syncWeb() {
      const u = D.lyricsWebUrl($('sg-q').value), a = $('sg-web');
      a.hidden = !u; if (u) a.href = u;
    },
    async search() {
      const q = $('sg-q').value, msg = $('sg-find-msg'), list = $('sg-results'), go = $('sg-find-go');
      if (!D.lyricsSearchUrl(q)) { msg.textContent = 'Type an artist and a song title first.'; $('sg-q').focus(); return; }
      if (this.ctl) this.ctl.abort();
      const seq = ++this.seq, ctl = this.ctl = new AbortController();
      msg.textContent = 'Searching LRCLIB…'; go.disabled = true; list.hidden = true; list.innerHTML = '';
      const io = this.io(ctl.signal);
      io.onStep = (k) => { if (seq === this.seq && k === 'ovh') msg.textContent = 'No luck with LRCLIB, trying lyrics.ovh…'; };
      const res = await D.findLyrics(q, io);
      if (seq !== this.seq || res.aborted) return; // a newer search replaced this one
      go.disabled = false; this.ctl = null;
      const rows = this.found = res.rows, lrc = res.tried[0];
      if (!rows.length) {
        const failed = res.tried.filter(t => t.outcome !== 'empty' && t.outcome !== 'notfound');
        let head;
        if (navigator.onLine === false) head = 'You seem to be offline.';
        else if (!failed.length) head = `No lyrics found for "${q.trim()}". Try the artist and title spelled another way.`;
        else head = `Couldn't get lyrics right now: ${res.tried.map(t => this.triedText(t)).join(', and ')}. These free services are sometimes overloaded; try again in a minute.`;
        const mine = D.lyricsCacheFind(this.savedList(), q).length;
        if (mine) head += mine === 1 ? ' One of Your songs matches; it is listed below.' : ` ${mine} of Your songs match; they are listed below.`;
        msg.innerHTML = escapeHtml(head) + this.webLink(q);
        return;
      }
      const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      let lead = `${rows.length} result${rows.length > 1 ? 's' : ''} from ${this.srcName(res.source)}. Pick one to load its lyrics`;
      if (res.source === 'lrclib') lead += rows.some(r => r.timed) ? '; timed ones scroll by themselves.' : '.';
      else lead = `${this.triedText(lrc)}, so these come from ${this.srcName(res.source)} instead. Its lyrics are plain (not timed). ` + lead + '.';
      msg.textContent = lead;
      list.innerHTML = rows.map((r, k) => `<li><button type="button" data-k="${k}"><span class="t">${escapeHtml(r.title)}</span>`
        + `<span class="a">${escapeHtml([r.artist, r.album, r.duration ? mmss(r.duration) : '', this.srcName(r.src)].filter(Boolean).join(' · '))}</span>`
        + `<span class="k${r.timed ? ' timed' : ''}">${r.timed ? 'Timed' : 'Plain'}</span></button></li>`).join('');
      list.hidden = false;
    },
    async pick(k) {
      const r = this.found[k]; if (!r) return;
      const msg = $('sg-find-msg'), list = $('sg-results');
      if (!r.text) { const have = D.lyricsCacheGet(this.savedList(), r); if (have) r.text = have.text; }
      if (!r.text) {
        if (this.ctl) this.ctl.abort();
        const seq = ++this.seq, ctl = this.ctl = new AbortController();
        msg.textContent = `Getting the lyrics for ${r.title} from ${this.srcName(r.src)}…`;
        list.querySelectorAll('button').forEach(b => { b.disabled = true; });
        const got = await D.loadLyricsText(r, this.io(ctl.signal));
        if (seq !== this.seq || got.outcome === 'aborted') return;
        this.ctl = null;
        list.querySelectorAll('button').forEach(b => { b.disabled = false; });
        if (!got.text) {
          const why = got.outcome === 'notfound' ? `${this.srcName(r.src)} has no lyrics for ${r.title}. Pick another result, or`
            : `${this.triedText({ src: r.src, outcome: got.outcome, status: got.status })}. Try again in a minute, pick another result, or`;
          msg.innerHTML = escapeHtml(why) + this.webLink(`${r.artist} ${r.title}`, true);
          return;
        }
        r.text = got.text;
      }
      this.apply(r, `Loaded ${r.timed ? 'timed' : 'plain'} lyrics for ${r.title}${r.artist ? ' by ' + r.artist : ''} from ${this.srcName(r.src)}, and added them to your songs.`,
        ' <button type="button" class="btn sm sg-find-msg-btn" id="sg-more">Other results</button>');
      this.remember(r);
      $('sg-more').addEventListener('click', () => { $('sg-results').hidden = false; $('sg-more').remove(); });
    },
    // Your songs: every song loaded from a search or saved as your own (newest first, capped in dsp.js), listed under
    // the search box and filtered by what is typed there. They are part of the saved data, so once Google Drive is
    // connected they follow you to every device (lyrics and video links only; song files stay in this browser).
    shown: [],
    savedList() { return D.lyricsCacheClean(Data.d.songs); },
    storeSaved(list) {
      const next = D.songsStamp(Data.d.songs, D.lyricsCacheCap(list), Data.d.songsGone);
      Data.d.songs = next.songs; Data.d.songsGone = next.songsGone;
      Data.persist();
      return next.songs;
    },
    savedEntry(key) { return key ? this.savedList().find(r => r.key === key) || null : null; },
    remember(r) { if (r && r.text) this.storeSaved(D.lyricsCachePut(this.savedList(), r)); this.renderSaved(); },
    renderSaved() {
      const all = this.savedList(), q = $('sg-q').value, by = $('sg-sort').value;
      const shown = this.shown = D.lyricsCacheSort(D.lyricsCacheFind(all, q), by), now = Date.now();
      const list = $('sg-saved-list'), msg = $('sg-saved-msg'), cur = this.song && this.song.key;
      $('sg-saved-clear').hidden = !all.length;
      $('sg-sort-wrap').hidden = all.length < 2;
      $('sg-saved-n').textContent = !all.length ? '' : shown.length === all.length ? `(${all.length})` : `(${shown.length} of ${all.length} match your search)`;
      list.innerHTML = shown.map((r, k) => {
        const on = !!cur && r.key === cur;
        return `<li><button type="button" data-s="${k}"${on ? ' class="on" aria-current="true"' : ''}><span class="t">${escapeHtml(r.title)}</span>`
          + `<span class="a">${escapeHtml([r.artist, r.src === 'mine' ? 'your lyrics' : this.srcName(r.src), r.video ? 'video attached' : this.backKeys.has(r.key) ? 'song file' : '', on ? 'loaded now' : r.at ? ('used ' + D.usedAgo(r.at, now)).replace(/ /g, '\u00a0') : ''].filter(Boolean).join(' · '))}</span>`
          + `<span class="k${r.timed ? ' timed' : ''}">${r.timed ? 'Timed' : 'Plain'}</span></button>`
          + `<button type="button" class="sg-x" data-x="${k}" title="Remove from your songs" aria-label="Remove ${escapeHtml(r.title)}${r.artist ? ' by ' + escapeHtml(r.artist) : ''} from your songs">×</button></li>`;
      }).join('');
      list.hidden = !shown.length;
      if (msg.dataset.keep) return;
      msg.textContent = !all.length ? 'No songs yet. Search for a song, or tap New song to type or paste your own. ' + (Data.where === 'drive' ? 'Songs are saved in your Google Drive, so you can pick them again with one tap on any device.' : 'Songs are kept here on this device, so you can pick them again with one tap.')
        : !shown.length ? 'None of your songs match the search box; search to find more.'
        : 'Tap a song to load its lyrics; × removes it.';
    },
    savedNote(text, undo) {
      const msg = $('sg-saved-msg');
      msg.dataset.keep = '1';
      msg.innerHTML = escapeHtml(text) + (undo ? ' <button type="button" class="btn sm sg-find-msg-btn" id="sg-saved-undo">Undo</button>' : '');
      if (undo) $('sg-saved-undo').addEventListener('click', () => { delete msg.dataset.keep; msg.textContent = ''; undo(); });
    },
    useSaved(k) {
      const r = this.shown[k]; if (!r) return;
      delete $('sg-saved-msg').dataset.keep;
      this.apply(r, `Loaded ${r.timed ? 'timed' : 'plain'} lyrics for ${r.title}${r.artist ? ' by ' + r.artist : ''} from your songs.`);
      this.remember(r); // marks it used now (the top of the list when sorted by last use)
    },
    forget(k) {
      const r = this.shown[k]; if (!r) return;
      const before = this.savedList();
      this.storeSaved(D.lyricsCacheDrop(before, r.key));
      delete $('sg-saved-msg').dataset.keep;
      this.unlink([r]);
      this.renderSaved();
      this.savedNote(`Removed ${r.title} from your songs.`, () => { this.storeSaved(before); this.relink([r]); this.renderSaved(); });
      const next = $('sg-saved-list').querySelector(`button[data-x="${Math.min(k, this.shown.length - 1)}"]`);
      (next || $('sg-q')).focus();
    },
    forgetAll() {
      const before = this.savedList(); if (!before.length) return;
      this.storeSaved([]);
      this.unlink(before);
      this.renderSaved();
      this.savedNote(`Deleted ${before.length} saved song${before.length > 1 ? 's' : ''} from your songs.`, () => { this.storeSaved(before); this.relink(before); this.renderSaved(); });
      $('sg-saved-undo').focus();
    },
    // Put lyrics into the box, with Undo when that replaces something, and an extra button or two after the note.
    apply(r, note, extra = '') {
      const msg = $('sg-find-msg'), prev = this.snap();
      this.song = this.songFrom(r); this.show(r.text);
      $('sg-results').hidden = true;
      $('sg-song-h').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // the lyrics open at the bottom, under Your songs
      if (r.timed && this.audio && Number.isFinite(this.audio.duration) && r.duration && Math.abs(this.audio.duration - r.duration) > 4)
        note += ` The attached ${this.rec && this.rec.kind === 'yt' ? 'video' : 'song file'} is ${Math.round(Math.abs(this.audio.duration - r.duration))} s ${this.audio.duration > r.duration ? 'longer' : 'shorter'}, so this may be another version; nudge the timing while singing if lines drift.`;
      msg.innerHTML = escapeHtml(note) + (prev.text.trim() && prev.text !== r.text ? ' <button type="button" class="btn sm sg-find-msg-btn" id="sg-undo">Undo</button>' : '') + extra;
      const undo = $('sg-undo');
      if (undo) undo.addEventListener('click', () => { this.restore(prev); msg.textContent = 'Your earlier lyrics are back.'; if (this.found.length) $('sg-results').hidden = false; });
    },
    // The song on screen: null until one is picked from Your songs or a search, or New song is tapped.
    // { mine, key, src, title, artist, album, duration, timed, dirty }: mine = typed or pasted here (needs a
    // name and an artist), key = its entry in Your songs (null while not saved), dirty = changed since saved,
    // video = a video attached while the song isn't in Your songs yet (it moves into the song's entry when saved).
    song: null,
    songFrom(r) {
      return { mine: r.src === 'mine', key: D.lyricsKey(r), src: String(r.src || ''), title: String(r.title || ''), artist: String(r.artist || ''),
        album: String(r.album || ''), duration: Number.isFinite(+r.duration) && +r.duration > 0 ? +r.duration : null, timed: !!r.timed, dirty: false, video: null };
    },
    blankSong() { return { mine: true, key: null, src: 'mine', title: '', artist: '', album: '', duration: null, timed: false, dirty: true, video: null }; },
    // After a reload: the song that was open, else lyrics left in the box from before songs had names.
    restoreSong(text, meta) {
      if (meta && typeof meta === 'object' && (meta.mine || String(meta.title || '').trim())) {
        this.song = { ...this.songFrom(meta), mine: !!meta.mine, key: typeof meta.key === 'string' ? meta.key : null, dirty: !!meta.dirty, video: D.videoClean(meta.video) };
      } else if (text.trim()) {
        const had = this.savedList().find(r => r.text === text);
        this.song = had ? this.songFrom(had) : this.blankSong();
      }
      this.show(text);
    },
    snap() { return { song: this.song && { ...this.song }, text: $('sg-lyrics').value }; },
    restore(snap) { this.song = snap.song && { ...snap.song }; this.show(snap.text); },
    // Put the current song (or none) on screen; text replaces the lyrics when given.
    show(text) {
      const s = this.song, ta = $('sg-lyrics');
      if (text !== undefined || !s) ta.value = s ? text : '';
      $('sg-song').hidden = !s;
      $('sg-new').setAttribute('aria-expanded', String(!!s));
      if (s) {
        $('sg-song-meta').hidden = !s.mine; $('sg-song-save').hidden = !s.mine;
        $('sg-title').value = s.mine ? s.title : ''; $('sg-artist').value = s.mine ? s.artist : '';
        $('sg-title').removeAttribute('aria-invalid'); $('sg-artist').removeAttribute('aria-invalid');
        $('sg-song-h').textContent = !s.mine ? s.title : s.key ? 'Your song' : 'New song';
        $('sg-song-by').textContent = s.mine ? '' : [s.artist ? 'by ' + s.artist : '', s.album].filter(Boolean).join(' · ');
      }
      this.ownNote();
      this.storeSong(); this.parse(); this.renderSaved(); this.karaokeLink();
      this.syncTrack();
    },
    storeSong() {
      try {
        if (this.song) { localStorage.setItem(SING_SONG_KEY, JSON.stringify(this.song)); localStorage.setItem(SING_KEY, $('sg-lyrics').value); }
        else { localStorage.removeItem(SING_SONG_KEY); localStorage.removeItem(SING_KEY); }
      } catch (e) {}
    },
    ownNote(text) {
      const s = this.song, msg = $('sg-song-msg');
      msg.textContent = !s || !s.mine ? '' : text || (!s.dirty ? 'Saved in Your songs.'
        : s.key ? 'Changes not saved yet. Save them, or start singing, to keep them in Your songs.'
        : D.ownSongMissing(s).length ? 'Give it a song name and an artist, then type or paste the lyrics. Save keeps it in Your songs; starting to sing saves it too.'
        : 'Not in Your songs yet. Save keeps it there; starting to sing saves it too.');
    },
    edited() {
      if (this.song && this.song.mine) { this.song.dirty = true; this.ownNote(); }
      this.storeSong(); this.parse();
    },
    metaEdited(e) {
      const s = this.song; if (!s || !s.mine) return;
      s.title = $('sg-title').value; s.artist = $('sg-artist').value;
      e.target.removeAttribute('aria-invalid');
      s.dirty = true; this.ownNote();
      this.storeSong(); this.karaokeLink();
    },
    newSong() {
      const s = this.song;
      if (s && s.mine && !s.key) { // a new song is already open: go to what it still needs
        const miss = D.ownSongMissing(s);
        $(miss[0] === 'title' ? 'sg-title' : miss[0] ? 'sg-artist' : 'sg-lyrics').focus();
        return;
      }
      const prev = this.snap(), msg = $('sg-find-msg');
      this.song = this.blankSong(); this.show('');
      $('sg-results').hidden = true;
      if (prev.song && prev.text.trim()) {
        msg.innerHTML = escapeHtml(`Started a new song in place of ${prev.song.title || 'the one you had open'}.`) + ' <button type="button" class="btn sm sg-find-msg-btn" id="sg-undo">Undo</button>';
        $('sg-undo').addEventListener('click', () => { this.restore(prev); msg.textContent = 'Your earlier lyrics are back.'; });
      } else msg.textContent = '';
      $('sg-title').focus();
    },
    closeSong() {
      const prev = this.snap(), msg = $('sg-find-msg');
      this.song = null; this.show();
      const name = prev.song.title.trim() || 'your new song';
      const kept = prev.song.key && !prev.song.dirty;
      msg.innerHTML = escapeHtml(kept ? `Closed ${name}; it's still in Your songs.` : `Closed ${name}.`)
        + (prev.text.trim() && !kept ? ' <button type="button" class="btn sm sg-find-msg-btn" id="sg-undo">Undo</button>' : '');
      const undo = $('sg-undo');
      if (undo) undo.addEventListener('click', () => { this.restore(prev); msg.textContent = 'Your song is back.'; });
      $('sg-new').focus();
    },
    // Keep a song typed or pasted here in Your songs. It needs a name and an artist first.
    // quiet (from Start singing): lyrics-less songs pass, and a saved song without changes isn't saved again.
    saveOwn(quiet) {
      const s = this.song; if (!s || !s.mine) return true;
      const text = $('sg-lyrics').value;
      if (quiet && !text.trim()) return true; // nothing typed: sing without lyrics
      const miss = D.ownSongMissing(s);
      [['title', 'sg-title'], ['artist', 'sg-artist']].forEach(([k, id]) => { if (miss.includes(k)) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid'); });
      if (miss.length) {
        this.ownNote(miss.length === 2 ? 'Give your song a name and an artist first.' : miss[0] === 'title' ? 'Give your song a name first.' : 'Add the artist first.');
        const el = $(miss[0] === 'title' ? 'sg-title' : 'sg-artist');
        el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return false;
      }
      if (!text.trim()) { this.ownNote('Type or paste the lyrics first.'); $('sg-lyrics').focus(); return false; }
      if (quiet && !s.dirty && s.key) return true;
      const row = { src: 'mine', title: s.title.trim(), artist: s.artist.trim(), timed: D.parseLyrics(text).timed, text };
      const key = D.lyricsKey(row);
      let list = this.savedList();
      const was = s.key && s.key !== key ? list.find(r => r.key === s.key) : null;
      if (was) row.video = was.video; // renamed: the attached video moves with it
      else if (!s.key && s.video) row.video = s.video;
      if (s.key && s.key !== key) list = D.lyricsCacheDrop(list, s.key);
      const replaces = s.key !== key && !!D.lyricsCacheGet(list, row);
      this.storeSaved(D.lyricsCachePut(list, row));
      if (s.key && s.key !== key && this.recKey === s.key) { Backing.del(s.key); this.backKeys.delete(s.key); this.recKey = null; } // renamed: the track moves with it
      Object.assign(s, { key, title: row.title, artist: row.artist, timed: row.timed, dirty: false, video: null });
      delete $('sg-saved-msg').dataset.keep;
      this.show();
      this.ownNote(`Saved ${row.title} by ${row.artist} in Your songs.` + (replaces ? ' It replaces your earlier song with the same name and artist.' : ''));
      return true;
    },
    // The open song was removed from Your songs (or put back with Undo).
    unlink(rows) {
      const s = this.song; if (!s || !s.key || !rows.some(r => r.key === s.key)) return;
      if (s.mine) { s.key = null; s.dirty = true; this.show(); } else this.storeSong();
    },
    relink(rows) {
      const s = this.song; if (!s || !s.mine || s.key) return;
      const r = rows.find(x => x.src === 'mine' && x.key === D.lyricsKey({ src: 'mine', title: s.title.trim(), artist: s.artist.trim() }));
      if (!r) return;
      s.key = r.key; s.dirty = r.text !== $('sg-lyrics').value || r.title !== s.title || r.artist !== s.artist;
      this.show();
    },
    parse() {
      this.lyr = D.parseLyrics($('sg-lyrics').value);
      const n = this.lyr.lines.filter(l => l.text).length, msg = $('sg-parse');
      if (!this.song) shortWithInfo(msg, 'Pick one of Your songs, search for lyrics, or tap New song to type your own. You can also just start singing without lyrics and get your pitch and resonance for the whole song.', 'Singing without lyrics');
      else if (!n) msg.textContent = 'No lyrics yet. You can still sing without them and get your pitch and resonance for the whole song.';
      else if (this.lyr.timed) {
        const t = this.lyr.lines[0].t;
        msg.textContent = `${n} timed lines (LRC), the first at ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}. ` + (this.audio ? `They follow the attached ${this.rec && this.rec.kind === 'yt' ? 'video' : 'song file'}.` : 'Press Next line when the first line begins; after that they scroll by themselves.');
      } else msg.textContent = `${n} lines. Press Next line (or the space bar) as you reach each one, or let the app follow your singing.`;
      this.syncFollow(n);
    },
    // "Follow my singing" moves through plain lyrics by counting sung syllables, and keeps timed lyrics
    // in step when they run on their own clock. With a song file the file keeps timed lyrics exact.
    canFollow(n) { return n > 0 && !(this.lyr.timed && this.audio); },
    syncFollow(n) {
      const ok = this.canFollow(n), note = $('sg-follow-note');
      $('sg-follow-wrap').hidden = !ok;
      if (!ok) return;
      note.textContent = '(approximate)';
      note.append(infoBadge('How Follow my singing works', this.lyr.timed
        ? 'Approximate: the lyrics start when you start singing, and the start of each phrase you sing nudges them back in step if they drift.'
        : 'Approximate: the next line comes up when you pause after singing most of a line. It counts the syllables you sing, so long runs of quick words or one word over many notes can throw it off; Next line, Back a line or a tap on a line puts it right.'));
    },
    setFollowPref(on) {
      $('sg-follow').checked = on;
      try { localStorage.setItem(SING_FOLLOW_KEY, on ? '1' : '0'); } catch (e) {}
    },
    // turn following on or off during a song
    followLive(on) {
      if (!this.on || this.empty || !this.canFollow(this.lyr.lines.length)) on = false;
      this.fol = on ? new D.SingFollower(this.lyr.lines, { auto: !this.lyr.timed }) : null;
      if (this.fol && this.cur >= 0) this.fol.setLine(this.cur);
      const b = $('sg-follow-btn');
      b.setAttribute('aria-pressed', String(!!this.fol)); b.textContent = this.fol ? 'Following your singing' : 'Follow my singing';
      $('sg-lines').classList.toggle('following', !!this.fol);
      this.progress(); this.hint();
    },
    progress() {
      const li = $('sg-lines').children[this.cur]; if (!li) return;
      const need = this.fol ? this.fol.need[this.cur] : 0;
      li.style.setProperty('--sgp', need ? String(Math.min(1, this.fol.n / need)) : '0');
    },
    // Attached video or song file. this.audio is an <audio> element for a file or a YtTrack for a YouTube video;
    // this.rec is what is stored for it and this.recKey the song it is stored under: a video in the song's entry in
    // Your songs (D.lyricsCacheVideo), a file in IndexedDB (Backing). While recKey is null the track belongs to no
    // saved song yet; recFor is then the open song it was attached to (its .video keeps the link across reloads).
    trackIdle: 'No video attached. Sing to music playing anywhere, or attach one below.',
    backFor: undefined, // the song the Attach section was last set up for (it folds when another song opens)
    recFor: null,
    linkShown: '', linkFor: undefined, // the link last put in the YouTube link box, and the song it was for
    // The YouTube karaoke search: the open song's name and artist, else what's typed in Find lyrics.
    karaokeLink() {
      const s = this.song, u = (s && s.title.trim() && D.karaokeSearchUrl(s.title, s.artist)) || D.karaokeSearchUrl($('sg-q').value) || 'https://www.youtube.com/results?search_query=karaoke';
      $('sg-karaoke').href = u;
    },
    trackNote(text) { $('sg-track-name').textContent = text; },
    trackText() {
      const r = this.rec; if (!r) return this.trackIdle;
      const kept = this.recKey ? (r.kind === 'yt' ? ' Kept with this song in Your songs.' : ' Kept with this song in this browser.')
        : this.song ? ' It is kept with this song once the song is saved in Your songs.'
        : ' It will be kept with the song you open or start next.';
      return r.kind === 'yt' ? 'Attached video, shown at the top of this tab.' + kept + ' Wear headphones so the microphone hears only you.'
        : `Song file: ${r.name}.` + kept;
    },
    // Show the track that goes with the song on screen: load the song's own, keep a track that belongs to
    // no song yet (and store it with this one once it's saved), and put away the previous song's.
    async syncTrack() {
      const s = this.song, key = s && s.key || null, saved = !!this.savedEntry(key);
      // Attach video is optional, so it starts folded; a song that has a track opens it (trackShown).
      if (s !== this.backFor) { this.backFor = s; $('sg-backing').open = false; this.showLink(); }
      if (this.rec && !this.recKey && !(this.recFor && this.recFor !== s)) {
        if (saved) { this.recKey = key; this.recFor = null; if (s.video) { s.video = null; this.storeSong(); } this.storeTrack(); }
        else if (s) { this.recFor = s; if (this.rec.kind === 'yt') { s.video = D.videoClean(this.rec); this.storeSong(); } }
        this.trackNote(this.trackText()); this.trackShown();
        return;
      }
      if (this.rec && this.recKey && this.recKey === key) return;
      if (this.rec) this.dropTrack();
      if (!saved) { // a song that isn't in Your songs (yet) can still have a video attached
        if (s && s.video) { this.playYouTube({ kind: 'yt', ...s.video }, null); this.recFor = s; this.trackNote(this.trackText()); }
        return;
      }
      const e = this.savedEntry(key);
      if (e.video) { this.playYouTube({ kind: 'yt', ...e.video }, key); return; }
      const want = ++this.trackSeq, rec = await Backing.get(key);
      if (want !== this.trackSeq || !rec || this.rec || !this.song || this.song.key !== key) return;
      if (rec.kind === 'file' && rec.blob) this.playFile(rec.blob, rec.name, rec, key);
      else if (rec.kind === 'yt' && rec.id) { this.playYouTube(rec, key); this.storeTrack(); } // an older link: moves into the song's entry
    },
    trackSeq: 0,
    // Keep the track with its song: a video in the song's entry in Your songs, a file in this browser's IndexedDB.
    storeTrack() {
      const r = this.rec; if (!r) return;
      const k = this.recKey;
      if (!k) { if (r.kind === 'yt' && this.recFor) { this.recFor.video = D.videoClean(r); this.storeSong(); } return; }
      const e = this.savedEntry(k);
      if (r.kind === 'yt') {
        if (e) this.storeSaved(D.lyricsCacheVideo(this.savedList(), k, r));
        Backing.del(k); this.backKeys.delete(k);
        this.renderSaved();
      } else {
        if (e && e.video) this.storeSaved(D.lyricsCacheVideo(this.savedList(), k, null));
        Backing.put(k, r).then(ok => { if (ok) { this.backKeys.add(k); this.renderSaved(); } });
      }
    },
    // Make sure the open song is in Your songs, so a video attached to it is kept there.
    keepSong() {
      const s = this.song; if (!s || this.savedEntry(s.key)) return;
      if (s.mine) { this.saveOwn(false); return; }
      const text = $('sg-lyrics').value;
      if (text.trim()) { this.remember({ ...s, text }); this.show(); }
    },
    useFile(file) {
      this.dropTrack();
      this.playFile(file, file.name, { kind: 'file', name: file.name, blob: file, offset: 0 }, null);
      this.syncTrack();
    },
    useYouTube(text) {
      const id = D.youtubeId(text), inp = $('sg-yt-url');
      if (!id) { this.trackNote(String(text || '').trim() ? "That isn't a YouTube video link. Open the video on YouTube, use Share, Copy link, and paste it here." : 'Paste a link to a YouTube video first.'); inp.focus(); return; }
      const start = D.youtubeStart(text), r = this.rec;
      if (r && r.kind === 'yt' && r.id === id && (+r.start || 0) === start) { this.trackShown(); return; } // already attached: keep its timing
      this.dropTrack();
      this.playYouTube({ kind: 'yt', id, start, offset: 0 }, null);
      this.keepSong(); // attaching a video keeps the song in Your songs
      this.syncTrack();
    },
    playFile(blob, name, rec, key) {
      this.rec = rec; this.recKey = key;
      this.url = URL.createObjectURL(blob);
      this.audio = new Audio(this.url);
      this.audio.preload = 'auto';
      this.audio.addEventListener('ended', () => { if (this.on) this.finish(); });
      this.audio.addEventListener('error', () => { this.dropTrack(); this.trackNote(`${name} can't be played by this browser. Try MP3, M4A or WAV.`); });
      this.trackName = name;
      this.trackNote(this.trackText());
      this.trackShown();
    },
    playYouTube(rec, key) {
      this.rec = rec; this.recKey = key; this.trackName = '';
      this.trackNote(this.trackText());
      if (mode === 'sing') this.makeYt(); // otherwise when the Sing tab opens, so YouTube isn't contacted before then
      this.trackShown();
    },
    makeYt() {
      const rec = this.rec; if (!rec || rec.kind !== 'yt' || this.audio) return;
      const box = $('sg-video'); box.hidden = false;
      const track = this.audio = new YtTrack(rec.id, rec.start, box, {
        ended: () => { if (this.on && this.audio === track) this.finish(); },
        state: () => { if (this.on && this.audio === track) this.hint(); },
        error: (code) => { if (this.audio === track) this.trackNote(`${YT_ERRORS[code] || `YouTube couldn't play this video (error ${code}).`} Pick another karaoke version, or play this one on YouTube with headphones.`); },
      });
      track.ready.catch((e) => {
        if (this.audio !== track || !/blocked|timeout/.test(e.message)) return;
        track.destroy(); this.audio = null; box.hidden = true; this.trackShown(); // tried again next time the Sing tab opens
        this.trackNote("YouTube's player couldn't load here (offline, or blocked by this page or a content blocker). " + (this.recKey ? 'The attached video is kept with the song, and it will try again next time you open Sing. ' : '') + "Or play the music elsewhere.");
      });
    },
    trackShown() {
      if (this.rec) $('sg-backing').open = true;
      $('sg-track-clear').hidden = !this.rec; $('sg-aec-wrap').hidden = !this.audio;
      $('sg-track-clear').textContent = this.rec && this.rec.kind === 'file' ? 'Remove song file' : 'Remove video';
      $('sg-file-btn').textContent = this.rec && this.rec.kind === 'file' ? 'Use another file' : 'Use a file';
      this.showLink();
      if (!this.on) this.parse();
    },
    // The YouTube link box shows the attached video's link (to see, copy or change it). It empties when the video
    // goes or another song opens, but text being typed in it is left alone otherwise.
    showLink() {
      const link = this.rec && this.rec.kind === 'yt' ? D.youtubeUrl(this.rec) : '';
      if (link !== this.linkShown || (!link && this.backFor !== this.linkFor)) { $('sg-yt-url').value = link; this.linkShown = link; this.linkFor = this.backFor; }
    },
    // Put the track away (it stays stored with its song).
    dropTrack() {
      if (this.on) this.finish();
      ++this.trackSeq;
      if (this.audio) {
        if (this.audio instanceof YtTrack) this.audio.destroy();
        else { this.audio.pause(); this.audio.removeAttribute('src'); }
        this.audio = null;
      }
      if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
      $('sg-video').hidden = true;
      this.rec = null; this.recKey = null; this.recFor = null; this.trackName = '';
      this.trackNote(this.trackIdle);
      this.trackShown();
    },
    // Remove: put it away and forget it for this song.
    removeTrack() {
      const k = this.recKey, s = this.song;
      this.dropTrack();
      if (k) {
        Backing.del(k); this.backKeys.delete(k);
        const e = this.savedEntry(k); if (e && e.video) this.storeSaved(D.lyricsCacheVideo(this.savedList(), k, null));
      }
      if (s && s.video) { s.video = null; this.storeSong(); }
      this.renderSaved();
      $('sg-yt-url').focus();
    },
    // Remember the lyric timing set against this track (Next line and the nudges), for next time.
    keepOffset() {
      if (this.rec && this.audio && Math.abs((this.rec.offset || 0) - this.offset) > 0.05) { this.rec.offset = Math.round(this.offset * 100) / 100; this.storeTrack(); }
    },
    // Sing tab shown or left: a backing track playing in the setup stops when you leave.
    leave() { if (this.audio && !this.on) this.audio.pause(); },
    enter() { if (this.rec && this.rec.kind === 'yt' && !this.audio) { this.makeYt(); this.trackShown(); } },
    // song time in seconds: the backing track's own position, or a clock started by the first Next line
    clock() {
      if (this.audio) return this.audio.currentTime + this.offset;
      if (!this.started) return null;
      return this.paused ? this.base : this.base + (performance.now() - this.at) / 1000;
    },
    setClock(t) {
      if (this.audio) this.offset = t - this.audio.currentTime;
      else { this.base = t; this.at = performance.now(); this.started = true; }
    },
    async start() {
      if (!this.saveOwn(true)) return; // own lyrics need a name and an artist first
      if (this.song && this.savedEntry(this.song.key)) { this.storeSaved(D.lyricsCacheTouch(this.savedList(), this.song.key)); this.renderSaved(); } // singing counts as using it
      this.parse();
      await startMic({ aec: !!this.audio && $('sg-aec').checked });
      if (state.running !== 'mic') return; // no microphone: startMic has said why
      take = null; // a song isn't a speech sample, so it doesn't feed the guided exercise
      this.empty = !this.lyr.lines.length;
      if (this.empty) this.lyr = { timed: false, lines: [{ t: null, text: 'Your singing' }] };
      Object.assign(this, { on: true, paused: false, frames: [], trace: [], cur: -1, started: false, offset: this.rec && this.audio ? +this.rec.offset || 0 : 0, t0: performance.now(), lastResAt: -1e9 });
      $('sg-lines').innerHTML = this.lyr.lines.map((l, i) => `<li data-i="${i}"${l.text ? '' : ' class="gap"'}><span class="sg-t">${escapeHtml(l.text)}</span><span class="sg-badge"></span>${l.notes ? `<span class="sg-mel" aria-label="Target notes: ${l.notes.map(D.midiName).join(', ')}">${l.notes.map(D.midiName).join(' ')}</span>` : ''}</li>`).join('');
      $('sg-setup').hidden = true; $('sg-result').hidden = true; $('sg-stage').hidden = false;
      $('sg-nudge').hidden = !this.lyr.timed; $('sg-step').hidden = this.empty;
      $('sg-follow-btn').hidden = this.empty || !this.canFollow(this.lyr.lines.length);
      this.fol = null; this.followLive($('sg-follow').checked);
      $('sg-pause').textContent = 'Pause'; $('sg-pause').setAttribute('aria-pressed', 'false');
      if (this.audio) { this.audio.currentTime = this.audio instanceof YtTrack ? this.audio.start : 0; try { await this.audio.play(); } catch (e) {} }
      this.setLine(this.lyr.timed ? -1 : this.fol ? Math.max(0, this.fol.cur) : 0);
      if (this.lyr.timed && this.audio) this.setLine(D.lyricLineAt(this.lyr.lines, this.clock()));
      requestAnimationFrame(() => { this.draw(); this.paintHud(); });
      $(this.audio instanceof YtTrack ? 'sg-video' : 'sg-stage').scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    hint() {
      const h = $('sg-hint');
      if (this.empty) h.textContent = 'Sing freely. Press Finish for your summary.';
      else if (this.fol && !this.lyr.timed) h.textContent = 'Following your singing: the next line comes up when you pause after a line. It only counts syllables, so if it slips, press Next line or Back a line, or tap a line.';
      else if (this.fol && !this.started) h.textContent = 'Start the song and sing: the lyrics start with your first phrase. Or press Next line as the first line begins.';
      else if (this.fol) h.textContent = 'The timed lyrics scroll by themselves, and the start of each phrase you sing nudges them back in step. Still drifting? Press Next line, tap a line, or nudge them by half a second.';
      else if (!this.lyr.timed) h.textContent = 'Press Next line (or the space bar) as you start each line. You can also tap a line.';
      else if (this.audio instanceof YtTrack && !this.audio.playing && !this.paused && this.audio.p) h.textContent = 'Waiting for the video. If it does not start, tap play on the video.';
      else if (!this.audio && !this.started) h.textContent = 'Start the song, then press Next line (or the space bar) as the first line begins. After that the lyrics scroll by themselves.';
      else h.textContent = 'Lyrics drifting? Press Next line as a line begins, tap a line, or nudge them by half a second.';
      const last = this.cur >= this.lyr.lines.length - 1;
      $('sg-tap').disabled = last; $('sg-prev').disabled = this.cur <= 0;
    },
    tap() {
      if (!this.on || this.empty) return;
      const next = this.cur + 1; if (next >= this.lyr.lines.length) return;
      if (this.lyr.timed) this.setClock(this.lyr.lines[next].t + 0.02);
      this.setLine(next);
    },
    back() {
      if (!this.on || this.empty || this.cur <= 0) return;
      const i = this.cur - 1;
      if (this.lyr.timed) this.setClock(this.lyr.lines[i].t + 0.02);
      this.setLine(i);
    },
    nudge(s) { const t = this.clock(); if (t == null) return; this.setClock(Math.max(0, t + s)); this.follow(); },
    pause(p) {
      if (!this.on) return;
      if (p) { if (this.audio) this.audio.pause(); else if (this.started) this.base = this.clock(); }
      else if (this.audio) this.audio.play().catch(() => {});
      else this.at = performance.now();
      this.paused = p;
      $('sg-pause').textContent = p ? 'Resume' : 'Pause'; $('sg-pause').setAttribute('aria-pressed', String(p));
    },
    follow() {
      if (!this.lyr.timed) return;
      const t = this.clock(); if (t == null) return;
      const i = D.lyricLineAt(this.lyr.lines, t);
      if (i !== this.cur) this.setLine(i);
    },
    setLine(i, byFollower) {
      const prev = this.cur; this.cur = i;
      if (this.fol && !byFollower && i >= 0 && i !== this.fol.cur) this.fol.setLine(i);
      if (prev >= 0 && prev !== i) this.badge(prev);
      const box = $('sg-lines'), lis = box.children;
      for (let k = 0; k < lis.length; k++) {
        lis[k].classList.toggle('past', k < i); lis[k].classList.toggle('now', k === i);
        if (k === i) lis[k].setAttribute('aria-current', 'true'); else lis[k].removeAttribute('aria-current');
      }
      const li = lis[i], reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollTo({ top: li ? li.offsetTop - box.clientHeight / 2 + li.offsetHeight / 2 : 0, behavior: reduce ? 'auto' : 'smooth' });
      this.progress(); this.hint();
    },
    // one analyser frame for the follower: plain lyrics move when it says so; timed lyrics on their
    // own clock jump when a phrase starts near a line boundary (see D.lrcSync)
    followFrame(fr) {
      const r = this.fol.push(fr, performance.now());
      if (r.line != null && !this.lyr.timed) { this.setLine(r.line, true); return; }
      if (r.phrase && this.lyr.timed && !this.audio) {
        const t = D.lrcSync(this.lyr.lines, this.fol.need, this.clock(), this.cur, this.fol.n - 1);
        if (t != null) { this.setClock(t + 0.02); this.follow(); this.fol.n = 1; this.hint(); }
      }
      if (r.onset) this.progress();
    },
    // the target notes (MIDI) of the line being sung, when the lyrics give some ({C4 D4 ...} after the line)
    lineNotes() { const l = !this.empty && this.cur >= 0 && this.lyr.lines[this.cur]; return l && l.notes ? l.notes : null; },
    // the vowels of the line being sung (D.lineVowels), for scoring; null without lyrics or on a blank line
    lineVowels() {
      const l = !this.empty && this.cur >= 0 && this.lyr.lines[this.cur];
      if (!l || !l.text) return null;
      if (l.vk == null) l.vk = D.lineVowels(l.text, PRON);
      return l.vk.length ? l.vk : null;
    },
    melodyOf(k) { return D.melodyMatch(this.frames.filter(f => f.line === k), this.lyr.lines[k].notes); },
    lineSum(k) { return D.singSummary(this.frames.filter(f => f.line === k).map(f => Object.assign({}, f, { line: 0 })), 1)[0]; },
    badge(k) {
      const li = $('sg-lines').children[k]; if (!li) return;
      const s = this.lineSum(k), [lo, hi] = target(), bits = [];
      if (s.res != null) bits.push(`<b class="${onTarget(s.res) ? 'in' : ''}">${s.shaky ? '≈' : ''}${Math.round(s.res)}</b> resonance`);
      if (s.f0 != null) bits.push(`${D.hzToNote(s.lo)}–${D.hzToNote(s.hi)}`);
      li.querySelector('.sg-badge').innerHTML = bits.join(' · ');
    },
    frame(fr, res, u, miss) {
      if (!this.on || this.paused) return;
      if (this.fol) this.followFrame(fr);
      this.follow();
      const f0 = fr.kind === 'voiced' ? fr.f0 : 0, now = performance.now();
      if (this.cur >= 0) this.frames.push({ line: this.cur, f0, res, u, miss, t: now });
      this.trace.push({ t: now, f0, res });
      while (this.trace.length && now - this.trace[0].t > SING_VIEW_MS + 500) this.trace.shift();
      if (Number.isFinite(res)) this.lastResAt = now;
      if (frameCount % 3 === 0) { this.paintHud(); this.draw(); }
    },
    paintHud() {
      const now = performance.now(), recent = this.trace.filter(p => p.f0 > 0 && now - p.t < 300).map(p => p.f0);
      if (recent.length >= 3) {
        const f = D.median(recent), cents = Math.round(100 * (12 * Math.log2(f / 440) - Math.round(12 * Math.log2(f / 440))));
        $('sg-note').textContent = D.hzToNote(f);
        const nn = D.nearestNote(f, this.lineNotes()), tune = !nn ? '' : nn.octaves ? ` · ${D.midiName(nn.midi)} an octave ${nn.octaves > 0 ? 'up' : 'down'}`
          : Math.abs(nn.cents) <= 50 ? ` · on ${D.midiName(nn.midi)}` : ` · ${D.midiName(nn.midi)} ${nn.cents > 0 ? '+' : ''}${nn.cents}¢`;
        $('sg-hz').textContent = nn ? `${Math.round(f)} Hz${tune}` : `${Math.round(f)} Hz · ${cents > 0 ? '+' : ''}${cents}¢`;
        $('sg-note').classList.toggle('on-tune', !!nn && !nn.octaves && Math.abs(nn.cents) <= 50);
      } else if (!this.trace.some(p => p.f0 > 0 && now - p.t < 800)) { $('sg-note').textContent = '--'; $('sg-hz').innerHTML = '&nbsp;'; $('sg-note').classList.remove('on-tune'); }
      const fresh = now - this.lastResAt < 2000, v = state.meter, nd = $('sg-needle');
      $('sg-res').textContent = fresh && Number.isFinite(v) ? Math.round(v) : '--';
      nd.hidden = !(fresh && Number.isFinite(v)); if (!nd.hidden) nd.style.left = clamp(v, 0, 100) + '%';
      const [lo, hi] = target(), b = $('sg-band'); b.style.left = lo + '%'; b.style.width = (hi - lo) + '%';
      b.parentElement.classList.toggle('in', !nd.hidden && onTarget(Math.round(v)));
      $('sg-vowel').textContent = fresh ? ($('ro-vowel').textContent.split(' ')[0] || '--') : '--';
      const t = this.clock();
      $('sg-clock').textContent = this.lyr.timed ? (t == null ? 'waiting for the first line' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${this.paused ? ' paused' : ''}`)
        : this.empty ? (this.paused ? 'paused' : ' ') : `line ${Math.max(1, this.cur + 1)} of ${this.lyr.lines.length}${this.paused ? ', paused' : ''}`;
    },
    draw() {
      const cv = $('cv-sing'); if (!cv || !C.ink || $('sg-stage').hidden) return;
      fitCanvas(cv);
      if (!this.cols) this.cols = { m: parseColor(C.masc), f: parseColor(C.fem) };
      const g = cv.getContext('2d'), dpr = dprOf(), w = cv.width, h = cv.height, axisW = 34 * dpr;
      const now = performance.now(), want = this.lineNotes(), wantHz = want ? [...new Set(want)].map(n => 440 * Math.pow(2, (n - 69) / 12)) : [];
      const top = this.trace.some(p => p.f0 > SING_HZ[1] * 0.95) || wantHz.some(f => f > SING_HZ[1] * 0.95) ? SING_HZ_HIGH : SING_HZ[1];
      const L = Math.log(top / SING_HZ[0]), y = (f) => h - Math.log(f / SING_HZ[0]) / L * (h - 10 * dpr) - 5 * dpr;
      g.clearRect(0, 0, w, h);
      g.font = `${10 * dpr}px ${C.font}`; g.textAlign = 'right'; g.lineWidth = 1;
      for (let oct = 2; oct <= 6; oct++) for (const [semi, lab] of [[0, 'C'], [7, 'G']]) {
        const f = 440 * Math.pow(2, (12 * (oct + 1) + semi - 69) / 12); if (f < SING_HZ[0] || f > top) continue;
        g.strokeStyle = C.line; g.globalAlpha = semi ? 0.45 : 1;
        g.beginPath(); g.moveTo(axisW, y(f)); g.lineTo(w, y(f)); g.stroke(); g.globalAlpha = 1;
        if (!semi) { g.fillStyle = C.muted; g.fillText(lab + oct, axisW - 5 * dpr, y(f) + 4 * dpr); }
      }
      // the line's target notes: a soft band half a semitone either side, so landing inside it is on the note
      g.textAlign = 'left';
      let labY = -1e9; // labels go highest note first; one that would overlap the label above is left out
      for (const f of wantHz.slice().sort((p, q) => q - p)) {
        if (f < SING_HZ[0] || f > top) continue;
        const y0 = y(f * Math.pow(2, 0.5 / 12)), y1 = y(f / Math.pow(2, 0.5 / 12));
        g.fillStyle = C.accent; g.globalAlpha = 0.14; g.fillRect(axisW, y0, w - axisW, y1 - y0); g.globalAlpha = 0.8;
        if (y0 - labY >= 11 * dpr) { g.fillText(D.hzToNote(f), axisW + 4 * dpr, y0 - 2 * dpr); labY = y0; }
        g.globalAlpha = 1;
      }
      const sx = (w - axisW) / SING_VIEW_MS, { m, f: fm } = this.cols;
      for (const p of this.trace) {
        if (!p.f0) continue;
        const x = w - (now - p.t) * sx; if (x < axisW) continue;
        if (Number.isFinite(p.res)) { const u = clamp((p.res - D.RES_AVG.masc) / (D.RES_AVG.fem - D.RES_AVG.masc), 0, 1); g.fillStyle = `rgb(${m.map((c, k) => Math.round(c + (fm[k] - c) * u)).join(',')})`; }
        else g.fillStyle = C.ink;
        g.beginPath(); g.arc(x, y(clamp(p.f0, SING_HZ[0], top)), (Number.isFinite(p.res) ? 2.6 : 1.7) * dpr, 0, 7); g.fill();
      }
    },
    finish(fromStop) {
      if (!this.on) return;
      if (this.cur >= 0) this.badge(this.cur);
      this.on = false; this.paused = false; this.fol = null;
      if (this.audio) { this.audio.pause(); if (this.lyr.timed) this.keepOffset(); }
      take = null;
      if (!fromStop && state.running === 'mic') stop();
      this.result();
      $('sg-stage').hidden = true; $('sg-setup').hidden = false;
      if (this.empty) this.lyr = D.parseLyrics($('sg-lyrics').value);
    },
    // Histogram of time spent holding each semitone (D.heldNotes), with the goal's speaking range
    // shaded behind and the pitch tracker's ceiling marked. Tapping or hovering a bar reads it out.
    heldHtml() {
      const h = D.heldNotes(this.frames);
      const secs = (v) => v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${v < 10 ? v.toFixed(1) : Math.round(v)} s`;
      const head = `<h4 class="eyebrow"><span>Notes you held${infoHtml('About notes you held', 'Time spent on each note when you held it steady for a quarter second or more. Slides, scoops and quick passing notes are left out. The shaded band is the typical speaking range for your goal. Pitch is read up to about 1100 Hz (C6), so higher notes are missing.')}</span><span>seconds per note</span></h4>`;
      if (!h.bins.length) return `${head}<p class="small muted">No steady notes long enough to count.</p>`;
      const [bLo, bHi] = pitchBand(), toM = (f) => 12 * Math.log2(f / 440) + 69, CEIL = Math.floor(toM(D.SING_PITCH_MAX));
      let a = Math.min(h.lo, Math.floor(toM(bLo))) - 1, b = Math.max(h.hi, Math.ceil(toM(bHi))) + 1;
      while (b - a < 14) { a--; if (b - a < 14) b++; }
      const n = b - a + 1, W = 340, H = 150, L = 28, R = 4, T = 16, B = 20, cw = (W - L - R) / n, x = (m) => L + (m - a) * cw;
      const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find(s => h.peak.secs / s <= 4) || 600, top = Math.max(step, Math.ceil(h.peak.secs / step) * step);
      const y = (v) => H - B - v / top * (H - B - T);
      let g = `<rect class="hn-band" x="${x(toM(bLo)) - cw / 2}" y="${T}" width="${(toM(bHi) - toM(bLo)) * cw + cw}" height="${H - B - T}"/><text class="hn-lab" x="${x(toM(bLo)) - cw / 2 + 3}" y="${T - 4}">speaking range</text>`;
      for (let v = step; v <= top + 1e-9; v += step) g += `<line class="hn-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="hn-tick" x="${L - 4}" y="${y(v) + 3.5}" text-anchor="end">${v >= 60 ? Math.round(v / 60) + 'm' : v}</text>`;
      if (CEIL >= a && CEIL <= b) g += `<line class="hn-ceil" x1="${x(CEIL) + cw / 2}" x2="${x(CEIL) + cw / 2}" y1="${T}" y2="${H - B}"/><text class="hn-lab" x="${x(CEIL) + cw / 2 - 3}" y="${T - 4}" text-anchor="end">tracker limit</text>`;
      for (let m = a; m <= b; m++) {
        const bin = h.bins.find(q => q.midi === m), nm = D.midiName(m);
        if ((m % 12 === 0 && Math.abs(m - h.peak.midi) !== 1) || m === h.peak.midi) g += `<text class="hn-tick${m === h.peak.midi ? ' pk' : ''}" x="${x(m)}" y="${H - 6}" text-anchor="middle">${nm}</text>`;
        if (!bin) continue;
        const bw = Math.max(2, cw - 2), yt = Math.min(y(bin.secs), H - B - 2);
        const say = `${nm}: ${secs(bin.secs)} held${bin.res != null ? `, resonance ${Math.round(bin.res)}` : ''}`;
        g += `<path class="hn-bar" d="M${x(m) - bw / 2},${H - B}V${yt + 2}q0,-2 2,-2h${bw - 4}q2,0 2,2V${H - B}Z"/>`;
        g += `<rect class="hn-hit" data-hn="${escapeHtml(say)}" x="${x(m) - cw / 2}" y="${T}" width="${cw}" height="${H - B - T}" tabindex="0" role="img" aria-label="${escapeHtml(say)}"><title>${escapeHtml(say)}</title></rect>`;
      }
      if (h.peak) g += `<text class="hn-val" x="${x(h.peak.midi)}" y="${Math.min(y(h.peak.secs), H - B - 2) - 4}" text-anchor="middle">${secs(h.peak.secs)}</text>`;
      g += `<line class="hn-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
      const sum = `Most time on ${h.peak.note} (${secs(h.peak.secs)}). Held notes from ${D.midiName(h.lo)} to ${D.midiName(h.hi)}, ${secs(h.total)} in all.`;
      return `${head}<figure class="hn"><svg class="hn-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Seconds held per note. ${escapeHtml(sum)}">${g}</svg><figcaption class="small"><span class="hn-say" aria-live="polite">${escapeHtml(sum)}</span></figcaption></figure>`;
    },
    result() {
      const lines = this.lyr.lines, sum = D.singSummary(this.frames, lines.length), box = $('sg-result');
      const res = this.frames.map(f => f.res).filter(Number.isFinite), f0 = this.frames.map(f => f.f0).filter(v => v > 0);
      const [lo, hi] = target(), inT = onTarget;
      const secs = (performance.now() - this.t0) / 1000, sung = this.frames.length ? secs * f0.length / this.frames.length : 0;
      if (f0.length < 18) {
        box.innerHTML = `<h3>No singing heard</h3><p class="muted">The microphone didn't pick up enough voice to summarise. Check it's the right microphone and sing a little closer to it.</p><div class="btn-row"><button type="button" class="btn primary" data-sg="again">Try again</button></div>`;
      } else {
        const pLo = D.quantile(f0, 0.05), pHi = D.quantile(f0, 0.95), mRes = res.length >= 8 ? D.median(res) : null;
        const scored = sum.filter(s => s.res != null && !s.shaky && lines[s.line].text && !D.instrumentalLine(lines[s.line].text));
        const worst = scored.slice().sort((a, b) => (state.goal === 'fem' ? a.res - b.res : b.res - a.res)).filter(s => !inT(s.res)).slice(0, 2);
        // the tune, over the lines that give target notes (D.melodyMatch per line, summed)
        const mel = this.empty || !lines.some(l => l.notes) ? null : lines.reduce((a, l, i) => { if (!l.notes) return a; const r = this.melodyOf(i); a.held += r.held; a.on += r.on; a.oct += r.oct; return a; }, { held: 0, on: 0, oct: 0 });
        const stat = (k, v, sub) => `<div class="stat"><b>${v}</b><span>${k}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
        const rows = this.empty ? '' : sum.map((s, i) => {
          const l = lines[i]; if (!l.text) return '';
          const inst = D.instrumentalLine(l.text);
          const v = s.res != null ? Math.round(s.res) : null, tip = v != null ? `Resonance score ${v} ± ${s.pm}, from ${s.vowelFrames} vowel readings${s.shaky ? ' (only a few, so a rough guide)' : ''}` : '';
          const bar = v != null && !inst ? `<span class="sg-bar${s.shaky ? ' shaky' : ''}" title="${escapeHtml(tip)}"><s style="left:${lo}%;width:${hi - lo}%"></s><i class="${inT(s.res) ? 'in' : ''}" style="width:${clamp(s.res, 2, 100)}%"></i><u style="left:${clamp(s.res - s.pm, 0, 100)}%;width:${clamp(s.res + s.pm, 0, 100) - clamp(s.res - s.pm, 0, 100)}%"></u></span><span class="n${s.shaky ? ' shaky' : ''}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${s.shaky ? '≈' : ''}${v}</span>`
            : `<span class="why">${inst ? 'instrumental' : D.SING_WHY[s.why]}</span>`;
          const rng = s.f0 != null ? `<span class="r">${D.hzToNote(s.lo)}–${D.hzToNote(s.hi)}</span>` : '<span class="r">--</span>';
          const mm = l.notes && this.melodyOf(i), mel = !mm ? '' : `<small class="m">${mm.held < 0.25 ? 'No notes held long enough to check the tune'
            : `${Math.round(100 * mm.share)}% on the tune${mm.octShare >= 0.1 ? `, ${Math.round(100 * mm.octShare)}% an octave away` : ''}${mm.missed.length && mm.missed.length < new Set(l.notes).size ? ` · not held: ${mm.missed.map(D.midiName).join(' ')}` : ''}`}</small>`;
          return `<li><span class="t">${escapeHtml(l.text)}${mel}</span>${bar}${rng}</li>`;
        }).join('');
        box.innerHTML = `<div class="section-head"><h3>${this.song && this.song.title.trim() ? escapeHtml(this.song.title.trim()) : this.trackName && this.audio ? escapeHtml(this.trackName.replace(/\.[^.]+$/, '')) : 'Song finished'}</h3><span class="muted small">Not saved</span></div>
          <div class="stats">${stat('Resonance score', mRes != null ? Math.round(mRes) : '--', mRes != null ? `median of ${res.length} vowel readings` : 'too few steady vowels')}
          ${stat('In your target', res.length >= 8 ? Math.round(100 * res.filter(inT).length / res.length) + '%' : '--', `band ${lo} to ${hi}`)}
          ${stat('Range', `${D.hzToNote(pLo)}–${D.hzToNote(pHi)}`, `${Math.round(12 * Math.log2(pHi / pLo))} semitones, ${Math.round(pLo)} to ${Math.round(pHi)} Hz`)}
          ${mel ? stat('On the tune', mel.held >= 1 ? Math.round(100 * mel.on / mel.held) + '%' : '--', mel.held >= 1 ? `of ${Math.round(mel.held)} s of held notes${mel.oct / mel.held >= 0.1 ? `; ${Math.round(100 * mel.oct / mel.held)}% an octave away` : ''}` : 'too few held notes') : ''}
          ${stat('Singing', `${Math.floor(sung / 60)}:${String(Math.round(sung % 60)).padStart(2, '0')}`, `of ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`)}</div>
          ${worst.length ? `<p>Furthest from your goal: ${worst.map(s => `<q>${escapeHtml(lines[s.line].text)}</q> (${Math.round(s.res)})`).join(' and ')}. Try speaking those words in your goal voice, then sing them again.</p>` : scored.length ? '<p>Every line with a solid reading was inside your target band.</p>' : ''}
          ${this.heldHtml()}
          ${rows ? `<h4 class="eyebrow"><span>Resonance score and range per line</span><span>men avg ${Math.round(D.RES_AVG.masc)} · women avg ${Math.round(D.RES_AVG.fem)}</span></h4><ul class="sg-sum">${rows}</ul>` : ''}
          <p class="small muted">≈ means only a few vowels were read. Treat lines above C#4 as a hint.${infoHtml('How singing is measured', "The resonance score is read from steady vowels only, the same way as when you speak. Every line gets a score once 3 vowel readings land on it; under 8 it's marked ≈ and is a rough guide. The pale band on each bar is how far the score could be off. A line with no score says why: too little voice, too high, vowels that couldn't be measured (often a nasal or buzzy sound), or no held vowel (quick words and slides). Sung vowels are often stretched and darkened, and above about 280 Hz (C#4) the measurement gets rough, so treat high lines as a hint. Pitch is read up to about 1100 Hz (C6). Music from speakers in the room also mixes into the readings.")}</p>
          <div class="btn-row"><button type="button" class="btn primary" data-sg="again">Sing it again</button><button type="button" class="btn" data-sg="edit">Change the lyrics</button></div>`;
      }
      box.hidden = false;
      const say = box.querySelector('.hn-say'), sum0 = say && say.textContent;
      box.querySelectorAll('[data-hn]').forEach(r => {
        const on = () => { say.textContent = r.dataset.hn; box.querySelectorAll('.hn-hit.on').forEach(o => o.classList.remove('on')); r.classList.add('on'); };
        r.addEventListener('pointerenter', on); r.addEventListener('focus', on); r.addEventListener('click', on);
      });
      const svg = box.querySelector('.hn-svg');
      if (svg) svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { say.textContent = sum0; box.querySelectorAll('.hn-hit.on').forEach(o => o.classList.remove('on')); } });
      box.querySelectorAll('[data-sg]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.sg === 'again') this.start(); else { box.hidden = true; $(this.song ? 'sg-lyrics' : 'sg-q').focus(); }
      }));
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
  };

  let mode = 'home';
  // ---- microphone and voice check (Settings): quiet, "ah", "ee", a sentence, then D.micVoiceCheck ----
  const MicCheck = {
    STEPS: [
      { k: 'quiet', secs: 2, say: 'Stay quiet for a moment…' },
      { k: 'ah', secs: 3, say: 'Hold "ah", as in "father"' },
      { k: 'ee', secs: 3, say: 'Hold "ee", as in "see"' },
      { k: 'speech', secs: 7, say: 'Read: "She sells sea shells by the seashore, and the shells she sells are surely seashells."' },
    ],
    on: false,
    async start() {
      if (this.on) return;
      stop(); if (Run.on) cancelRun();
      const list = $('mc-list'), run = $('mc-run'), step = $('mc-step'), prog = $('mc-prog'), btn = $('mc-start');
      list.hidden = true; list.innerHTML = '';
      let s;
      try {
        ensureCtx();
        s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        run.hidden = false; step.textContent = 'The microphone could not be opened. Allow it for this page and try again.'; return;
      }
      this.on = true; btn.disabled = true; run.hidden = false;
      const track = s.getAudioTracks()[0], label = (track && track.label) || '';
      const src = ctx.createMediaStreamSource(s), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
      mute.gain.value = 0; src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      const chunks = {}; let cur = null;
      proc.onaudioprocess = (e) => { if (cur) (chunks[cur] = chunks[cur] || []).push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      const total = this.STEPS.reduce((a, x) => a + x.secs, 0); let done = 0;
      await new Promise(r => setTimeout(r, 400)); // let the microphone settle
      for (const st of this.STEPS) {
        step.textContent = st.say; cur = st.k;
        const t0 = performance.now();
        await new Promise(r => {
          const tick = () => { const el = (performance.now() - t0) / 1000; prog.style.width = Math.min(100, 100 * (done + el) / total) + '%'; if (el >= st.secs) r(); else setTimeout(tick, 100); };
          tick();
        });
        done += st.secs;
      }
      cur = null; proc.onaudioprocess = null;
      try { src.disconnect(); proc.disconnect(); mute.disconnect(); } catch (e) {}
      s.getTracks().forEach(t => t.stop());
      step.textContent = 'Reading the results…';
      await new Promise(r => setTimeout(r, 30));
      const join = (a) => { const out = new Float32Array((a || []).reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a || []) { out.set(x, o); o += x.length; } return out; };
      const seg = Object.fromEntries(this.STEPS.map(st => [st.k, join(chunks[st.k])]));
      let res = null;
      this.last = { seg, sr: ctx.sampleRate };
      try { res = D.micVoiceCheck(seg, ctx.sampleRate, { label }); } catch (e) { console.error(e); }
      this.on = false; btn.disabled = false; btn.textContent = 'Run it again'; run.hidden = true;
      this.show(res, label);
    },
    // the check's own audio as a lossless WAV (quiet, ah, ee, sentence with short gaps), only when you ask for it
    save() {
      const L = this.last; if (!L) return;
      const gap = new Float32Array(Math.round(L.sr * 0.3)), parts = [];
      for (const st of this.STEPS) parts.push(L.seg[st.k] || new Float32Array(0), gap);
      saveWav(parts, L.sr, 'voicetrainer-mic-check');
    },
    show(res, label) {
      const list = $('mc-list');
      if (!res) { list.hidden = false; list.innerHTML = '<li><span></span><span>Something went wrong reading the check. Try again.</span></li>'; return; }
      const ic = { good: '✓', warn: '!', bad: '✕' }, main = res.checks.find(c => c.id === res.main && c.level !== 'good');
      list.innerHTML = '';
      const head = document.createElement('li'); head.className = 'mc-main-li';
      head.innerHTML = `<span></span><p class="mc-main">${main ? 'Most likely limit: ' + escapeHtml(main.title.toLowerCase()) : 'Nothing here limits your readings.'}</p>`;
      list.appendChild(head);
      const order = { bad: 0, warn: 1, good: 2 };
      for (const c of res.checks.slice().sort((a, b) => order[a.level] - order[b.level])) {
        const li = document.createElement('li'); li.className = c.level;
        li.innerHTML = `<span class="mc-ic" aria-label="${c.level === 'good' ? 'fine' : c.level === 'warn' ? 'worth a look' : 'problem'}">${ic[c.level]}</span><div><b>${escapeHtml(c.title)}</b><span class="mc-say"></span></div>`;
        shortWithInfo(li.querySelector('.mc-say'), c.say, c.title);
        list.appendChild(li);
      }
      const d = res.data, foot = document.createElement('li');
      foot.innerHTML = `<span></span><span class="mc-say">${escapeHtml(label || 'Microphone')} · ${Math.round(d.sr / 100) / 10} kHz sampling${d.f0 ? ` · pitch ${d.f0} Hz` : ''} · <button type="button" class="linkish" id="mc-save">Save the recording</button></span>`;
      list.appendChild(foot);
      $('mc-save').onclick = () => this.save();
      list.hidden = false;
    },
  };
  // ---- "Check my readings" (Settings): one vowel held eight ways, then D.readingsCheck ----
  function saveWav(parts, sr, name) {
    const n = parts.reduce((a, x) => a + x.length, 0), b = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (o, t) => { for (let i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
    let o = 44; for (const x of parts) for (let i = 0; i < x.length; i++, o += 2) b.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    a.download = `${name}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.wav`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // Self-paced: each step records from your first sound, coaches you live (same note? brighter than dark? airy enough?)
  // and waits for Next, so nothing moves on before you do. Redo throws the step away. The last KEEP seconds of a step
  // are what's analysed, so a slow start or a correction partway through doesn't count against you.
  const ReadCheck = {
    KEEP: 4, MIN: 2.5, // s: analysed tail of a step; sound needed before Next is offered as done
    steps(nm) {
      return [
        { k: 'dark', say: `Hold ${nm} as dark and big as you can: larynx low, think big dog. Use a note in the middle of your range: this is your first note, and later you'll go 4 notes below and about 7 above it.` },
        { k: 'mid', say: `Hold ${nm} in your everyday voice, on the same note.`, note: true },
        { k: 'bright', say: `Hold ${nm} as bright and small as you can: larynx high, think small dog. Same note.`, note: true },
        { k: 'low', say: `Everyday ${nm}, on a lower note: at least 4 notes down from your first.` },
        { k: 'high', say: `Everyday ${nm}, on a clearly higher note: about 7 notes up from your first (5 at least), the jump at the start of "Twinkle, twinkle".` },
        { k: 'again', say: `Everyday ${nm} on your first note, once more.`, note: true },
        { k: 'airy', say: `Everyday ${nm} on your first note, with lots of air leaking through: a tired sigh with the voice still on. You should hear a hiss of breath over the note, and run out of air sooner.`, note: true },
        { k: 'whisper', say: `Whisper ${nm}: no tone at all.` },
      ];
    },
    on: false, stopAsked: false,
    // live coaching for one step from what has been heard so far: { ok, say }
    coach(st, m, ref) {
      const semi = (a, b) => 12 * Math.log2(a / b), R = Math.round;
      if (st.k === 'whisper') return m.voiced > 0.3 ? { ok: false, say: 'There is still tone in it: let the voice go, just air.' } : { ok: true, say: 'Reads as air. ✓' };
      const first = ref.dark && ref.dark.f0;
      if (!m.f0 && !(st.k === 'airy' && (m.air || Number.isFinite(m.breath)))) return { ok: false, say: 'Listening…' };
      if (st.note && first && m.f0 && Math.abs(semi(m.f0, first)) > 2) return { ok: false, say: `You're ${R(Math.abs(semi(m.f0, first)))} notes ${m.f0 > first ? 'above' : 'below'} your first note (${D.hzToNote(first)}): ${m.f0 > first ? 'come down' : 'go up'} a little.` };
      if (st.k === 'low' && first && semi(first, m.f0) < 4) return { ok: false, say: `${R(Math.max(0, semi(first, m.f0)))} notes below your first: go lower, 4 or more.` };
      if (st.k === 'high' && first && semi(m.f0, first) < 5) return { ok: false, say: `${R(Math.max(0, semi(m.f0, first)))} notes above your first: go higher, about 7 (${D.hzToNote(first * Math.pow(2, 7 / 12))}).` };
      if (st.k === 'airy') {
        const clear = ref.mid && ref.mid.breath;
        if (m.air) return { ok: true, say: 'Very airy, too little tone to read. That counts. ✓' };
        if (!Number.isFinite(m.breath)) return { ok: false, say: 'Listening…' };
        // the same rule as the result (D.readingsCheck): 15 more, or 8 more with a softer tone (H1-H2 up 4 dB on the same note)
        const softer = ref.mid && Number.isFinite(ref.mid.h1h2) && Number.isFinite(m.h1h2) && m.f0 && ref.mid.f0 && Math.abs(semi(m.f0, ref.mid.f0)) <= 2 && m.h1h2 >= ref.mid.h1h2 + 4;
        if (Number.isFinite(clear) && m.breath < clear + 15 && !(softer && m.breath >= clear + 8)) return { ok: false, say: `Breathiness ${R(m.breath)}, everyday was ${R(clear)}: more air. Let the breath hiss through the note, like a tired sigh.` };
        return { ok: true, say: `Breathiness ${R(m.breath)}${Number.isFinite(clear) ? `, everyday was ${R(clear)}` : ''}. Airy enough. ✓` };
      }
      if (m.resN < 8) return { ok: false, say: `${D.hzToNote(m.f0)} · no steady resonance reading yet: hold it still, with a clear tone.` };
      const at = `${D.hzToNote(m.f0)} · resonance ${R(m.res)}`;
      if (st.k === 'bright' && ref.dark && Number.isFinite(ref.dark.res) && m.res < ref.dark.res + 6) return { ok: false, say: `${at}, dark was ${R(ref.dark.res)}: brighter if you can (smile, larynx up, small dog).` };
      if (st.k === 'mid' && ref.dark && Number.isFinite(ref.dark.res) && m.res < ref.dark.res - 3) return { ok: false, say: `${at}: darker than your dark step (${R(ref.dark.res)}). Relax into your everyday voice.` };
      if (st.k === 'dark') { // the first note sets the low and high steps: say where they'll land, so a too-low start can be redone now
        const n = (k) => D.hzToNote(m.f0 * Math.pow(2, k / 12));
        return { ok: true, say: `${at}. ✓ Your first note is ${D.hzToNote(m.f0)}: later you'll go down to about ${n(-4)} and up to ${n(7)}. Too low or high to reach those? Redo on a different note.` };
      }
      return { ok: true, say: `${at}. ✓` };
    },
    async start() {
      if (this.on) return;
      stop(); if (Run.on) cancelRun(); if (MicCheck.on) return;
      const list = $('rc-list'), run = $('rc-run'), step = $('rc-step'), phase = $('rc-phase'), live = $('rc-pitch'), prog = $('rc-prog'), btn = $('rc-start');
      const next = $('rc-next'), redo = $('rc-redo');
      const vKey = $('rc-vowel').value, v = D.VOWEL_BY_KEY[vKey], nm = `"${v.cue.split(' ')[0]}"`;
      const STEPS = this.steps(nm);
      list.hidden = true; list.innerHTML = '';
      let s;
      try {
        ensureCtx();
        s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        run.hidden = false; step.textContent = 'The microphone could not be opened. Allow it for this page and try again.'; return;
      }
      this.on = true; this.stopAsked = false; btn.disabled = true; run.hidden = false;
      $('rc-card').classList.add('running');
      const sr = ctx.sampleRate, an = new D.Analyzer(sr), ring = new Float32Array(an.needed), HOP = 1024;
      const src = ctx.createMediaStreamSource(s), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
      mute.gain.value = 0; src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      // the step being recorded: audio from the first sound, and per-frame readings for the coach
      let cur = null;
      const ref = {}; // finished steps' summaries: { f0, res, breath }
      proc.onaudioprocess = (e) => {
        const x = e.inputBuffer.getChannelData(0);
        for (let o = 0; o < x.length; o += HOP) {
          const part = x.subarray(o, Math.min(x.length, o + HOP));
          ring.copyWithin(0, part.length); ring.set(part, ring.length - part.length);
          const fr = an.analyze(ring);
          if (!cur) continue;
          if (!cur.heard && fr.kind === 'silence') continue;
          cur.heard = true;
          cur.chunks.push(new Float32Array(part)); cur.secs += part.length / sr;
          if (fr.kind !== 'silence') cur.lastSound = cur.secs; // pressing Next after a pause must not leave the step silent
          const f = { t: cur.secs, s: fr.kind !== 'silence', v: fr.kind === 'voiced', f0: fr.kind === 'voiced' ? fr.f0 : 0, b: fr.breath, h: fr.breath != null ? fr.h1h2 : null, air: fr.breath == null && !fr.breathUneven && (fr.kind === 'other' || !!fr.whisperF), res: NaN };
          if (fr.kind === 'voiced' && fr.formants && fr.stable) { const fit = D.scoreVowel(fr.formants, v, fr.f0); if (fit.ok && fit.rms < D.HOLD_RMS) f.res = D.resScore(fit.alpha); }
          cur.frames.push(f);
        }
      };
      // what the last 2 s of the step sound like
      const metrics = (frames, win = 2) => {
        // up to your last sound: stopping before pressing Next keeps the reading (and the ✓) you had
        let t1 = 0; for (let j = frames.length - 1; j >= 0; j--) if (frames[j].s) { t1 = frames[j].t; break; }
        const w = frames.filter(f => f.t > t1 - win && f.t <= t1 + 0.05);
        const f0 = w.filter(f => f.f0).map(f => f.f0), res = w.map(f => f.res).filter(Number.isFinite), br = w.map(f => f.b).filter(b => b != null);
        const h12 = w.map(f => f.h).filter(Number.isFinite);
        const air = w.filter(f => f.air).length;
        return { f0: f0.length >= 5 ? D.median(f0) : 0, res: res.length ? D.median(res) : NaN, resN: res.length, breath: br.length >= 5 ? D.median(br) : NaN, h1h2: h12.length >= 5 ? D.median(h12) : NaN,
          air: air >= 20 && air >= 2 * br.length, voiced: w.length ? f0.length / w.length : 0 };
      };
      const segs = {};
      const tail = (c) => { // the last KEEP seconds of a step's sound (up to its last sound, plus a moment)
        const all = new Float32Array(c.chunks.reduce((n, a) => n + a.length, 0)); let o = 0;
        for (const a of c.chunks) { all.set(a, o); o += a.length; }
        const end = Math.min(all.length, Math.round(((c.lastSound || c.secs) + 0.1) * sr));
        return all.subarray(Math.max(0, end - Math.round(this.KEEP * sr)), end);
      };
      for (let i = 0; i < STEPS.length && !this.stopAsked; i++) {
        const st = STEPS[i];
        step.textContent = st.say; prog.style.width = (100 * i / STEPS.length) + '%';
        $('rc-plan').querySelectorAll('li').forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'cur' : ''; });
        cur = { heard: false, chunks: [], frames: [], secs: 0 };
        let action = null;
        next.onclick = () => { action = 'next'; }; redo.onclick = () => { action = 'redo'; };
        await new Promise(r => {
          const tick = () => {
            if (this.stopAsked) return r();
            if (action === 'redo') { action = null; cur = { heard: false, chunks: [], frames: [], secs: 0 }; }
            if (action === 'next' && cur.secs >= 1) return r();
            action = null;
            const m = metrics(cur.frames), c = cur.heard ? this.coach(st, m, ref) : { ok: false, say: 'Start when you are ready.' };
            const enough = cur.secs >= this.MIN;
            phase.textContent = `Step ${i + 1} of ${STEPS.length}` + (!cur.heard ? ' · your turn' : enough && c.ok ? ' · got it' : ' · listening');
            phase.classList.toggle('now', cur.heard);
            live.textContent = c.say;
            live.classList.toggle('ok', enough && c.ok);
            next.disabled = cur.secs < 1;
            next.textContent = enough && c.ok ? (i < STEPS.length - 1 ? 'Next step' : 'See results') : 'Next anyway';
            next.classList.toggle('primary', enough && c.ok);
            redo.hidden = !cur.heard;
            setTimeout(tick, 150);
          };
          tick();
        });
        if (this.stopAsked) break;
        segs[st.k] = tail(cur);
        const m = metrics(cur.frames, this.KEEP); ref[st.k] = { f0: m.f0, res: m.res, breath: m.breath, h1h2: m.h1h2 };
        cur = null;
      }
      cur = null; proc.onaudioprocess = null; next.onclick = redo.onclick = null;
      try { src.disconnect(); proc.disconnect(); mute.disconnect(); } catch (e) {}
      s.getTracks().forEach(t => t.stop());
      this.on = false; btn.disabled = false; run.hidden = true; live.textContent = '';
      $('rc-card').classList.remove('running'); $('rc-plan').querySelectorAll('li').forEach(li => { li.className = ''; });
      if (this.stopAsked) { btn.textContent = 'Start the check'; return; }
      const seg = Object.fromEntries(STEPS.map(st => [st.k, segs[st.k] || new Float32Array(0)]));
      this.last = { seg, sr, steps: STEPS, vowel: vKey };
      let res = null;
      try { res = D.readingsCheck(seg, sr, vKey); } catch (e) { console.error(e); }
      btn.textContent = 'Run it again';
      this.show(res, nm);
    },
    save() {
      const L = this.last; if (!L) return;
      const gap = new Float32Array(Math.round(L.sr * 0.3)), parts = [];
      for (const st of L.steps) parts.push(L.seg[st.k] || new Float32Array(0), gap);
      saveWav(parts, L.sr, `voicetrainer-readings-check-${L.vowel}`);
    },
    show(res, nm) {
      const list = $('rc-list');
      list.hidden = false;
      if (!res) { list.innerHTML = '<li><span></span><span>Something went wrong reading the check. Try again.</span></li>'; return; }
      const ic = { good: '✓', warn: '!', bad: '✕' };
      list.innerHTML = '';
      const head = document.createElement('li');
      head.innerHTML = `<span></span><p class="mc-main">${res.passed} of ${res.checks.length} checks passed${res.passed === res.checks.length ? ': the readings follow what you do.' : '.'}</p>`;
      list.appendChild(head);
      for (const c of res.checks) {
        const li = document.createElement('li'); li.className = c.level;
        li.innerHTML = `<span class="mc-ic" aria-label="${c.level === 'good' ? 'passed' : c.level === 'warn' ? 'partly' : 'failed'}">${ic[c.level]}</span><div><b>${escapeHtml(c.title)}</b><span class="mc-say"></span></div>`;
        shortWithInfo(li.querySelector('.mc-say'), c.say, c.title);
        list.appendChild(li);
      }
      const names = { dark: 'Dark', mid: 'Everyday', bright: 'Bright', low: 'Low note', high: 'High note', again: 'Everyday again', airy: 'Airy', whisper: 'Whisper' };
      const rows = D.RC_STEPS.map(k => {
        const d = res.data[k];
        if (!d) return `<tr><td>${names[k]}</td><td colspan="4">not heard</td></tr>`;
        return `<tr><td>${names[k]}</td><td>${d.f0 && d.voiced >= 20 ? d.f0 : '--'}</td><td>${d.res != null ? d.res : '--'}</td><td class="rc-f">${d.F ? d.F.join('/') : '--'}</td><td>${d.airy ? 'air' : d.breath != null ? d.breath : '--'}</td></tr>`;
      }).join('');
      const foot = document.createElement('li');
      foot.innerHTML = `<span></span><div><table class="rc-steps"><thead><tr><th>Step</th><th>Hz</th><th>Score</th><th>F1/F2/F3 Hz</th><th>Breath</th></tr></thead><tbody>${rows}</tbody></table>`
        + `<p class="mc-say">Vowel ${escapeHtml(nm)} · ${Math.round(this.last.sr / 100) / 10} kHz · <button type="button" class="linkish" id="rc-save">Save the recording</button>${infoHtml('What the table shows', 'Score is the resonance score (men avg ' + Math.round(D.RES_AVG.masc) + ', women avg ' + Math.round(D.RES_AVG.fem) + ') from steady moments only. F1 to F3 are the formants in Hz the score was read from: compare them with Praat to check the app. Breath is breathiness 0 to 100; "air" means too little tone to read.')}</p></div>`;
      list.appendChild(foot);
      $('rc-save').onclick = () => this.save();
    },
  };
  function setMode(m) {
    if (!['home', 'readings', 'freestyle', 'practice', 'sing', 'settings'].includes(m)) m = 'home';
    if (m !== 'sing' && Sing.on) Sing.finish();
    if (m !== 'sing') Sing.leave();
    if (m !== 'freestyle') Free.end();
    if (m !== 'practice' && exMode === 'hold') stopExample();
    mode = m;
    document.body.dataset.mode = m;
    if (m === 'sing') Sing.enter();
    for (const el of document.querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(m);
    for (const b of document.querySelectorAll('#modes [data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === m));
    if (m !== 'readings' && Reader.open) { cancelRun(); Reader.hide(); }
    if (m === 'home') renderHome();
    if (m === 'settings') { paintDrive(); paintPitchRange(); requestAnimationFrame(() => SpecPreview.draw()); }
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
    const [rlo, rhi] = target(); $('res-band-label').textContent = `goal ${rlo}-${Math.min(rhi, 100)}`;
    drawPitch(); drawRes(); paintPitchRange();
    if (Free.cur && !Free.on) showFreeReview(Free.cur); // its goal bands
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
  // Builds an info badge (see initInfoBadges) for text made in code; returns a fragment to append.
  let infoSeq = 0;
  function infoBadge(label, text) {
    const id = 'info-dyn-' + (++infoSeq), f = document.createDocumentFragment();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'info-btn inline'; b.dataset.info = '';
    b.setAttribute('aria-controls', id); b.setAttribute('aria-describedby', id); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', label);
    b.textContent = 'i';
    const s = document.createElement('span');
    s.className = 'info-pop'; s.id = id; s.setAttribute('role', 'note'); s.hidden = true; s.textContent = text;
    f.append(b, s);
    return f;
  }
  // Same badge as an HTML string, for templates; html must already be escaped.
  function infoHtml(label, html) {
    const id = 'info-dyn-' + (++infoSeq);
    return `<button type="button" class="info-btn inline" data-info aria-controls="${id}" aria-describedby="${id}" aria-expanded="false" aria-label="${escapeHtml(label)}">i</button><span class="info-pop" id="${id}" role="note" hidden>${html}</span>`;
  }
  // Shows the first sentence of a long explanation and tucks the rest behind an info badge.
  function shortWithInfo(el, text, label) {
    const t = String(text || ''), m = t.match(/^[\s\S]+?[.!?](?=\s+[A-Z"“(])/);
    el.textContent = m ? m[0] : t;
    const rest = m ? t.slice(m[0].length).trim() : '';
    if (rest) el.append(infoBadge(label, rest));
  }
  // Info badges: <button class="info-btn" data-info aria-controls="X"> next to a short line opens the
  // longer text in <span class="info-pop" id="X">. Tap or click toggles it, a mouse hover or keyboard
  // focus shows it, tapping elsewhere or Esc closes it. It floats (position: fixed) and is kept inside
  // the screen. Delegated, so badges added later (drill panels, results) work too.
  // Footer build id: tap to copy it into a report. On the hosted page, check version.json (never from cache)
  // on open and when the app comes back to the front, and offer a reload when a newer deploy is out.
  function initBuildLine() {
    const btn = $('build-id'), label = D.buildLabel(D.APP_BUILD, D.APP_BUILT);
    if (!btn) return;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      const text = D.APP_BUILD === 'dev' ? 'VoiceTrainer dev' : `VoiceTrainer ${D.APP_BUILD} (${D.APP_BUILT})`;
      const done = (ok) => { btn.textContent = ok ? 'Copied' : text; setTimeout(() => { btn.textContent = label; }, ok ? 1200 : 4000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    });
    if (D.APP_BUILD === 'dev' || !/^https?:$/.test(location.protocol) || typeof fetch !== 'function') return;
    let last = 0;
    const check = () => {
      if (Date.now() - last < 10 * 60e3) return;
      last = Date.now();
      fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
        .then(v => { if (D.newerBuild(D.APP_BUILD, v)) $('build-new').hidden = false; }).catch(() => {});
    };
    check();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    // The service worker may still hold the old page: ask it to update first, then reload.
    $('build-reload').addEventListener('click', () => {
      const sw = navigator.serviceWorker;
      (sw ? sw.getRegistration().then(r => r && r.update()).catch(() => {}) : Promise.resolve()).then(() => location.reload());
    });
  }
  function initInfoBadges() {
    let open = null, pinned = false, hoverT = 0, quiet = false;
    const popOf = (b) => document.getElementById(b.getAttribute('aria-controls'));
    const place = () => {
      if (!open) return;
      if (!open.isConnected || !popOf(open)) { close(); return; }
      const p = popOf(open), r = open.getBoundingClientRect(), m = 12;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const nav = document.querySelector('nav.modes'), nr = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect() : null;
      const bottom = (nr && nr.top > vh / 2 ? nr.top : vh) - m;
      if (r.bottom < 0 || r.top > vh) { close(); return; }
      const w = p.offsetWidth, h = p.offsetHeight;
      const left = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, vw - w - m));
      let top = r.bottom + 8;
      if (top + h > bottom && r.top - 8 - h >= m) top = r.top - 8 - h;
      p.style.left = left + 'px'; p.style.top = Math.max(m, Math.min(top, bottom - h)) + 'px';
    };
    const close = () => {
      if (!open) return;
      const p = popOf(open); if (p) p.hidden = true;
      open.setAttribute('aria-expanded', 'false'); open = null; pinned = false;
    };
    const show = (b, pin) => {
      clearTimeout(hoverT);
      if (open && open !== b) close();
      const p = popOf(b); if (!p) return;
      p.hidden = false; b.setAttribute('aria-expanded', 'true'); open = b; pinned = pinned || pin;
      place();
    };
    const badge = (t) => t && t.closest && t.closest('.info-btn[data-info]');
    document.addEventListener('click', (e) => {
      const b = badge(e.target);
      if (b) { e.preventDefault(); e.stopPropagation(); if (open === b && pinned) close(); else show(b, true); return; }
      if (open && !(popOf(open) && popOf(open).contains(e.target))) close();
    }, true);
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = badge(e.target);
      if (b) show(b, false);
      else if (open && popOf(open) && popOf(open).contains(e.target)) clearTimeout(hoverT);
    });
    document.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse' || !open || pinned || !popOf(open)) return;
      const to = e.relatedTarget;
      if (to && (open.contains(to) || popOf(open).contains(to))) return;
      if (badge(e.target) || popOf(open).contains(e.target)) { clearTimeout(hoverT); hoverT = setTimeout(close, 250); }
    });
    document.addEventListener('focusin', (e) => {
      if (quiet) return;
      const b = badge(e.target);
      if (b && b.matches(':focus-visible')) show(b, false);
      else if (open && e.target !== open && !(popOf(open) && popOf(open).contains(e.target))) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !open) return;
      const b = open; close(); quiet = true; b.focus({ preventScroll: true }); quiet = false; e.stopPropagation();
    }, true);
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place);
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
      // (only after some speech since the last snap, so silence before you start never moves it)
      const pause = this.tracker.silentMs > 450;
      if (pause && !this.wasPause && this.tracker.heard > 0) this.resync();
      this.wasPause = pause;
      // a focus spot scores itself once the last word is reached and the voice stops
      if (Run.on && Spot.cur && this.idx >= this.words.length - 1 && this.tracker.silentMs > 900 && Run.frames.some(f => f.f0 > 0)) finishSpot();
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
      if (!fromVoice) { this.base = this.cum[i] - this.tracker.count; this.tracker.mark(); }
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
      const who = this.synth && this.synth.who || 'demo voice';
      $('rh-hint').textContent = this.synth ? (!this.synth.src ? `Getting the ${RefRead.whoFor(this.current)} ready…` : state.running === 'mic' ? `The ${who} is reading. The microphone hears it from the speakers, so the meters show it; it does not count toward your progress.` : `The ${who} is reading, and the meters are measuring it live. It does not count toward your progress. Reference under Readings shows its pitch and resonance word by word.`)
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
      if (DemoVoice.get().read !== 'speech' || !S || !window.SpeechSynthesisUtterance) return this.listenSynth();
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
    // The synthetic demo voice reads the passage through the analyser, so every meter tracks it like microphone
    // input (with the microphone on, the microphone hears it from the speakers instead); the highlight follows
    // the word timings it was made with. Nothing it does is scored as you.
    listenSynth() {
      const t = this.current; if (!t || !this.words.length) return;
      ensureCtx();
      const start = this.idx >= this.words.length - 1 ? 0 : this.idx;
      const sy = this.synth = { src: null, room: null, raf: 0 };
      this.setListenButton(true);
      $('rh-hint').textContent = `Getting the ${RefRead.whoFor(t)} ready…`;
      if (state.running !== 'mic') { $('ro-pitch').textContent = '--'; $('ro-vowel').textContent = '--'; state.meter = NaN; }
      setTimeout(() => { // let the hint show: making a long passage takes about a second
        if (this.synth !== sy) return;
        RefRead.audio(t, ctx.sampleRate).then(c => {
        if (this.synth !== sy) return;
        const ab = ctx.createBuffer(1, c.x.length, c.fs); ab.copyToChannel(c.x, 0);
        const src = ctx.createBufferSource(); src.buffer = ab; sy.src = src;
        src.connect(ctx.destination);
        if (state.running !== 'mic') { src.connect(analyser); an.reset(); }
        if (!c.voice.clip && Synth.getStyle() === 'natural') { const r = roomFor(ctx.sampleRate); src.connect(r.input); r.output.connect(ctx.destination); sy.room = r; }
        const off = Math.max(0, c.starts[start] - 0.1), t0 = ctx.currentTime - off;
        src.onended = () => { if (this.synth === sy) this.stopListen(true); };
        if (ctx.state === 'suspended') ctx.resume();
        src.start(0, off);
        sy.who = RefRead.who(c);
        if (!state.running) setStatus((c.voice.clip ? 'Neural voice' : 'Demo voice') + ' reading ' + t.title, true);
        this.paint();
        this.go(start, false);
        const follow = () => {
          if (this.synth !== sy) return;
          sy.raf = requestAnimationFrame(follow);
          const now = ctx.currentTime - t0;
          let i = this.idx;
          while (i + 1 < c.starts.length && c.starts[i + 1] <= now) i++;
          if (i !== this.idx) this.go(i, false);
        };
        follow();
        ensureLoop();
        });
      }, 30);
    },
    stopListen(finished) {
      if (!this.tts && !this.synth) return;
      if (this.synth) {
        const sy = this.synth; this.synth = null;
        cancelAnimationFrame(sy.raf);
        if (sy.src) { try { sy.src.onended = null; sy.src.stop(); } catch (e) {} try { sy.src.disconnect(); } catch (e) {} }
        if (sy.room) setTimeout(() => { try { sy.room.output.disconnect(); } catch (e) {} }, 600);
        if (!state.running) setStatus(finished ? (sy.who === 'neural voice' ? 'Neural voice finished' : 'Demo voice finished') : 'Not listening');
        if (an && state.running !== 'mic') an.reset();
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
      $('reader-more').hidden = !sheet;
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
      endSpots();
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
      }
      $('reader-restart').addEventListener('click', () => this.restart());
      $('reader-pick').addEventListener('change', (e) => { endSpots(); this.pick(e.target.value); if (Run.on) { if (this.current && this.current.id === e.target.value) beginRun(); else cancelRun(); } });
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
    initSpecPick(); applySpecTheme(Data.setting('specTheme') || 'classic');
    const g = Data.setting('goal') || 'fem';
    $('goal-fem').addEventListener('click', () => setGoal('fem'));
    $('goal-masc').addEventListener('click', () => setGoal('masc'));
    for (const k of ['system', 'light', 'dark']) $('theme-' + k).addEventListener('click', () => { applyTheme(k); Data.setting('theme', k); });
    // The shared theme switch in the header (general/shared/theme-switch.js)
    document.addEventListener('petravanta:themechange', (e) => { applyTheme(e.detail.mode); Data.setting('theme', e.detail.mode); });
    $('settings-voice').addEventListener('click', () => $('btn-demo-set').click());
    $('mc-start').addEventListener('click', () => MicCheck.start());
    $('rc-start').addEventListener('click', () => ReadCheck.start());
    $('rc-stop').addEventListener('click', () => { ReadCheck.stopAsked = true; });
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
    Clips.index().then(ix => { if (ix) { renderReadings(); DemoVoice.paint(); } }); // the neural voice, where this copy of the page can load it
    $('btn-stop').addEventListener('click', stop);
    $('file-in').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) playFile(f); e.target.value = ''; });
    $('btn-reset').addEventListener('click', () => { session = newSession(); resetSessionViews(); });
    $('sess-vmap').addEventListener('click', (e) => { const g = e.target.closest('[data-vm]'); const def = g && DRILLS.vowels.find(d => d.vowel === g.dataset.vm); if (def) openDrill(def); });
    for (const t of ['vowels', 'sibilants', 'words', 'breath', 'control', 'whisper', 'embody', 'prosody']) $('tab-' + t).addEventListener('click', () => { state.tab = t; renderDrillGrid(); });
    initSpecHelp(); initTractHelp(); initInfoBadges(); initBuildLine();
    { const h = $('info-fo-live'); if (h) h.textContent = FO_HELP; }
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-fo]'); if (b) setFoFocus(b.dataset.fo); });
    paintFo($('fo-live'), null);
    readTheme();
    setGoal(g === 'masc' ? 'masc' : 'fem', true);
    renderDrillGrid();
    renderSession();
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { clearSpec(); SpecPreview.draw(); drawVowelChart(); drawPitch(); drawHistory(); renderTractLive(); paintDots(); Sing.draw(); if (state.coach) renderCoach(); tvyDraw(TvY.drill); tvyDraw(TvY.spot); }, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawVowelChart(); drawPitch(); clearSpec(); });
    Reader.init();
    Sing.init();
    Texts.sync();
    renderReadings(); renderPracticeHistory(); renderDrillGrid();
    setMode('home');
  }
  init();

  // test hook for automated checks
  window.__vt = { onFrame, state, sessionStats, Sing, showReadingResult, startReading, finishReading, get runFrames() { return Run.frames; }, get readerWords() { return Reader.words.map(w => w.text); }, get analyzer() { return an; }, setAnalyzer(a) { an = a; }, get tvyDrill() { return TvY.drill; } };
})();
