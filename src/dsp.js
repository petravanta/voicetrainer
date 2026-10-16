/* VoiceTrainer DSP: pitch (YIN), formants (LPC), sibilant spectra, vowel/resonance scoring.
   Pure functions plus a small stateful Analyzer. Runs in the browser and in Node (tests). */
(function (root) {
  'use strict';

  // Average formants [F1, F2, F3] in Hz for adult men (M) and women (W),
  // from Hillenbrand, Getty, Clark & Wheeler (1995), American English /hVd/ words.
  const VOWELS = [
    { key: 'i',  ipa: 'i',  word: 'heed',  cue: 'ee', M: [342, 2322, 3000], W: [437, 2761, 3372] },
    { key: 'I',  ipa: 'ɪ',  word: 'hid',   cue: 'ih', M: [427, 2034, 2684], W: [483, 2365, 3053] },
    { key: 'e',  ipa: 'eɪ', word: 'hayed', cue: 'ay', M: [476, 2089, 2691], W: [536, 2530, 3047] },
    { key: 'E',  ipa: 'ɛ',  word: 'head',  cue: 'eh', M: [580, 1799, 2605], W: [731, 2058, 2979] },
    { key: 'ae', ipa: 'æ',  word: 'had',   cue: 'a',  M: [588, 1952, 2601], W: [669, 2349, 2972] },
    { key: 'a',  ipa: 'ɑ',  word: 'hod',   cue: 'ah', M: [768, 1333, 2522], W: [936, 1551, 2815] },
    { key: 'c',  ipa: 'ɔ',  word: 'hawed', cue: 'aw', M: [652, 997, 2538],  W: [781, 1136, 2824] },
    { key: 'V',  ipa: 'ʌ',  word: 'hud',   cue: 'uh', M: [623, 1200, 2550], W: [753, 1426, 2933] },
    { key: 'o',  ipa: 'oʊ', word: 'hoed',  cue: 'oh', M: [497, 910, 2459],  W: [555, 1035, 2828] },
    { key: 'U',  ipa: 'ʊ',  word: 'hood',  cue: 'oo (book)', M: [469, 1122, 2434], W: [519, 1225, 2827] },
    { key: 'u',  ipa: 'u',  word: "who'd", cue: 'oo', M: [378, 997, 2343],  W: [459, 1105, 2735] },
    { key: 'r',  ipa: 'ɝ',  word: 'heard', cue: 'er', M: [474, 1379, 1710], W: [523, 1588, 1929] },
  ];
  const VOWEL_BY_KEY = Object.fromEntries(VOWELS.map(v => [v.key, v]));

  // Spectral centre of gravity (1-15 kHz) of sustained sibilants. Approximate midpoints of
  // published adult values (e.g. Jongman et al. 2000; Fuchs & Toda 2010); speakers vary widely.
  const SIBILANTS = {
    s:  { key: 's',  cue: 's',  word: 'sss', M: 6200, W: 7800 },
    sh: { key: 'sh', cue: 'sh', word: 'shh', M: 3700, W: 4500 },
  };

  // Typical speaking pitch ranges (Hz).
  const PITCH_BANDS = {
    masc: [85, 155],
    andro: [145, 175],
    fem: [165, 255],
  };

  // ---------- basic helpers ----------
  function median(arr) {
    if (!arr.length) return NaN;
    const a = Array.from(arr).sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }
  function quantile(arr, q) {
    if (!arr.length) return NaN;
    const a = Array.from(arr).sort((x, y) => x - y);
    const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }
  function hzToNote(f) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const n = Math.round(12 * Math.log2(f / 440) + 69);
    return names[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  }

  // In-place radix-2 FFT.
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  const windowCache = new Map();
  function hann(n) {
    const k = 'h' + n;
    if (!windowCache.has(k)) {
      const w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      windowCache.set(k, w);
    }
    return windowCache.get(k);
  }
  function hamming(n) {
    const k = 'm' + n;
    if (!windowCache.has(k)) {
      const w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1));
      windowCache.set(k, w);
    }
    return windowCache.get(k);
  }

  // Power spectrum (length n/2+1) of the last n samples of x, Hann-windowed.
  function powerSpectrum(x, n) {
    const off = x.length - n, w = hann(n);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[off + i] * w[i];
    fft(re, im);
    const p = new Float64Array(n / 2 + 1);
    for (let i = 0; i <= n / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
    return p;
  }

  // Windowed-sinc low-pass FIR. cutoff is a fraction of the sample rate (0..0.5).
  function lowpassFIR(taps, cutoff) {
    const h = new Float32Array(taps), m = (taps - 1) / 2;
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const t = i - m;
      const sinc = t === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * t) / (Math.PI * t);
      const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (taps - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (taps - 1));
      h[i] = sinc * w; sum += h[i];
    }
    for (let i = 0; i < taps; i++) h[i] /= sum;
    return h;
  }

  // Low-pass and keep every `factor`-th sample, producing `outLen` samples that end at x's end.
  function decimate(x, factor, h, outLen) {
    if (factor === 1) return Float32Array.from(x.subarray(x.length - outLen));
    const y = new Float32Array(outLen), taps = h.length;
    const start = x.length - taps - (outLen - 1) * factor;
    for (let k = 0; k < outLen; k++) {
      const o = start + k * factor;
      let s = 0;
      for (let j = 0; j < taps; j++) s += h[j] * x[o + j];
      y[k] = s;
    }
    return y;
  }

  // ---------- pitch: YIN (de Cheveigné & Kawahara 2002) ----------
  function yin(x, fs, fmin = 60, fmax = 500, threshold = 0.15) {
    const maxLag = Math.floor(fs / fmin), minLag = Math.max(2, Math.floor(fs / fmax));
    const W = x.length - maxLag - 1;
    if (W < minLag * 2) return { f0: 0, aperiodicity: 1 };
    const d = new Float64Array(maxLag + 2);
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; s += v * v; }
      d[tau] = s;
    }
    const c = new Float64Array(maxLag + 2);
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= maxLag + 1; tau++) { run += d[tau]; c[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = minLag; t <= maxLag; t++) {
      if (c[t] < threshold) {
        while (t + 1 <= maxLag && c[t + 1] < c[t]) t++;
        tau = t; break;
      }
    }
    if (tau < 0) {
      let best = minLag;
      for (let t = minLag; t <= maxLag; t++) if (c[t] < c[best]) best = t;
      tau = best;
    }
    const a = c[tau - 1], b = c[tau], cc = c[tau + 1];
    const den = a - 2 * b + cc;
    const shift = den !== 0 ? 0.5 * (a - cc) / den : 0;
    const t = tau + Math.max(-1, Math.min(1, shift));
    return { f0: fs / t, aperiodicity: c[tau] };
  }

  // ---------- formants: LPC + polynomial roots ----------
  function lpc(x, order, fs, lagHz) {
    const n = x.length, r = new Float64Array(order + 1);
    for (let k = 0; k <= order; k++) { let s = 0; for (let i = k; i < n; i++) s += x[i] * x[i - k]; r[k] = s; }
    if (r[0] <= 0) return null;
    // Gaussian lag window (~bandwidth expansion) tames harmonic peaks in high voices.
    if (lagHz) for (let k = 1; k <= order; k++) r[k] *= Math.exp(-0.5 * (2 * Math.PI * lagHz * k / fs) ** 2);
    r[0] *= 1 + 1e-9; // tiny white-noise floor for stability
    const a = new Float64Array(order + 1); a[0] = 1;
    let err = r[0];
    for (let i = 1; i <= order; i++) {
      let acc = r[i];
      for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
      const k = -acc / err;
      const prev = a.slice();
      for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
      a[i] = k;
      err *= 1 - k * k;
      if (err <= 0) return null;
    }
    return a;
  }

  // Roots of the monic polynomial z^p + a1 z^(p-1) + ... + ap (Durand-Kerner).
  function polyRoots(a) {
    const p = a.length - 1;
    const zr = new Float64Array(p), zi = new Float64Array(p);
    for (let k = 0; k < p; k++) { // spread initial guesses on a circle
      const ang = 2 * Math.PI * k / p + 0.4;
      zr[k] = 0.9 * Math.cos(ang); zi[k] = 0.9 * Math.sin(ang);
    }
    for (let iter = 0; iter < 400; iter++) {
      let delta = 0;
      for (let k = 0; k < p; k++) {
        // evaluate polynomial at z_k (Horner)
        let vr = 1, vi = 0;
        for (let j = 1; j <= p; j++) {
          const tr = vr * zr[k] - vi * zi[k] + a[j];
          vi = vr * zi[k] + vi * zr[k];
          vr = tr;
        }
        // denominator: prod (z_k - z_j)
        let dr = 1, di = 0;
        for (let j = 0; j < p; j++) {
          if (j === k) continue;
          const er = zr[k] - zr[j], ei = zi[k] - zi[j];
          const tr = dr * er - di * ei; di = dr * ei + di * er; dr = tr;
        }
        const dd = dr * dr + di * di || 1e-30;
        const qr = (vr * dr + vi * di) / dd, qi = (vi * dr - vr * di) / dd;
        zr[k] -= qr; zi[k] -= qi;
        delta = Math.max(delta, Math.abs(qr) + Math.abs(qi));
      }
      if (delta < 1e-10) break;
    }
    const out = [];
    for (let k = 0; k < p; k++) out.push([zr[k], zi[k]]);
    return out;
  }

  // Returns up to 3 formants [{f, bw}] from a segment sampled at fs (expected ~11-12 kHz).
  function formants(seg, fs, order, lagHz = 50) {
    const n = seg.length, w = hamming(n);
    const x = new Float64Array(n);
    const pre = Math.exp(-2 * Math.PI * 50 / fs);
    for (let i = n - 1; i > 0; i--) x[i] = (seg[i] - pre * seg[i - 1]) * w[i];
    x[0] = 0;
    const a = lpc(x, order, fs, lagHz);
    if (!a) return [];
    const roots = polyRoots(a);
    const cands = [];
    for (const [re, im] of roots) {
      if (im <= 0) continue;
      const f = Math.atan2(im, re) * fs / (2 * Math.PI);
      const r = Math.hypot(re, im);
      const bw = -Math.log(r) * fs / Math.PI;
      if (f > 180 && f < fs / 2 - 200 && bw > 0 && bw < 500) cands.push({ f, bw });
    }
    cands.sort((p, q) => p.f - q.f);
    return cands.slice(0, 4);
  }

  // ---------- scoring ----------
  // Fit the measured formants F (Hz) to vowel v on a log scale as M + alpha * (W - M).
  // alpha = 0 is the typical adult male value for that vowel, 1 the typical adult female value.
  const FIT_WEIGHTS = [0.6, 1, 0.8];
  function fitVowel(F, v, weights = FIT_WEIGHTS) {
    let num = 0, den = 0, wsum = 0;
    const d = [], s = [];
    for (let i = 0; i < 3; i++) {
      d[i] = Math.log(F[i] / v.M[i]);
      s[i] = Math.log(v.W[i] / v.M[i]);
      num += weights[i] * d[i] * s[i];
      den += weights[i] * s[i] * s[i];
      wsum += weights[i];
    }
    const alpha = num / den;
    let resid = 0;
    for (let i = 0; i < 3; i++) resid += weights[i] * (d[i] - alpha * s[i]) ** 2;
    // Per-formant positions on the same 0..1 scale (diagnostics for tips).
    const per = d.map((di, i) => di / s[i]);
    return { alpha, rms: Math.sqrt(resid / wsum), per };
  }

  // Jointly identify the vowel and its resonance. Out-of-range alphas are penalised so a
  // stretched vowel does not masquerade as a neighbour.
  function classifyVowel(F, candidates = VOWELS) {
    const res = [];
    for (const v of candidates) {
      const fit = fitVowel(F, v, [1, 1, 0.7]);
      const excess = Math.max(0, -0.6 - fit.alpha, fit.alpha - 1.6);
      const cost = Math.hypot(fit.rms, excess * 0.12);
      res.push({ v, cost, fitRms: fit.rms });
    }
    res.sort((p, q) => p.cost - q.cost);
    const best = res[0];
    const scored = fitVowel(F, best.v);
    return { vowel: best.v, alpha: scored.alpha, per: scored.per, cost: best.cost, margin: res[1].cost - best.cost };
  }

  // Live coaching for a held vowel. Positions use the same 0 (male avg) .. 100 (female avg) scale
  // per formant. A formant is fine inside the goal band; outside it, `need` says which way it must
  // move. `focus` is the single most useful change: one formant, or 'all' when every formant is off
  // the same way (a whole-tract change such as larynx height).
  const COACH_BAND = { fem: [75, 135], masc: [-35, 25] };
  const COACH_WEIGHT = [0.6, 1, 0.8]; // F1 swings with jaw opening and is the noisiest
  // F1 moves about twice as far on this scale as F2/F3 for the same real change, its estimate is the
  // noisiest, and it varies naturally with jaw opening: give it a much wider zone.
  const F1_SLACK = 120; // about +-30% F1
  function coachVowel(F, v, goal) {
    const [lo0, hi0] = COACH_BAND[goal];
    const pos = fitVowel(F, v).per.map(x => x * 100);
    // F1 gets extra slack: it is the least reliable estimate, especially at higher pitch
    const band = (i) => (i === 0 ? [lo0 - F1_SLACK, hi0 + F1_SLACK] : [lo0, hi0]);
    const need = pos.map((p, i) => (p < band(i)[0] ? 1 : p > band(i)[1] ? -1 : 0));
    const miss = pos.map((p, i) => (p < band(i)[0] ? band(i)[0] - p : p > band(i)[1] ? p - band(i)[1] : 0) * COACH_WEIGHT[i]);
    const distance = (miss[0] + miss[1] + miss[2]) / (COACH_WEIGHT[0] + COACH_WEIGHT[1] + COACH_WEIGHT[2]);
    let focus = null;
    const worst = miss.indexOf(Math.max(...miss));
    if (miss[worst] > 0) {
      // F2 and F3 off together (and F1 not pulling the other way) means a whole-tract change
      const same = need[1] === need[2] && need[1] !== 0 && need[0] !== -need[1] &&
        Math.min(miss[1], miss[2]) > 0.45 * Math.max(miss[1], miss[2]);
      focus = same ? { formant: 'all', dir: need[1] } : { formant: worst, dir: need[worst] };
    }
    return { pos, need, miss, distance, focus, onTarget: !focus };
  }
  // ---------- vocal tract sketch ----------
  // A rough articulatory reading of the formants, for a picture only. Each vowel starts from its
  // textbook tongue height, backness and lip rounding (0..1); the formants then nudge it the way the
  // live coach reads them: a shift shared by all formants = tract length (larynx height), and what
  // is left over = F1 jaw opening, F2 tongue front/back, F3 lips (spread vs rounded).
  // Many shapes make the same formants, so this is one plausible shape, not a measurement.
  const VOWEL_ART = {
    i: [1, 0, 0], I: [0.82, 0.12, 0], e: [0.72, 0.06, 0], E: [0.5, 0.1, 0], ae: [0.18, 0.12, 0], a: [0, 0.85, 0],
    c: [0.22, 0.95, 0.55], V: [0.35, 0.6, 0], o: [0.6, 1, 0.7], U: [0.8, 0.85, 0.45], u: [1, 1, 0.9], r: [0.5, 0.45, 0.25],
  };
  function tractShape(F, v, goal) {
    const G = goal === 'fem' ? v.W : v.M;
    // positions in "masculine to feminine average" units, relative to the goal for this vowel
    const u = [0, 1, 2].map(i => Math.log(F[i] / G[i]) / Math.log(v.W[i] / v.M[i]));
    const a = (u[1] + u[2]) / 2; // the shared shift, read from F2 and F3 (F1 mostly follows the jaw)
    const q = u.map(x => x - a);
    const [h, b, r] = VOWEL_ART[v.key] || [0.5, 0.5, 0];
    const lim = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    return {
      vowel: v.key,
      height: lim(h - 0.3 * q[0], -0.2, 1.2),  // F1 up = lower tongue, more open jaw
      back: lim(b - 0.3 * q[1], -0.2, 1.2),    // F2 up = tongue further forward
      round: lim(r - 0.35 * q[2], -0.5, 1.2),  // F3 down = more rounding; negative = spread (smile)
      larynx: lim((goal === 'fem' ? 1 : 0) + a, -0.8, 1.8), // 0 = typical masculine height, 1 = typical feminine
      shift: a, resid: q,
    };
  }

  // ---------- control (isolation) exercises ----------
  // Compares the current formants (and pitch) with a baseline taken at the start of the exercise and
  // says whether the change is the one the exercise asks for, with the other formants holding still.
  // Changes are natural-log ratios (0.1 = about 10%).
  const ISO_RULES = {
    jaw:    { main: [0], thr: 0.12, others: [[1, 0.7], [2, 0.5]] },
    tongue: { main: [1], thr: 0.10, others: [[0, 0.6], [2, 0.6]] },
    lips:   { main: [2], thr: 0.06, others: [[0, 0.5]] }, // rounding also lowers F2, so F2 is free
    larynx: { all: true, thr: 0.04 },
    pitch:  { pitch: 3, still: 0.07 },
  };
  function isolation(kind, baseF, F, baseF0, f0) {
    const dev = [0, 1, 2].map(i => Math.log(F[i] / baseF[i]));
    const semis = baseF0 > 0 && f0 > 0 ? 12 * Math.log2(f0 / baseF0) : 0;
    const r = ISO_RULES[kind], a = dev.map(Math.abs);
    let ok = false, moved = false;
    if (r.pitch) {
      moved = Math.abs(semis) >= r.pitch;
      ok = moved && Math.max(...a) <= r.still;
    } else if (r.all) {
      moved = Math.max(...a) >= r.thr;
      ok = a.every(x => x >= r.thr) && dev.every(x => Math.sign(x) === Math.sign(dev[0])) && Math.min(...a) >= 0.4 * Math.max(...a);
    } else {
      const m = a[r.main[0]];
      moved = m >= r.thr;
      ok = moved && r.others.every(([i, k]) => a[i] <= k * m);
    }
    return { dev, semis, moved, ok };
  }

  function coachSibilant(cog, sib, goal) {
    const [lo, hi] = COACH_BAND[goal];
    const pos = sibilantAlpha(cog, sib) * 100;
    const dir = pos < lo ? 1 : pos > hi ? -1 : 0;
    return { pos, dir, distance: pos < lo ? lo - pos : pos > hi ? pos - hi : 0, onTarget: dir === 0 };
  }

  // ---------- reading-along helpers ----------
  // Rough English syllable count for a written word (vowel groups, silent final e).
  function countSyllables(word) {
    const w = String(word).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!w) return 0;
    if (/^[0-9]+$/.test(w)) return Math.max(1, w.length);
    if (w.length <= 3) return 1;
    let t = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const groups = t.match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
  }
  // Counts syllable nuclei in a stream of analyzer frames: every voiced onset, plus
  // energy peaks inside a voiced stretch separated by a dip of at least `dipDb`.
  class NucleusTracker {
    constructor(dipDb = 3, minGapMs = 110) { this.dip = dipDb; this.gap = minGapMs; this.reset(); }
    reset() { this.count = 0; this.inNuc = false; this.peak = -200; this.valley = -200; this.lastT = -1e9; this.silentMs = 0; this.lastFrameT = null; }
    push(fr, tMs) {
      const dt = this.lastFrameT == null ? 16 : Math.min(100, tMs - this.lastFrameT);
      this.lastFrameT = tMs;
      const e = 20 * Math.log10(fr.rms + 1e-9);
      if (fr.kind === 'voiced') {
        this.silentMs = 0;
        if (!this.inNuc) {
          if (e > this.valley + this.dip && tMs - this.lastT > this.gap) { this.count++; this.inNuc = true; this.peak = e; this.lastT = tMs; return true; }
          this.valley = Math.min(this.valley, e);
        } else {
          this.peak = Math.max(this.peak, e);
          if (e < this.peak - this.dip) { this.inNuc = false; this.valley = e; }
        }
      } else {
        this.inNuc = false; this.valley = -200;
        if (fr.kind === 'silence') this.silentMs += dt; else this.silentMs = 0;
      }
      return false;
    }
  }

  // Voice quality from one voiced frame: cepstral peak prominence (CPP, dB; lower = more
  // airflow noise, less clear harmonics) and H1-H2 (dB; higher = folds closing less firmly).
  function voiceQuality(y, fs, f0) {
    const n = 1 << Math.floor(Math.log2(Math.min(y.length, Math.round(fs * 0.09))));
    const ps = powerSpectrum(y, n);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = 10 * Math.log10(ps[i <= n / 2 ? i : n - i] + 1e-12);
    fft(re, im);
    const cep = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) cep[i] = 10 * Math.log10((re[i] * re[i] + im[i] * im[i]) / (n * n) + 1e-12);
    // highest peak for pitches of 60-500 Hz, against a regression line over 1-20 ms
    const lo = Math.max(2, Math.floor(fs / 500)), hi = Math.min(n / 2 - 1, Math.ceil(fs / 60));
    let pk = lo;
    for (let i = lo; i <= hi; i++) if (cep[i] > cep[pk]) pk = i;
    const a = Math.round(fs * 0.001), b = Math.min(n / 2 - 1, Math.round(fs * 0.02));
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let i = a; i <= b; i++) { sx += i; sy += cep[i]; sxx += i * i; sxy += i * cep[i]; m++; }
    const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx), icpt = (sy - slope * sx) / m;
    const cpp = cep[pk] - (icpt + slope * pk);
    // harmonic amplitudes: the strongest bin within 20% of f0 and 2*f0
    const bin = fs / n, peakDb = (f) => {
      let best = 0;
      for (let k = Math.max(1, Math.round(f * 0.8 / bin)); k <= Math.min(n / 2, Math.round(f * 1.2 / bin)); k++) best = Math.max(best, ps[k]);
      return 10 * Math.log10(best + 1e-12);
    };
    const h1h2 = peakDb(f0) - peakDb(2 * f0);
    return { cpp, h1h2 };
  }
  // Breathiness 0..100 from CPP: 0 is a very clear, firm voice, about 50 a light airy one,
  // 80+ mostly air. CPP is the most reliable single acoustic cue for breathiness, but room noise
  // and mic quality lower it too, so read the number as a trend within one setup.
  const BREATH_CPP = [13, 25]; // dB: mostly air .. very clear (synthetic calibration)
  const BREATH_BAND = { fem: [20, 50], masc: [10, 40] };
  function breathiness(q) {
    return Math.max(0, Math.min(100, 100 * (BREATH_CPP[1] - q.cpp) / (BREATH_CPP[1] - BREATH_CPP[0])));
  }

  function sibilantAlpha(cog, sib) {
    return Math.log(cog / sib.M) / Math.log(sib.W / sib.M);
  }

  // ---------- streaming analyzer ----------
  class Analyzer {
    constructor(sampleRate) {
      this.sr = sampleRate;
      this.dec = Math.max(1, Math.round(sampleRate / 11025));
      this.fsd = sampleRate / this.dec;
      this.taps = this.dec > 1 ? 24 * this.dec + 1 : 1;
      this.h = this.dec > 1 ? lowpassFIR(this.taps, 0.45 / this.dec) : null;
      this.decLen = 1024;
      this.lpcOrder = 2 * Math.round(this.fsd / 2200); // 10 at 11-12 kHz (5 formants below Nyquist)
      this.fricN = 1 << Math.round(Math.log2(sampleRate * 0.023)); // ~23 ms
      this.needed = Math.max(this.decLen * this.dec + this.taps, this.fricN);
      this.noise = 0.003;
      this.hist = [];   // recent formant frames for smoothing
      this.pitchHist = [];
      this.gap = 0;
    }

    analyze(buf) {
      const sr = this.sr;
      const x = buf.length > this.needed ? buf.subarray(buf.length - this.needed) : buf;
      const out = { kind: 'silence', rms: 0, f0: 0, formants: null, cog: 0, spec: null };

      // level over the last ~30 ms
      const nr = Math.min(x.length, Math.round(sr * 0.03));
      let e = 0;
      for (let i = x.length - nr; i < x.length; i++) e += x[i] * x[i];
      const rms = Math.sqrt(e / nr);
      out.rms = rms;
      if (rms < this.noise) this.noise = 0.95 * this.noise + 0.05 * rms;
      else this.noise *= 1.0015;
      this.noise = Math.max(this.noise, 1e-4);
      const gate = Math.max(0.006, this.noise * 3.5);

      const y = decimate(x, this.dec, this.h, this.decLen);
      out.spec = this.spectrumColumn(y);
      if (rms < gate) { this.reset(); return out; }

      // pitch on ~65 ms of the decimated signal
      const pn = Math.round(this.fsd * 0.065);
      const p = yin(y.subarray(y.length - pn), this.fsd, 60, 500, 0.15);
      const voiced = p.aperiodicity < 0.25;

      // high-frequency balance and spectral centre of gravity at the full rate
      const ps = powerSpectrum(x, this.fricN);
      const binHz = sr / this.fricN;
      let tot = 0, hi = 0, cw = 0, cs = 0;
      const top = Math.min(15000, sr / 2 - 300);
      for (let k = 1; k < ps.length; k++) {
        const f = k * binHz;
        if (f < 300) continue;
        tot += ps[k];
        if (f > 2500) hi += ps[k];
        if (f >= 1000 && f <= top) { cw += f * ps[k]; cs += ps[k]; }
      }
      const hfRatio = tot > 0 ? hi / tot : 0;
      out.hfRatio = hfRatio;
      out.cog = cs > 0 ? cw / cs : 0;

      if (voiced) {
        out.kind = 'voiced';
        this.gap = 0;
        this.pitchHist.push(p.f0);
        if (this.pitchHist.length > 3) this.pitchHist.shift();
        out.f0 = median(this.pitchHist);
        const vq = voiceQuality(y, this.fsd, out.f0);
        out.cpp = vq.cpp; out.h1h2 = vq.h1h2; out.breath = breathiness(vq);
        const ln = Math.round(this.fsd * 0.03);
        const fm = formants(y.subarray(y.length - ln), this.fsd, this.lpcOrder);
        if (fm.length >= 3) {
          this.hist.push(fm.slice(0, 3).map(q => q.f));
          if (this.hist.length > 5) this.hist.shift();
          const F = [0, 1, 2].map(i => median(this.hist.map(h => h[i])));
          // stability: spread of the recent frames relative to their median
          let spread = 0;
          if (this.hist.length >= 3) {
            for (let i = 0; i < 3; i++) {
              const dev = this.hist.map(h => Math.abs(Math.log(h[i] / F[i])));
              spread = Math.max(spread, median(dev));
            }
          } else spread = 1;
          out.formants = F;
          out.stable = this.hist.length >= 3 && spread < 0.06;
        }
      } else if (hfRatio < 0.6 && p.f0 > 0 && p.aperiodicity < 0.5) {
        // too airy to count as clean voicing, but still a voice: measure how breathy it is
        out.kind = 'other';
        const vq = voiceQuality(y, this.fsd, p.f0);
        out.cpp = vq.cpp; out.h1h2 = vq.h1h2; out.breath = breathiness(vq);
        this.softReset();
      } else if (hfRatio > 0.6 && p.aperiodicity > 0.3) {
        out.kind = 'fricative';
        out.sib = out.cog > 5200 ? 's' : 'sh';
        this.softReset();
      } else {
        out.kind = 'other';
        this.softReset();
      }
      return out;
    }

    spectrumColumn(y) {
      const n = 512;
      const ps = powerSpectrum(y, n);
      const col = new Float32Array(ps.length);
      for (let i = 0; i < ps.length; i++) col[i] = 10 * Math.log10(ps[i] + 1e-12);
      return col;
    }

    softReset() { if (++this.gap > 2) { this.hist.length = 0; this.pitchHist.length = 0; } }
    reset() { this.gap = 3; this.hist.length = 0; this.pitchHist.length = 0; }
  }


  // ---------- prosody (intonation) ----------
  // pts: [{t (ms), f0 (Hz, 0 when unvoiced)}] for one phrase. Works in semitones around the
  // phrase's median pitch. end = how far the last eighth of the voicing sits above (+) or below (-)
  // the middle of the phrase; span = 10th to 90th percentile range; sd = spread; peak = how far the
  // highest moment sits above the median, and where it falls (0 = start, 1 = end).
  function prosodyStats(pts) {
    const v = pts.filter(p => p.f0 > 0);
    if (v.length < 12) return null;
    const med = median(v.map(p => p.f0));
    const st = v.map(p => ({ t: p.t, s: 12 * Math.log2(p.f0 / med) }));
    // light smoothing so a single bad frame does not count as a peak or an ending
    const sm = st.map((p, i) => ({ t: p.t, s: median(st.slice(Math.max(0, i - 2), i + 3).map(q => q.s)) }));
    const n = sm.length, ss = sm.map(p => p.s);
    const mid = median(ss.slice(Math.floor(n * 0.3), Math.ceil(n * 0.7)));
    const end = median(ss.slice(Math.min(n - 4, Math.floor(n * 0.88)))) - mid; // the last eighth: where a final rise or fall lands
    let pi = 0; for (let i = 1; i < n; i++) if (ss[i] > ss[pi]) pi = i;
    const t0 = sm[0].t, t1 = sm[n - 1].t;
    const mean = ss.reduce((a, b) => a + b, 0) / n;
    return {
      medianHz: med, end, span: quantile(ss, 0.9) - quantile(ss, 0.1),
      sd: Math.sqrt(ss.reduce((a, b) => a + (b - mean) ** 2, 0) / n),
      peak: ss[pi], peakAt: t1 > t0 ? (sm[pi].t - t0) / (t1 - t0) : 0.5,
      dur: (t1 - t0) / 1000, contour: sm,
    };
  }

  // ---------- word labels for the pitch track ----------
  // Speech recognition gives words but no timings. Spread the words over the voiced frames heard
  // since the previous result: one word per voiced stretch when the counts match, otherwise by
  // syllable count along the voiced time. times: ascending ms timestamps of voiced frames.
  function placeWords(words, times, gapMs = 120) {
    words = words.filter(w => /[a-z0-9]/i.test(w));
    if (!words.length || !times.length) return [];
    const segs = [];
    for (const t of times) {
      const s = segs[segs.length - 1];
      if (s && t - s[1] <= gapMs) s[1] = t; else segs.push([t, t]);
    }
    for (const s of segs) s[1] += 15; // a frame lasts about 15 ms
    if (segs.length === words.length) return words.map((w, i) => ({ w, t0: segs[i][0], t1: segs[i][1] }));
    const total = segs.reduce((a, s) => a + s[1] - s[0], 0);
    const at = (pos) => { // voiced position (ms) -> clock time
      for (const s of segs) { const d = s[1] - s[0]; if (pos <= d) return s[0] + pos; pos -= d; }
      return segs[segs.length - 1][1];
    };
    const wt = words.map(w => Math.max(1, countSyllables(w))), sum = wt.reduce((a, b) => a + b, 0);
    let acc = 0;
    return words.map((w, i) => {
      const p0 = acc / sum * total; acc += wt[i];
      return { w, t0: at(p0 + 0.01), t1: at(acc / sum * total) };
    });
  }

  const api = {
    VOWELS, VOWEL_BY_KEY, SIBILANTS, PITCH_BANDS,
    median, quantile, hzToNote, fft, powerSpectrum, lowpassFIR, decimate,
    yin, lpc, polyRoots, formants, fitVowel, classifyVowel, sibilantAlpha, coachVowel, coachSibilant, COACH_BAND, F1_SLACK, tractShape, isolation, ISO_RULES, voiceQuality, breathiness, BREATH_BAND, countSyllables, placeWords, prosodyStats, NucleusTracker, Analyzer,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VTDSP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
