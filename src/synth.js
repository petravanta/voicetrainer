/* Simple source-filter voice synthesizer, used for the in-app demo voice and the tests. */
(function (root) {
  'use strict';

  function resonate(x, fs, f, bw) {
    const r = Math.exp(-Math.PI * bw / fs), c = 2 * r * Math.cos(2 * Math.PI * f / fs), r2 = r * r;
    const g = 1 - c + r2;
    let y1 = 0, y2 = 0;
    for (let n = 0; n < x.length; n++) {
      const y = g * x[n] + c * y1 - r2 * y2;
      y2 = y1; y1 = y; x[n] = y;
    }
  }

  // Lehmer RNG so tests are repeatable.
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 48271) % 2147483647) / 2147483647; }

  // Sustained vowel. F = [F1, F2, F3]; F4/F5 follow F3.
  function vowel(fs, dur, f0, F, opts = {}) {
    const n = Math.round(fs * dur), x = new Float32Array(n), rand = rng(opts.seed || 7);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const f = f0 * (1 + 0.012 * Math.sin(2 * Math.PI * 5 * t)) * (1 + 0.004 * (rand() - 0.5));
      phase += f / fs;
      if (phase >= 1) phase -= 1;
      // Rosenberg glottal pulse: open 40%, closing 16%
      const op = 0.4, cl = 0.16;
      let g = 0;
      if (phase < op) g = 0.5 * (1 - Math.cos(Math.PI * phase / op));
      else if (phase < op + cl) g = Math.cos(0.5 * Math.PI * (phase - op) / cl);
      x[i] = g + 0.01 * (rand() - 0.5);
    }
    for (let i = n - 1; i > 0; i--) x[i] -= x[i - 1]; // lip radiation
    const bws = [70, 100, 140, 200, 250];
    const all = [F[0], F[1], F[2], F[3] || F[2] * 1.22 + 250, F[4] || F[2] * 1.38 + 500];
    for (let k = 0; k < all.length; k++) if (all[k] < fs / 2 - 100) resonate(x, fs, all[k], bws[k]);
    return normalize(x, opts.level || 0.3, fs);
  }

  // Sibilant: noise shaped around a spectral peak.
  function sibilant(fs, dur, peak, opts = {}) {
    const n = Math.round(fs * dur), x = new Float32Array(n), rand = rng(opts.seed || 11);
    for (let i = 0; i < n; i++) x[i] = rand() * 2 - 1;
    resonate(x, fs, Math.min(peak, fs / 2 - 200), peak * 0.3);
    resonate(x, fs, Math.min(peak, fs / 2 - 200), peak * 0.3);
    // mild high-pass to remove low-frequency energy
    let prev = 0;
    for (let i = 0; i < n; i++) { const v = x[i]; x[i] = v - 0.95 * prev; prev = v; }
    return normalize(x, opts.level || 0.12, fs, STYLE === 'natural' ? 0.035 : 0.02);
  }

  // A hiss whose centre moves: peak(t) gives it in Hz at t seconds (the /s/-/ʃ/ glide in Practice > Sibilants).
  function sibilantGlide(fs, dur, peak, opts = {}) {
    const n = Math.round(fs * dur), x = new Float32Array(n), rand = rng(opts.seed || 13), bw = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = rand() * 2 - 1;
    const track = (i) => Math.min(peak(i / fs), fs / 2 - 200);
    for (let i = 0; i < n; i++) bw[i] = track(i) * 0.3;
    resonateArr(x, fs, track, bw); resonateArr(x, fs, track, bw);
    let prev = 0;
    for (let i = 0; i < n; i++) { const v = x[i]; x[i] = v - 0.95 * prev; prev = v; }
    return normalize(x, opts.level || 0.12, fs, 0.03);
  }
  // Demo of a sibilant exercise (def.kind glide, ladder or pairs) at the typical values of the goal.
  // o.sh / o.s: the hiss centres to use instead (Hz); o.flat: a ladder that doesn't move.
  function sibExercise(fs, def, goal, VOWELS, SIBILANTS, o = {}) {
    const g = goal === 'fem' ? 'W' : 'M', s = o.s || SIBILANTS.s[g], sh = o.sh || SIBILANTS.sh[g], gap = silence(fs, 0.45), lead = silence(fs, 0.12);
    if (def.kind === 'glide') {
      // s, slide to sh, hold, slide back, twice, ending on s
      const hold = 0.35, slide = 0.7, seg = [[s, s, hold]];
      for (let k = 0; k < 2; k++) seg.push([s, sh, slide], [sh, sh, hold], [sh, s, slide], [s, s, hold]);
      const T = seg.reduce((a, q) => a + q[2], 0);
      const peak = (t) => {
        for (const [a, b, d] of seg) { if (t <= d) { const u = (1 - Math.cos(Math.PI * t / d)) / 2; return Math.exp(Math.log(a) + u * Math.log(b / a)); } t -= d; }
        return s;
      };
      return concat([lead, sibilantGlide(fs, T, peak), lead]);
    }
    if (def.kind === 'ladder') {
      const k = (def.rungs || []).length || 3, S = SIBILANTS[def.sib || 'sh'], fem = goal === 'fem';
      // from typical masculine to a little past typical feminine (or back, for a masculine goal)
      const lo = S.M * 0.97, hi = S.W * 1.03, parts = [lead];
      for (let i = 0; i < k; i++) {
        const u = o.flat ? 0.5 : (fem ? i : k - 1 - i) / Math.max(1, k - 1);
        parts.push(sibilant(fs, 0.9, Math.exp(Math.log(lo) + u * Math.log(hi / lo)), { level: 0.12, seed: 21 + i }), gap);
      }
      return concat(parts);
    }
    // pairs: "sip, ship" three times
    const SIB = { s: { ...SIBILANTS.s, [g]: s }, sh: { ...SIBILANTS.sh, [g]: sh } };
    const word = (sib, cue) => example(fs, { type: 'word', sib, vowel: 'I', cue }, goal, VOWELS, SIB);
    const parts = [lead];
    for (let i = 0; i < 3; i++) parts.push(word('s', 'sip'), word('sh', 'ship'));
    return concat(parts);
  }

  function silence(fs, dur) { return new Float32Array(Math.round(fs * dur)); }

  function normalize(x, level, fs, rampSec = 0.02) {
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    const g = level / Math.sqrt(e / x.length || 1);
    const ramp = Math.max(1, Math.round(fs * rampSec));
    for (let i = 0; i < x.length; i++) {
      const env = Math.min(1, i / ramp, (x.length - 1 - i) / ramp);
      x[i] *= g * env;
    }
    return x;
  }

  function concat(parts) {
    const n = parts.reduce((s, p) => s + p.length, 0), out = new Float32Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // Demo: a few vowels and sibilants, first at typical masculine resonance, then feminine.
  // The natural voice says the demo words three times instead (see demoWords).
  function demo(fs, VOWELS) {
    if (STYLE === 'natural') {
      const parts = [silence(fs, 0.1)];
      [[0, 115, 40], [50, 160, 52], [100, 205, 65]].forEach(([res, pitch, bright], j) => {
        parts.push(demoWords(fs, VOWELS, { pitch, res, bright }, 60 + 40 * j), silence(fs, 0.45));
      });
      return concat(parts);
    }
    const keys = ['i', 'a', 'u', 'E'];
    const parts = [];
    const mix = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
    [[0, 115, 6200], [0.5, 160, 7000], [1, 205, 7800]].forEach(([t, f0, sPeak], j) => {
      parts.push(sibilant(fs, 0.45, sPeak, { seed: 3 + j }), silence(fs, 0.12));
      for (const k of keys) {
        const v = VOWELS.find(q => q.key === k);
        parts.push(vowel(fs, 0.7, f0, mix(v, t), { seed: 5 + j }), silence(fs, 0.15));
      }
      parts.push(silence(fs, 0.3));
    });
    return concat(parts);
  }

  // Demo at chosen settings: o = {pitch (Hz), res (0 = typical masculine, 100 = typical
  // feminine, may go past either end), bright (0..100)}. An s, then four vowels.
  function demoVoice(fs, VOWELS, o) {
    if (STYLE === 'natural') return concat([silence(fs, 0.1), demoWords(fs, VOWELS, o, 5), silence(fs, 0.1)]);
    const t = o.res / 100, b = clamp01(o.bright / 100);
    const mix = (v) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
    const parts = [silence(fs, 0.1), sibilant(fs, 0.45, 6200 + 1600 * Math.max(-0.3, Math.min(1.3, t)), { seed: 3 }), silence(fs, 0.15)];
    ['i', 'a', 'u', 'E'].forEach((k, j) => {
      const v = VOWELS.find(q => q.key === k);
      parts.push(voiced(fs, 0.75, o.pitch * 1.06, o.pitch * 0.92, mix(v), { bright: b, seed: 5 + j, ramp: 0.05 }), silence(fs, 0.18));
    });
    return concat(parts);
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  // The natural demo: the same s and four vowels, said as words in a list ("see, spa, sue, said")
  // instead of held one by one. Each vowel glides in from the s (or p) and, in "said", out to the d;
  // pitch rises on each listed word and falls on the last, around o.pitch. The middle of every vowel
  // sits on its target for about a quarter second, so the analyzer reads the set resonance.
  const DEMO_WORDS = [
    { v: 'i', f0: [0.96, 1.04], dur: 0.4 },
    { v: 'a', f0: [0.97, 1.05], dur: 0.42, p: true },
    { v: 'u', f0: [0.98, 1.07], dur: 0.42 },
    { v: 'E', f0: [1.07, 0.86], dur: 0.36, d: true },
  ];
  function demoWords(fs, VOWELS, o, seed = 5) {
    const t = o.res / 100, b = clamp01(o.bright / 100), tc = Math.max(-0.3, Math.min(1.3, t));
    const mix = (v) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
    const sPeak = 6200 + 1600 * tc, parts = [];
    DEMO_WORDS.forEach((w, j) => {
      const F = mix(VOWELS.find(q => q.key === w.v));
      parts.push(sibilant(fs, j ? 0.17 : 0.2, sPeak, { level: 0.11, seed: seed + 3 * j }));
      if (w.p) parts.push(silence(fs, 0.045), burst(fs, 0.015, 1500, 0.05, seed + 3 * j + 1));
      const from = w.p ? [320, 900, F[2]] : [300, SIB_LOCUS.s, F[2]];
      const x = voicedRun(fs, [{ dur: w.dur, f0a: o.pitch * w.f0[0], f0b: o.pitch * w.f0[1], F, from,
        to: w.d ? [320, 1750, F[2]] : undefined, trans: 0.07, level: 0.3 }], { bright: b, seed: seed + 3 * j + 2, ramp: 0.015 });
      if (!w.d) { // an open syllable fades out over ~90 ms rather than stopping dead
        const k = Math.round(0.09 * fs);
        for (let i = 0; i < k; i++) x[x.length - 1 - i] *= smooth(i / k);
      }
      parts.push(x);
      if (w.d) parts.push(silence(fs, 0.04), burst(fs, 0.025, 3800, 0.05, seed + 3 * j + 1));
      if (j < DEMO_WORDS.length - 1) parts.push(silence(fs, 0.22));
    });
    return concat(parts);
  }

  // ---------- reading a text aloud (for analysis, not intelligibility) ----------
  // Spelling -> rough sound units. English spelling is irregular, so this only aims for plausible
  // vowels, s/sh hiss, nasals and stop gaps with speech-like timing.
  const V_PATTERNS = [['igh', 'a'], ['eau', 'o'], ['ee', 'i'], ['ea', 'i'], ['ie', 'i'], ['ey', 'e'], ['ai', 'e'], ['ay', 'e'], ['ei', 'e'],
    ['oa', 'o'], ['oe', 'o'], ['ow', 'o'], ['ou', 'a'], ['oo', 'u'], ['ue', 'u'], ['ew', 'u'], ['au', 'c'], ['aw', 'c'], ['oi', 'c'], ['oy', 'c'],
    ['er', 'r'], ['ir', 'r'], ['ur', 'r'], ['ar', 'a'], ['or', 'o'], ['a', 'ae'], ['e', 'E'], ['i', 'I'], ['o', 'a'], ['u', 'V']];
  const MAGIC_E = { a: 'e', e: 'i', i: 'a', o: 'o', u: 'u' };
  function wordUnits(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    const out = [];
    if (!w) return out;
    // silent final e makes the previous single vowel long ("made", "time", "hope")
    let magic = null;
    const m = w.match(/^(.*?)([aeiou])([b-df-hj-np-tv-z])e(s|d)?$/);
    if (m && w.length > 3) { magic = m[1].length; w = w.slice(0, m[1].length + 2) + (m[4] || ''); }
    const shortE = /^[b-df-hj-np-tv-z]{1,2}e$/.test(w) && w !== 'the'; // he, she, we, be
    for (let i = 0; i < w.length;) {
      const rest = w.slice(i), c = w[i];
      if (rest.startsWith('sh') || rest.startsWith('ch') || /^ti[oa]/.test(rest)) { out.push({ sib: 'sh' }); i += rest.startsWith('ti') ? 1 : 2; continue; }
      if (rest.startsWith('th')) { out.push({ fric: 1 }); i += 2; continue; }
      if (rest.startsWith('ng')) { out.push({ nasal: 1 }); i += 2; continue; }
      if (c === 'y') {
        if (i === 0 && w.length > 1) { out.push({ glide: 1 }); i++; continue; }
        out.push({ v: i === w.length - 1 && w.length > 2 ? 'i' : 'I' }); i++; continue;
      }
      const vp = 'aeiou'.includes(c) && V_PATTERNS.find(([p]) => rest.startsWith(p));
      if (vp) {
        out.push({ v: magic === i ? MAGIC_E[c] : shortE && i === w.length - 1 ? 'i' : w === 'the' ? 'V' : vp[1] });
        i += vp[0].length;
        continue;
      }
      if (c === 's' || c === 'z' || c === 'x' || (c === 'c' && /[eiy]/.test(w[i + 1] || ''))) out.push({ sib: 's' });
      else if (c === 'j' || (c === 'g' && /[eiy]/.test(w[i + 1] || '') && i > 0)) out.push({ sib: 'sh', short: 1 });
      else if ('mnlrwv'.includes(c)) out.push({ nasal: 1 });
      else if (c === 'f' || c === 'h') out.push({ fric: 1 });
      else out.push({ stop: 1 });
      i += c === w[i + 1] ? 2 : 1; // double letters sound once
    }
    if (!out.some(u => u.v)) out.unshift({ v: 'V' });
    return out;
  }
  // words: array of strings. o = {pitch, res, bright, rate}. Returns the samples and each word's
  // start and end time in seconds.
  function readText(fs, words, VOWELS, o) {
    const t = o.res / 100, b = Math.max(0, Math.min(1, (o.bright ?? 50) / 100)), rate = o.rate || 1;
    const mixV = {};
    for (const v of VOWELS) mixV[v.key] = v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
    const sibPeak = { s: 6200 + 1600 * Math.max(-0.3, Math.min(1.3, t)), sh: 3700 + 800 * Math.max(-0.3, Math.min(1.3, t)) };
    const parts = [silence(fs, 0.15)], starts = [], ends = [];
    let time = 0.15, seed = 41;
    const push = (x) => { parts.push(x); time += x.length / fs; };
    // pitch falls across each sentence and resets after it
    let sentPos = 0, sentLen = 1;
    const sentLenFrom = (i) => { let n = 0; for (let j = i; j < words.length; j++) { n++; if (/[.!?]["')\]]*$/.test(words[j])) break; } return n; };
    for (let wi = 0; wi < words.length; wi++) {
      if (sentPos === 0) sentLen = sentLenFrom(wi);
      const units = wordUnits(words[wi]);
      // o.vowelsOf(word): the word's full vowels from a dictionary ('x' gliding, keep the spelling's guess), so a
      // passage is said with the vowels a reading expects; a syllable past them is unstressed and said as a schwa
      const seq = o.vowelsOf && o.vowelsOf(words[wi]);
      if (seq && seq.length) units.filter(u => u.v).forEach((u, j) => { if (j >= seq.length) u.v = 'V'; else if (seq[j] !== 'x' && mixV[seq[j]]) u.v = seq[j]; });
      const nv = units.filter(u => u.v).length;
      // o.f0At(wordIndex, fractionThroughWord) gives a pitch multiplier for set intonation patterns
      const f0w = o.f0At ? o.pitch * o.f0At(wi, 0) : o.pitch * (1.12 - 0.24 * sentPos / Math.max(1, sentLen - 1 || 1));
      starts.push(time);
      let vi = 0;
      // natural voice: voiced sounds in a row are said as one run (see voicedRun)
      const nat = STYLE === 'natural';
      let run = [];
      const flush = () => { if (run.length) { push(voicedRun(fs, run, { bright: b, seed, ramp: 0.015 })); run = []; } };
      // next to a consonant, F1 falls and F2 leans toward the tongue-tip position (~1700 Hz)
      const edge = (F) => [Math.max(250, F[0] * 0.8), F[1] + 0.25 * (1700 - F[1]), F[2]];
      for (let ui = 0; ui < units.length; ui++) {
        const u = units[ui];
        seed += 7;
        if (nat && (u.v || u.nasal || u.glide)) {
          const voicedU = (q) => q && (q.v || q.nasal || q.glide), prev = units[ui - 1], next = units[ui + 1];
          let seg;
          if (u.v) {
            const F = mixV[u.v] || mixV.V, last = vi === nv - 1, first = vi === 0;
            const dur = (first ? 0.17 : 0.13) * (last && /[.!?,;:]$/.test(words[wi]) ? 1.35 : 1) / rate;
            const fa = o.f0At ? o.pitch * o.f0At(wi, vi / nv) : f0w * (first ? 1.05 : 1);
            const fb = o.f0At ? o.pitch * o.f0At(wi, (vi + 1) / nv) : f0w * (first ? 1.0 : 0.96);
            seg = { dur, f0a: fa, f0b: fb, F, level: 0.3, trans: 0.05 };
            if (prev && !voicedU(prev)) seg.from = edge(F);
            if (next && !voicedU(next)) seg.to = edge(F);
            vi++;
          } else seg = { dur: 0.06 / rate, f0a: f0w, f0b: f0w, F: [300, 1350, 2500], level: 0.12, bws: [90, 200, 250, 300, 350], trans: 0.025 };
          run.push(seg);
          continue;
        }
        flush();
        if (nat && u.stop) { push(concat([silence(fs, 0.036 / rate), burst(fs, 0.014 / rate, 3200, 0.05, seed)])); continue; }
        if (u.v) {
          const F = mixV[u.v] || mixV.V, last = vi === nv - 1, first = vi === 0;
          const dur = (first ? 0.17 : 0.13) * (last && /[.!?,;:]$/.test(words[wi]) ? 1.35 : 1) / rate;
          const fa = o.f0At ? o.pitch * o.f0At(wi, vi / nv) : f0w * (first ? 1.05 : 1);
          const fb = o.f0At ? o.pitch * o.f0At(wi, (vi + 1) / nv) : f0w * (first ? 1.0 : 0.96);
          push(voiced(fs, dur, fa, fb, F, { bright: b, seed, ramp: 0.012, level: 0.3 }));
          vi++;
        } else if (u.sib) push(sibilant(fs, (u.short ? 0.07 : 0.12) / rate, sibPeak[u.sib], { level: 0.11, seed }));
        else if (u.nasal || u.glide) push(voiced(fs, 0.06 / rate, f0w, f0w, [300, 1350, 2500], { level: 0.12, bws: [90, 200, 250, 300, 350], ramp: 0.01, seed }));
        else if (u.fric) push(sibilant(fs, 0.06 / rate, 2000, { level: 0.04, seed }));
        else push(silence(fs, 0.05 / rate));
      }
      flush();
      ends.push(time);
      const wd = words[wi];
      const gap = /[.!?]["')\]]*$/.test(wd) ? 0.45 : /[,;:]["')\]]*$/.test(wd) ? 0.22 : 0.05;
      push(silence(fs, gap / rate));
      sentPos = /[.!?]["')\]]*$/.test(wd) ? 0 : sentPos + 1;
    }
    push(silence(fs, 0.2));
    return { x: concat(parts), starts, ends };
  }

  // ---------- reference examples ----------
  // Voiced segment with gliding pitch and formant transitions: formants move from Fa to F over
  // the first `trans` seconds and from F to Fb over the last `trans` seconds (coarticulation).
  function voiced(fs, dur, f0a, f0b, F, opts = {}) {
    if (STYLE === 'natural' && !opts.classic) return voicedNatural(fs, dur, f0a, f0b, F, opts);
    const n = Math.round(fs * dur), x = new Float32Array(n), rand = rng(opts.seed || 13);
    const trans = opts.trans || 0.07, Fa = opts.from || F, Fb = opts.to || F;
    let phase = 0, lp = 0;
    // a real voice wanders: slow pitch drift, a light vibrato and small loudness changes
    const ph = [0, 0, 0, 0, 0].map(() => rand() * 6.283), t0 = (opts.seed || 13) * 0.37;
    // the closing edge of a real glottal pulse is softer than the model's, so the tone is tilted
    // down a little (darker voices more), which takes the buzz off the upper harmonics
    const tilt = opts.bright == null ? 0.35 : 0.5 - 0.3 * opts.bright;
    for (let i = 0; i < n; i++) {
      const t = i / fs, u = t / dur, tt = t + t0;
      const drift = 0.007 * Math.sin(6.283 * 1.3 * tt + ph[0]) + 0.005 * Math.sin(6.283 * 2.9 * tt + ph[1]) + 0.004 * Math.sin(6.283 * 0.6 * tt + ph[2]);
      const f = (f0a + (f0b - f0a) * u) * (1 + drift + 0.005 * Math.sin(6.283 * 5.2 * t)) * (1 + 0.002 * (rand() - 0.5));
      const amp = 1 + 0.05 * Math.sin(6.283 * 3.1 * tt + ph[3]) + 0.03 * Math.sin(6.283 * 7.3 * tt + ph[4]);
      phase += f / fs; if (phase >= 1) phase -= 1;
      // brightness (0..1) shortens the closing phase, which lifts the upper harmonics
      // breath (0..1) leaves the folds open longer and adds turbulent airflow noise
      const br = opts.breath || 0;
      const op = 0.42 + 0.22 * br, cl = (opts.bright == null ? 0.15 : 0.27 - 0.2 * opts.bright) + 0.12 * br;
      let g = 0;
      if (phase < op) g = 0.5 * (1 - Math.cos(Math.PI * phase / op));
      else if (phase < op + cl) g = Math.cos(0.5 * Math.PI * (phase - op) / cl);
      lp += (1 - tilt) * (g - lp);
      x[i] = amp * (lp + (0.025 + 0.3 * br) * (rand() - 0.5) * (0.25 + g)); // airflow noise, strongest while open
    }
    for (let i = n - 1; i > 0; i--) x[i] -= x[i - 1];
    const at = (k, t) => {
      const a = Fa[k], m = F[k], b = Fb[k];
      if (t < trans) return a + (m - a) * smooth(t / trans);
      if (t > dur - trans) return m + (b - m) * smooth((t - (dur - trans)) / trans);
      return m;
    };
    const F4 = F[2] * 1.22 + 250, F5 = F[2] * 1.38 + 500;
    const tracks = [(t) => at(0, t), (t) => at(1, t), (t) => at(2, t), () => F4, () => F5];
    const bwScale = opts.bright == null ? 1 : 1.35 - 0.6 * opts.bright; // darker voices damp formants more
    const bws = (opts.bws || [70, 100, 140, 200, 250]).map(b => b * bwScale);
    tracks.forEach((tr, k) => { if (tr(0) < fs / 2 - 100) trackResonate(x, fs, tr, bws[k]); });
    return normalize(x, opts.level || 0.3, fs, opts.ramp);
  }
  function smooth(u) { return u * u * (3 - 2 * u); }

  // ---------- natural voice (LF glottal source) ----------
  // The classic voice above is a smooth Rosenberg pulse with almost no cycle-to-cycle variation,
  // which is what makes it sound like a machine. The natural voice uses the Liljencrants-Fant (LF)
  // glottal flow derivative, shaped by one "Rd" number (0.3 pressed .. 1 modal .. 2.7 breathy;
  // Fant 1995), with cycle-to-cycle jitter and shimmer, pitch-synchronous aspiration noise and
  // slow formant flutter. F1-F3 targets are unchanged, so the analyzer reads the same vowels.
  let STYLE = 'classic';
  function setStyle(s) { STYLE = s === 'natural' ? 'natural' : 'classic'; }
  function getStyle() { return STYLE; }
  const LF_N = 1024, lfCache = new Map();
  function lfTable(Rd) {
    Rd = Math.max(0.3, Math.min(2.7, Rd));
    const key = Math.round(Rd * 20);
    if (lfCache.has(key)) return lfCache.get(key);
    Rd = key / 20;
    const Rap = (-1 + 4.8 * Rd) / 100, Rkp = (22.4 + 11.8 * Rd) / 100;
    const Rgp = 0.25 * Rkp / ((0.11 * Rd / (0.5 + 1.2 * Rkp)) - Rap);
    const tp = 1 / (2 * Rgp), te = tp * (1 + Rkp), ta = Rap, tr = 1 - te, wg = Math.PI / tp;
    let eps = 1 / ta;
    for (let k = 0; k < 60; k++) eps = (1 - Math.exp(-eps * tr)) / ta;
    const ex = Math.exp(-eps * tr);
    const ret = -(1 / (eps * ta)) * ((1 - ex) / eps - tr * ex); // area of the return phase (< 0)
    const openArea = (a) => {
      const E0 = -1 / (Math.exp(a * te) * Math.sin(wg * te));
      return E0 * (Math.exp(a * te) * (a * Math.sin(wg * te) - wg * Math.cos(wg * te)) + wg) / (a * a + wg * wg);
    };
    let lo = -30, hi = 300; // the flow must return to zero: open area + return area = 0
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (openArea(m) + ret > 0) lo = m; else hi = m; }
    const a = (lo + hi) / 2, E0 = -1 / (Math.exp(a * te) * Math.sin(wg * te));
    const tab = new Float32Array(LF_N + 1);
    for (let i = 0; i <= LF_N; i++) {
      const t = i / LF_N;
      tab[i] = t <= te ? E0 * Math.exp(a * t) * Math.sin(wg * t) : -(1 / (eps * ta)) * (Math.exp(-eps * (t - te)) - ex);
    }
    const out = { tab, te };
    lfCache.set(key, out);
    return out;
  }
  function gauss(rand) { return (rand() + rand() + rand() - 1.5) * 2; }
  // LF source with jitter, shimmer and aspiration. f0(i) and rd(i) give pitch and voice quality per
  // sample; breath(i) 0..1 adds airflow noise. Returns the glottal flow derivative (lip radiation
  // included), ready for the vocal tract filter.
  function lfSource(fs, n, f0, rd, breath, rand, o = {}) {
    const x = new Float32Array(n), jit = o.jitter ?? 0.006, shim = o.shimmer ?? 0.04;
    let phase = 0, jf = 1, sf = 1, L = lfTable(rd(0)), n1 = 0, n2 = 0;
    for (let i = 0; i < n; i++) {
      phase += f0(i) * jf / fs;
      if (phase >= 1) { // a new glottal cycle: its own period, loudness and pulse shape
        phase -= 1;
        jf = 1 + jit * gauss(rand); sf = 1 + shim * gauss(rand);
        L = lfTable(rd(i));
      }
      const p = phase * LF_N, k = p | 0, fr = p - k;
      const g = L.tab[k] + (L.tab[k + 1] - L.tab[k]) * fr;
      // turbulence at the glottis: high-passed noise, strongest while the folds are open
      const w = rand() - 0.5, hp = w - 0.5 * n1 + 0.1 * n2; n2 = n1; n1 = w;
      const br = breath(i), open = phase < L.te ? 1 : 0.35;
      x[i] = sf * g + (0.05 + 0.9 * br) * open * hp;
    }
    return x;
  }
  // A run of voiced sounds said in one breath (a vowel into an "n", "oo-w-oo"...): voicing and
  // pitch carry on across the joins and formants glide between targets, as in real speech.
  // segs: [{dur, f0a, f0b, F, level?, bws?, from?, to?}]. o: {bright, breath, seed, trans, ramp}.
  function voicedRun(fs, segs, o = {}) {
    const ns = segs.map(s => Math.round(fs * s.dur)), N = ns.reduce((a, b) => a + b, 0);
    const rand = rng((o.seed || 13) * 31 + 7), t0 = (o.seed || 13) * 0.37, dur = N / fs;
    const ph = [0, 0, 0, 0, 0, 0, 0, 0].map(() => rand() * 6.283);
    const br = o.breath || 0;
    // brighter voices close the folds faster (lower Rd); breathy ones stay open longer
    const rd0 = Math.min(2.7, (o.bright == null ? 0.95 : 1.4 - 0.9 * o.bright) + 1.4 * br);
    const bwScale = (o.bright == null ? 1 : 1.3 - 0.5 * o.bright) * (1 + 0.4 * br);
    const f0 = new Float32Array(N), Ft = [0, 1, 2].map(() => new Float32Array(N)), bw = [0, 1, 2, 3, 4].map(() => new Float32Array(N));
    const start = [];
    let off = 0;
    segs.forEach((s, j) => {
      start.push(off);
      const prev = segs[j - 1], next = segs[j + 1], n = ns[j];
      const tr = Math.min(s.trans || o.trans || 0.07, 0.45 * s.dur);
      const bws = (s.bws || [65, 95, 110, 190, 240]).map(b => b * bwScale);
      for (let k = 0; k < 3; k++) {
        const a = s.from ? s.from[k] : prev ? (prev.F[k] + s.F[k]) / 2 : s.F[k];
        const b = s.to ? s.to[k] : next ? (next.F[k] + s.F[k]) / 2 : s.F[k], m = s.F[k];
        for (let i = 0; i < n; i++) {
          const t = i / fs;
          Ft[k][off + i] = t < tr ? a + (m - a) * smooth(t / tr) : t > s.dur - tr ? m + (b - m) * smooth((t - (s.dur - tr)) / tr) : m;
        }
      }
      for (let i = 0; i < n; i++) {
        f0[off + i] = s.f0a + (s.f0b - s.f0a) * i / n;
        for (let k = 0; k < 5; k++) bw[k][off + i] = bws[k];
      }
      off += n;
    });
    // smooth the joins of pitch and bandwidth (about 15 ms)
    const a15 = 1 - Math.exp(-1 / (0.015 * fs));
    for (const arr of [f0, ...bw]) { let y = arr[0]; for (let i = 0; i < N; i++) { y += a15 * (arr[i] - y); arr[i] = y; } }
    const last = segs[segs.length - 1], sags = last.f0b <= last.f0a;
    for (let i = 0; i < N; i++) {
      const t = i / fs, tt = t + t0;
      const drift = 0.008 * Math.sin(6.283 * 1.1 * tt + ph[0]) + 0.006 * Math.sin(6.283 * 2.7 * tt + ph[1]) + 0.004 * Math.sin(6.283 * 0.5 * tt + ph[2]);
      // pitch settles in at the onset and sags a little as the sound dies away
      // (only when the run is falling anyway, so a question still ends high)
      const on = 1 + 0.02 * Math.exp(-t / 0.04), fall = sags ? 1 - 0.015 * Math.max(0, (t - dur + 0.08) / 0.08) : 1;
      f0[i] *= (1 + drift + 0.004 * Math.sin(6.283 * 5.3 * t)) * on * fall;
      // formants are never quite still: a slow wander of under 1%
      for (let k = 0; k < 3; k++) Ft[k][i] *= 1 + 0.007 * Math.sin(6.283 * (0.7 + 0.4 * k) * tt + ph[5 + k]);
    }
    const x = lfSource(fs, N, (i) => f0[i], (i) => rd0 + 0.3 * Math.max(0, 1 - i / (fs * 0.05)), () => br, rand, o);
    const F4 = (i) => Ft[2][i] * 1.22 + 250, F5 = (i) => Ft[2][i] * 1.38 + 500;
    const tracks = [(i) => Ft[0][i], (i) => Ft[1][i], (i) => Ft[2][i], F4, F5];
    tracks.forEach((tr, k) => { if (tr(0) < fs / 2 - 100) resonateArr(x, fs, tr, bw[k]); });
    // loudness: each segment at its own level, blended across the joins, soft start and end
    const gains = segs.map((s, j) => {
      let e = 0; const a = start[j], n = ns[j];
      for (let i = a; i < a + n; i++) e += x[i] * x[i];
      return (s.level || o.level || 0.3) / Math.sqrt(e / Math.max(1, n) || 1);
    });
    const xf = Math.round(0.02 * fs), ramp = Math.max(1, Math.round(fs * Math.max(o.ramp || 0.02, 0.012)));
    for (let j = 0; j < segs.length; j++) {
      const a = start[j], n = ns[j];
      for (let i = 0; i < n; i++) {
        let g = gains[j];
        if (j > 0 && i < xf / 2) g = Math.exp(Math.log(gains[j - 1]) + (Math.log(gains[j]) - Math.log(gains[j - 1])) * smooth(0.5 + i / xf));
        if (j < segs.length - 1 && i >= n - xf / 2) g = Math.exp(Math.log(gains[j]) + (Math.log(gains[j + 1]) - Math.log(gains[j])) * smooth((i - (n - xf / 2)) / xf));
        const p = a + i, env = smooth(Math.min(1, p / ramp, (N - 1 - p) / ramp));
        x[p] *= g * env;
      }
    }
    for (let i = 0; i < N; i++) { const tt = i / fs + t0; x[i] *= 1 + 0.04 * Math.sin(6.283 * 2.9 * tt + ph[3]) + 0.025 * Math.sin(6.283 * 6.7 * tt + ph[4]); }
    return x;
  }
  function resonateArr(x, fs, track, bwArr) {
    let y1 = 0, y2 = 0, c = 0, g = 0, r2 = 0;
    for (let n = 0; n < x.length; n++) {
      if (n % 32 === 0) {
        const r = Math.exp(-Math.PI * bwArr[n] / fs);
        r2 = r * r; c = 2 * r * Math.cos(2 * Math.PI * track(n) / fs); g = 1 - c + r2;
      }
      const y = g * x[n] + c * y1 - r2 * y2;
      y2 = y1; y1 = y; x[n] = y;
    }
  }
  function voicedNatural(fs, dur, f0a, f0b, F, opts = {}) {
    return voicedRun(fs, [{ dur, f0a, f0b, F, from: opts.from, to: opts.to, bws: opts.bws, level: opts.level, trans: opts.trans }], opts);
  }
  function trackResonate(x, fs, track, bw) {
    const r = Math.exp(-Math.PI * bw / fs), r2 = r * r;
    let y1 = 0, y2 = 0, c = 0, g = 0;
    for (let n = 0; n < x.length; n++) {
      if (n % 32 === 0) { c = 2 * r * Math.cos(2 * Math.PI * track(n / fs) / fs); g = 1 - c + r2; }
      const y = g * x[n] + c * y1 - r2 * y2;
      y2 = y1; y1 = y; x[n] = y;
    }
  }
  function burst(fs, dur, peak, level, seed) {
    const x = sibilant(fs, dur, peak, { seed, level });
    for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-i / (fs * dur * 0.35));
    return x;
  }

  // Final consonants of the practice words, with the formant locus the vowel glides toward.
  const CODAS = {
    t: { locus: [320, 1800], parts: (fs) => [silence(fs, 0.07), burst(fs, 0.05, 4500, 0.09, 21)] },
    d: { locus: [320, 1750], parts: (fs) => [silence(fs, 0.05), burst(fs, 0.03, 3800, 0.05, 23)] },
    p: { locus: [320, 900], parts: (fs) => [silence(fs, 0.08), burst(fs, 0.04, 1500, 0.06, 25)] },
  };
  // Word spellings -> final consonant (n handled as a nasal murmur).
  const WORD_CODA = { sit: 't', sat: 't', shed: 'd', shop: 'p', shirt: 't', sun: 'n' };
  const SIB_LOCUS = { s: 1750, sh: 2100 };

  // What a drill's sound is made of: the typical values of the goal, or, with `voice` (the demo voice's
  // settings: pitch in Hz, res 0 = typical masculine to 100 = typical feminine and past either end, bright 0..100),
  // formants and hiss mixed between the two on a log scale the way the demo voice mixes them, at its own pitch.
  function soundVals(def, goal, VOWELS, SIBILANTS, voice) {
    const fem = goal === 'fem', V = def.vowel && VOWELS.find(v => v.key === def.vowel), S = def.sib && SIBILANTS[def.sib];
    if (!voice) return { F: V && (fem ? V.W : V.M), peak: S && (fem ? S.W : S.M), f0a: fem ? 215 : 122, f0b: fem ? 180 : 100, f0: fem ? 200 : 112 };
    const t = voice.res / 100, tc = Math.max(-0.3, Math.min(1.3, t)), mix = (m, w, k) => Math.exp(Math.log(m) + k * Math.log(w / m));
    return { F: V && V.M.map((m, i) => mix(m, V.W[i], t)), peak: S && mix(S.M, S.W, tc), f0a: voice.pitch * 1.06, f0b: voice.pitch * 0.89, f0: voice.pitch * 0.97, bright: clamp01(voice.bright / 100) };
  }
  // Reference recording for a drill, at the typical values of the chosen goal (or in the demo voice: o.voice).
  // def: {type:'vowel'|'sib'|'word', vowel, sib, cue}; goal: 'fem'|'masc'.
  function example(fs, def, goal, VOWELS, SIBILANTS, o = {}) {
    const { F, peak, f0a, f0b, bright } = soundVals(def, goal, VOWELS, SIBILANTS, o.voice);
    const lead = silence(fs, 0.12);
    if (def.type === 'vowel') return concat([lead, voiced(fs, 1.2, f0a, f0b, F, { ramp: 0.06, bright }), lead]);
    if (def.type === 'sib') return concat([lead, sibilant(fs, 1.0, peak, { level: 0.12 }), lead]);
    // word, said twice
    const codaKey = WORD_CODA[def.cue], coda = CODAS[codaKey];
    const one = () => {
      const from = [300, SIB_LOCUS[def.sib], F[2]];
      const to = coda ? [coda.locus[0], coda.locus[1], F[2]] : codaKey === 'n' ? [300, 1700, F[2]] : F;
      const vowelDur = coda || codaKey === 'n' ? 0.32 : 0.45;
      const parts = [sibilant(fs, 0.26, peak, { level: 0.11, seed: 31 }), voiced(fs, vowelDur, f0a, f0b, F, { from, to, trans: 0.08, ramp: 0.012, bright })];
      if (coda) parts.push(...coda.parts(fs));
      if (codaKey === 'n') parts.push(voiced(fs, 0.13, f0b, f0b * 0.95, [270, 1500, 2500], { level: 0.12, bws: [90, 200, 250, 300, 350], ramp: 0.01 }));
      return concat(parts);
    };
    return concat([lead, one(), silence(fs, 0.45), one(), lead]);
  }
  // The same item at typical masculine then typical feminine values.
  function comparison(fs, def, VOWELS, SIBILANTS) {
    return concat([example(fs, def, 'masc', VOWELS, SIBILANTS), silence(fs, 0.35), example(fs, def, 'fem', VOWELS, SIBILANTS)]);
  }

  // ---------- held references ----------
  // A drill's reference held for as long as you like: it starts the way the example does (a word's
  // hiss leads into its vowel), then holds one pitch and fixed formants on a loop with no seam, so it
  // can play until stopped. Returns {x, loopStart, loopEnd} in seconds, or null for sounds that move.
  // Pitch is the middle of the example's glide, formants are the same goal values, so it reads the same.
  const HOLD_LOOP = 4, HOLD_XF = 0.15;
  function canSustain(def) {
    return !!def && (def.type === 'vowel' || def.type === 'sib' || def.type === 'word' || (def.type === 'whisper' && def.kind !== 'siren'));
  }
  function sustain(fs, def, goal, VOWELS, SIBILANTS, o = {}) {
    if (!canSustain(def)) return null;
    const { F, peak, f0, bright } = soundVals(def, goal, VOWELS, SIBILANTS, o.voice);
    const lead = 0.12, settle = 0.3, body = settle + HOLD_LOOP + HOLD_XF + 0.15;
    let head = [], x;
    if (def.type === 'vowel') x = voiced(fs, body, f0, f0, F, { ramp: 0.06, bright });
    else if (def.type === 'sib') x = sibilant(fs, body, peak, { level: 0.12 });
    else if (def.type === 'word') {
      head = [sibilant(fs, 0.26, peak, { level: 0.11, seed: 31 })];
      x = voiced(fs, body, f0, f0, F, { from: [300, SIB_LOCUS[def.sib], F[2]], trans: 0.08, ramp: 0.012, bright });
    } else {
      const shift = o.shift || [1, 1, 1], base = F.map((f, i) => f * shift[i]);
      x = whispered(fs, body, () => base, { seed: 45 });
    }
    const out = concat([silence(fs, lead), ...head, x]);
    const a = out.length - x.length + Math.round(fs * settle), L = Math.round(fs * HOLD_LOOP), n = Math.round(fs * HOLD_XF);
    // the stretch just past the loop's end fades into its start (equal power), so the jump back is seamless
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      out[a + i] = out[a + i] * Math.sin(0.5 * Math.PI * u) + out[a + L + i] * Math.cos(0.5 * Math.PI * u);
    }
    return { x: out.subarray(0, a + L), loopStart: a / fs, loopEnd: (a + L) / fs, fs };
  }

  // ---------- whispers ----------
  // Whispered vowel: turbulent airflow noise (no tone) through the formants, which are wider than in
  // a voiced vowel. track(t) gives [F1, F2, F3] at time t (seconds), so a whisper can glide.
  function whispered(fs, dur, track, opts = {}) {
    const n = Math.round(fs * dur), x = new Float32Array(n), rand = rng(opts.seed || 41);
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += 0.5 * (rand() * 2 - 1 - lp); x[i] = lp; }
    const bws = [160, 190, 240, 300, 360];
    const tracks = [0, 1, 2].map(k => (t) => track(t)[k]);
    tracks.push((t) => track(t)[2] * 1.22 + 250, (t) => track(t)[2] * 1.38 + 500);
    tracks.forEach((tr, k) => { if (tr(0) < fs / 2 - 100) trackResonate(x, fs, tr, bws[k]); });
    return normalize(x, opts.level || 0.2, fs, opts.ramp || 0.05);
  }
  // Reference whispers for the whisper exercises (def: {kind:'siren'|'hold', vowel}) at the typical
  // formants of `goal`, raised by the usual whisper shift (shift = [k1, k2, k3]).
  // o.wrong: 'flat' = a siren that does not move; 'voiced' = the same sound with tone.
  function whisperExample(fs, def, goal, VOWELS, shift, o = {}) {
    const base = soundVals(def, goal, VOWELS, {}, o.voice).F.map((f, i) => f * shift[i]);
    const lead = silence(fs, 0.12);
    if (def.kind === 'siren') {
      // the whole tract shortens and lengthens: up and down twice, about 13% to either side
      const dur = 5.2, k = (t) => (o.wrong === 'flat' ? 1 : Math.exp(-0.13 * Math.cos(4 * Math.PI * t / dur)));
      if (o.wrong === 'voiced') {
        const unshift = base.map((f, i) => f / shift[i]);
        return concat([lead, voiced(fs, dur, goal === 'fem' ? 190 : 110, goal === 'fem' ? 190 : 110, unshift, { ramp: 0.06 }), lead]);
      }
      return concat([lead, whispered(fs, dur, (t) => base.map(f => f * k(t)), { seed: 43 }), lead]);
    }
    // "kee" three times: a /k/ burst, then the whispered vowel
    const one = () => {
      const k = burst(fs, 0.035, 2600, 0.06, 47);
      if (o.wrong === 'voiced') return concat([k, voiced(fs, 0.6, goal === 'fem' ? 205 : 115, goal === 'fem' ? 190 : 105, base.map((f, i) => f / shift[i]), { ramp: 0.03 })]);
      return concat([k, whispered(fs, 0.65, () => base, { seed: 45, ramp: 0.03 })]);
    };
    return concat([lead, one(), silence(fs, 0.3), one(), silence(fs, 0.3), one(), lead]);
  }

  // ---------- embodied voice ----------
  // "uwu" ("eww-woo") said `times` times at the typical values of `goal`: a glide from "ee" into
  // "oo", a dip for the "w", then a longer "oo" that falls a little. o.f0: pitch scale (default 1).
  function uwu(fs, goal, VOWELS, o = {}) {
    const fem = goal === 'fem', V = (k) => { const v = VOWELS.find(x => x.key === k); return fem ? v.W : v.M; };
    const ee = V('i'), oo = V('u'), w = [oo[0] * 0.9, oo[1] * 0.85, oo[2]];
    const f0 = (fem ? 190 : 118) * (o.f0 || 1), lead = silence(fs, 0.15);
    const one = () => STYLE === 'natural' ? voicedRun(fs, [
      { dur: 0.34, f0a: f0 * 1.04, f0b: f0, F: oo, from: ee, to: w, trans: 0.12, level: 0.3 },
      { dur: 0.07, f0a: f0, f0b: f0 * 1.02, F: w, level: 0.16, trans: 0.03 },
      { dur: 0.5, f0a: f0 * 1.06, f0b: f0 * 0.94, F: oo, from: w, trans: 0.06, level: 0.3 },
    ], { seed: 9, ramp: 0.04 }) : concat([
      voiced(fs, 0.34, f0 * 1.04, f0, oo, { from: ee, to: w, trans: 0.12, ramp: 0.03 }),
      voiced(fs, 0.07, f0, f0 * 1.02, w, { level: 0.12, ramp: 0.01 }),
      voiced(fs, 0.5, f0 * 1.06, f0 * 0.94, oo, { from: w, trans: 0.06, ramp: 0.06 }),
    ]);
    const parts = [lead];
    for (let i = 0; i < (o.times || 2); i++) parts.push(one(), silence(fs, 0.6));
    parts.push(lead);
    return concat(parts);
  }

  // ---------- resonance exercises (data/reso.json) ----------
  // A resonance exercise said by the demo voice. Resonance is set like the demo voice's: 0 typical masculine,
  // 1 typical feminine (formants mixed on a log scale), past either end allowed.
  //   dog: big, little, big, little, each held about a second on one note. o.big / o.little set their
  //        resonance (defaults: a bit darker than typical masculine, a bit brighter than typical feminine);
  //        o.jump lifts the little dog's pitch by that many semitones (a demo of dragging the pitch along).
  //   chain with held vowels (def.held): the vowels in one breath, gliding from each into the next.
  //   chain of words or phrases: def.say read aloud. o.res overrides the resonance; o.vowelsOf as in readText.
  function resoExample(fs, def, goal, VOWELS, o = {}) {
    const fem = goal === 'fem', f0 = o.pitch || (fem ? 200 : 112), V = (k) => VOWELS.find(v => v.key === k);
    const mix = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
    const lead = silence(fs, 0.15);
    if (def.kind === 'dog') {
      const v = V(def.vowel), big = o.big ?? -0.25, little = o.little ?? 1.2, up = Math.pow(2, (o.jump || 0) / 12), parts = [lead];
      [big, little, big, little].forEach((t, i) => {
        const p = f0 * (i % 2 ? up : 1);
        parts.push(voiced(fs, 1.0, p * 1.01, p * 0.99, mix(v, t), { ramp: 0.06, seed: 21 + i, bright: t > 0.5 ? 0.65 : 0.35 }), silence(fs, 0.4));
      });
      return concat(parts);
    }
    const t = o.res ?? (fem ? 1 : 0);
    if (def.held) {
      const segs = def.vowels.map((k, i) => ({ dur: 0.6, f0a: f0 * (1.03 - 0.02 * i), f0b: f0 * (1.01 - 0.02 * i), F: mix(V(k), o.resOf ? o.resOf(k) : t), trans: 0.12 }));
      const x = STYLE === 'natural' ? voicedRun(fs, segs, { seed: 9, ramp: 0.06 })
        : concat(segs.map((sg, i) => voiced(fs, sg.dur, sg.f0a, sg.f0b, sg.F, { from: segs[i - 1] ? segs[i - 1].F : sg.F, to: segs[i + 1] ? segs[i + 1].F : sg.F, trans: 0.1, ramp: i === 0 || i === segs.length - 1 ? 0.06 : 0.001, seed: 9 + i })));
      return concat([lead, x, lead]);
    }
    const parts = [lead];
    for (const line of def.say) parts.push(readText(fs, line.replace(/[–—]/g, ' ').split(/\s+/).filter(Boolean), VOWELS, { pitch: f0, res: t * 100, bright: fem ? 65 : 40, rate: 0.85, vowelsOf: o.vowelsOf }).x, silence(fs, 0.35));
    return concat(parts);
  }

  const api = { resoExample, soundVals, canSustain, sustain, setStyle, getStyle, voicedRun, demoWords, lfTable, vowel, sibilant, silence, concat, demo, demoVoice, readText, wordUnits, voiced, example, comparison, whispered, whisperExample, uwu, sibilantGlide, sibExercise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VTSynth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
