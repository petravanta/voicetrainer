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
    return normalize(x, opts.level || 0.12, fs);
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
  function demo(fs, VOWELS) {
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
      const nv = units.filter(u => u.v).length;
      // o.f0At(wordIndex, fractionThroughWord) gives a pitch multiplier for set intonation patterns
      const f0w = o.f0At ? o.pitch * o.f0At(wi, 0) : o.pitch * (1.12 - 0.24 * sentPos / Math.max(1, sentLen - 1 || 1));
      starts.push(time);
      let vi = 0;
      for (const u of units) {
        seed += 7;
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

  // Reference recording for a drill, at the typical values of the chosen goal.
  // def: {type:'vowel'|'sib'|'word', vowel, sib, cue}; goal: 'fem'|'masc'.
  function example(fs, def, goal, VOWELS, SIBILANTS) {
    const fem = goal === 'fem';
    const f0a = fem ? 215 : 122, f0b = fem ? 180 : 100;
    const V = def.vowel && VOWELS.find(v => v.key === def.vowel);
    const F = V && (fem ? V.W : V.M);
    const peak = def.sib && (fem ? SIBILANTS[def.sib].W : SIBILANTS[def.sib].M);
    const lead = silence(fs, 0.12);
    if (def.type === 'vowel') return concat([lead, voiced(fs, 1.2, f0a, f0b, F, { ramp: 0.06 }), lead]);
    if (def.type === 'sib') return concat([lead, sibilant(fs, 1.0, peak, { level: 0.12 }), lead]);
    // word, said twice
    const codaKey = WORD_CODA[def.cue], coda = CODAS[codaKey];
    const one = () => {
      const from = [300, SIB_LOCUS[def.sib], F[2]];
      const to = coda ? [coda.locus[0], coda.locus[1], F[2]] : codaKey === 'n' ? [300, 1700, F[2]] : F;
      const vowelDur = coda || codaKey === 'n' ? 0.32 : 0.45;
      const parts = [sibilant(fs, 0.26, peak, { level: 0.11, seed: 31 }), voiced(fs, vowelDur, f0a, f0b, F, { from, to, trans: 0.08, ramp: 0.012 })];
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

  const api = { vowel, sibilant, silence, concat, demo, demoVoice, readText, wordUnits, voiced, example, comparison };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VTSynth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
