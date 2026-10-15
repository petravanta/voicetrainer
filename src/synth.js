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

  // ---------- reference examples ----------
  // Voiced segment with gliding pitch and formant transitions: formants move from Fa to F over
  // the first `trans` seconds and from F to Fb over the last `trans` seconds (coarticulation).
  function voiced(fs, dur, f0a, f0b, F, opts = {}) {
    const n = Math.round(fs * dur), x = new Float32Array(n), rand = rng(opts.seed || 13);
    const trans = opts.trans || 0.07, Fa = opts.from || F, Fb = opts.to || F;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs, u = t / dur;
      const f = (f0a + (f0b - f0a) * u) * (1 + 0.01 * Math.sin(2 * Math.PI * 5.2 * t)) * (1 + 0.003 * (rand() - 0.5));
      phase += f / fs; if (phase >= 1) phase -= 1;
      // brightness (0..1) shortens the closing phase, which lifts the upper harmonics
      // breath (0..1) leaves the folds open longer and adds turbulent airflow noise
      const br = opts.breath || 0;
      const op = 0.42 + 0.22 * br, cl = (opts.bright == null ? 0.15 : 0.27 - 0.2 * opts.bright) + 0.12 * br;
      let g = 0;
      if (phase < op) g = 0.5 * (1 - Math.cos(Math.PI * phase / op));
      else if (phase < op + cl) g = Math.cos(0.5 * Math.PI * (phase - op) / cl);
      x[i] = g + (0.025 + 0.3 * br) * (rand() - 0.5) * (0.25 + g); // airflow noise, strongest while open
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

  const api = { vowel, sibilant, silence, concat, demo, demoVoice, voiced, example, comparison };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VTSynth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
