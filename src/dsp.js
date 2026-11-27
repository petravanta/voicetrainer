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
  // FNV-1a of a text's UTF-8 bytes, as 8 hex digits: tells a pre-made neural reading (refclips/clips.json, made by
  // scripts/make-refclips.py, which hashes the same way) from one of a passage changed since
  function textHash(s) {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  // the time (s) of the first sound well above the silence before it (a tenth of the loudest 5 ms): the same
  // measure the clip script stores, so a decoder's delay can be undone
  function soundOnset(x, fs) {
    const hop = Math.floor(fs / 200), e = [];
    for (let i = 0; i + hop < x.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += x[i + j] * x[i + j]; e.push(Math.sqrt(s / hop)); }
    let mx = 0; for (const v of e) if (v > mx) mx = v;
    const k = e.findIndex(v => v > 0.1 * mx);
    return k < 0 ? 0 : k * hop / fs;
  }
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
  const OCTAVE_DIP = 0.35; // the dip at twice the lag must be this much deeper (see the octave check in yin)
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
    // Octave check: when the second harmonic sits on a formant (an "ee" or "oo" whose F1 is about twice the pitch),
    // the wave nearly repeats every half period and the first dip under the threshold is half the real period, so
    // the pitch reads an octave high. The real period then shows a much deeper dip at twice the lag: take that.
    const dipNear = (t0) => { let m = Math.max(minLag, t0 - 2); for (let t = m; t <= Math.min(maxLag, t0 + 2); t++) if (c[t] < c[m]) m = t; return m; };
    // Only above 110 Hz: no vowel's F1 is under ~220 Hz, and below that the doubled period is more likely creak.
    if (2 * tau + 2 <= maxLag && fs / (2 * tau) >= 110 && c[tau] > 0.03) { const t2 = dipNear(2 * tau); if (c[t2] < OCTAVE_DIP * c[tau]) tau = t2; }
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

  // Returns up to 4 formant candidates [{f, bw}] from a segment sampled at fs (expected ~11-12 kHz).
  // maxBw: poles wider than this are taken for spectral shaping, not a formant.
  function formants(seg, fs, order, lagHz = 50, maxBw = 500, maxN = 4) {
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
      if (f > 180 && f < fs / 2 - 200 && bw > 0 && bw < maxBw) cands.push({ f, bw });
    }
    cands.sort((p, q) => p.f - q.f);
    return cands.slice(0, maxN);
  }

  // ---------- a dominant first harmonic ----------
  // In a light, breathy or "flutey" voice the first harmonic (the pitch itself) can stand 15-35 dB above the second
  // (a firm modal voice: about 0-8 dB). A 10-pole LPC then spends a pole pair on that one harmonic and puts "F1"
  // at the pitch, and the real F1 above it, far weaker, gets no pole at all. Measured on Petra's readings (Nov 2026):
  // 55-65% of steady frames had F1 within 1.35 x the pitch and H1-H2 ~19 dB, against 12% and 5 dB for the neural
  // voice reading the same passage. On the synthetic voice, a breathy source read F1 26% low on average.
  // So before LPC, a first harmonic more than H1_KEEP dB above the second is cut back to that (a peaking EQ at the
  // pitch, Q 2), which leaves the vocal tract's own shape for LPC to fit. A firm voice (H1-H2 under H1_KEEP) is
  // untouched; on the synthetic grid this took a breathy source's F1 error from 27% to 7% and left modal ones as
  // they were. When F1 really sits on the first harmonic (a closed "ee" at a high pitch) the cut can't undo that:
  // the score's own F1 rules (pitchLimited, f1OnPitch) still apply there.
  const H1_KEEP = 4, H1_Q = 2;
  // the cut is used freely under H1_CUT_MAX Hz of pitch; above it only when the plain "F1" sat under F1_ON_PITCH_LOCK x
  // the pitch and the cut finds F1 at H1_CLEAR x the pitch or more (measured 2026-11-17 on synthetic "ee" at 200-320 Hz:
  // the free cut read a 300 Hz F1 as 360-500; with this rule 260-370, as before the cut, and breathy voices under
  // 200 Hz keep the gain: F1 error 27% -> 7%)
  const H1_CUT_MAX = 200, F1_ON_PITCH_LOCK = 1.35, H1_CLEAR = 2.5;
  function tameH1(y, fs, f0, h1h2) {
    if (!(f0 > 0) || !Number.isFinite(h1h2) || h1h2 <= H1_KEEP) return y;
    const A = Math.pow(10, -(h1h2 - H1_KEEP) / 40), w0 = 2 * Math.PI * f0 / fs, al = Math.sin(w0) / (2 * H1_Q), cw = Math.cos(w0);
    const a0 = 1 + al / A, b0 = (1 + al * A) / a0, b1 = -2 * cw / a0, b2 = (1 - al * A) / a0, a1 = -2 * cw / a0, a2 = (1 - al / A) / a0;
    // over the whole buffer, so the filter has settled by the analysis window at its end
    const z = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; z[i] = v; }
    return z;
  }

  // Formants from all candidate poles (sorted by frequency, up to WIDE_F1_BW wide): the narrow ones (< VOICED_MAX_BW),
  // except that some voices have a soft, wide first resonance (an open "ah" with a lot of air): when no narrow pole
  // sits low enough to be F1, the clearest wide one there is taken instead of letting F2 slide into F1's place.
  function pickFormants(all) {
    const fm = all.filter(q => q.bw < VOICED_MAX_BW).slice(0, 4);
    if (!fm.length || fm[0].f > WIDE_F1_RANGE[1]) {
      const w = all.filter(q => q.bw >= VOICED_MAX_BW && q.f >= WIDE_F1_RANGE[0] && q.f <= WIDE_F1_RANGE[1]).sort((p, q) => p.bw - q.bw)[0];
      if (w) { fm.unshift(w); if (fm.length > 4) fm.pop(); fm.wideF1 = true; }
    }
    return fm;
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

  // ---------- what a score can be trusted for ----------
  // LPC pulls F1 towards the nearest strong harmonic once the pitch gets close to F1 (Kent & Vorperian 2018:
  // accuracy is about F0/4 at best; Shadle, Nam & Whalen 2016: every automatic method has this bias). Measured on
  // the synthetic voice, a male-average tract's "ee" scored ~40 at 220 Hz from F1 alone. So above this share of
  // the vowel's typical F1 the resonance score is read from F2 and F3 only, which hold up far better.
  // Re-measured 2026-11 after tameH1 (12 vowels, both tracts, firm and breathy, 110-320 Hz): with the typical F1 at 2x
  // the pitch or more, the full fit's score is off 2-3 points (median, 80th percentile 5-6), the same as F2 and F3 alone;
  // under 1.75x it is off 5-18 (F2 and F3 alone: 2-3). It was 0.45 (2.2x) before; the error between 2x and 2.2x matched
  // the error well clear of the pitch, so F1 now counts up to 2x: "ee" up to about 193 Hz, "oo" about 208 Hz.
  // This limit is the harmonics being too far apart to show where F1 is, which tameH1 can't change.
  const F1_PITCH_RATIO = 0.5;
  const PITCH_WEIGHTS = [0, 1, 0.8];
  // An "F1" this close to the pitch is usually the voice's own first harmonic, which LPC can take for a resonance
  // (common in running speech with a strong fundamental); it says nothing about the vowel's F1. Since tameH1 turns a
  // dominant first harmonic down this rarely fires (0-4% of steady frames on real readings, from 44-62%), but an F1
  // under 1.5x the pitch is past where the synthetic voice reads F1 within 20 points, so it stays as a guard.
  const F1_ON_PITCH = 1.5;
  function f1OnPitch(F, f0) { return f0 > 0 && F[0] < F1_ON_PITCH * f0; }
  function pitchLimitHz(v) { return Math.round(F1_PITCH_RATIO * Math.sqrt(v.M[0] * v.W[0])); }
  function pitchLimited(v, f0) { return f0 > 0 && f0 > F1_PITCH_RATIO * Math.sqrt(v.M[0] * v.W[0]); }
  // Rough best-case spread of a single reading, in score points: each formant read to within F0/4 Hz,
  // (Kent & Vorperian 2018), passed through the same weighted fit. Grows with pitch; never below a 100 Hz voice.
  function scoreSpread(F, v, f0, weights) {
    let num = 0, den = 0;
    for (let i = 0; i < 3; i++) {
      const s = Math.log(v.W[i] / v.M[i]), sd = Math.log(1 + Math.max(f0 || 0, 100) / 4 / F[i]);
      num += (weights[i] * s * sd) ** 2; den += weights[i] * s * s;
    }
    return den > 0 ? 100 * Math.sqrt(num) / den : Infinity;
  }
  // A fit this far off the male-female line is a measuring error (a nasal resonance or a harmonic taken for a
  // formant, the vowel misheard), not a voice: say "couldn't measure" rather than pin it to 0 or 100.
  // Wide enough for real adults: in Hillenbrand et al.'s (1995) recordings 3% of women's vowels sit above 2 (refused
  // before 2026-11), none of the adults' below -1.5 or above 2.5. The nasal and harmonic misreads land far outside.
  const SCORE_RANGE = [-1.5, 2.5];
  function plausible(fit) { return fit.alpha >= SCORE_RANGE[0] && fit.alpha <= SCORE_RANGE[1] && fit.rms < 0.15; }

  // ---------- the resonance scale people see ----------
  // alpha (0 = average man, 1 = average woman for the vowel) is spread over 0..100 so that the whole plausible
  // range fits and nothing a real voice does is pinned at an end: 0 and 100 are the edges of SCORE_RANGE, the
  // average man is 37.5 and the average woman 62.5, and one point is a 1/25 step of the male-female gap
  // (about 0.6% in the formants). Scale 1 (before 2026-11) was alpha * 100 clamped to 0..100.
  const RES_SCALE = 2;
  const RES_PER_ALPHA = 100 / (SCORE_RANGE[1] - SCORE_RANGE[0]);
  const resScore = (alpha) => (alpha - SCORE_RANGE[0]) * RES_PER_ALPHA;
  const resAlpha = (score) => score / RES_PER_ALPHA + SCORE_RANGE[0];
  const RES_AVG = { masc: resScore(0), fem: resScore(1) };
  // Target bands: where 90% of real adult speakers of each group sit. Each speaker's median alpha over their
  // vowels, in Hillenbrand et al. (1995) (45 men, 48 women; the same recordings the averages come from):
  // men 5th-95th percentile -0.31..0.27, women 0.60..1.46. Rounded out to alpha -0.35..0.3 and 0.6..1.5.
  // Past the band's far end (brighter than most women for a feminine goal) still counts as on target.
  const band = (a, b) => [Math.floor(resScore(a)), Math.ceil(resScore(b))]; // rounded outwards, to whole points
  const RES_BANDS = { masc: band(-0.35, 0.3), fem: band(0.6, 1.5) };
  // A score saved on scale 1, moved to this one. Scale 1 clamped at 0 and 100, so those two stay at the
  // scale-1 ends (37.5 and 62.5 here): the real value was that or further out.
  const fromScale1 = (s) => (typeof s === 'number' && Number.isFinite(s) ? Math.round(resScore(s / 100) * 10) / 10 : s);
  // Move one saved reading or practice record to this scale (a copy; records already on it are returned as they are).
  // Practice kinds 'sound' (vowel, consonant, word and whispered-vowel drills) and 'spot' hold resonance scores;
  // the others are breathiness, semitones, percentages or Hz.
  // Breathiness (readings' breath, breath exercises' score) moves to BREATH_SCALE the same way, marked bs.
  function migrateRecord(r, list) {
    if (!r) return r;
    if (!(r.bs >= BREATH_SCALE)) {
      r = Object.assign({}, r, { bs: BREATH_SCALE });
      if (list === 'practice') { if (r.kind === 'breath') r.score = breathFromScale1(r.score); } else r.breath = breathFromScale1(r.breath);
    }
    if (r.rs >= RES_SCALE) return r;
    const o = Object.assign({}, r, { rs: RES_SCALE, rsFrom: r.rs || 1 }); // rsFrom: converted, so the History can say so
    if (list === 'practice') { if ((r.kind || 'sound') === 'sound' || r.kind === 'spot') o.score = fromScale1(r.score); return o; }
    o.resonance = fromScale1(r.resonance); o.sibS = fromScale1(r.sibS); o.sibSh = fromScale1(r.sibSh);
    if (r.vowels) o.vowels = Object.fromEntries(Object.entries(r.vowels).map(([k, v]) => [k, fromScale1(v)]));
    if (r.vmap) o.vmap = Object.fromEntries(Object.entries(r.vmap).map(([k, e]) => [k, Array.isArray(e) ? e.map((x, i) => (i === 3 ? fromScale1(x) : x)) : e]));
    if (Array.isArray(r.byWord)) o.byWord = r.byWord.map(w => (Array.isArray(w) ? w.map((x, i) => (i === 2 || i === 3 ? fromScale1(x) : x)) : w));
    return o;
  }
  // The resonance score for formants F heard as vowel v at pitch f0 (0 = unknown):
  // { alpha, rms, per, pitchLimited, ok (plausible), spread (± score points) }
  // When the three formants don't line up but F2 and F3 agree closely, only F1 is off. F1 is the least reliable
  // formant (a soft, wide F1, or a voice whose F1 sits outside both references, like a very closed "ee"), so the
  // score is then read from F2 and F3 as at high pitch, and marked f1Off.
  // Kept after tameH1 (2026-11), for a different reason than it was added: F1 is now read right on a breathy voice, and
  // when it alone disagrees it is usually a real difference of articulation, not size: a tight, high "ee" lowers F1 at any
  // tract length, and the published averages disagree on it by more than men and women differ (Hillenbrand 1995 "ee" F1:
  // men 342, women 437 Hz; Peterson & Barney 1952: 270 and 310). So the score, which is about size and shape, stays on
  // F2 and F3, and Formant by formant still shows F1's own position (marked "?") as the jaw cue to work on.
  // F1_OFF_FULL was 0.1 before 2026-11; 0.08 sits under HOLD_RMS, so a fit pulled off by F1 alone (a closed "ee" whose F1
  // LPC drags towards the 2nd harmonic at 150-170 Hz) is read from F2 and F3 rather than scored ~12 points dark or dropped.
  const F1_OFF_RMS = 0.06, F1_OFF_FULL = 0.08;
  function scoreVowel(F, v, f0 = 0) {
    const lim = pitchLimited(v, f0) || f1OnPitch(F, f0), w = lim ? PITCH_WEIGHTS : FIT_WEIGHTS;
    const fit = fitVowel(F, v, w);
    if (!lim && fit.rms >= F1_OFF_FULL) {
      const f23 = fitVowel(F, v, PITCH_WEIGHTS);
      if (f23.rms < F1_OFF_RMS && plausible(f23))
        return Object.assign(f23, { pitchLimited: false, f1Off: true, ok: true, spread: scoreSpread(F, v, f0, PITCH_WEIGHTS) });
    }
    return Object.assign(fit, { pitchLimited: lim, ok: plausible(fit), spread: scoreSpread(F, v, f0, w) });
  }

  // Jointly identify the vowel and its resonance. Out-of-range alphas are penalised so a
  // stretched vowel does not masquerade as a neighbour.
  function classifyVowel(F, candidates = VOWELS, f0 = 0) {
    const res = [];
    for (const v of candidates) {
      const fit = fitVowel(F, v, f1OnPitch(F, f0) ? [0, 1, 0.7] : [1, 1, 0.7]);
      const excess = Math.max(0, -0.6 - fit.alpha, fit.alpha - 1.6);
      const cost = Math.hypot(fit.rms, excess * 0.12);
      res.push({ v, cost, fitRms: fit.rms });
    }
    res.sort((p, q) => p.cost - q.cost);
    const best = res[0];
    const scored = scoreVowel(F, best.v, f0);
    return { vowel: best.v, alpha: scored.alpha, per: scored.per, cost: best.cost, margin: res.length > 1 ? res[1].cost - best.cost : Infinity,
      ok: scored.ok, pitchLimited: scored.pitchLimited, spread: scored.spread };
  }

  // ---------- a held vowel keeps its name ----------
  // Guessed afresh from each frame, a vowel's name follows its formants. Sliding the resonance of one held vowel moves
  // all of them, so a bright "eh" starts to look like a dark "a" (as in cat) and a bright "aw" like a dark "oh": the
  // name flips, the score is read against the other vowel's averages, and the meter stalls or jumps instead of
  // following the slide (measured on synthetic slides: "aw" 42 -> 72 for a 6% step, "oo" shown lower when brighter).
  // While a sound is held, it is still the same vowel, so it keeps being scored as that one as long as it fits it
  // about as well as an exercise asks (rms under HOLD_RMS) and stays in the plausible range.
  const HOLD_RMS = 0.085;
  function heldVowelFit(F, held, f0 = 0) {
    if (!held) return null;
    const fit = scoreVowel(F, held, f0);
    return fit.ok && fit.rms < HOLD_RMS ? Object.assign(fit, { vowel: held, held: true }) : null;
  }

  // ---------- the vowels a word should have ----------
  // In a reading the text is known, so a vowel heard on a word is checked against the vowels that word should
  // have (its stressed syllables, from data/pron.json) instead of being guessed from sound among all twelve.
  // Short function words are reduced in connected speech ("the" is a quick schwa), so they are not scored;
  // nor are glides ("sign", "round", "boil") and r-coloured vowels ("arch", "there"), which don't hold one
  // vowel shape. The cot/caught pair is accepted either way, since many speakers say them alike.
  const FUNCTION_WORDS = new Set(('a an the and or but nor if as than that this these those of to in on at by for from with into onto upon '
    + 'off out up via per is am are was were be been being have has had do does did will would shall should can could may might must '
    + 'i me my he him his she her it its we us our you your they them their there theirs who whom whose which what so not '
    + "it's i'm i've i'll i'd you're you've you'll he's she's we're we've they're they've that's there's isn't wasn't don't doesn't didn't can't won't").split(' '));
  const CODE_KEY = { A: 'ae' }; // pron.json writes the two-letter key "ae" as one letter
  const VOWEL_ALT = { a: ['c'], c: ['a'] };
  // pron: { words: { code: "word word ..." } } -> Map word -> code
  function pronIndex(pron) {
    const m = new Map();
    for (const [code, ws] of Object.entries((pron && pron.words) || {})) for (const w of ws.split(' ')) m.set(w, code);
    return m;
  }
  // -> { keys: [vowel keys], why: 'ok' | 'function' | 'glide' | 'unknown' }; keys is empty unless why is 'ok'
  // a word's dictionary code (its full vowels in order, 'x' for a gliding one), or why there is none
  function pronCode(text, idx) {
    const w = String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z']+|[^a-z']+$/g, '').replace(/^'+|'+$/g, '');
    if (!w) return { why: 'unknown' };
    if (FUNCTION_WORDS.has(w)) return { why: 'function' };
    const look = (x) => idx.get(x) || (/'s$/.test(x) ? idx.get(x.slice(0, -2)) : null) || (/s$/.test(x) && !/ss$/.test(x) ? idx.get(x.slice(0, -1)) : null);
    // a hyphenated word ("ninety-three", "mmm-me") has the vowels of its parts; a part we can't look up
    // (a hum like "mmm") is skipped, and a short part is said in full here, so it counts
    const code = w.includes('-') ? w.split('-').map(look).filter(Boolean).join('') : look(w);
    return code ? { code } : { why: 'unknown' };
  }
  // The full vowels of a word in order, as vowel keys ('x' for a gliding vowel), or null for a linking word or one
  // not in the dictionary. The demo voice uses it to say a passage's words with the vowels the reading expects.
  function wordVowelSeq(text, idx) {
    const r = pronCode(text, idx);
    return r.code ? [...r.code].map(c => CODE_KEY[c] || c) : null;
  }
  function wordVowels(text, idx) {
    const pc = pronCode(text, idx), code = pc.code;
    if (!code) return { keys: [], why: pc.why };
    const keys = [...new Set([...code].filter(c => c !== 'x').map(c => CODE_KEY[c] || c))];
    return keys.length ? { keys, why: 'ok' } : { keys: [], why: 'glide' };
  }
  // A steady frame heard on a word with vowels `keys`: the best fit among those vowels, or null when the
  // frame doesn't sound like any of them (a consonant transition, an unstressed syllable, or the highlight
  // being on a neighbouring word). Same rule as a vowel drill: a close fit, or the free guess agrees.
  function matchWordVowel(F, keys, guess = classifyVowel(F), f0 = 0) {
    const cands = [...new Set(keys.flatMap(k => [k].concat(VOWEL_ALT[k] || [])))].map(k => VOWEL_BY_KEY[k]).filter(Boolean);
    if (!cands.length) return null;
    const v = cands.includes(guess.vowel) ? guess.vowel : classifyVowel(F, cands).vowel;
    const fit = scoreVowel(F, v, f0);
    if (!(cands.includes(guess.vowel) || fit.rms < 0.085) || !fit.ok) return null;
    return { vowel: v, alpha: fit.alpha, per: fit.per, pitchLimited: fit.pitchLimited, f1Off: !!fit.f1Off, spread: fit.spread };
  }
  // The vowels a sung line should have: every stressed vowel of its words (linking words left out), for
  // matchWordVowel. Sing doesn't know which word you're on, only the line, so a frame is checked against them all.
  // -> [vowel keys], empty when the line has no word we can look up
  function lineVowels(text, idx) {
    const keys = new Set();
    for (const w of String(text || '').split(/\s+/)) { const r = wordVowels(w, idx); if (r.why === 'ok') r.keys.forEach(k => keys.add(k)); }
    return [...keys];
  }

  // Live coaching for a held vowel. Positions use the same 0 (male avg) .. 100 (female avg) scale
  // per formant. A formant is fine inside the goal band; outside it, `need` says which way it must
  // move. `focus` is the single most useful change: one formant, or 'all' when every formant is off
  // the same way (a whole-tract change such as larynx height).
  // Each formant's zone on its own alpha x 100 line. The near edges are the target bands' (see RES_BANDS), so a
  // voice the meter calls on target isn't told to change; the far edges stay tight, to catch one formant overdone.
  const COACH_BAND = { fem: [60, 135], masc: [-35, 30] };
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
    // resonance slide: the whole tract moves (dark to bright or back) while pitch holds within +-hold semitones.
    // Read from F2 and F3 like tractShape's shared shift; F1 is unreliable at higher pitch, so it only must not go the other way.
    slide:  { shift: [1, 2], thr: 0.07, hold: 1.5 },
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
    } else if (r.shift) {
      const [p, q] = r.shift, dir = Math.sign(dev[p]);
      moved = Math.min(a[p], a[q]) >= r.thr && Math.sign(dev[q]) === dir;
      ok = moved && Math.min(a[p], a[q]) >= 0.4 * Math.max(a[p], a[q]) && dev[0] * dir > -0.05 && Math.abs(semis) <= r.hold;
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

  // ---------- one formant at a time ----------
  // Where each of F1, F2 and F3 sits on its own, on the resonance scale people see (0..100, average man 37.5,
  // average woman 62.5 for that vowel), and how far it is from its goal zone: direction, score points, and the change
  // in Hz and % that would bring it to the zone's near edge. The zones and the "which one first" pick are the live
  // coach's (coachVowel), so the gauges, the tips and the vocal tract sketch always agree. F1 is not judged when the
  // score itself sets it aside (high pitch, an F1 on the pitch, or F1 alone off while F2 and F3 agree), and a formant
  // whose own position is outside anything a real voice does reads "couldn't measure" instead of being clamped.
  // opt: { f0 (Hz, 0 = unknown), f1Off (the score set F1 aside) }
  // -> { rows: [{ i, hz, score, zone: [lo, hi] score points, need: 1 | -1 | 0, pts, toHz, dHz, pct, skip }],
  //      worst (index of the formant furthest off, weighted as the coach weighs them, or null), focus (coach-style:
  //      { formant: 0..2 | 'all', dir }), onTarget, aside ('pitch' | 'f1off' | null) }; unsure: F1 set aside by the score
  //      but still shown (see below)
  const FORMANT_SLACK_A = F1_SLACK / 100; // F1's wider zone, in alpha
  function formantOffsets(F, v, goal, opt = {}) {
    const g = goal === 'masc' ? 'masc' : 'fem', f0 = opt.f0 || 0;
    const c = coachVowel(F, v, g), fit = scoreVowel(F, v, f0);
    const aside = fit.pitchLimited ? 'pitch' : fit.f1Off || opt.f1Off ? 'f1off' : null;
    const rows = [0, 1, 2].map(i => {
      const sl = i === 0 ? FORMANT_SLACK_A : 0, a = c.pos[i] / 100;
      const zA = [COACH_BAND[g][0] / 100 - sl, COACH_BAND[g][1] / 100 + sl];
      const row = { i, hz: F[i], score: resScore(a), zone: zA.map(resScore), need: 0, pts: 0, toHz: null, dHz: 0, pct: 0, skip: null };
      if (!(F[i] > 0) || !Number.isFinite(a)) row.skip = 'range';
      else if (i === 0 && aside === 'pitch') {
        row.skip = 'pitch'; row.f0 = Math.round(f0);
        // which rule: the pitch past half this vowel's typical F1, or an "F1" under 1.5x the pitch (the harmonic itself)
        row.pitchWhy = pitchLimited(v, f0) ? 'high' : 'onpitch'; row.limitHz = pitchLimitHz(v);
      }
      else if (a < SCORE_RANGE[0] - sl || a > SCORE_RANGE[1] + sl) row.skip = 'range';
      // F1 alone disagreeing with F2 and F3 is still shown (it may be a real jaw or throat difference, the one thing
      // to dial in), but marked unsure and never picked as the one to fix first, since it is as likely a misreading
      if (i === 0 && aside === 'f1off') row.unsure = true;
      if (row.skip) { row.score = null; return row; }
      row.need = c.need[i];
      if (row.need) {
        const edge = row.need > 0 ? zA[0] : zA[1];
        row.toHz = v.M[i] * Math.pow(v.W[i] / v.M[i], edge);
        row.dHz = row.toHz - F[i]; row.pct = row.toHz / F[i] - 1;
        row.pts = Math.abs(resScore(edge) - row.score);
      }
      return row;
    });
    const w = rows.map(r => (r.skip || r.unsure ? 0 : r.pts * COACH_WEIGHT[r.i]));
    const top = Math.max(...w), worst = top > 0 ? w.indexOf(top) : null;
    let focus = null;
    if (worst != null) {
      const n = rows.map(r => r.need), m = w;
      const same = n[1] === n[2] && n[1] !== 0 && n[0] !== -n[1] && Math.min(m[1], m[2]) > 0.45 * Math.max(m[1], m[2]);
      focus = same ? { formant: 'all', dir: n[1] } : { formant: worst, dir: n[worst] };
    }
    return { rows, worst, focus, onTarget: worst == null && rows.some(r => !r.skip), aside };
  }
  // The same over a whole reading or session: items [{ k (vowel key), F: [F1, F2, F3], n (frames) }], f0 the median pitch.
  // Each formant's position is the frame-weighted mean of its per-vowel positions (each already relative to its own
  // vowel's averages, so they can be pooled); pct is the mean change asked for over the vowels where it is off.
  // -> { rows: [{ i, score, zone, need, pts, pct, nOff, nVowels, skip }], worst, together (1 | -1 | 0), byVowel: { k: formantOffsets } }
  function formantSummary(items, goal, f0 = 0) {
    const byVowel = {};
    for (const it of items || []) { const v = VOWEL_BY_KEY[it.k]; if (v && it.F && it.F.every(f => f > 0)) byVowel[it.k] = formantOffsets(it.F, v, goal, { f0 }); }
    const ks = Object.keys(byVowel), wOf = (k) => Math.max(1, (items.find(it => it.k === k) || {}).n || 1);
    const rows = [0, 1, 2].map(i => {
      const use = ks.filter(k => !byVowel[k].rows[i].skip && !byVowel[k].rows[i].unsure);
      const g = goal === 'masc' ? 'masc' : 'fem', sl = i === 0 ? FORMANT_SLACK_A : 0;
      const zone = [COACH_BAND[g][0] / 100 - sl, COACH_BAND[g][1] / 100 + sl].map(resScore);
      if (!use.length) {
        const why = ks.map(k => byVowel[k].rows[i].skip || (byVowel[k].rows[i].unsure ? 'f1off' : null));
        return { i, score: null, zone, need: 0, pts: 0, pct: 0, nOff: 0, nVowels: 0, skip: why.find(x => x === 'pitch') || why[0] || 'none' };
      }
      let sw = 0, ss = 0, sp = 0, spw = 0, sn = 0, nOff = 0;
      for (const k of use) {
        const r = byVowel[k].rows[i], wt = wOf(k);
        sw += wt; ss += wt * r.score; sn += wt * r.pts * (r.need || 0);
        if (r.need) { nOff++; sp += wt * r.pct; spw += wt; }
      }
      const signed = sn / sw, need = Math.abs(signed) >= 0.5 ? Math.sign(signed) : 0;
      return { i, score: ss / sw, zone, need, pts: Math.abs(signed), pct: spw ? sp / spw : 0, nOff, nVowels: use.length, skip: null };
    });
    const w = rows.map(r => r.pts * COACH_WEIGHT[r.i] * (r.need ? 1 : 0)), top = Math.max(...w);
    // F2 and F3 off the same way by a similar amount: a whole-tract (larynx) change, as the live coach reads it
    const together = rows[1].need && rows[1].need === rows[2].need && Math.min(w[1], w[2]) > 0.45 * Math.max(w[1], w[2]) ? rows[1].need : 0;
    return { rows, worst: top > 0 ? w.indexOf(top) : null, together, byVowel };
  }
  function coachSibilant(cog, sib, goal) {
    const [lo, hi] = COACH_BAND[goal];
    const pos = sibilantAlpha(cog, sib) * 100;
    const dir = pos < lo ? 1 : pos > hi ? -1 : 0;
    return { pos, dir, distance: pos < lo ? lo - pos : pos > hi ? pos - hi : 0, onTarget: dir === 0 };
  }


  // ---------- voice dimensions: one model for every summary (readings, Freestyle sessions, drills) ----------
  // Groups what the app measured by the knob it belongs to (pitch, resonance, voice quality, melody, articulation),
  // each with a value, where it sits against the goal, and a 0-100 position for a bar. Only what was measured
  // is listed; the knobs the app can't read yet are named in notMeasured so nothing is faked.
  // m: { goal, pitchBand: [lo, hi] Hz, pitch: { median, p10?, p90?, share? (0..1 in target) } | null,
  //      res: { score, pm?, shaky?, why? } | null, fo: formantSummary(...) or formantOffsets(...) | null,
  //      breath: number | null (scale 2), sib: { s?, sh? } scores }
  const DIM_PITCH_AXIS = [70, 400]; // Hz, log scale, for the pitch bar
  const DIM_SPREAD_MAX = 24; // semitones, for the pitch movement bar
  const DIMS_NOT_MEASURED = ['larynx height on its own', 'vocal weight', 'twang', 'loudness', 'rhythm'];
  function voiceDims(m) {
    const goal = m.goal === 'masc' ? 'masc' : 'fem', fem = goal === 'fem', fin = (x) => typeof x === 'number' && Number.isFinite(x);
    const oneSided = (v, [lo, hi], unit = '') => {
      const ok = fem ? v >= lo : v <= hi, gap = fem ? lo - v : v - hi;
      return { status: ok ? 'ok' : 'off', dir: ok ? 0 : fem ? 1 : -1, gap: ok ? 0 : gap, verdict: ok ? 'on goal' : `${fem ? '↑' : '↓'} ${Math.max(1, Math.round(gap))}${unit} to goal` };
    };
    const groups = [];
    // pitch
    const p = m.pitch, pb = m.pitchBand || PITCH_BANDS[goal];
    if (p && fin(p.median) && p.median > 0) {
      const ax = (hz) => 100 * (Math.log(Math.min(Math.max(hz, DIM_PITCH_AXIS[0]), DIM_PITCH_AXIS[1])) - Math.log(DIM_PITCH_AXIS[0])) / (Math.log(DIM_PITCH_AXIS[1]) - Math.log(DIM_PITCH_AXIS[0]));
      const j = oneSided(p.median, pb, ' Hz');
      const sub = fin(p.p10) && fin(p.p90) ? `${Math.round(p.p10)}-${Math.round(p.p90)} Hz` : '';
      const rows = [{ key: 'pitch', label: 'Pitch', sub: 'median', value: `${Math.round(p.median)} Hz`, more: sub, pos: ax(p.median), zone: [ax(pb[0]), ax(pb[1])], goal: `${pb[0]}-${pb[1]} Hz`, ...j }];
      if (fin(p.share)) rows.push({ key: 'share', label: 'Time in target', sub: '', value: `${Math.round(p.share * 100)}%`, pos: p.share * 100, zone: null, goal: `${pb[0]}-${pb[1]} Hz`, status: 'info', dir: 0, gap: 0, verdict: 'of voiced time' });
      groups.push({ key: 'pitch', title: 'Pitch', rows });
    }
    // resonance: the score, then the three formants it is made from
    const res = m.res, rb = RES_BANDS[goal];
    if (res && (fin(res.score) || res.why)) {
      const rows = [];
      if (fin(res.score)) rows.push({ key: 'res', label: 'Resonance score', sub: '', value: (res.shaky ? '≈' : '') + Math.round(res.score), more: fin(res.pm) ? `± ${res.pm}` : '', pos: res.score, zone: rb, goal: `${rb[0]}-${rb[1]}`, ...oneSided(res.score, rb) });
      else rows.push({ key: 'res', label: 'Resonance score', sub: '', value: '--', pos: null, zone: rb, goal: `${rb[0]}-${rb[1]}`, status: 'na', dir: 0, gap: 0, verdict: 'no reading', why: res.why });
      const fo = m.fo, hasFo = fo && fo.rows && fo.rows.some(r => r.score != null || r.skip === 'pitch');
      let note = '';
      if (hasFo) {
        const together = fo.together != null ? fo.together : fo.focus && fo.focus.formant === 'all' ? fo.focus.dir : 0;
        if (together) note = together > 0 ? 'F2 and F3 are low together: that points to throat length, so a slightly higher larynx moves both.' : 'F2 and F3 are high together: that points to throat length, so a slightly lower larynx moves both.';
      }
      groups.push({ key: 'res', title: 'Resonance', rows, fo: hasFo ? fo : null, note, larynx: hasFo ? (note ? (note.includes('higher') ? 1 : -1) : 0) : null });
    }
    // voice quality
    if (fin(m.breath)) {
      const [lo, hi] = BREATH_BAND[goal], b = m.breath, ok = b >= lo && b <= hi;
      groups.push({ key: 'quality', title: 'Voice quality', rows: [{ key: 'breath', label: 'Breathiness', sub: '', value: String(Math.round(b)), pos: b, zone: [lo, hi], goal: `${lo}-${hi}`,
        status: ok ? 'ok' : 'off', dir: ok ? 0 : b < lo ? 1 : -1, gap: ok ? 0 : b < lo ? lo - b : b - hi, verdict: ok ? 'in zone' : b < lo ? `↑ ${Math.max(1, Math.round(lo - b))} airier` : `↓ ${Math.max(1, Math.round(b - hi))} firmer` }] });
    }
    // melody: how far the pitch moves (10th to 90th percentile); no goal, a style rather than a size
    if (p && fin(p.p10) && fin(p.p90) && p.p10 > 0 && p.p90 >= p.p10) {
      const st = 12 * Math.log2(p.p90 / p.p10);
      groups.push({ key: 'melody', title: 'Melody', rows: [{ key: 'spread', label: 'Pitch movement', sub: 'low to high', value: `${st.toFixed(1)} st`, pos: 100 * Math.min(st, DIM_SPREAD_MAX) / DIM_SPREAD_MAX, zone: null, goal: '', status: 'info', dir: 0, gap: 0, verdict: 'no goal' }] });
    }
    // articulation: sibilant brightness, on the resonance scale and bands
    const sib = m.sib || {}, srows = [];
    for (const [k, lab] of [['s', '/s/ brightness'], ['sh', '/ʃ/ brightness']]) if (fin(sib[k])) srows.push({ key: k, label: lab, sub: '', value: String(Math.round(sib[k])), pos: sib[k], zone: rb, goal: `${rb[0]}-${rb[1]}`, ...oneSided(sib[k], rb) });
    if (srows.length) groups.push({ key: 'artic', title: 'Articulation', rows: srows });
    return { goal, groups, notMeasured: DIMS_NOT_MEASURED.slice() };
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
  // Room sound, a mic switching on, or a stray periodic burst must not count as a syllable, so
  //  - for the first `armMs` after a reset (or a gap in the frames, e.g. the mic restarting) it only
  //    listens and learns the room's level; nothing counts yet,
  //  - an onset counts only once voicing has held for `holdMs` at least `floorDb` above that level.
  // The room level keeps following the quiet frames, dropping quickly and rising slowly.
  class NucleusTracker {
    constructor(dipDb = 3, minGapMs = 110, opts = {}) {
      this.dip = dipDb; this.gap = minGapMs;
      this.armMs = opts.armMs != null ? opts.armMs : 350;
      this.holdMs = opts.holdMs != null ? opts.holdMs : 45;
      this.floorDb = opts.floorDb != null ? opts.floorDb : 10;
      this.reset();
    }
    reset() { this.count = 0; this.heard = 0; this.inNuc = false; this.peak = -200; this.valley = -200; this.lastT = -1e9; this.silentMs = 0; this.lastFrameT = null; this.arm(); }
    arm() { this.armLeft = this.armMs; this.armE = []; this.floor = null; this.cand = null; this.inNuc = false; this.valley = -200; }
    get armed() { return this.armLeft <= 0; }
    mark() { this.heard = 0; } // `heard` counts nuclei since the last reset or mark
    push(fr, tMs) {
      if (this.lastFrameT != null && tMs - this.lastFrameT > 500) this.arm(); // frames stopped for a while: listen afresh
      const dt = this.lastFrameT == null ? 16 : Math.min(100, Math.max(0, tMs - this.lastFrameT));
      this.lastFrameT = tMs;
      const e = 20 * Math.log10(fr.rms + 1e-9);
      if (fr.kind === 'silence') this.silentMs += dt; else this.silentMs = 0;
      if (this.armLeft > 0) {
        this.armLeft -= dt;
        this.armE.push(e);
        if (this.armLeft <= 0) { const s = this.armE.slice().sort((a, b) => a - b); this.floor = s[Math.floor(s.length * 0.3)]; this.armE = []; }
        return false;
      }
      if (fr.kind !== 'voiced') this.floor = e < this.floor ? 0.7 * this.floor + 0.3 * e : this.floor + Math.min(e - this.floor, 0.05);
      const loud = e > this.floor + this.floorDb;
      if (fr.kind === 'voiced' && loud) {
        if (!this.inNuc) {
          if (this.cand == null) {
            if (e > this.valley + this.dip && tMs - this.lastT > this.gap) this.cand = { t: tMs, e };
            else this.valley = Math.min(this.valley, e);
          }
          if (this.cand && tMs - this.cand.t >= this.holdMs) {
            this.count++; this.heard++; this.inNuc = true; this.peak = Math.max(e, this.cand.e); this.lastT = this.cand.t; this.cand = null; return true;
          }
        } else {
          this.peak = Math.max(this.peak, e);
          if (e < this.peak - this.dip) { this.inNuc = false; this.valley = e; }
        }
      } else {
        this.inNuc = false; this.valley = -200; this.cand = null;
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
  // The cepstral peak is read over ~85 ms. When that window is not all voice (the vowel has only just started, or
  // a consonant or a gap sits in it), the silence or noise in it lowers CPP as if the voice were airy. On a real
  // voice that put a spoken sentence at 39 against 0-10 for the same voice's held vowels; reading only frames whose
  // window is evenly voiced brought the sentence to 19. So a frame whose quietest third of the window is more than
  // 6 dB under its loudest gets no breathiness reading (out.breathUneven).
  const BREATH_EVEN = 0.25; // energy ratio, quietest third to loudest
  function breathWindowUneven(y, fs) {
    const n = 1 << Math.floor(Math.log2(Math.min(y.length, Math.round(fs * 0.09)))), h = Math.floor(n / 3), s = y.length - n;
    const e = [];
    for (let k = 0; k < 3; k++) { let a = 0; for (let i = s + k * h; i < s + (k + 1) * h; i++) a += y[i] * y[i]; e.push(a); }
    return Math.min(...e) < BREATH_EVEN * Math.max(...e);
  }
  // dB: mostly air .. very clear. The clear end was 25 dB before 2026-11 (scale 1), but clear voices read 25-29 dB
  // (the synthetic voice 27-29, one real voice's clear "ee" 25-28 on a phone), so every clear voice read 0 and a
  // mildly airy one too: that voice's sigh-like "ee" dropped CPP by 2.5 dB and still read 4. With the clear end at
  // 29 dB the same step reads 13 -> 29. Below 25 dB nothing changes but the numbers: scale 2 = 25 + 0.75 x scale 1,
  // and the bands and words below are the old ones moved the same way, so they mean the same voice as before.
  const BREATH_CPP = [13, 29];
  const BREATH_SCALE = 2;
  const BREATH_BAND = { fem: [40, 63], masc: [32, 55] }; // scale 1: fem 20-50, masc 10-40
  function breathiness(q) {
    return Math.max(0, Math.min(100, 100 * (BREATH_CPP[1] - q.cpp) / (BREATH_CPP[1] - BREATH_CPP[0])));
  }
  // A breathiness saved on scale 1, moved to scale 2. Scale 1 read every CPP over 25 dB as 0, so a saved 0 was
  // somewhere in 0..25 now: it becomes the middle of that, 12.
  const breathFromScale1 = (b) => (typeof b === 'number' && Number.isFinite(b) ? (b <= 0 ? 12 : Math.round((25 + 0.75 * b) * 10) / 10) : b);

  function sibilantAlpha(cog, sib) {
    return Math.log(cog / sib.M) / Math.log(sib.W / sib.M);
  }

  // ---------- whispered sound ----------
  // A whisper has no tone, but the vocal tract still shapes the airflow noise, so its formants can be
  // read with LPC (noise excitation has no harmonics to mislead it, so a longer window and a higher
  // order work). Returns [F1, F2, F3] in Hz, or null for frames that do not look like a whispered
  // vowel: an /s/, a sound with almost no energy below 1.2 kHz (/sh/, /f/), or formants out of range.
  function whisperFormants(y, fs, order, cog) {
    if (cog > 5200) return null;
    const ps = powerSpectrum(y, y.length), bin = fs / y.length;
    let low = 0, tot = 0;
    for (let k = Math.ceil(250 / bin); k < ps.length; k++) { tot += ps[k]; if (k * bin < 1200) low += ps[k]; }
    if (!(tot > 0) || low / tot < 0.06) return null;
    // noise can split one formant into two wide poles; then try a lower and a higher order and
    // keep the fit whose first three formants are sharpest
    let best = null;
    for (const p of [order, order - 2, order + 2]) {
      const fm = formants(y, fs, p, 50).slice(0, 3);
      if (fm.length < 3) continue;
      const w = Math.max(...fm.map(q => q.bw));
      if (!best || w < best.w) best = { w, F: fm.map(q => q.f) };
      if (w < 330) break;
    }
    const F = best && best.F;
    return F && F[0] < 1300 && F[1] > 600 && F[2] < 4300 ? F : null;
  }
  // Whispered vowels have higher formants than voiced ones, F1 most (e.g. Kallail & Emanuel 1984;
  // Jovičić 1998). F1 is also the hardest to read without a tone, so whisper scores use only F2 and
  // F3, after taking off an approximate whisper shift. Speakers differ, so treat the score as a
  // trend within one setup rather than an exact match to the voiced scale.
  const WHISPER_SHIFT = [1.25, 1.05, 1.03];
  const WHISPER_WEIGHTS = [0, 1, 0.8];
  function whisperFit(F, v) {
    return fitVowel(F.map((f, i) => f / WHISPER_SHIFT[i]), v, WHISPER_WEIGHTS);
  }
  // Brightness of a whisper: the log of the geometric mean of F2 and F3. It rises as the tract gets
  // shorter or the tongue moves forward, which is what a whisper siren slides up and down.
  function whisperBrightness(F) { return 0.5 * (Math.log(F[1]) + Math.log(F[2])); }
  // Counts the legs of a siren in a brightness series: alternating rises and falls of at least
  // `step` (natural log units, 0.12 is about 13%), with hysteresis so small wobbles do not count.
  const SIREN_STEP = 0.12;
  const SIREN_FURTHER = 0.015; // a slide still going: a new extreme at least this far (~1.5%) past the last one
  function sirenLegs(vals, step = SIREN_STEP) {
    let lo = Infinity, hi = -Infinity, dir = 0, ext = 0, legs = 0, extAt = -1, far = 0;
    const go = (i) => { if (Math.abs(ext - far) >= SIREN_FURTHER) { far = ext; extAt = i; } };
    vals.forEach((v, i) => {
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      if (dir === 0) {
        if (v - lo >= step) { dir = 1; legs = 1; ext = far = v; extAt = i; } else if (hi - v >= step) { dir = -1; legs = 1; ext = far = v; extAt = i; }
      } else if (dir === 1) {
        if (v > ext) { ext = v; go(i); } else if (ext - v >= step) { dir = -1; legs++; ext = far = v; extAt = i; }
      } else if (v < ext) { ext = v; go(i); } else if (v - ext >= step) { dir = 1; legs++; ext = far = v; extAt = i; }
    });
    // extAt: where the leg in progress last went clearly further (SIREN_FURTHER, so a wobbly end doesn't count). A leg is counted as soon as it has moved `step`,
    // part way through the slide; it is only finished once it stops going further (see the whisper siren).
    return { legs, span: vals.length ? hi - lo : 0, dir, extAt, since: extAt < 0 ? 0 : vals.length - 1 - extAt };
  }

  // ---------- sibilant exercises (Practice > Sibilants) ----------
  // A hiss centred above SIB_SPLIT reads as /s/, below as /ʃ/, the same split the analyzer labels frames with.
  const SIB_SPLIT = 5200;
  // Hisses in a run of frames: fricative frames close together (gaps up to `gap` frames) make one burst, and a
  // burst shorter than `min` frames is dropped. frames: [{ cog: Hz | null }] in order (null: not a hiss).
  // Each burst: { a, b (first and last frame index), n (hiss frames), cog (median Hz of its middle 80%), sib }.
  function sibBursts(frames, { gap = 4, min = 6 } = {}) {
    const out = [];
    let cur = null;
    const close = () => {
      if (cur && cur.c.length >= min) {
        const c = cur.c, cut = Math.floor(c.length * 0.1), mid = c.slice(cut, c.length - cut);
        const cog = median(mid.length ? mid : c);
        out.push({ a: cur.a, b: cur.b, n: c.length, cog, sib: cog > SIB_SPLIT ? 's' : 'sh' });
      }
      cur = null;
    };
    frames.forEach((f, i) => {
      if (f && f.cog > 0) {
        if (cur && i - cur.b > gap + 1) close();
        if (!cur) cur = { a: i, b: i, c: [] };
        cur.b = i; cur.c.push(f.cog);
      }
    });
    close();
    return out;
  }
  // Turning points of a glide between /s/ and /ʃ/. vals: log(hiss centre) of each hiss frame in order.
  // Smoothed (running median of 5) so a single odd frame doesn't turn it, then a turn is counted once the
  // line has come back `step` from its extreme. lows: the /ʃ/ end of each slide (the one in progress included),
  // highs: the /s/ end of each. legs: slides of at least `step`.
  const GLIDE_STEP = 0.25; // log units, about 28%; /s/ and /ʃ/ sit about 70% apart
  function glideTurns(vals, step = GLIDE_STEP) {
    const v = vals.map((_, i) => median(vals.slice(Math.max(0, i - 2), i + 3)));
    let lo = Infinity, hi = -Infinity, loAt = -1, hiAt = -1, dir = 0, ext = 0, extAt = -1, legs = 0;
    const lows = [], highs = [], lowAt = [];
    v.forEach((x, i) => {
      if (dir === 0) {
        if (x < lo) { lo = x; loAt = i; }
        if (x > hi) { hi = x; hiAt = i; }
        if (x - lo >= step) { dir = 1; legs = 1; lows.push(lo); lowAt.push(loAt); ext = x; extAt = i; } else if (hi - x >= step) { dir = -1; legs = 1; highs.push(hi); ext = x; extAt = i; }
      } else if (dir === 1) {
        if (x > ext) { ext = x; extAt = i; } else if (ext - x >= step) { highs.push(ext); dir = -1; legs++; ext = x; extAt = i; }
      } else if (x < ext) { ext = x; extAt = i; } else if (x - ext >= step) { lows.push(ext); lowAt.push(extAt); dir = 1; legs++; ext = x; extAt = i; }
    });
    if (dir === 1) highs.push(ext); else if (dir === -1) { lows.push(ext); lowAt.push(extAt); }
    return { legs, lows, lowAt, highs, dir, smooth: v };
  }

  // A hiss on the 0-100 scale against its own sibilant's typical values (as the drills and readings score it).
  const sibScore = (cog, sib) => Math.max(0, Math.min(100, resScore(sibilantAlpha(cog, SIBILANTS[sib]))));
  // The checks behind the sibilant exercises; frames: [{ cog: Hz | null }] in order, one per analyzer frame.
  // glide: each /ʃ/ end of the slides, scored as /ʃ/ (an end still above SIB_SPLIT never reached /ʃ/).
  function glideCheck(frames) {
    const t = glideTurns(frames.filter(f => f && f.cog > 0).map(f => Math.log(f.cog)));
    const ends = t.lows.map((l, i) => { const cog = Math.exp(l); return { cog, at: t.lowAt[i], sh: cog <= SIB_SPLIT, score: sibScore(cog, 'sh') }; });
    const sh = ends.filter(e => e.sh);
    return { legs: t.legs, dir: t.dir, smooth: t.smooth, ends, score: sh.length ? median(sh.map(e => e.score)) : NaN, missed: ends.length - sh.length };
  }
  // ladder: each held hiss (RUNG_MIN frames or more, pauses between them) is one rung, scored as `sib`.
  const RUNG_MIN = 30; // frames, about half a second
  function ladderCheck(frames, sib) {
    return sibBursts(frames, { gap: 8, min: RUNG_MIN }).map(b => ({ a: b.a, b: b.b, cog: b.cog, n: b.n, score: sibScore(b.cog, sib) }));
  }
  // pairs: every hiss, sorted into /s/ or /ʃ/ by where it sits, each scored as what it is.
  function pairsCheck(frames) {
    const out = { s: [], sh: [] };
    for (const b of sibBursts(frames, { gap: 3, min: 5 })) out[b.sib].push({ cog: b.cog, score: sibScore(b.cog, b.sib) });
    return out;
  }

  // ---------- embodied voice (unscored) ----------
  // Deals the next feeling: never one of the `recent` ids, and from a family other than the last
  // one's where it can. rand() returns [0, 1).
  function dealFeeling(list, recent = [], rand = Math.random) {
    const seen = new Set(recent), last = list.find(e => e.id === recent[recent.length - 1]);
    let pool = list.filter(e => !seen.has(e.id) && (!last || e.family !== last.family));
    if (!pool.length) pool = list.filter(e => !seen.has(e.id));
    if (!pool.length) pool = list.filter(e => !last || e.id !== last.id);
    if (!pool.length) pool = list;
    return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  }
  // Splits a stream of per-frame voicing (true/false, ~60 per second) into takes: voiced stretches
  // of at least `minOn` frames, ended by `gap` unvoiced frames (short dips, like the "w" in "uwu",
  // stay inside one take). Returns the finished takes as [start, end] frame indexes.
  function voicedTakes(voiced, minOn = 18, gap = 24) {
    const takes = [];
    let start = -1, last = -1, on = 0;
    voiced.forEach((v, i) => {
      if (v) { if (start < 0) { start = i; on = 0; } on++; last = i; }
      else if (start >= 0 && i - last >= gap) { if (on >= minOn) takes.push([start, last]); start = -1; }
    });
    return takes;
  }

  // ---------- resonance exercises (Practice > Resonance, data/reso.json) ----------
  // What a resonance exercise keeps of one analyzer frame, or null. Only steady voiced frames count (a drill's
  // held vowel, or the looser steadiness of running speech, so a word chain's short vowels count too).
  //   dog: the exercise's vowel however dark or bright it is said: any plausible reading of it gives {res, f0}
  //        (a vowel drill would also want it close to the typical vowel, which a big dog deliberately isn't).
  //   chain: a frame that matches one of the chain's vowels, the way a reading word's vowels are matched
  //        (see matchWordVowel), gives {key, res}; anything else (a consonant, a glide, another vowel) is null.
  function resoFrame(def, fr) {
    if (!fr || fr.kind !== 'voiced' || !fr.formants || !(fr.stable || fr.steady)) return null;
    const F = fr.formants, res = (a) => Math.max(0, Math.min(100, resScore(a)));
    if (def.kind === 'dog') {
      const fit = scoreVowel(F, VOWEL_BY_KEY[def.vowel], fr.f0);
      return fit.ok ? { res: res(fit.alpha), f0: fr.f0 } : null;
    }
    const m = matchWordVowel(F, def.vowels, classifyVowel(F, VOWELS, fr.f0), fr.f0);
    if (!m) return null;
    const key = def.vowels.includes(m.vowel.key) ? m.vowel.key : def.vowels.find(k => (VOWEL_ALT[k] || []).includes(m.vowel.key));
    return key ? { key, res: res(m.alpha) } : null;
  }
  // Big dog, little dog: held sounds separated by short pauses, read in pairs. A hold is a run of kept frames
  // (gaps up to DOG.gap frames join, so a wobble doesn't split it) of at least DOG.min frames (half a second).
  // In each pair the darker hold is the big dog and the brighter the little dog, whichever came first.
  // A pair passes when they are DOG.contrast points apart on the resonance score and within DOG.drift semitones
  // of each other in pitch: the point is changing resonance, not dragging the pitch along with it.
  // score: the median of the goal's side (little dogs for a feminine goal, big dogs for a masculine one).
  const DOG = { gap: 10, min: 30, contrast: 12, drift: 2, pairs: 2 };
  function dogHolds(frames) {
    const out = []; let cur = null, gap = 0;
    frames.forEach((f, i) => {
      if (f) { if (!cur) cur = { a: i, fr: [] }; cur.fr.push(f); cur.b = i; gap = 0; }
      else if (cur && ++gap > DOG.gap) { out.push(cur); cur = null; gap = 0; }
    });
    if (cur) out.push(cur);
    return out.filter(h => h.fr.length >= DOG.min)
      .map(h => ({ a: h.a, b: h.b, n: h.fr.length, res: median(h.fr.map(f => f.res)), f0: median(h.fr.map(f => f.f0)) }));
  }
  function dogCheck(frames, goal) {
    const holds = dogHolds(frames), pairs = [];
    for (let i = 0; i + 1 < holds.length; i += 2) {
      const x = holds[i], y = holds[i + 1], big = x.res <= y.res ? x : y, little = big === x ? y : x;
      const contrast = little.res - big.res, drift = Math.abs(12 * Math.log2(little.f0 / big.f0));
      pairs.push({ big, little, contrast, drift, ok: contrast >= DOG.contrast && drift <= DOG.drift });
    }
    const side = pairs.map(p => (goal === 'fem' ? p.little.res : p.big.res));
    return { holds, pairs, good: pairs.filter(p => p.ok).length, score: side.length ? median(side) : NaN };
  }
  // Resonance chains: vowels said one after another (held, in words or in phrases), each scored on its own.
  // A vowel counts once it has CHAIN_MIN kept frames (about an eighth of a second, gathered over every time it
  // comes round). score: the median of the vowels' own scores, so one vowel can't carry the rest; lo and hi
  // are the darkest and brightest vowel, and their gap is how evenly the chain held its resonance.
  const CHAIN_MIN = 8;
  function chainCheck(frames, keys) {
    const by = Object.fromEntries(keys.map(k => [k, []]));
    for (const f of frames) if (f && by[f.key]) by[f.key].push(f.res);
    const per = keys.map(k => ({ key: k, n: by[k].length, res: by[k].length >= CHAIN_MIN ? median(by[k]) : NaN, recent: by[k].slice(-30) }));
    const got = per.filter(p => Number.isFinite(p.res)), r = got.map(p => p.res);
    return { per, done: got.length, all: got.length === keys.length,
      score: got.length === keys.length ? median(r) : NaN, lo: r.length ? Math.min(...r) : NaN, hi: r.length ? Math.max(...r) : NaN };
  }

  // ---------- streaming analyzer ----------
  // Formant gates for real running speech, measured on a real reader (8 LJSpeech clips, a woman, median 229 Hz):
  // with poles up to 500 Hz wide and the drill's 0.06 steadiness, only 26% of voiced frames held still and 5% got
  // a score, so a short reading often got none. Real vowels last ~80-150 ms and glide into their consonants, and
  // a higher voice's formants come out wider. Up to 700 Hz bandwidth (800 starts letting nasal misreads through)
  // and 0.10 steadiness for speech roughly double the scored frames with the same median. Drills keep 0.06.
  const VOICED_MAX_BW = 700, SPEECH_SPREAD = 0.10, WIDE_F1_BW = 1200, WIDE_F1_RANGE = [250, 1100];
  // Pitch is read from 60 Hz up to PITCH_MAX for speech; singing goes higher (SING_PITCH_MAX, about C6).
  const PITCH_MIN = 60, PITCH_MAX = 500, SING_PITCH_MAX = 1100;
  // the full-rate pass (Sing only) reads from HIGH_PASS_MIN up (low enough for its octave check to see twice the
  // period), and is asked when the first reading is unvoiced or could be an octave under a note from HIGH_PASS_FROM
  const HIGH_PASS_MIN = 100, HIGH_PASS_FROM = 230;

  // A spectrum column's level (dB) between lo and hi Hz; binHz: the column's bin spacing.
  function bandLevel(col, binHz, lo, hi) {
    let p = 0;
    for (let k = Math.max(1, Math.ceil(lo / binHz)); k <= Math.min(col.length - 1, Math.floor(hi / binHz)); k++) p += Math.pow(10, col[k] / 10);
    return Math.round(100 * Math.log10(p + 1e-12)) / 10;
  }
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
      this.histN = 5; this.winMs = 30; this.lagHz = 50; // formant smoothing frames, LPC window, LPC lag window
      this.pitchHist = [];
      this.gap = 0;
      this.whist = []; // recent whispered-vowel formant frames
      this.pitchMax = PITCH_MAX; // highest pitch read (Hz); Sing raises it to SING_PITCH_MAX
      this.wgap = 0;
    }

    analyze(buf) {
      const sr = this.sr;
      const x = buf.length > this.needed ? buf.subarray(buf.length - this.needed) : buf;
      const out = { kind: 'silence', rms: 0, f0: 0, formants: null, cog: 0, spec: null, fsd: this.fsd };

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
      out.ve = bandLevel(out.spec, this.fsd / 512, 250, 2500); // loudness where vowels are strong, for finding syllables
      if (rms < gate) { this.reset(); return out; }

      // pitch on ~65 ms of the decimated signal
      const pn = Math.round(this.fsd * 0.065);
      let p = yin(y.subarray(y.length - pn), this.fsd, PITCH_MIN, Math.min(this.pitchMax, PITCH_MAX), 0.15);
      // Singing: notes above the speech range. At the decimated rate a high note's period is only 10-30 samples, so
      // its dips are shallow and YIN slips an octave down (a G4 read as G3); a second pass at the full rate (with the
      // same octave check) reads it. Only a note of HIGH_PASS_FROM or more replaces the first reading.
      if (this.pitchMax > PITCH_MAX && (p.aperiodicity >= 0.25 || p.f0 >= HIGH_PASS_FROM / 2)) {
        const q = yin(x.subarray(x.length - Math.round(sr * 0.035)), sr, HIGH_PASS_MIN, this.pitchMax, 0.15);
        if (q.aperiodicity < 0.25 && q.f0 >= HIGH_PASS_FROM) p = q;
      }
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
      out.wide = wideColumn(ps, binHz); // 0-12 kHz, for a hiss's spectrogram (spec stops near 5.5 kHz)
      out.cog = cs > 0 ? cw / cs : 0;

      if (voiced) {
        out.kind = 'voiced';
        this.gap = 0;
        this.pitchHist.push(p.f0);
        if (this.pitchHist.length > 3) this.pitchHist.shift();
        out.f0 = median(this.pitchHist);
        if (!breathWindowUneven(y, this.fsd)) {
          const vq = voiceQuality(y, this.fsd, out.f0);
          out.cpp = vq.cpp; out.h1h2 = vq.h1h2; out.breath = breathiness(vq);
        } else out.breathUneven = true;
        const ln = Math.round(this.fsd * this.winMs / 1000);
        const lag = typeof this.lagHz === 'function' ? this.lagHz(out.f0) : this.lagHz;
        // a first harmonic far above the second is turned down first, or LPC spends its F1 on it (see tameH1)
        const h12 = Number.isFinite(out.h1h2) ? out.h1h2 : voiceQuality(y, this.fsd, out.f0).h1h2;
        const read = (z) => pickFormants(formants(z.subarray(z.length - ln), this.fsd, this.lpcOrder, lag, WIDE_F1_BW, 8));
        let fm = read(y);
        if (h12 > H1_KEEP) {
          // From H1_CUT_MAX up, a closed vowel's F1 can sit on the first harmonic itself, and cutting the harmonic then
          // cuts the F1 with it: the next pole up gets read (a held "ee" at ~300 Hz read 450-650). There the cut is only
          // kept when the plain reading had F1 on the pitch and the cut finds one well clear of it (an open vowel).
          const tamed = read(tameH1(y, this.fsd, out.f0, h12));
          const lockedOnPitch = !(fm.length && fm[0].f > F1_ON_PITCH_LOCK * out.f0);
          if (out.f0 < H1_CUT_MAX || (lockedOnPitch && tamed.length && tamed[0].f >= H1_CLEAR * out.f0)) { fm = tamed; out.h1Cut = Math.round(h12 - H1_KEEP); }
        }
        if (fm.wideF1) out.wideF1 = true;
        if (fm.length >= 3) {
          this.hist.push(fm.slice(0, 3).map(q => q.f));
          out.rawF = this.hist[this.hist.length - 1]; // this frame alone, unsmoothed
          out.cands = fm.map(q => q.f); // every formant candidate of this frame (up to 4)
          if (this.hist.length > this.histN) this.hist.shift();
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
          out.spread = spread;
          out.stable = this.hist.length >= 3 && spread < 0.06; // a held vowel (drills)
          out.steady = this.hist.length >= 3 && spread < SPEECH_SPREAD; // steady enough for running speech
        }
      } else if (hfRatio < 0.6 && p.f0 > 0 && p.aperiodicity < 0.5) {
        // too airy to count as clean voicing, but still a voice: measure how breathy it is
        out.kind = 'other';
        if (!breathWindowUneven(y, this.fsd)) {
          const vq = voiceQuality(y, this.fsd, p.f0);
          out.cpp = vq.cpp; out.h1h2 = vq.h1h2; out.breath = breathiness(vq);
        } else out.breathUneven = true;
        this.softReset();
      } else if (hfRatio > 0.6 && p.aperiodicity > 0.3) {
        out.kind = 'fricative';
        out.sib = out.cog > SIB_SPLIT ? 's' : 'sh';
        this.softReset();
      } else {
        out.kind = 'other';
        this.softReset();
      }
      if (voiced) this.whist.length = 0;
      else this.whisperFrame(y, out);
      return out;
    }

    // smoothed formants of a whisper (median of the last few frames), as out.whisperF
    whisperFrame(y, out) {
      const F = whisperFormants(y, this.fsd, this.lpcOrder + 2, out.cog);
      if (!F) { if (++this.wgap > 3) this.whist.length = 0; return; }
      this.wgap = 0;
      this.whist.push(F);
      if (this.whist.length > 9) this.whist.shift();
      if (this.whist.length >= 4) out.whisperF = [0, 1, 2].map(i => median(this.whist.map(h => h[i])));
    }

    spectrumColumn(y) {
      const n = 512;
      const ps = powerSpectrum(y, n);
      const col = new Float32Array(ps.length);
      for (let i = 0; i < ps.length; i++) col[i] = 10 * Math.log10(ps[i] + 1e-12);
      return col;
    }

    softReset() { if (++this.gap > 2) { this.hist.length = 0; this.pitchHist.length = 0; } }
    reset() { this.gap = 3; this.hist.length = 0; this.pitchHist.length = 0; this.whist.length = 0; }
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
    // fold octave slips back (a pitch tracker can jump to double or half on a short sound)
    const fold = (s) => { while (s > 9) s -= 12; while (s < -9) s += 12; return s; };
    const st = v.map(p => ({ t: p.t, s: fold(12 * Math.log2(p.f0 / med)) }));
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

  // ---------- word edges after a reading ----------
  // While you read, the highlight moves a word on each syllable it hears, and a missed syllable or a jump at a pause
  // can leave one word holding its neighbour's sound ("beautiful" covering "beautiful colors", "colors" a sliver).
  // Once the reading is over the whole recording is there, so the edges are placed again from the sound itself:
  //  1. pauses (ALIGN_PAUSE ms or more of quiet) cut the reading into stretches of speech;
  //  2. the words are shared out over the stretches so each stretch's length fits its words' expected length
  //     (syllables count most, then consonants; quick linking words less), and a word ending in . , ; : ! ? (or one
  //     the reference voice paused after) likes to end a stretch;
  //  3. inside a stretch each edge starts where the expected lengths put it and moves to the nearest real cue:
  //     a loudness dip in the vowel band (where one syllable gives way to the next) or a break in voicing (a stop
  //     like the /k/ of "colors", or a hiss).
  // frames: { t: ms, f0, e: vowel-band loudness dB, a: overall loudness dB } (Run.frames form). words: the
  // passage's words up to the last one reached. opt.ref: the reference voice's word times ([[start, end] s]) for
  // the same words; when given, their lengths are the expected lengths (a template), so it breaks ties.
  // Returns { ws, we } in the frames' ms (we[i]: where word i stops sounding before a pause, else null), or null
  // when the frames have no loudness or the words can't be fitted (then the highlight's edges stay).
  const ALIGN_PAUSE = 180, ALIGN_REF_MIX = 0.25, ALIGN_SYL_RATE = 5;
  const isFnWord = (w) => FUNCTION_WORDS.has(String(w).toLowerCase().replace(/[^a-z']/g, ''));
  function wordWeight(w) {
    const t = String(w).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!t) return 0.3;
    const cons = (t.match(/[^aeiouy]/g) || []).length;
    return (countSyllables(t) + 0.3 * cons + 0.3) * (isFnWord(t) ? 0.6 : 1);
  }
  function speechStretches(frames) {
    const n = frames.length, t = frames.map(f => f.t);
    const a = frames.map(f => (Number.isFinite(f.a) ? f.a : f.e));
    const sa = a.slice().sort((x, y) => x - y), fa = sa[Math.floor(n * 0.1)], top = sa[Math.floor(n * 0.95)];
    const thr = Math.max(fa + 10, fa + 0.4 * (top - fa)); // well above the room, well below the voice
    const snd = a.map((x, i) => (frames[i].f0 > 0 && x > fa + 6) || x > thr);
    const out = [];
    let cur = null, quietFrom = -1;
    for (let i = 0; i < n; i++) {
      if (snd[i]) {
        if (cur && quietFrom >= 0 && t[i] - t[quietFrom] >= ALIGN_PAUSE) { out.push(cur); cur = null; }
        if (!cur) cur = { a: i, b: i }; else cur.b = i;
        quietFrom = -1;
      } else if (quietFrom < 0) quietFrom = i;
    }
    if (cur) out.push(cur);
    // a stretch shorter than 60 ms with no voicing is a click or a breath, not speech
    const list = out.filter(s => t[s.b] - t[s.a] >= 60 || frames.slice(s.a, s.b + 1).some(f => f.f0 > 0))
      .map(s => ({ a: s.a, b: s.b, t0: t[s.a], t1: t[s.b] + 16 }));
    list.snd = snd;
    return list;
  }
  // places inside frames[a..b] where a word edge sounds likely, with how strong a cue each is (about 0..2)
  function edgeCues(frames, a, b, opt = {}) {
    const es = [];
    for (let i = a; i <= b; i++) { let s = 0, c = 0; for (let j = Math.max(a, i - 1); j <= Math.min(b, i + 1); j++) { s += frames[j].e; c++; } es.push(s / c); }
    const cues = [], quiet = opt.snd ? (i) => !opt.snd[i] : () => false;
    // a short quiet inside the stretch (a breath, a comma, a long stop): a strong cue where the sound comes back
    for (let i = a + 1, q0 = -1; i <= b; i++) {
      if (quiet(i)) { if (q0 < 0) q0 = i; continue; }
      if (q0 >= 0 && frames[i].t - frames[q0].t >= 60) cues.push({ t: frames[i].t, s: Math.min(2, 1.2 + (frames[i].t - frames[q0].t) / 100), q: frames[i].t - frames[q0].t, end: frames[q0].t });
      q0 = -1;
    }
    for (let i = a + 1; i < b; i++) {
      const k = i - a, v = frames[i].f0 > 0, pv = frames[i - 1].f0 > 0;
      if (!v && pv) cues.push({ t: frames[i].t, s: 0.8 }); // voicing stops: a stop or hiss, which can start the next word
      else if (v && !pv) cues.push({ t: frames[i].t, s: 0.3 }); // voicing starts again
      if (es[k] <= es[k - 1] && es[k] < es[k + 1]) {
        let l = es[k], r = es[k];
        for (let j = k - 1; j >= Math.max(0, k - 8); j--) l = Math.max(l, es[j]);
        for (let j = k + 1; j <= Math.min(es.length - 1, k + 8); j++) r = Math.max(r, es[j]);
        const depth = Math.min(l, r) - es[k];
        if (depth >= 1.5) cues.push({ t: frames[i].t, s: Math.min(1.5, depth / 6) });
      }
    }
    return cues.sort((x, y) => x.t - y.t);
  }
  function alignWords(frames, words, opt = {}) {
    const fr = (frames || []).filter(f => Number.isFinite(f.t) && Number.isFinite(f.e));
    let W = words.length;
    if (!W || fr.length < 20 || fr.length < 0.8 * (frames || []).length) return null;
    const st = speechStretches(fr), C = st.length;
    if (!C) return null;
    const ref = opt.ref && opt.ref.length >= W ? opt.ref : null;
    // a reference word's length runs to the next word's start (the gap between words is part of saying them), but
    // not across a pause
    // Another voice's timing only partly carries over to yours, so it is blended with the rule of thumb (ALIGN_REF_MIX).
    let d = words.map(wordWeight);
    if (ref) {
      const rd = ref.slice(0, W).map(([x, y], i) => Math.max(0.04, i + 1 < ref.length && ref[i + 1][0] - y < 0.15 ? ref[i + 1][0] - x : y - x + 0.05));
      const mix = opt.mix != null ? opt.mix : ALIGN_REF_MIX, sd = d.reduce((x, y) => x + y, 0), sr = rd.reduce((x, y) => x + y, 0);
      d = d.map((v, i) => (1 - mix) * v / sd + mix * rd[i] / sr);
    }
    const punct = words.map(w => (/[.!?]["'”’)]*$/.test(w) ? 2 : /[,;:]["'”’)]*$/.test(w) ? 1 : 0));
    const refPause = ref && !opt.noRefPause ? words.map((_, w) => w + 1 < ref.length && ref[w + 1][0] - ref[w][1] >= 0.15) : null;
    const len = st.map(s => s.t1 - s.t0), total = len.reduce((x, y) => x + y, 0);
    // 2. words to stretches. With opt.free the reading may have stopped at any word (the live highlight's last word
    // is only a guess: it can fall far behind), so the pace isn't known either: several paces are tried, and the
    // one whose stretches fit their words best (with sentence ends at pauses) wins, along with where it stopped.
    const INF = 1e18, free = !!opt.free;
    const fit = (rate) => {
      const cost = Array.from({ length: C + 1 }, () => new Float64Array(W + 1).fill(INF)), back = Array.from({ length: C + 1 }, () => new Int32Array(W + 1).fill(-1));
      cost[0][0] = 0;
      for (let c = 0; c < C; c++) for (let w = 0; w <= W; w++) {
        const base = cost[c][w]; if (base >= INF) continue;
        // a stretch with no words: a cough, an "um", a word said again
        const skip = base + 1.5 + Math.min(2, len[c] / 400);
        if (skip < cost[c + 1][w]) { cost[c + 1][w] = skip; back[c + 1][w] = w; }
        let sum = 0, inner = 0;
        for (let m = 1; w + m <= W && m <= 40; m++) {
          const k = w + m - 1; sum += d[k];
          if (m > 1) { const p = punct[k - 1]; inner += p === 2 ? 1.2 : p === 1 ? 0.25 : 0; if (refPause && refPause[k - 1]) inner += 0.4; }
          const r = Math.log(len[c] / (sum * rate));
          let v = base + 3 * r * r + inner;
          if ((c + 1 < C || free) && w + m < W) v -= (punct[k] === 2 ? 1 : punct[k] === 1 ? 0.6 : 0) + (refPause && refPause[k] ? 0.6 : 0);
          if (v < cost[c + 1][w + m]) { cost[c + 1][w + m] = v; back[c + 1][w + m] = w; }
          if (sum * rate > 4 * len[c] + 400) break;
        }
      }
      let end = W;
      if (free) for (let w = 1; w <= W; w++) if (cost[C][w] < cost[C][end]) end = w;
      return { c: cost[C][end], end, back };
    };
    let best = null;
    if (free) {
      const n0 = Math.min(W, Math.max(1, opt.guess || W)), base = total / d.slice(0, n0).reduce((x, y) => x + y, 0);
      // read speech runs at about ALIGN_SYL_RATE syllables a second of sound; a pace far from that costs more
      const sylAt = [0]; for (let w = 0; w < W; w++) sylAt.push(sylAt[w] + Math.max(1, countSyllables(words[w])));
      for (let k = -12; k <= 12; k++) {
        const f = fit(base * Math.pow(1.07, k)), sr = sylAt[f.end] / (total / 1000), z = Math.log(sr / ALIGN_SYL_RATE);
        f.c += 2 * C * z * z;
        if (!best || f.c < best.c) best = f;
      }
    } else best = fit(total / d.reduce((x, y) => x + y, 0));
    if (best.c >= INF) return null;
    const groups = Array(C);
    for (let c = C, w = best.end; c > 0; c--) { const p = best.back[c][w]; groups[c - 1] = [p, w]; w = p; }
    W = best.end;
    // 3. edges inside each stretch
    const ws = Array(W).fill(null), we = Array(W).fill(null);
    for (let c = 0; c < C; c++) {
      const [w0, w1] = groups[c], m = w1 - w0; if (!m) continue;
      const s = st[c], L = s.t1 - s.t0, tot = d.slice(w0, w1).reduce((x, y) => x + y, 0);
      ws[w0] = s.t0; we[w1 - 1] = s.t1;
      if (m === 1) continue;
      // segment the stretch: each word ends at a cue or a plain point (every 30 ms); a word costs the squared log of
      // its length over its expected length (the stretch's pace), less how strong a cue its end is
      const pts = [{ t: s.t0, s: 0 }];
      for (let t = s.t0 + 30; t < s.t1 - 20; t += 30) pts.push({ t, s: 0 });
      for (const cu of edgeCues(fr, s.a, s.b, { snd: st.snd })) pts.push(cu);
      pts.sort((x, y) => x.t - y.t);
      pts.push({ t: s.t1, s: 0 });
      const P = pts.length, pace = L / tot;
      let row = new Float64Array(P).fill(INF); row[0] = 0;
      const from = [];
      for (let k = w0; k < w1; k++) {
        const nxt = new Float64Array(P).fill(INF), fb = new Int32Array(P).fill(-1), e = d[k] * pace, last = k === w1 - 1;
        for (let i = 0; i < P; i++) {
          if (row[i] >= INF) continue;
          for (let j = i + 1; j < P; j++) {
            const len = pts[j].t - pts[i].t;
            if (len < 40) continue;
            if (len > 4 * e + 200) break;
            if (last && j !== P - 1) continue;
            const r = Math.log(len / e), v = row[i] + 2 * r * r - (last ? 0 : 0.6 * pts[j].s + (pts[j].q ? (punct[k] ? 1 : -0.2) : 0));
            if (v < nxt[j]) { nxt[j] = v; fb[j] = i; }
          }
        }
        from.push(fb); row = nxt;
      }
      if (row[P - 1] < INF) {
        for (let k = w1 - 1, j = P - 1; k > w0; k--) { j = from[k - w0][j]; ws[k] = pts[j].t; }
      } else { // no way through (a stretch too short for its words): by expected length
        let acc = 0; for (let k = w0; k < w1 - 1; k++) { acc += d[k]; ws[k + 1] = s.t0 + L * acc / tot; }
      }
    }
    // words in no stretch (skipped, or said too quickly to find): squeezed in where they belong
    for (let w = 0; w < W; w++) if (ws[w] == null) ws[w] = w > 0 ? (we[w - 1] != null ? we[w - 1] : ws[w - 1] + 40) : fr[0].t;
    for (let w = 1; w < W; w++) if (ws[w] < ws[w - 1]) ws[w] = ws[w - 1];
    return { ws: ws.map(Math.round), we: we.map(x => (x == null ? null : Math.round(x))), stretches: C, last: W - 1 };
  }
  // ---------- word edges from the sounds of the words ----------
  // A word's spelling, turned into a rough sequence of sound classes: V (a vowel, or l r m n w y, which carry voice
  // the same way), S (a hiss: s z sh ch j), F (a soft rasp: f v th h) and K (a stop: p t k b d g, mostly a short
  // quiet). Silent letters (a final e, gh) are dropped and repeats merged. Returns [{ c, n: letters }].
  function soundClasses(word) {
    let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return [];
    if (w.length > 2) w = w.replace(/([^aeiouy])e$/, '$1').replace(/([^aeiouy])es$/, '$1s');
    w = w.replace(/tch/g, 'S').replace(/(sh|ch)/g, 'S').replace(/(th|ph)/g, 'F').replace(/gh/g, '').replace(/wh/g, 'w').replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/x/g, 'kS');
    const out = [];
    for (let i = 0; i < w.length; i++) {
      const ch = w[i], nx = w[i + 1] || '';
      let c;
      if (ch === 'S') c = 'S'; else if (ch === 'F') c = 'F';
      else if ('aeiouylrmnw'.includes(ch)) c = 'V';
      else if ('sz'.includes(ch) || ch === 'j' || (ch === 'c' && 'eiy'.includes(nx))) c = 'S';
      else if ('fvh'.includes(ch)) c = 'F';
      else c = 'K';
      const last = out[out.length - 1];
      if (last && last.c === c) last.n++; else out.push({ c, n: 1 });
    }
    if (!out.some(s => s.c === 'V')) out.push({ c: 'V', n: 1 }); // "hmm", "shh": still voiced somewhere
    return out;
  }
  // How well a frame's sound fits each class (0 best, more negative worse). k: 'v' voiced, 's' hiss, 'o' other sound,
  // '.' quiet (the analyzer's frame kinds). P is a pause, G anything at all (noise, a cough, an "um", a re-read).
  const CLASS_FIT = {
    V: { v: 0, o: -1.2, s: -2.5, '.': -3 },
    S: { s: 0, o: -0.8, v: -1.8, '.': -2.5 },
    F: { o: -0.3, s: -0.4, '.': -0.8, v: -1.5 },
    K: { '.': 0, o: -0.3, s: -1, v: -1.6 },
    P: { '.': 0, o: -0.3, s: -2, v: -2.5 }, // a breath before the next phrase is part of the pause
    G: { '.': -0.6, o: -1, s: -1.1, v: -1.3 },
  };
  // the longest a class usually lasts (frames at ~60 a second) before each extra frame costs `over`, and the least
  const CLASS_DUR = { V: { min: 2, per: 9, max: 40, over: 0.5 }, S: { min: 3, per: 12, max: 18, over: 1.5 }, F: { min: 1, per: 8, max: 10, over: 1.5 }, K: { min: 2, per: 8, max: 10, over: 1.5 } };
  // Lines the passage up with the recording by those classes (a Viterbi search over one chain of short states per sound
  // in the passage, so a sound can't run on for seconds), with an optional pause or noise between any two words, noise
  // before the first word, and the reading free to stop after any word. frames: { t, kd: frame kind } (Run.frames).
  // Returns { ws, we, last } in the frames' ms (we: where each word's last sound ends), or null when the frames have no
  // kinds (an older reading).
  function alignByClass(frames, words, opt = {}) {
    const fr = (frames || []).filter(f => Number.isFinite(f.t) && f.kd);
    const T = fr.length;
    if (T < 20 || T < 0.8 * (frames || []).length || !words.length) return null;
    const maxW = Math.min(words.length, opt.maxWords || words.length);
    // states: per word, its sounds' chains; between words a pause state P and a noise state G
    const S = []; // { c, word, first (first state of a sound), min, idx in chain, last (of chain), opt (sound may be skipped) }
    const wordFirst = [], wordLast = [];
    const punct = words.map(w => (/[.!?]["'”’)]*$/.test(w) ? 2 : /[;:,]["'”’)]*$/.test(w) ? 1 : 0));
    const runOn = punct.map(p => (p === 2 ? -(opt.runOn != null ? opt.runOn : 2) : p === 1 ? -0.8 : 0)); // going straight on after a full stop or comma
    for (let w = 0; w < maxW; w++) {
      const segs = soundClasses(words[w]);
      wordFirst.push(S.length);
      segs.forEach((g, si) => {
        const D = CLASS_DUR[g.c], mn = g.c === 'V' ? D.min + (opt.vmin != null ? opt.vmin : 1) * g.n : D.min;
        const L = Math.min(D.max, Math.max(mn + 2, Math.round(D.per * (g.c === 'V' ? Math.sqrt(g.n) : 1)) + 2));
        const base = S.length;
        for (let i = 0; i < L; i++) S.push({ c: g.c, w, seg: si, base, i, L, min: mn, over: D.over, skip: g.c !== 'V' });
      });
      wordLast.push(S.length - 1);
    }
    const N = S.length, NEG = -1e30;
    // previous-chain lookups: for the first state of each sound, which sounds can lead into it
    // after word w: a pause, as a chain of LP states (a pause shorter than that doesn't count as a sentence break),
    // and a noise state; END: after the last word read
    const LP = 9, P0 = N, G0 = N + maxW * LP, END = G0 + maxW, START = END + 1;
    let prev, cur;
    const nS = START + 1;
    prev = new Float64Array(nS).fill(NEG); cur = new Float64Array(nS).fill(NEG);
    const bp = new Int32Array(T * nS).fill(-1); // where each state came from at each frame
    const fit = (c, k) => CLASS_FIT[c][k] != null ? CLASS_FIT[c][k] : -2;
    const kindOf = (f) => (f.kd === 'v' ? 'v' : f.kd === 's' ? 's' : f.kd === '.' ? '.' : 'o');
    // best way into the first sound of word w: from START (w = 0), or from the end of word w-1, its pause or its noise
    const segEnds = (j) => { // states from which the sound whose first state is j can be left (index >= min-1)
      const s = S[j]; const r = []; for (let i = Math.max(0, s.min - 1); i < s.L; i++) r.push(s.base + i); return r;
    };
    // precompute: for each sound's first state, the list of earlier exits that may enter it (same word: previous sound,
    // or the one before when that is skippable); and for each word, the exits of its last sound(s)
    const firstOfSeg = []; for (let j = 0; j < N; j++) if (S[j].i === 0) firstOfSeg.push(j);
    const segIdx = new Map(firstOfSeg.map((j, k) => [j, k]));
    const segList = firstOfSeg.map(j => ({ j, w: S[j].w, c: S[j].c, skip: S[j].skip, ends: segEnds(j) }));
    const wordSegs = Array.from({ length: maxW }, () => []); segList.forEach((g, k) => wordSegs[g.w].push(k));
    const wordExits = wordSegs.map(ks => { // exits of the word: last sound's ends, or the one before if the last can be skipped
      const r = []; const last = ks[ks.length - 1]; r.push(...segList[last].ends.map(e => [e, 0]));
      if (ks.length > 1 && segList[last].skip) r.push(...segList[ks[ks.length - 2]].ends.map(e => [e, -0.7]));
      return r;
    });
    for (let t = 0; t < T; t++) {
      const k = kindOf(fr[t]), row = t * nS;
      cur.fill(NEG);
      const into = (s, v, from) => { if (v > cur[s]) { cur[s] = v; bp[row + s] = from; } };
      // START: noise or quiet before reading
      if (t === 0) cur[START] = Math.max(fit('G', k), fit('P', k)); else into(START, prev[START] + Math.max(fit('G', k), fit('P', k)), START);
      for (let g = 0; g < segList.length; g++) {
        const sg = segList[g], j = sg.j, e0 = fit(sg.c, k);
        // stay/advance in the chain
        for (let i = 1; i < S[j].L; i++) into(j + i, prev[j + i - 1] + e0, j + i - 1);
        into(j + S[j].L - 1, prev[j + S[j].L - 1] + e0 - S[j].over, j + S[j].L - 1);
        // enter the chain's first state
        const enter = (v, from) => into(j, v + e0, from);
        const w = sg.w, ks = wordSegs[w], pos = ks.indexOf(g);
        if (pos > 0) {
          for (const e of segList[ks[pos - 1]].ends) enter(prev[e], e);
          if (pos > 1 && segList[ks[pos - 1]].skip) for (const e of segList[ks[pos - 2]].ends) enter(prev[e] - 0.7, e);
        } else {
          if (w === 0) { if (t === 0) cur[j] = Math.max(cur[j], e0); else enter(prev[START], START); }
          else {
            for (const [e, c] of wordExits[w - 1]) enter(prev[e] + c + runOn[w - 1], e);
            for (let i = 0; i < LP; i++) enter(prev[P0 + (w - 1) * LP + i] + (i < LP - 1 ? runOn[w - 1] : 0), P0 + (w - 1) * LP + i);
            enter(prev[G0 + w - 1] - 0.5, G0 + w - 1);
          }
        }
        // a skippable first sound: the word can start at its second sound
        if (pos === 0 && sg.skip && ks.length > 1) {
          const g2 = segList[ks[1]], j2 = g2.j, e2 = fit(g2.c, k);
          const ent = (v, from) => into(j2, v + e2 - 0.7, from);
          if (w === 0) { if (t > 0) ent(prev[START], START); }
          else { for (const [e, c] of wordExits[w - 1]) ent(prev[e] + c + runOn[w - 1], e); for (let i = 0; i < LP; i++) ent(prev[P0 + (w - 1) * LP + i] + (i < LP - 1 ? runOn[w - 1] : 0), P0 + (w - 1) * LP + i); ent(prev[G0 + w - 1] - 0.5, G0 + w - 1); }
        }
      }
      // pauses and noise after each word, and the end
      for (let w = 0; w < maxW; w++) {
        const p = P0 + w * LP, gg = G0 + w, ep = fit('P', k), eg = fit('G', k);
        // a real pause (the chain's end) after a word with no punctuation is less likely than at a comma or full stop
        for (let i = 1; i < LP; i++) into(p + i, prev[p + i - 1] + ep - (i === LP - 1 && !punct[w] ? (opt.midPause != null ? opt.midPause : 1.5) : 0), p + i - 1);
        into(p + LP - 1, prev[p + LP - 1] + ep, p + LP - 1);
        into(gg, prev[gg] + eg, gg);
        for (const [e, c] of wordExits[w]) { into(p, prev[e] + c + ep - (punct[w] ? 0 : 0.3), e); into(gg, prev[e] + c + eg - 3, e); into(END, prev[e] + c + Math.max(eg, ep), e); }
        for (let i = 0; i < LP; i++) into(END, prev[p + i] + Math.max(eg, ep), p + i);
      }
      into(END, prev[END] + Math.max(fit('G', k), fit('P', k)), END);
      [prev, cur] = [cur, prev];
    }
    // back from END at the last frame
    if (prev[END] <= NEG / 2) return null;
    const path = new Int32Array(T);
    for (let t = T - 1, s = END; t >= 0; t--) { path[t] = s; s = bp[t * nS + s]; if (s < 0 && t > 0) return null; }
    const ws = Array(maxW).fill(null), we = Array(maxW).fill(null);
    let last = -1;
    for (let t = 0; t < T; t++) {
      const s = path[t]; if (s >= N) continue;
      const w = S[s].w;
      if (ws[w] == null) ws[w] = fr[t].t;
      we[w] = fr[t].t + 16; if (w > last) last = w;
    }
    if (last < 0) return null;
    // a word the path went straight past (every sound skipped can't happen, so this is only words never reached)
    for (let w = 1; w <= last; w++) if (ws[w] == null) ws[w] = we[w - 1];
    for (let w = 1; w <= last; w++) if (we[w] == null) we[w] = ws[w];
    return { ws: ws.slice(0, last + 1).map(Math.round), we: we.slice(0, last + 1).map(Math.round), last };
  }
  // Tag each frame with the word whose stretch it falls in (the realigned edges), for the word by word report.
  function retagFrames(frames, ws) {
    let k = 0;
    return frames.map(f => {
      while (k + 1 < ws.length && ws[k + 1] != null && ws[k + 1] <= f.t) k++;
      return f.i === k ? f : Object.assign({}, f, { i: k });
    });
  }

  // A reading's vowels, sorted again once its word edges have been re-placed (retagFrames), for the vowel map.
  // Each voiced frame is checked against the vowels its aligned word should have (matchWordVowel, the same rule
  // as live). Two things kept the map down to a vowel or two in a short reading (Petra, 2026-11-19, 14 s of the
  // Rainbow passage: one vowel shown from ~25 matched frames): live, the highlight lags or runs ahead, so a vowel
  // was checked against the wrong word; and only steady frames counted, under half of the voiced ones in running
  // speech. Short vowels now count from their single-frame formants (rawF), as word scores already do, since the
  // word's own vowels filter them. On her readings this gives 5 vowels in 16 s instead of 1-2.
  // frames: Run.frames form ({ i, F, rawF, f0, st, k }); texts: the passage's words.
  // Returns { frames (k set from the aligned word, or cleared), vf: { key: [[F1, F2, F3, score]] } }.
  const READ_VMAP_MIN = 6; // frames (~100 ms) a vowel needs in a reading before the map shows it
  function readingVowels(frames, texts, pron) {
    const wv = texts.map(t => wordVowels(t, pron)), vf = {};
    const out = frames.map(f => {
      const w = wv[f.i], F = f.st && f.F ? f.F : f.rawF;
      let k = null;
      if (w && w.why === 'ok' && F && f.f0 > 0) {
        const m = matchWordVowel(F, w.keys, classifyVowel(F, VOWELS, f.f0), f.f0);
        if (m) { k = m.vowel.key; (vf[k] = vf[k] || []).push([F[0], F[1], F[2], Math.max(0, Math.min(100, resScore(m.alpha)))]); }
      }
      return f.k === k ? f : Object.assign({}, f, { k });
    });
    return { frames: out, vf };
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

  // ---------- reading report ----------
  // Per-word summary of a reading. frames: [{ i: word index, f0: Hz or 0, res: score or NaN, sib: score or NaN,
  // loose (res is from a single frame that wasn't steady, optional) }].
  // Returns one { p, r, s, rough } per word (median pitch, resonance, sibilant score; null when too little was heard).
  // Resonance: 2 steady frames, or else 3 frames counting loose ones (rough: true). See LOOSE_WORD_MIN.
  function wordReport(frames, nWords) {
    const acc = Array.from({ length: nWords }, () => ({ p: [], r: [], l: [], s: [] }));
    for (const f of frames) {
      const a = acc[f.i]; if (!a) continue;
      if (f.f0 > 0) a.p.push(f.f0);
      if (Number.isFinite(f.res)) (f.loose ? a.l : a.r).push(f.res);
      if (Number.isFinite(f.sib)) a.s.push(f.sib);
    }
    const m = (arr, n) => (arr.length >= n ? median(arr) : null);
    return acc.map(a => {
      const r = m(a.r, 2), rl = r == null ? m(a.r.concat(a.l), LOOSE_WORD_MIN) : null;
      return { p: m(a.p, 3), r: r != null ? r : rl, s: m(a.s, 2), rough: rl != null };
    });
  }
  // Script words the reader may have left out. There is no speech recognition, so this goes by the voice alone:
  // a word the highlight passed with no voice on it (fewer than MISS_VOICED voiced frames tagged with it) is
  // "possibly missed". That happens when the highlight had to jump over words at a pause to catch up (the
  // voice had fewer syllables than the script there), or, in tap and pace modes, when a word went by in
  // silence. Words after the last one reached are "not reached" instead. When more than MISS_MAX_SHARE of the
  // reached words look missed, the highlight lost the voice rather than the reader the words, so none are flagged.
  // Returns { miss: [word indices], reach: last word index reached (-1 for none) }.
  const MISS_VOICED = 2, MISS_MAX_SHARE = 0.4;
  function missedWords(frames, nWords) {
    const voiced = new Array(nWords).fill(0);
    let reach = -1;
    for (const f of frames || []) {
      if (!(f.i >= 0 && f.i < nWords)) continue;
      if (f.i > reach) reach = f.i;
      if (f.f0 > 0) voiced[f.i]++;
    }
    const miss = [];
    for (let i = 0; i <= reach; i++) if (voiced[i] < MISS_VOICED) miss.push(i);
    if (miss.length > MISS_MAX_SHARE * (reach + 1)) return { miss: [], reach, lost: true };
    return { miss, reach };
  }
  // Script words the speech recogniser didn't hear, for readings with "Check words" on. script: the passage's words
  // as shown; heard: the recogniser's words. A word-level edit alignment (like scoring speech recognisers): a
  // script word the alignment has to drop is missed; a word heard as something else (misheard, or said a bit
  // differently) is a substitution and is not flagged, so a recogniser's slips don't read as skipped words.
  // Script words after the last one heard are left alone (the reading stopped, or the last words came in late).
  // Spellings are compared loosely (case, punctuation, colour/color, numbers as digits, one word split in two).
  // When under MATCH_MIN of the script up to the last match was heard, the recogniser was off, so none are flagged.
  // Returns { miss: [script indices], heard: matched count, last: last matched script index (-1 for none), lost }.
  const MATCH_MIN = 0.5;
  const NUM_WORDS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
  function normWord(w) {
    let t = String(w).toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, '');
    if (/^\d+$/.test(t) && +t <= 20) t = NUM_WORDS[+t];
    return t.replace(/our$/, 'or').replace(/ise$/, 'ize').replace(/tre$/, 'ter');
  }
  function editDist(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
    }
    return d[b.length];
  }
  const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && editDist(a, b) <= Math.floor(Math.min(a.length, b.length) / 4));
  function matchScript(script, heard) {
    const S = script.map(normWord), H = heard.map(normWord).filter(Boolean), n = S.length, m = H.length;
    // cost[i][j]: aligning the first i script words with the first j heard ones; moves: match/substitute,
    // drop a script word (missed), extra heard word, or a script word heard as two (or two as one)
    const INF = 1e9, cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF)), how = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    cost[0][0] = 0;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
      const c = cost[i][j]; if (c >= INF) continue;
      const step = (ii, jj, k, v) => { if (ii <= n && jj <= m && c + v < cost[ii][jj]) { cost[ii][jj] = c + v; how[ii][jj] = k; } };
      if (i < n && !S[i]) { step(i + 1, j, 5, 0); continue; } // a script "word" with no letters (a dash)
      if (i < n && j < m) step(i + 1, j + 1, sameWord(S[i], H[j]) ? 1 : 2, sameWord(S[i], H[j]) ? 0 : 1);
      if (i < n) step(i + 1, j, 3, 1);
      if (j < m) step(i, j + 1, 4, 1);
      if (i < n && j + 1 < m && S[i] === H[j] + H[j + 1]) step(i + 1, j + 2, 7, 0);
      if (i + 1 < n && j < m && S[i] + S[i + 1] === H[j]) step(i + 2, j + 1, 6, 0);
    }
    // the reading may stop anywhere: end at the cheapest place once every heard word is used
    let bi = 0; for (let i = 0; i <= n; i++) if (cost[i][m] < cost[bi][m] || (cost[i][m] === cost[bi][m] && i > bi)) bi = i;
    const drop = [], hit = [];
    for (let i = bi, j = m; i > 0 || j > 0;) {
      const k = how[i][j];
      if (k === 1) { hit.push(i - 1); i--; j--; }
      else if (k === 7) { hit.push(i - 1); i--; j -= 2; }
      else if (k === 2) { i--; j--; }
      else if (k === 3) { drop.push(i - 1); i--; }
      else if (k === 4) j--;
      else if (k === 5) i--;
      else if (k === 6) { hit.push(i - 2, i - 1); i -= 2; j--; }
      else break;
    }
    const last = hit.length ? Math.max(...hit) : -1;
    const miss = drop.filter(i => i < last).sort((a, b) => a - b);
    const words = S.slice(0, last + 1).filter(Boolean).length;
    if (!hit.length || hit.length < MATCH_MIN * words) return { miss: [], heard: hit.length, last, lost: m > 0 };
    return { miss, heard: hit.length, last };
  }
  // A reading over time, for the replay timeline: frames ({ t: ms, i: word index, f0, res, loose }) cut into
  // bins of binMs from t0 (when the recording started). Each bin keeps the median pitch of its voiced frames
  // and the mean resonance of its steady vowel frames (or of short-vowel frames, marked rough, when it has no
  // steady one). rs is the resonance smoothed over about a quarter second, so the line follows the voice
  // rather than frame jitter; gaps longer than that stay gaps. ws: when the highlight first reached each word.
  function readingTimeline(frames, t0, nWords, binMs = 50) {
    const fr = (frames || []).filter(f => Number.isFinite(f.t) && f.t >= t0);
    const dur = fr.length ? Math.ceil(fr[fr.length - 1].t - t0) : 0, n = Math.max(1, Math.ceil(dur / binMs));
    const acc = Array.from({ length: n }, () => ({ p: [], r: [], l: [] }));
    const ws = Array(nWords).fill(null);
    let reached = -1;
    for (const f of fr) {
      const ms = f.t - t0, a = acc[Math.min(n - 1, Math.floor(ms / binMs))];
      if (f.f0 > 0) a.p.push(f.f0);
      if (Number.isFinite(f.res)) (f.loose ? a.l : a.r).push(f.res);
      // the highlight only moves forward in a reading, so a word starts when it (or a later word) is first reached
      while (reached < Math.min(f.i, nWords - 1)) { reached++; ws[reached] = Math.round(ms); }
    }
    const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
    const f0 = acc.map(a => (a.p.length ? Math.round(median(a.p)) : 0));
    const res = acc.map(a => (a.r.length ? Math.round(mean(a.r) * 10) / 10 : a.l.length ? Math.round(mean(a.l) * 10) / 10 : null));
    const rough = acc.map(a => (!a.r.length && a.l.length ? 1 : 0));
    const k = Math.max(1, Math.round(125 / binMs));
    const rs = res.map((v, i) => {
      const near = []; let anyClose = false;
      for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) if (res[j] != null) { near.push(res[j]); if (Math.abs(j - i) <= 1) anyClose = true; }
      return near.length && (v != null || anyClose) ? Math.round(mean(near) * 10) / 10 : null;
    });
    // formants per bin (median F1-F3 of the voiced frames), drawn over the spectrogram
    const fm = Array.from({ length: n }, () => [[], [], []]);
    for (const f of fr) {
      if (!(f.f0 > 0) || !Array.isArray(f.F) || f.F.length < 3) continue;
      const a = fm[Math.min(n - 1, Math.floor((f.t - t0) / binMs))];
      for (let j = 0; j < 3; j++) if (f.F[j] > 0) a[j].push(f.F[j]);
    }
    const fmt = fm.map(a => (a[0].length && a[1].length && a[2].length ? a.map(v => Math.round(median(v))) : null));
    return { bin: binMs, dur, f0, res, rough, rs, ws, fm: fmt };
  }
  // Each word's stretch of the reading, [start, end] in ms: from where the highlight reached it to where it
  // reached the next word (or the end), or null for a word the highlight never reached.
  // we (optional): where each word ends, when that's known (words heard in a Freestyle take, which have pauses between them).
  function wordSpans(ws, dur, we) {
    return (ws || []).map((s, i) => {
      if (s == null) return null;
      if (we && we[i] != null) return [s, Math.max(s, we[i])];
      let e = dur;
      for (let j = i + 1; j < ws.length; j++) if (ws[j] != null) { e = ws[j]; break; }
      return [s, Math.max(s, e)];
    });
  }
  // Words the browser's speech recogniser heard during a Freestyle take, put on the take's timeline. heard: [{ w, t0, t1,
  // conf, tent }] on the page clock (t0/t1 where the words were placed on the voice, see placeWords; conf the
  // recogniser's confidence 0-1, 0 when it gives none; tent when the word never firmed up). frames: the take's frames
  // (t on the frame clock, which runs lag ms behind the page clock), t0: when the take started, dur: its length.
  // Returns the words in byWord form ([word, pitch, resonance, sibilance, rough?]), when each starts (ws) and ends (we),
  // and which ones the recogniser was unsure of (low confidence or never final). Frames get tagged with their word (f.i).
  const HEARD_SURE = 0.6;
  function heardWords(frames, t0, dur, heard, lag) {
    const list = (heard || []).filter(L => L && L.w && Number.isFinite(L.t0) && Number.isFinite(L.t1))
      .map(L => ({ L, s: Math.round(L.t0 - lag - t0), e: Math.round(L.t1 - lag - t0) }))
      .filter(x => x.e > 0 && x.s < dur).sort((a, b) => a.s - b.s);
    const ws = list.map(x => Math.max(0, x.s)), we = list.map((x, i) => Math.max(ws[i], Math.min(dur, x.e)));
    let k = 0;
    const tagged = [];
    for (const f of frames || []) {
      const ms = f.t - t0;
      while (k < ws.length && we[k] < ms) k++;
      if (k < ws.length && ws[k] <= ms) tagged.push(Object.assign({}, f, { i: k }));
    }
    const round = (v) => (v != null ? Math.round(v * 10) / 10 : null);
    const words = wordReport(tagged, list.length).map((r, i) => [list[i].L.w, r.p != null ? Math.round(r.p) : null, round(r.r), round(r.s)].concat(r.rough && r.r != null ? [1] : []));
    const unsure = list.map(x => !!x.L.tent || (x.L.conf > 0 && x.L.conf < HEARD_SURE));
    return { words, ws, we, unsure };
  }
  // ---------- a reference reading (the demo voice reading a passage) ----------
  // The demo voice's audio is made here, so each word's timing is known exactly. It is analysed offline the way a
  // live reading is (app.js onFrame): 60 frames a second, each tagged with its word; on steady frames the word's
  // own vowels first, else any clear vowel (counted overall, not per vowel), linking words not scored; short
  // vowels read from single frames (loose); /s/ and /sh/ scored; formants kept for the timeline and vowel map.
  // x: samples at fs; words: the passage's words; spans: [[start, end] in seconds] per word; pron: pronIndex.
  // A generator, so a page can analyse a long passage in slices without freezing: it yields the share done
  // every `every` frames and returns { frames (Run.frames form, t in ms from the start), vf (formants and score
  // per vowel key, for vowelMap), all (every resonance score), pitch, breath, sibs: { s, sh } }.
  const REF_LAG = 0.04; // s: the analysis looks at the newest ~30 ms, smoothed over a few frames
  function* analyzeReadingSteps(x, fs, words, spans, pron, every = 400) {
    const an = new Analyzer(fs), hop = Math.round(fs / 60), out = { frames: [], vf: {}, all: [], pitch: [], breath: [], sibs: { s: [], sh: [] } };
    const wv = words.map(w => wordVowels(w, pron));
    const score = (a) => Math.max(0, Math.min(100, resScore(a)));
    let wi = -1, n = 0;
    for (let end = an.needed; end <= x.length; end += hop) {
      const fr = an.analyze(x.subarray(0, end)), tc = end / fs - REF_LAG;
      while (wi + 1 < spans.length && spans[wi + 1][0] <= tc + 0.01) wi++; // the word being said, as a highlight would have it
      const i = Math.max(0, wi), f = { i, f0: fr.kind === 'voiced' ? fr.f0 : 0, res: NaN, u: NaN, miss: false, sib: NaN, k: null,
        t: Math.round(tc * 1000), e: fr.ve, a: Math.round(200 * Math.log10(fr.rms + 1e-9)) / 10, F: fr.kind === 'voiced' ? fr.formants : null, rawF: fr.kind === 'voiced' ? fr.rawF : null, st: !!fr.steady, w: i };
      const w = wv[i];
      if (fr.kind === 'voiced') {
        out.pitch.push(fr.f0);
        if (fr.formants && (fr.stable || fr.steady)) {
          const F = fr.formants, cls = classifyVowel(F, VOWELS, fr.f0);
          let fit = null, perVowel = false;
          if (w.why === 'ok') {
            const m = matchWordVowel(F, w.keys, cls, fr.f0);
            if (m) { fit = m; perVowel = true; } else if (cls.cost < 0.07 && cls.ok) fit = cls; else if (cls.cost < 0.07) f.miss = true;
          } else if (w.why !== 'function') {
            if (cls.cost < 0.07 && !cls.ok) f.miss = true; else if (cls.cost < 0.07) fit = cls;
          }
          if (fit) {
            f.res = score(fit.alpha); f.u = fit.spread * RES_PER_ALPHA / 100; out.all.push(f.res);
            if (perVowel) { f.k = fit.vowel.key; (out.vf[f.k] = out.vf[f.k] || []).push([F[0], F[1], F[2], f.res]); }
          }
        } else if (fr.rawF && w.why !== 'function') {
          const cls = classifyVowel(fr.rawF, VOWELS, fr.f0);
          const m = w.why === 'ok' ? matchWordVowel(fr.rawF, w.keys, cls, fr.f0) : null, fit = m || (cls.cost < 0.07 && cls.ok ? cls : null);
          if (fit) { f.res = score(fit.alpha); f.u = fit.spread * RES_PER_ALPHA / 100; f.loose = true; }
        }
      } else if (fr.kind === 'fricative' && SIBILANTS[fr.sib]) {
        f.sib = score(sibilantAlpha(fr.cog, SIBILANTS[fr.sib])); out.sibs[fr.sib].push(f.sib);
      }
      if (fr.breath != null) out.breath.push(fr.breath);
      out.frames.push(f);
      if (++n % every === 0) yield end / x.length;
    }
    return out;
  }
  function analyzeReading(x, fs, words, spans, pron) {
    const it = analyzeReadingSteps(x, fs, words, spans, pron);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
  }
  // A reference reading's timeline laid on another reading's clock: each word's stretch of the reference is
  // stretched or squeezed onto the same word's stretch there (ws: that reading's word starts in ms, dur its
  // length), so the two line up word by word even when the pace differs. A word's stretch is scaled by at most
  // 2.5 times either way, and a word the other reading never reached is left out.
  // Returns { f0: [[ms, Hz]], rs: [[ms, resonance or null]] } in that reading's ms.
  // What the timeline read at one moment (ms), for the readout under it when a spot is cued: the nearest pitch,
  // resonance and F1-F3 within reach ms (so a tap between dots still reads), and the reference's pitch and
  // resonance there when one is laid over it (ref: warpTimeline's { f0: [[ms, Hz]], rs: [[ms, score]] }).
  function timelineAt(tl, ms, ref, reach = 100) {
    const n = tl.f0.length, i = Math.max(0, Math.min(n - 1, Math.floor(ms / tl.bin))), k = Math.max(1, Math.round(reach / tl.bin));
    let f0 = 0, res = null, F = null;
    for (let d = 0; d <= k && (!f0 || res == null || !F); d++) for (const j of d ? [i - d, i + d] : [i]) {
      if (j < 0 || j >= n) continue;
      if (!f0 && tl.f0[j]) f0 = tl.f0[j];
      if (res == null && tl.rs[j] != null) res = tl.rs[j];
      if (!F && tl.fm && tl.fm[j]) F = tl.fm[j];
    }
    const near = (pts) => { let best = null, bd = reach + 1; for (const [t, v] of pts || []) { const d = Math.abs(t - ms); if (v != null && d < bd) { bd = d; best = v; } } return best; };
    return { i, f0, res, F, ref: ref ? { f0: near(ref.f0), res: near(ref.rs) } : null };
  }
  // F1-F3 over a stretch [a, b) ms of a timeline (a word): the median of each formant over the bins read there, or null.
  function spanFormants(tl, a, b) {
    if (!tl.fm) return null;
    const got = [[], [], []];
    for (let i = Math.max(0, Math.floor(a / tl.bin)); i < tl.fm.length && i * tl.bin < b; i++) {
      const F = tl.fm[i], mid = (i + 0.5) * tl.bin; if (!F || mid < a || mid >= b) continue;
      for (let k = 0; k < 3; k++) if (F[k]) got[k].push(F[k]);
    }
    if (!got[0].length && !got[1].length) return null;
    return got.map(v => { if (!v.length) return null; v.sort((x, y) => x - y); return Math.round(v[(v.length - 1) >> 1] / 2 + v[v.length >> 1] / 2); });
  }
  function warpTimeline(ref, ws, dur) {
    const rsp = wordSpans(ref.ws, ref.dur), usp = wordSpans(ws, dur), out = { f0: [], rs: [] };
    for (let k = 0; k < rsp.length; k++) {
      const a = rsp[k], b = usp[k]; if (!a || !b) continue;
      const rl = Math.max(1, a[1] - a[0]), ul = b[1] - b[0], g = Math.max(0.4, Math.min(2.5, ul / rl));
      const i0 = Math.max(0, Math.floor(a[0] / ref.bin)), i1 = Math.min(ref.f0.length - 1, Math.ceil(a[1] / ref.bin) - 1);
      for (let i = i0; i <= i1; i++) {
        const ms = (i + 0.5) * ref.bin; if (ms < a[0] || ms >= a[1]) continue;
        const at = b[0] + (ms - a[0]) * g; if (at > b[1]) break;
        if (ref.f0[i]) out.f0.push([Math.round(at), ref.f0[i]]);
        out.rs.push([Math.round(at), ref.rs[i]]);
      }
    }
    return out;
  }
  // The reference's spectrogram laid on your reading's clock, word by word, the way warpTimeline lays its pitch and
  // resonance: each of your words gets the reference's same word stretched (0.4-2.5x) onto its span; where the
  // reference ran out of word, or between words, the column is blank. spec: D.spectrogram of the reference audio;
  // ref: its timeline (ws word starts, dur, bin, fm per bin); ws/dur/we: your words and length. Returns a spectrogram
  // at the reference's hop on your clock, plus fm: [[ms, [F1, F2, F3]]] for its formant marks.
  function warpSpectrogram(spec, ref, ws, dur, we) {
    const rsp = wordSpans(ref.ws, ref.dur), usp = wordSpans(ws, dur, we), hop = spec.hop, rows = spec.rows;
    const cols = Math.max(0, Math.ceil(dur / hop)), v = new Uint8Array(cols * rows), fm = [];
    for (let k = 0; k < rsp.length; k++) {
      const a = rsp[k], b = usp[k]; if (!a || !b) continue;
      const g = Math.max(0.4, Math.min(2.5, (b[1] - b[0]) / Math.max(1, a[1] - a[0])));
      for (let c = Math.max(0, Math.floor(b[0] / hop)); c < cols && c * hop < b[1]; c++) {
        const ms = c * hop; if (ms < b[0]) continue;
        const rc = Math.round((a[0] + (ms - b[0]) / g) / hop);
        if (rc * hop >= a[1] || rc < 0 || rc >= spec.cols) continue;
        v.set(spec.v.subarray(rc * rows, rc * rows + rows), c * rows);
      }
      if (ref.fm) {
        const i0 = Math.max(0, Math.floor(a[0] / ref.bin)), i1 = Math.min(ref.fm.length - 1, Math.ceil(a[1] / ref.bin) - 1);
        for (let i = i0; i <= i1; i++) {
          const ms = (i + 0.5) * ref.bin; if (ms < a[0] || ms >= a[1] || !ref.fm[i]) continue;
          const at = b[0] + (ms - a[0]) * g; if (at > b[1]) break;
          fm.push([Math.round(at), ref.fm[i]]);
        }
      }
    }
    return { hop, rows, cols, fmax: spec.fmax, v, fm };
  }
  // A spectrogram of a whole recording, for drawing under the reading timeline: the sound brought down to about
  // 11 kHz, 23 ms Hann windows every hopMs (wider for long recordings, so a column count stays under maxCols),
  // rows from 0 Hz up to fmax, each cell 0..255 over the loudest 65 dB. v[col * rows + row], row 0 = 0 Hz.
  function spectrogram(x, sr, { hopMs = 10, fmax = 5000, rows = 100, maxCols = 8000 } = {}) {
    const factor = Math.max(1, Math.floor(sr / 11025)), fs = sr / factor;
    let y = x;
    if (factor > 1) {
      const h = lowpassFIR(31, 0.45 / factor), m = Math.floor((x.length - h.length) / factor) + 1;
      y = new Float32Array(Math.max(0, m));
      for (let k = 0; k < m; k++) { let s = 0; const o = k * factor; for (let j = 0; j < h.length; j++) s += h[j] * x[o + j]; y[k] = s; }
    }
    const dur = y.length / fs * 1000;
    const hop = Math.max(hopMs, Math.ceil(dur / maxCols)), N = 256, w = hann(N), step = fs * hop / 1000;
    const cols = Math.max(0, Math.floor((y.length - N) / step) + 1), binHz = fs / N;
    const db = new Float32Array(cols * rows), re = new Float64Array(N), im = new Float64Array(N);
    for (let c = 0; c < cols; c++) {
      const o = Math.round(c * step);
      for (let i = 0; i < N; i++) { const a = o + i; re[i] = (y[a] - 0.9 * (a > 0 ? y[a - 1] : 0)) * w[i]; im[i] = 0; } // pre-emphasis lifts the formants
      fft(re, im);
      for (let r = 0; r < rows; r++) {
        const b0 = Math.floor(r * fmax / rows / binHz), b1 = Math.max(b0, Math.floor((r + 1) * fmax / rows / binHz));
        let p = 0;
        for (let b = b0; b <= Math.min(b1, N / 2); b++) p = Math.max(p, re[b] * re[b] + im[b] * im[b]);
        db[c * rows + r] = 10 * Math.log10(p + 1e-12);
      }
    }
    // the top is the 99.5th percentile, so a click or pop doesn't wash the rest out
    const sample = [];
    for (let i = 0; i < db.length; i += Math.max(1, Math.floor(db.length / 20000))) sample.push(db[i]);
    const top = sample.length ? quantile(sample, 0.995) : 0, v = new Uint8Array(cols * rows);
    for (let i = 0; i < db.length; i++) v[i] = Math.max(0, Math.min(255, Math.round((db[i] - top + 65) / 65 * 255)));
    return { hop, rows, cols, fmax, v };
  }
  // A full-rate power spectrum as WIDE_ROWS rows of WIDE_HZ / WIDE_ROWS Hz each (dB, loudest bin in the row), so a
  // sibilant's hiss (centred at 3.5-8 kHz) can be drawn; the analyzer's own column stops near 5.5 kHz.
  const WIDE_HZ = 12000, WIDE_ROWS = 96;
  function wideColumn(ps, binHz) {
    const col = new Float32Array(WIDE_ROWS).fill(-120), rh = WIDE_HZ / WIDE_ROWS;
    for (let k = 1; k < ps.length; k++) {
      const r = Math.floor(k * binHz / rh); if (r >= WIDE_ROWS) break;
      const v = 10 * Math.log10(ps[k] + 1e-12); if (v > col[r]) col[r] = v;
    }
    return col;
  }
  // Target vs you: a short spectrogram made from analyzer frames (live or offline, ~60 a second), so a reference
  // sound and your own are drawn the same way. fmax: top of the chart; wide: use the 0-12 kHz column (for hiss).
  // Each cell is 0..255 over the strip's loudest 60 dB (the 99th percentile is the top, so a pop doesn't wash it out);
  // silent frames are blank. fm per column: F1-F3 read on a voiced frame, [null, F2, F3] from a whisper, else null;
  // cog per column: a hiss's centre of gravity. trim drops the silence before and after the sound.
  function specStrip(frames, { fmax = 5000, rows = 80, wide = false, trim = false, fps = 60 } = {}) {
    let a = 0, b = frames.length;
    const sounding = (f) => f && f.kind && f.kind !== 'silence';
    if (trim) {
      while (a < b && !sounding(frames[a])) a++;
      while (b > a && !sounding(frames[b - 1])) b--;
      a = Math.max(0, a - 3); b = Math.min(frames.length, b + 3);
    }
    const fr = frames.slice(a, b), cols = fr.length, db = new Float32Array(cols * rows).fill(-200);
    const fm = [], cog = [], sample = [], f0 = [];
    fr.forEach((f, c) => {
      fm.push(f.kind === 'voiced' && f.formants ? f.formants.slice(0, 3) : f.whisperF ? [null, f.whisperF[1], f.whisperF[2]] : null);
      cog.push(f.kind === 'fricative' && f.cog > 0 ? f.cog : null);
      f0.push(f.kind === 'voiced' && f.f0 > 0 ? f.f0 : null);
      const col = wide ? f.wide : f.spec;
      if (!sounding(f) || !col) return;
      const top = wide ? WIDE_HZ : (f.fsd || 11025) / 2, bin = top / (wide ? col.length : col.length - 1);
      for (let r = 0; r < rows; r++) {
        const lo = r * fmax / rows, hi = (r + 1) * fmax / rows;
        if (lo >= top) break;
        let i0 = wide ? Math.floor(lo / bin) : Math.round(lo / bin), i1 = Math.max(i0, wide ? Math.ceil(hi / bin) - 1 : Math.round(hi / bin));
        i1 = Math.min(i1, col.length - 1);
        let p = -200; for (let i = i0; i <= i1; i++) if (col[i] > p) p = col[i];
        db[c * rows + r] = p; sample.push(p);
      }
    });
    const top = sample.length ? quantile(sample, 0.99) : 0, v = new Uint8Array(cols * rows);
    for (let i = 0; i < db.length; i++) v[i] = db[i] <= -199 ? 0 : Math.max(0, Math.min(255, Math.round((db[i] - top + 60) / 60 * 255)));
    return { rows, cols, fmax, wide, v, fm, cog, f0, dur: cols * 1000 / fps };
  }
  // What a strip read: median F1-F3 over its marked columns (null with fewer than 5) and the hiss's median centre.
  function stripReads(st) {
    const F = [0, 1, 2].map(i => { const a = st.fm.filter(f => f && f[i] > 0).map(f => f[i]); return a.length >= 5 ? median(a) : null; });
    const c = st.cog.filter(x => x > 0), p = (st.f0 || []).filter(x => x > 0);
    return { F, cog: c.length >= 5 ? median(c) : null, f0: p.length >= 5 ? median(p) : 0 };
  }
  // Target vs you in numbers: each formant (and the hiss) yours against the target's, as a ratio, and the one that
  // differs most (gaps under 4% don't count; in a vowel that is about one tenth of the way from a typical man to a
  // typical woman). Returns { rows: [{ k: 'F1'|'F2'|'F3'|'cog', t, y, r }], big }.
  // opt.vowel: the vowel being made; your F1 is then marked aside (and never the biggest difference) where the score
  // sets it aside: your pitch past half its typical F1, or an "F1" under 1.5x your pitch.
  function compareStrips(tgt, you, opt = {}) {
    const a = stripReads(tgt), b = stripReads(you), rows = [];
    [0, 1, 2].forEach(i => { if (a.F[i] && b.F[i]) rows.push({ k: 'F' + (i + 1), t: a.F[i], y: b.F[i], r: b.F[i] / a.F[i] }); });
    if (a.cog && b.cog) rows.push({ k: 'cog', t: a.cog, y: b.cog, r: b.cog / a.cog });
    const v = opt.vowel, r1 = rows.find(x => x.k === 'F1');
    if (v && r1 && b.f0 && (pitchLimited(v, b.f0) || f1OnPitch(b.F, b.f0))) { r1.aside = true; r1.f0 = Math.round(b.f0); r1.limitHz = pitchLimitHz(v); }
    let big = null;
    for (const x of rows) if (!x.aside && Math.abs(Math.log(x.r)) >= Math.log(1.04) && (!big || Math.abs(Math.log(x.r)) > Math.abs(Math.log(big.r)))) big = x;
    return { rows, big };
  }
  // Shorter vowels: in a reading, a frame whose formants didn't hold still is still read on its own (its own 30 ms,
  // not smoothed across the consonant next to it) when it fits one of the word's vowels. One such frame is noisy,
  // so a word needs 3 of them, and they only fill words and readings the steady frames leave empty. On 8 clips of a
  // real reader this lifts content words with a score from 65% to 79%; on synthetic speech at 1.6x speed the word
  // error stays at 2-4 points (median) with more words scored. Shorter LPC windows, 3-frame smoothing, a
  // pitch-scaled lag window and re-picking formants from all candidates were tried and gained 0-4 points of coverage.
  const LOOSE_WORD_MIN = 3;
  // ---------- vowel map ----------
  // The vowels of a passage, each on its own: byKey maps a vowel key to the steady frames classified as
  // that vowel, [[F1, F2, F3, score], ...]. Returns [{ k, F: median formants, s: median score, n }] for each
  // vowel heard in at least minN frames, in the order of VOWELS. Consonants never reach this: only
  // steady voiced frames whose formants fit a vowel are scored.
  function vowelMap(byKey, minN = 8) {
    const out = [];
    for (const v of VOWELS) {
      const fr = (byKey || {})[v.key];
      if (!fr || fr.length < minN) continue;
      out.push({ k: v.key, F: [0, 1, 2].map(i => median(fr.map(f => f[i]))), s: median(fr.map(f => f[3])), n: fr.length });
    }
    return out;
  }
  // Split a passage into short phrases at punctuation (at most maxLen words each) and summarise each one
  // from the per-word values: [{ a, b (word indices, inclusive), r, p (medians, null if none) }].
  function readingPhrases(texts, words, maxLen = 10) {
    const out = [];
    let a = 0;
    for (let i = 0; i < texts.length; i++) {
      if (i === texts.length - 1 || /[.,;:!?]["')\]]*$/.test(texts[i]) || i - a + 1 >= maxLen) {
        const ws = words.slice(a, i + 1);
        const r = ws.map(w => w.r).filter(v => v != null), p = ws.map(w => w.p).filter(v => v != null);
        out.push({ a, b: i, r: r.length ? median(r) : null, p: p.length ? median(p) : null, nr: r.length });
        a = i + 1;
      }
    }
    return out;
  }

  // ---------- focus spots ----------
  // The stretches of a reading where practice pays off most. Each word's shortfall is how far it sits
  // outside the goal: resonance points short of the goal band (below it for a feminine goal, above it for a
  // masculine one) plus pitch on the far side of the pitch band, 5 points per semitone. A stretch's gain is
  // the sum over its words, so a run of words that are all a little off can outrank one word that is far
  // off (and one stray word, often the highlight drifting, counts for less). Stretches are the phrases of
  // readingPhrases trimmed to their off words, then widened back to minLen words so they read naturally.
  // words: [{ p, r }]; opts: { goal: 'fem' | 'masc', res: [lo, hi], pitch: [lo, hi], n, minLen }
  // Returns [{ a, b, gain, rGain, pGain, ri, pi, r, p, why: 'resonance' | 'pitch' | 'both' }], biggest gain first.
  const ST_POINTS = 5;
  function wordShortfall(w, opts) {
    const fem = opts.goal !== 'masc', [lo, hi] = opts.res, [plo, phi] = opts.pitch;
    const r = w && w.r != null ? Math.max(0, fem ? lo - w.r : w.r - hi) : 0;
    const p = w && w.p > 0 ? ST_POINTS * Math.max(0, 12 * Math.log2(fem ? plo / w.p : w.p / phi)) : 0;
    return { r, p };
  }
  function clipStats(words) {
    const r = words.map(w => w && w.r).filter(v => v != null), p = words.map(w => w && w.p).filter(v => v > 0);
    return { r: r.length ? median(r) : null, p: p.length ? median(p) : null, nr: r.length, np: p.length };
  }
  // The numbers of a spot: the median over the words that were off in the reading (ri, pi: indices within
  // the spot), so a try is compared on the same words; the whole spot when none of those words were scored.
  function spotStats(sp, clipWords) {
    const all = clipStats(clipWords), pick = (idx, k) => {
      const v = (idx || []).map(i => clipWords[i] && clipWords[i][k]).filter(x => x != null && (k !== 'p' || x > 0));
      return v.length ? median(v) : all[k];
    };
    return { r: pick(sp.ri, 'r'), p: pick(sp.pi, 'p') };
  }
  function focusSpots(texts, words, opts) {
    const n = opts.n || 3, minLen = opts.minLen || 3;
    const sf = words.map(w => wordShortfall(w, opts)), g = sf.map(x => x.r + x.p);
    const out = [];
    for (const ph of readingPhrases(texts, words)) {
      let a = ph.a, b = ph.b;
      while (a < b && !(g[a] > 0)) a++;
      while (b > a && !(g[b] > 0)) b--;
      if (!(g[a] > 0)) continue; // the whole phrase is on the goal
      while (b - a + 1 < minLen && (a > ph.a || b < ph.b)) {
        if (b < ph.b) b++;
        if (b - a + 1 < minLen && a > ph.a) a--;
      }
      let rGain = 0, pGain = 0;
      const ri = [], pi = [];
      for (let i = a; i <= b; i++) { rGain += sf[i].r; pGain += sf[i].p; if (sf[i].r > 0) ri.push(i - a); if (sf[i].p > 0) pi.push(i - a); }
      const sp = { a, b, gain: rGain + pGain, rGain, pGain, ri, pi, why: rGain >= 2 * pGain ? 'resonance' : pGain >= 2 * rGain ? 'pitch' : 'both' };
      out.push(Object.assign(sp, spotStats(sp, words.slice(a, b + 1))));
    }
    return out.sort((x, y) => y.gain - x.gain).slice(0, n);
  }
  // How the tries of a focus spot compare with the reading, word by word. before: [{ p, r }] for the
  // spot's words in the reading; tries: [[{ p, r }], ...] the same words in each try; why: the spot's
  // problem ('resonance', 'pitch' or 'both'), so only that shortfall counts. A word's gap is its shortfall
  // (wordShortfall); a change under `same` points is no change. Each attempt's gap is the mean over the
  // words it has a number for, so tries that scored different words still compare.
  // Returns { words: [{ before, last, gap0, gap1, state }], gaps: [reading, try 1, ...], best (try index),
  //   improved, reached, worse, off } where state is 'reached' (was off, now on the goal), 'better',
  //   'worse', 'same' (still off by about as much), 'on' (on the goal both times) or 'none' (no number).
  function compareTries(before, tries, why, opts, same = 2) {
    const gapOf = (w) => {
      if (!w) return null;
      const want = (why !== 'pitch' && w.r != null) || (why !== 'resonance' && w.p > 0);
      if (!want) return null;
      const f = wordShortfall(w, opts);
      return (why === 'pitch' ? 0 : f.r) + (why === 'resonance' ? 0 : f.p);
    };
    const mean = (ws) => { const g = ws.map(gapOf).filter(v => v != null); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null; };
    const gaps = [mean(before), ...tries.map(mean)];
    let best = -1;
    tries.forEach((t, i) => { const g = gaps[i + 1]; if (g != null && (best < 0 || g < gaps[best + 1])) best = i; });
    const last = tries[tries.length - 1] || [];
    const words = before.map((w, i) => {
      const g0 = gapOf(w), g1 = gapOf(last[i]);
      const state = g0 == null || g1 == null ? 'none' : g0 === 0 && g1 === 0 ? 'on' : g1 === 0 ? 'reached'
        : g1 < g0 - same ? 'better' : g1 > g0 + same ? 'worse' : 'same';
      return { before: w, last: last[i] || null, gap0: g0, gap1: g1, state };
    });
    const n = (st) => words.filter(w => st.includes(w.state)).length;
    return { words, gaps, best, improved: n(['reached', 'better']), reached: n(['reached']), worse: n(['worse']), off: words.filter(w => w.gap1 > 0).length };
  }
  // Several readings of one passage, word by word ([[word, Hz, resonance, ...], ...] each), merged into
  // one: the median of each word's values over the readings that have one. Readings of a different
  // length (the text was edited since) are left out.
  function mergeWordReports(lists) {
    const len = lists.length ? lists[lists.length - 1].length : 0, use = lists.filter(l => l && l.length === len);
    return Array.from({ length: len }, (_, i) => {
      const p = use.map(l => l[i][1]).filter(v => v > 0), r = use.map(l => l[i][2]).filter(v => v != null);
      return { text: use[use.length - 1][i][0], p: p.length ? median(p) : null, r: r.length ? median(r) : null };
    });
  }

  // ---------- sing along ----------
  // Lyrics pasted by the user: plain text (one line per lyric line) or LRC ("[01:02.50]words", several
  // stamps on one line allowed, "[offset:+250]" in ms shows every line that much sooner, as in the LRC format, metadata tags and
  // enhanced "<01:02.50>" word stamps are dropped). Returns {timed, lines: [{t, text}]} with t in
  // seconds (null for plain text), sorted by time; blank lines are kept out.
  function parseLyrics(src) {
    const rows = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const stamp = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
    let offset = 0, timed = [], plain = [];
    for (const raw of rows) {
      const off = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i);
      if (off) { offset = parseInt(off[1], 10) / 1000; continue; }
      if (/^\s*\[[a-z#]+:[^\]]*\]\s*$/i.test(raw) && !/^\s*\[\d/.test(raw)) continue; // [ar:..], [ti:..], [length: ..]
      const ts = [];
      let m, last = 0; stamp.lastIndex = 0;
      while ((m = stamp.exec(raw)) && m.index === last) { ts.push(parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.'))); last = stamp.lastIndex; }
      let text = raw.slice(last).replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '');
      // a target melody for the line, written after it in braces: "Sweet dreams are made of this {C4 C4 D#4 C4 G3}"
      const notes = [];
      text = text.replace(/\{([^{}]*)\}/g, (_, n) => { notes.push(...parseNotes(n, notes.length ? notes[notes.length - 1] : null)); return ' '; });
      text = text.replace(/\s+/g, ' ').trim();
      const add = (o) => (notes.length ? Object.assign(o, { notes }) : o);
      if (ts.length) for (const t of ts) timed.push(add({ t, text }));
      else if (text) plain.push(add({ t: null, text }));
      else if (notes.length && plain.length) { const p = plain[plain.length - 1]; p.notes = (p.notes || []).concat(notes); } // notes on their own row go with the line above
    }
    if (timed.length) {
      // LRC files use an empty stamped line for an instrumental break: keep it so the highlight can rest there
      timed = timed.map(l => Object.assign({}, l, { t: Math.max(0, l.t - offset) })).sort((a, b) => a.t - b.t);
      while (timed.length && !timed[0].text) timed.shift();
      return { timed: true, lines: timed };
    }
    return { timed: false, lines: plain };
  }
  // Note names to MIDI numbers: "C4 D#4 Eb4 g3", sharps (#, ♯) and flats (b, ♭), separated by spaces, commas, dashes
  // or bars. A note without an octave takes the previous note's (the first one's defaults to 4); "-" alone (a rest)
  // and anything that isn't a note are skipped. prev: the MIDI number of the note before these, if any.
  const NOTE_STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function parseNotes(str, prev = null) {
    const out = [];
    let oct = prev != null ? Math.floor(prev / 12) - 1 : 4;
    for (const tok of String(str || '').split(/[\s,|;/]+|(?<=\d)-(?=[a-g])/i)) {
      const m = tok.match(/^([a-g])([#♯b♭]?)(\d)?$/i);
      if (!m) continue;
      if (m[3] != null) oct = +m[3];
      const n = 12 * (oct + 1) + NOTE_STEP[m[1].toLowerCase()] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0);
      if (n >= 24 && n <= 96) out.push(n);
    }
    return out;
  }
  // How a sung line kept to its target notes, from the notes held on it (heldNotes): seconds held on one of the
  // line's notes (on), on one of them an octave or two away (oct: a voice singing the tune in its own octave), and
  // on other notes (off); share = on / held; missed = the line's notes never held. Order and timing aren't checked:
  // without the song's timing the app can't know when each note should come.
  function melodyMatch(frames, notes) {
    const want = new Set(notes || []), h = heldNotes(frames);
    let on = 0, oct = 0;
    for (const b of h.bins) {
      if (want.has(b.midi)) on += b.secs;
      else if ([12, 24].some(k => want.has(b.midi + k) || want.has(b.midi - k))) oct += b.secs;
    }
    const held = h.total, hit = new Set(h.bins.map(b => b.midi));
    return { held, on, oct, off: held - on - oct, share: held > 0 ? on / held : null, octShare: held > 0 ? oct / held : null,
      missed: [...want].filter(n => !hit.has(n)) };
  }
  // the target note nearest a pitch (Hz) among notes (MIDI), allowing whole octaves away:
  // { midi, cents (signed, from that note in the octave sung), octaves (how many octaves the voice is from it) }
  function nearestNote(f0, notes) {
    if (!(f0 > 0) || !notes || !notes.length) return null;
    const m = 12 * Math.log2(f0 / 440) + 69;
    let best = null;
    for (const n of new Set(notes)) {
      const k = Math.round((m - n) / 12), c = Math.round(100 * (m - n - 12 * k));
      if (!best || Math.abs(k) < Math.abs(best.octaves) || (Math.abs(k) === Math.abs(best.octaves) && Math.abs(c) < Math.abs(best.cents))) best = { midi: n, cents: c, octaves: k };
    }
    return best;
  }

  // index of the line sung at time t (seconds) in timed lyrics; -1 before the first line
  function lyricLineAt(lines, t) {
    let lo = 0, hi = lines.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  // After a song: one summary per lyric line from the frames heard while it was current
  // ({line, f0 (0 when unvoiced), res (NaN unless a vowel was scored), u (± of res, score points, optional),
  // miss (a vowel was heard but couldn't be measured, optional)}). A line needs 0.3 s of voice for a pitch
  // summary. Resonance: 8 scored vowel frames (~0.13 s) give a solid reading; 3 to 7 still give one, marked
  // shaky. pm = rough ± of the line's median: the frames' own ± shrunk by how many there were (1.25/√n for a
  // median), floored at 2 and widened for shaky lines. A line with no reading says why (why):
  // 'quiet' (barely any voice), 'high' (sung above SING_RES_HIGH Hz), 'unclear' (vowels heard, none measurable),
  // 'unsteady' (voice but no held vowel, e.g. fast words or slides).
  const SING_RES_SOLID = 8, SING_RES_MIN = 3, SING_RES_HIGH = 280;
  function singSummary(frames, nLines) {
    const by = Array.from({ length: nLines }, () => ({ f0: [], res: [], u: [], miss: 0 }));
    for (const f of frames) {
      const b = by[f.line]; if (!b) continue;
      if (f.f0 > 0) b.f0.push(f.f0);
      if (Number.isFinite(f.res)) { b.res.push(f.res); if (Number.isFinite(f.u)) b.u.push(f.u); }
      else if (f.miss) b.miss++;
    }
    return by.map((b, i) => {
      const voiced = b.f0.length >= 18;
      const lo = voiced ? quantile(b.f0, 0.1) : null, hi = voiced ? quantile(b.f0, 0.9) : null;
      const n = b.res.length, has = n >= SING_RES_MIN, shaky = has && n < SING_RES_SOLID;
      let pm = null, why = null;
      if (has) {
        const u = b.u.length ? median(b.u) : 8; // no per-frame ± given: a typical speaking-pitch reading
        pm = Math.max(2, Math.round(u * 1.25 / Math.sqrt(n) * (shaky ? 1.5 : 1)));
      } else if (b.f0.length < 6) why = 'quiet';
      else if (median(b.f0) > SING_RES_HIGH) why = 'high';
      else if (b.miss >= 3) why = 'unclear';
      else why = 'unsteady';
      return {
        line: i, voicedFrames: b.f0.length, vowelFrames: n, missFrames: b.miss,
        f0: voiced ? median(b.f0) : null, lo, hi, span: voiced ? 12 * Math.log2(hi / lo) : null,
        res: has ? median(b.res) : null, shaky, pm, why,
      };
    });
  }
  // A whole reading's resonance, pooled from every frame that got a score ({f0 (0 when unvoiced), res (NaN unless
  // scored), u (± of res, optional), miss (heard but not measurable, optional)}). 20 scored frames (~0.3 s of
  // vowels) give a solid score; 6 to 19 still give one, marked shaky. With fewer it says why, with the same
  // reasons as a sung line (SING_WHY). -> { res, n, shaky, pm, why }
  const READ_RES_SOLID = 20, READ_RES_MIN = 6;
  // Loose frames (see wordReport) only count when the steady ones are too few for a solid score.
  function pooledResonance(frames) {
    let res = [], u = [], f0 = [], lres = [], lu = []; let miss = 0;
    for (const f of frames || []) {
      if (f.f0 > 0) f0.push(f.f0);
      if (Number.isFinite(f.res)) { (f.loose ? lres : res).push(f.res); if (Number.isFinite(f.u)) (f.loose ? lu : u).push(f.u); } else if (f.miss) miss++;
    }
    if (res.length < READ_RES_SOLID) { res = res.concat(lres); u = u.concat(lu); }
    const n = res.length;
    if (n >= READ_RES_MIN) {
      const shaky = n < READ_RES_SOLID, uu = u.length ? median(u) : 8;
      return { res: median(res), n, shaky, pm: Math.max(2, Math.round(uu * 1.25 / Math.sqrt(n) * (shaky ? 1.5 : 1))), why: null };
    }
    const why = f0.length < 30 ? 'quiet' : median(f0) > SING_RES_HIGH ? 'high' : miss >= 3 ? 'unclear' : 'unsteady';
    return { res: null, n, shaky: false, pm: null, why };
  }

  // ---------- mic & voice check ----------
  // A short guided recording, read back to find what limits the readings: the microphone (a narrow phone-call band,
  // noise, clipping, sound cut to silence between words, too quiet) or the voice (breathy, a nasal resonance, a pitch
  // high enough to hide F1). seg: { quiet, ah, ee, speech } Float32Arrays at sample rate sr; info: { label } (device name).
  // -> { checks: [{ id, level: 'good' | 'warn' | 'bad', title, say }], main (the check most likely limiting readings,
  // or null), data (the numbers behind them) }
  // Not checked: nasality. A nasal pole (250-350 Hz) on a synthetic "ah" doesn't show up in this LPC's candidates, and
  // the usual measure (A1-P0) mixes with the first harmonic at a higher pitch, so it can't be told reliably here.
  const MIC_PRIORITY = ['clip', 'noise', 'band', 'gate', 'level', 'breath', 'vowels', 'pitch'];
  function micVoiceCheck(seg, sr, info = {}) {
    const db = (p) => 10 * Math.log10(p + 1e-20);
    const rmsBlocks = (x, ms = 10) => {
      const n = Math.max(1, Math.round(sr * ms / 1000)), out = [];
      for (let i = 0; i + n <= x.length; i += n) { let e = 0; for (let k = i; k < i + n; k++) e += x[k] * x[k]; out.push(e / n); }
      return out;
    };
    // long-term average spectrum in 250 Hz bands, from ~43 ms frames (only frames above `minE` mean power)
    const N = 1 << Math.round(Math.log2(sr * 0.043)), binHz = sr / N;
    function ltas(x, minE = -1) {
      const frames = [];
      for (let end = N; end <= x.length; end += N >> 1) {
        let e = 0; for (let k = end - N; k < end; k++) e += x[k] * x[k];
        frames.push({ end, e });
      }
      if (!frames.length) return null;
      const cut = minE * N;
      const acc = new Float64Array(N / 2 + 1); let n = 0;
      for (const f of frames) if (f.e >= cut) { const p = powerSpectrum(x.subarray(0, f.end), N); for (let k = 0; k < p.length; k++) acc[k] += p[k]; n++; }
      const bands = [];
      for (let lo = 0; lo + 250 <= sr / 2; lo += 250) {
        let sum = 0, c = 0;
        for (let k = Math.ceil(lo / binHz); k * binHz < lo + 250 && k < acc.length; k++) { sum += acc[k] / n; c++; }
        bands.push({ f: lo + 125, db: db(c ? sum / c : 0) });
      }
      return bands;
    }
    const voiceAll = new Float32Array((seg.ah ? seg.ah.length : 0) + (seg.ee ? seg.ee.length : 0) + (seg.speech ? seg.speech.length : 0));
    { let o = 0; for (const x of [seg.ah, seg.ee, seg.speech]) if (x) { voiceAll.set(x, o); o += x.length; } }
    const data = { sr, label: info.label || '' };
    const checks = [];
    const add = (id, level, title, say) => checks.push({ id, level, title, say });

    // level, noise, clipping, silence between words
    const vb = rmsBlocks(voiceAll), qb = seg.quiet ? rmsBlocks(seg.quiet) : [];
    const voiceDb = vb.length ? db(quantile(vb, 0.9)) : -200, quietDb = qb.length ? db(median(qb)) : -200;
    data.voiceDb = Math.round(voiceDb); data.quietDb = Math.round(quietDb); data.snr = Math.round(voiceDb - quietDb);
    let clip = 0; for (let i = 0; i < voiceAll.length; i++) if (Math.abs(voiceAll[i]) >= 0.985) clip++;
    data.clip = voiceAll.length ? clip / voiceAll.length : 0;
    const dead = qb.length ? qb.filter(e => e < 1e-10).length / qb.length : 0; // below -100 dBFS: digital silence
    data.deadQuiet = Math.round(100 * dead);

    // bandwidth: the highest 250 Hz band where your voice stands 10 dB clear of the room and of a floor 60 dB under its peak
    // (a real voice reaches 8-12 kHz on that rule, a phone line or 8 kHz Bluetooth call 3.5-4.5 kHz), searched from the top down
    // sound, not pauses: frames at least 10x the room's power (the hiss of "s" is far quieter than a vowel, so all of it counts)
    const L = ltas(voiceAll, Math.max(1e-9, 10 * (qb.length ? median(qb) : 0))), Q = seg.quiet ? ltas(seg.quiet) : null;
    let top = 0;
    if (L) {
      const peak = Math.max(...L.filter(b => b.f > 200 && b.f < 4000).map(b => b.db));
      for (let i = L.length - 1; i >= 0; i--) {
        const floor = Math.max(Q ? Q[i].db : -300, peak - 60); // 60 dB down: past where real speech still has energy
        if (L[i].f > 300 && L[i].db > floor + 10) { top = L[i].f + 125; break; }
      }
    }
    data.topHz = top;
    const bt = /hands-?free|headset|bluetooth|airpods|buds|\bbt\b/i.test(info.label || '');
    // in a noisy room the noise hides the top of the voice, so a narrow reading there is only a maybe
    if (top && top < 4600 && data.snr < 25) add('band', 'warn', 'Top end unclear', `Your voice only stands out from the noise up to about ${(top / 1000).toFixed(1)} kHz. That may be the noise, or a phone-quality microphone${bt ? ' (it looks like a Bluetooth headset, which drops to call quality while its mic is on)' : ''}. Try again somewhere quieter.`);
    else if (top && top < 4600) add('band', 'bad', 'Phone-call sound', `Your microphone only passes sound up to about ${(top / 1000).toFixed(1)} kHz, like a phone call. F3 and the hiss of "s" sit above that, so most vowels can't be read.${bt ? ' It looks like a Bluetooth headset: these drop to call quality whenever their mic is in use.' : ''} Use the computer's or phone's built-in microphone, or a wired one.`);
    else if (top && top < 6000) add('band', 'warn', 'Muffled top end', `Your microphone passes sound up to about ${(top / 1000).toFixed(1)} kHz. Vowels can be read, but /s/ brightness may read low.${bt ? ' A Bluetooth headset does this; a wired or built-in mic is better.' : ''}`);
    else add('band', 'good', 'Full sound range', `Your microphone passes sound up to about ${Math.round(Math.min(top || sr / 2, sr / 2) / 1000)} kHz.`);

    if (data.clip > 0.002) add('clip', 'bad', 'Too loud: clipping', 'Your voice is cut off at the top of the range, which smears the vowels. Move back a little or turn the microphone level down.');
    else if (data.clip > 0.0003) add('clip', 'warn', 'Almost clipping', 'Your loudest moments touch the top of the range. Move back a little.');
    else add('clip', 'good', 'No clipping', 'Your voice stays inside the microphone\'s range.');

    if (dead > 0.5) add('gate', 'warn', 'Silence between words', 'The room reads as total silence, so something (the system, the headset or a noise cancelling app) is gating or cleaning the sound. That processing can also blur vowels: turn off "noise suppression", "audio enhancements" or "voice isolation" if you can.');
    else if (data.snr < 15) add('noise', 'bad', 'Noisy room', `Your voice is only ${data.snr} dB above the background. Find a quieter spot or move closer to the microphone.`);
    else if (data.snr < 25) add('noise', 'warn', 'Some background noise', `Your voice is ${data.snr} dB above the background. Quieter is better for reading vowels.`);
    else add('noise', 'good', 'Quiet background', `Your voice is ${Math.min(data.snr, 99)} dB above the background.`);
    if (voiceDb < -42) add('level', 'warn', 'Quiet signal', 'The microphone picks you up quietly. Move closer or turn its level up.');

    // the voice: run the same analysis as the app over the held vowels
    function vowelStats(x, key) {
      if (!x || x.length < sr * 0.5) return null;
      const an = new Analyzer(sr), hop = Math.round(sr / 60), v = VOWEL_BY_KEY[key];
      let voiced = 0, steady = 0, ok = 0, airy = 0, withF = 0; const f0 = [], br = [], sc = [], Fs = [], h12 = [], why = { dark: 0, bright: 0, shape: 0 };
      for (let end = an.needed; end <= x.length; end += hop) {
        const fr = an.analyze(x.subarray(0, end));
        if (fr.kind === 'other' && fr.breath != null) { airy++; br.push(fr.breath); }
        if (fr.kind !== 'voiced') continue;
        voiced++; f0.push(fr.f0); if (fr.breath != null) br.push(fr.breath); if (Number.isFinite(fr.h1h2)) h12.push(fr.h1h2);
        if (!fr.formants) continue;
        withF++;
        if (!fr.steady) continue;
        steady++; Fs.push(fr.formants);
        const fit = scoreVowel(fr.formants, v, fr.f0);
        if (fit.ok) { ok++; sc.push(resScore(fit.alpha)); }
        else why[fit.alpha < SCORE_RANGE[0] ? 'dark' : fit.alpha > SCORE_RANGE[1] ? 'bright' : 'shape']++; // why a held frame was refused
      }
      return { voiced, airy, withF: voiced ? withF / voiced : 0, steady: voiced ? steady / voiced : 0, ok: voiced ? ok / voiced : 0, why,
        F: Fs.length ? [0, 1, 2].map(i => Math.round(median(Fs.map(f => f[i])))) : null,
        f0: f0.length ? median(f0) : 0, breath: br.length ? median(br) : NaN, h1h2: h12.length ? median(h12) : NaN, score: sc.length ? median(sc) : NaN };
    }
    const ah = vowelStats(seg.ah, 'a'), ee = vowelStats(seg.ee, 'i');
    data.ah = ah; data.ee = ee;
    const held = [ah, ee].filter(s => s && s.voiced >= 30);
    const airy = [ah, ee].filter(s => s && s.airy > s.voiced && s.airy >= 30);
    if (!held.length && airy.length) add('breath', 'bad', 'Too airy to read', 'Your held vowels came through as breath more than tone, so there are no clear resonances to read. Try the same vowels with a little more voice in them.');
    else if (!held.length) add('vowels', 'bad', 'No held vowel heard', 'Not enough voice reached the microphone while you held "ah" and "ee". Check the right microphone is picked and try again.');
    else {
      const b = median(held.map(s => s.breath).filter(Number.isFinite));
      data.breath = Number.isFinite(b) ? Math.round(b) : null;
      if (b > 74) add('breath', 'warn', 'Very breathy voice', `Your held vowels read ${Math.round(b)} on breathiness. Air noise blurs the formants, so a slightly firmer, clearer tone gives more readings.`);
      else if (Number.isFinite(b)) add('breath', 'good', 'Clear voicing', `Breathiness ${Math.round(b)}, clear enough to read.`);
      const okFrac = median(held.map(s => s.ok));
      data.read = Math.round(100 * okFrac);
      // what the app heard on each held vowel, next to the reference, so a misread formant shows
      const pc = (x) => Math.round(100 * x) + '%';
      const detail = [[ah, 'a', 'ah'], [ee, 'i', 'ee']].filter(([st]) => st && st.voiced >= 30).map(([st, k, nm]) => {
        const v = VOWEL_BY_KEY[k], top = Object.entries(st.why).sort((a, b) => b[1] - a[1])[0];
        return ` "${nm}": formants found in ${pc(st.withF)} of voiced moments, held still in ${pc(st.steady)}, read in ${pc(st.ok)}`
          + (st.F ? `; heard F1-F3 ${st.F.join('/')} Hz (typical woman ${v.W.join('/')}, man ${v.M.join('/')})` : '')
          + (top && top[1] > 0 && st.ok < 0.6 ? `; refused mostly as ${top[0] === 'shape' ? "not the shape of this vowel" : top[0] === 'dark' ? 'far darker than any adult' : 'far brighter than any adult'}` : '') + '.';
      }).join('');
      if (okFrac < 0.3) add('vowels', 'bad', 'Held vowels hard to read', `Only ${Math.round(100 * okFrac)}% of your held "ah" and "ee" gave a reading.${detail}`);
      else if (okFrac < 0.6) add('vowels', 'warn', 'Held vowels partly readable', `${Math.round(100 * okFrac)}% of your held "ah" and "ee" gave a reading.${detail}`);
      else add('vowels', 'good', 'Held vowels read well', `${Math.round(100 * okFrac)}% of your held "ah" and "ee" gave a reading${held.length === 2 && Number.isFinite(ah.score) && Number.isFinite(ee.score) ? ` (ah ${Math.round(ah.score)}, ee ${Math.round(ee.score)})` : ''}.`);
      const f0 = median(held.map(s => s.f0));
      data.f0 = Math.round(f0);
      // H1-H2 on "ah" only: its F1 is far above the pitch, so the gap is the voice's own, not "ee"'s low F1 lifting H1
      const g = ah && ah.voiced >= 30 ? ah.h1h2 : NaN;
      data.h1h2 = Number.isFinite(g) ? Math.round(g) : null;
      if (g > H1_KEEP + 6) add('h1', 'good', 'Strong fundamental', `On "ah" your first harmonic (your pitch itself) is about ${Math.round(g)} dB over the second; a firm voice is about 0-8. That's a light, soft-edged tone. It used to hide F1 from the formant finder; the app now turns it down to ${H1_KEEP} dB over the second before reading formants, so it's handled.`);
      else if (Number.isFinite(g)) add('h1', 'good', 'Balanced fundamental', `On "ah" your first harmonic is about ${Math.round(g)} dB over the second, so the app reads your formants as they are.`);
      if (pitchLimited(VOWEL_BY_KEY.i, f0)) add('pitch', 'good', 'Pitch above F1 of "ee"', `At ${Math.round(f0)} Hz your pitch is close to the first formant of "ee" and "oo", so those are read from F2 and F3. That's expected for a higher voice and handled.`);
    }
    const bad = (lv) => MIC_PRIORITY.find(id => checks.some(c => c.id === id && c.level === lv));
    return { checks, main: bad('bad') || bad('warn') || null, data };
  }

  // ---------- "Check my readings": does the app follow what you do? (Settings) ----------
  // The person holds one vowel in eight ways: dark, everyday and bright resonance on one note; everyday on a low and
  // a high note; everyday again; very airy; whispered. Each step is analysed the same way the app reads a held vowel,
  // against the vowel they were asked for (as in an exercise, so the name can't drift), and five plain checks come
  // out: does the score follow a resonance change, does pitch alone move it, does it repeat, does breathiness follow
  // air, could each step be read at all. The check can't tell how dark or bright the person really was; it shows the
  // formants next to the score so a score that stalls while the formants move points at the app, and one that stalls
  // while the formants stay put points at the change (often pitch or tone quality more than resonance).
  const RC_STEPS = ['dark', 'mid', 'bright', 'low', 'high', 'again', 'airy', 'whisper'];
  const RC_SKIP = 0.6; // s at the start of each step: settling into the sound
  function readingsCheck(seg, sr, vowelKey = 'a') {
    const v = VOWEL_BY_KEY[vowelKey] || VOWEL_BY_KEY.a;
    const st = {};
    for (const k of RC_STEPS) {
      const x = seg[k];
      if (!x || x.length < sr * (RC_SKIP + 0.5)) { st[k] = null; continue; }
      const an = new Analyzer(sr), hop = Math.round(sr / 60), skip = Math.round(sr * RC_SKIP);
      const f0 = [], res = [], Fs = [], br = [], h12 = []; let n = 0, voiced = 0, air = 0, held = 0;
      for (let end = an.needed; end <= x.length; end += hop) {
        const fr = an.analyze(x.subarray(0, end));
        if (end < skip) continue;
        n++;
        if (fr.breath != null) { br.push(fr.breath); if (Number.isFinite(fr.h1h2)) h12.push(fr.h1h2); }
        else if (!fr.breathUneven && (fr.kind === 'other' || fr.whisperF || fr.kind === 'fricative')) air++;
        if (fr.kind !== 'voiced') continue;
        voiced++; f0.push(fr.f0);
        if (!fr.formants || !fr.stable) continue;
        held++;
        const fit = scoreVowel(fr.formants, v, fr.f0);
        if (fit.ok && fit.rms < HOLD_RMS) { res.push(resScore(fit.alpha)); Fs.push(fr.formants); }
      }
      st[k] = { n, voiced, held, air, f0: f0.length ? median(f0) : 0, resN: res.length,
        res: res.length ? median(res) : NaN, resIqr: res.length >= 4 ? quantile(res, 0.75) - quantile(res, 0.25) : NaN,
        F: Fs.length ? [0, 1, 2].map(i => median(Fs.map(f => f[i]))) : null,
        breath: br.length >= 5 ? median(br) : NaN, breathN: br.length, h1h2: h12.length >= 5 ? median(h12) : NaN,
        airy: air >= 20 && air >= 2 * br.length }; // too little tone to read, the way the live display says "mostly air"
    }
    const checks = [], add = (id, level, title, say) => checks.push({ id, level, title, say });
    const R = (x) => Math.round(x), semis = (a, b) => 12 * Math.log2(a / b);
    const readable = (s) => s && s.resN >= 10;
    const pct = (a, b) => R(100 * (a / b - 1));
    const f23 = (a, b) => (pct(a.F[1], b.F[1]) + pct(a.F[2], b.F[2])) / 2; // F2 and F3 moved by this many % on average
    const sign = (x) => (x > 0 ? '+' : '') + x;
    const tol = (...ss) => Math.max(3, median(ss.map(s => s.resIqr).filter(Number.isFinite)) / 2 || 3); // the score's own wobble

    // 1. resonance follows a deliberate change
    // a missed everyday step can borrow its repeat (the same sound), so one late start doesn't sink three checks
    const md = readable(st.mid) ? st.mid : readable(st.again) ? st.again : st.mid;
    const [dk, bt] = [st.dark, st.bright];
    if (![dk, md, bt].every(readable)) {
      const miss = [['dark', dk], ['everyday', md], ['bright', bt]].filter(([, s]) => !readable(s)).map(([nm]) => nm);
      add('follow', 'bad', "Couldn't read every resonance step", `Too few steady readings on the ${miss.join(' and ')} step${miss.length > 1 ? 's' : ''}, so this part can't be judged. Hold the vowel steadily for the whole step, with a clear (not airy) tone.`);
    } else {
      const span = bt.res - dk.res, t = tol(dk, md, bt), moved = f23(bt, dk);
      const pitchMoved = Math.abs(semis(Math.max(dk.f0, md.f0, bt.f0), Math.min(dk.f0, md.f0, bt.f0))) > 3;
      const nums = `Scores: dark ${R(dk.res)}, everyday ${R(md.res)}${md === st.mid ? '' : ' (from the repeat)'}, bright ${R(bt.res)}. F2 and F3 moved ${sign(R(moved))}% from dark to bright.`;
      const inOrder = md.res > dk.res - t && md.res < bt.res + t;
      const pitchNote = pitchMoved ? ` Your pitch also changed (${R(dk.f0)}, ${R(md.f0)}, ${R(bt.f0)} Hz), so try the three on one note.` : '';
      if (span >= 8 && inOrder) add('follow', 'good', 'Resonance follows your changes', `${nums} The score moved the way you did.${pitchNote}`);
      else if (span <= -4) add('follow', 'bad', 'Resonance went the wrong way', `${nums} Bright scored lower than dark. ${moved < 0 ? 'Your F2 and F3 went down too, so the sound you made got darker by this measure: what feels brighter may be pitch or tone.' : 'Your F2 and F3 went up, so the score should have too: that is the app misreading. Save the recording and send it over.'}${pitchNote}`);
      else if (span < 4 && moved >= 5) add('follow', 'bad', "Your formants moved but the score didn't", `${nums} That's the app falling short, not you. Save the recording and send it over.${pitchNote}`);
      else if (span < 4) add('follow', 'warn', 'Hardly any change measured', `${nums} Neither the score nor your formants moved much. The change you made may have been mostly pitch, loudness or tone (all of which change how bright a voice sounds) rather than the shape of your throat and mouth. Try a bigger change: think small dog to big dog.${pitchNote}`);
      else add('follow', 'warn', 'Resonance partly follows', `${nums} ${inOrder ? 'The score moved the right way, but only a little.' : 'Dark and bright were in order, but everyday sat outside them.'} Changes under about ${R(t)} points are within the score's own wobble.${pitchNote}`);
    }

    // 2. pitch alone shouldn't move the score
    const [lo, hi] = [st.low, st.high];
    if (![lo, md, hi].every(readable)) {
      const miss = [['low note', lo], ['everyday', md], ['high note', hi]].filter(([, s]) => !readable(s)).map(([nm]) => nm);
      add('pitch', 'bad', "Couldn't read every pitch step", `Too few steady readings on the ${miss.join(' and ')} step${miss.length > 1 ? 's' : ''}.${hi && !readable(hi) && readable(md) ? ' Very high notes are the hardest to read: try a smaller step up.' : ''}`);
    } else {
      const rs = [lo.res, md.res, hi.res], range = Math.max(...rs) - Math.min(...rs);
      const up = semis(hi.f0, md.f0), down = semis(md.f0, lo.f0);
      const nums = `Scores: low ${R(lo.res)} (${R(lo.f0)} Hz), everyday ${R(md.res)} (${R(md.f0)} Hz${md === st.mid ? '' : ', the repeat'}), high ${R(hi.res)} (${R(hi.f0)} Hz).`;
      const f = f23(hi, lo), rose = hi.res - lo.res;
      // The score is read from the formants, and on a voice whose formants are held still it moves at most a few
      // points from 85 to 240 Hz (synthetic sweep, 2026-11). So when F2 and F3 moved with the score, the voice's
      // resonance changed with the note, which the score should show: one real voice's "ee" had F2 2430 Hz at 111 Hz
      // and 2800-2900 at 175-193 Hz, and Praat measured the same. That passes, with a word on the voice.
      const real = Math.abs(rose) >= 8 && Math.sign(f) === Math.sign(rose) && Math.abs(f) >= 3;
      const why = Math.abs(rose) >= 8 ? (real
        ? ` Your F2 and F3 moved ${sign(R(f))}% from low to high too, so your resonance really changed with pitch: that's common (the larynx tends to rise with pitch).`
        : ` Your F2 and F3 moved only ${sign(R(f))}% from low to high, so most of that change is the app reading pitch as resonance.`) : '';
      if (up < 3 || down < 3) add('pitch', 'warn', 'Pitch steps too small to judge', `${nums} The notes were only ${R(down)} and ${R(up)} semitones apart. Go at least 4 semitones down and 5 up.`);
      else if (range <= 8) add('pitch', 'good', "Pitch alone doesn't move the score", `${nums} Within ${R(range)} points across ${R(up + down)} semitones.`);
      else if (real) add('pitch', 'good', 'The score follows your resonance across notes', `${nums}${why} The app reads that right: it's your voice${rose > 0 ? ' getting darker on low notes and brighter on high ones' : ' getting brighter on low notes'}. If you want your low notes as bright as your everyday ones, practise keeping the larynx up and the mouth small as you slide down (Practice: "Change pitch, keep resonance").`);
      else if (range <= 15) add('pitch', 'warn', 'Pitch moves the score a little', `${nums} A ${R(range)} point spread across ${R(up + down)} semitones.${why}`);
      else add('pitch', 'bad', 'Pitch moves the score a lot', `${nums} A ${R(range)} point spread across ${R(up + down)} semitones.${why} Compare scores at similar pitches.`);
    }

    // 3. the same sound twice gives the same score
    const ag = st.again;
    if (readable(st.mid) && readable(ag)) {
      const md = st.mid;
      const dlt = Math.abs(ag.res - md.res);
      const nums = `First ${R(md.res)}, again ${R(ag.res)}.`;
      if (dlt <= 5) add('repeat', 'good', 'Repeats closely', `${nums} The same sound scores within ${R(dlt)} points.`);
      else if (dlt <= 10) add('repeat', 'warn', 'Repeats roughly', `${nums} ${R(dlt)} points apart: treat differences of that size as noise.${Math.abs(semis(ag.f0, md.f0)) > 2 ? ` Your pitch differed too (${R(md.f0)} and ${R(ag.f0)} Hz).` : ''}`);
      else add('repeat', 'bad', "Doesn't repeat", `${nums} ${R(dlt)} points apart for what should be the same sound.${Math.abs(semis(ag.f0, md.f0)) > 2 ? ` Your pitch differed (${R(md.f0)} and ${R(ag.f0)} Hz), which can explain some of it.` : ' Single readings are rough; look at trends over a few tries.'}`);
    } else add('repeat', 'bad', "Couldn't compare the repeat", 'Too few steady readings on the everyday step or its repeat.');

    // 4. breathiness follows air
    const ay = st.airy, wh = st.whisper;
    const brOf = (s) => (!s ? NaN : s.airy ? 100 : s.breath);
    const clear = brOf(md), airy = brOf(ay), whisper = brOf(wh);
    if (!Number.isFinite(clear) || !Number.isFinite(airy)) add('breath', 'bad', "Couldn't read breathiness", 'Too few readings on the everyday or the airy step.');
    else {
      const say = (b, s) => (s && s.airy ? 'no clear tone (mostly air)' : R(b));
      const nums = `Everyday ${say(clear, md)}, airy ${say(airy, ay)}, whisper ${Number.isFinite(whisper) ? say(whisper, wh) : 'not heard'}.`;
      const whOk = Number.isFinite(whisper) && whisper >= 78;
      const gap = airy - clear;
      // A little air shows in two places: the cepstral peak drops (the breathiness number) and the first harmonic
      // grows against the second (H1-H2: the folds don't close fully). H1-H2 also moves with the vowel and the note,
      // so it is only compared on the same vowel within 2 semitones. On one real voice a gentle sigh moved breathiness
      // by 16 and H1-H2 by 8 dB.
      const dh = !ay.airy && md.f0 && ay.f0 && Math.abs(semis(ay.f0, md.f0)) <= 2 ? ay.h1h2 - md.h1h2 : NaN;
      const softer = gap >= 8 && dh >= 4;
      const how = gap >= 15 ? 'Airy read clearly above everyday' : `Airy read ${R(gap)} above everyday and its tone was softer (H1-H2 ${sign(R(dh))} dB, the first harmonic louder against the second, which is what air does)`;
      if ((gap >= 15 || softer) && whOk) add('breath', 'good', 'Breathiness follows your air', `${nums} ${how}, and the whisper as air.`);
      else if (gap >= 15 || softer) add('breath', 'warn', 'Breathiness follows, whisper unclear', `${nums} ${how}, but the whisper ${Number.isFinite(whisper) ? 'still read as having some tone' : "wasn't picked up (too quiet?)"}.`);
      else if (gap >= 5) add('breath', 'warn', 'Breathiness follows a little', `${nums} Only ${R(gap)} points between everyday and airy. Try a much airier sound, like a sigh, with the tone still in it.`);
      else add('breath', 'bad', "Breathiness didn't follow", `${nums} The airy step didn't read airier than everyday. If you could hear the difference, the app missed it; room noise or a noise-cancelling microphone can hide air.`);
    }
    const data = Object.fromEntries(RC_STEPS.map(k => [k, st[k] && { f0: R(st[k].f0), res: Number.isFinite(st[k].res) ? R(st[k].res) : null, resN: st[k].resN,
      F: st[k].F && st[k].F.map(R), breath: Number.isFinite(st[k].breath) ? R(st[k].breath) : null, h1h2: Number.isFinite(st[k].h1h2) ? R(st[k].h1h2) : null, airy: st[k].airy, voiced: st[k].voiced, n: st[k].n }]));
    return { checks, vowel: v.key, data, passed: checks.filter(c => c.level === 'good').length };
  }

  // a lyric line that isn't words to sing: "♪", "(Instrumental)", "[Guitar solo]", "--"
  const instrumentalLine = (text) => !/\p{L}/u.test(text || '') || /^[\s([{]*(instrumental|interlude|(guitar |piano |sax )?solo|music|break)[\s)\]}.!]*$/i.test(text || '');
  const SING_WHY = {
    quiet: 'too little voice heard',
    high: 'too high to read resonance',
    unclear: "vowels couldn't be measured",
    unsteady: 'no held vowels to read',
  };

  // Held notes after a song: seconds spent holding each semitone, from frames {f0 (0 when unvoiced),
  // res (NaN unless scored), t (ms)}. A hold is a run of voiced frames that stays within `tol`
  // semitones of where it settled and lasts at least `minHold` seconds; gaps up to `maxGap` ms
  // (a breath of noise, one octave blip) don't break it. Slides and scoops never settle, so they
  // don't count. Each frame is worth the time to the next one, capped at 100 ms so pauses add nothing.
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiName = (n) => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  function heldNotes(frames, opt) {
    const o = Object.assign({ minHold: 0.25, tol: 0.6, maxGap: 60 }, opt);
    const bins = new Map(); let run = null;
    const dur = (i) => {
      const a = frames[i].t, nx = frames[i + 1], pv = frames[i - 1];
      const d = nx ? nx.t - a : pv ? a - pv.t : 1000 / 60;
      return Math.min(Math.max(d, 0), 100) / 1000;
    };
    const close = () => {
      if (run && run.secs >= o.minHold) {
        const n = Math.round(median(run.m));
        const b = bins.get(n) || { secs: 0, res: [] };
        b.secs += run.secs; b.res.push(...run.res); bins.set(n, b);
      }
      run = null;
    };
    const open = (m, f, d) => { run = { m: [m], ref: m, secs: d, res: Number.isFinite(f.res) ? [f.res] : [], last: f.t }; };
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], m = f.f0 > 0 ? 12 * Math.log2(f.f0 / 440) + 69 : null, d = dur(i);
      if (run && m != null && Math.abs(m - run.ref) <= o.tol) {
        run.m.push(m); run.secs += d; run.last = f.t;
        if (Number.isFinite(f.res)) run.res.push(f.res);
        if (run.m.length <= 10) run.ref = median(run.m); // settle on the note, then hold the reference still
        continue;
      }
      if (run && f.t - run.last <= o.maxGap) continue;
      close();
      if (m != null) open(m, f, d);
    }
    close();
    const list = [...bins.keys()].sort((a, b) => a - b).map(n => {
      const b = bins.get(n);
      return { midi: n, note: midiName(n), hz: 440 * Math.pow(2, (n - 69) / 12), secs: b.secs, res: b.res.length >= 4 ? median(b.res) : null };
    });
    const total = list.reduce((s, b) => s + b.secs, 0);
    const peak = list.reduce((p, b) => (!p || b.secs > p.secs ? b : p), null);
    return { bins: list, total, peak, lo: list.length ? list[0].midi : null, hi: list.length ? list[list.length - 1].midi : null };
  }

  // ---------- following a singer through the lyrics ----------
  // Rough syllables a lyric line asks for: section labels like "[Chorus]" ask for none.
  function lineSyllables(text) {
    const t = String(text || '').replace(/\[[^\]]*\]/g, ' ');
    return t.split(/[\s\-–—]+/).reduce((s, w) => s + countSyllables(w), 0);
  }
  // Follows a singer through lyric lines by counting what they sing, never by time alone:
  //  - a syllable is a voiced onset or an energy peak (NucleusTracker, so room sound, the mic
  //    switching on and stray blips don't count), or a step to a new note of at least a semitone
  //    held for 80 ms inside a sung stretch (legato singing often has no dip between syllables;
  //    octave jumps are ignored as likely pitch-tracker slips, and vibrato is smoothed out),
  //  - with `auto` on, a line is done once most of its syllables are heard and the singer pauses
  //    (a short pause when all were heard, a longer one when only about 70% were, since sung
  //    syllables often merge), or straight away once clearly more than the line holds were heard
  //    (the singer ran on without a breath; the extra syllables carry into the next line),
  //  - silence, held notes and instrumental breaks never move it on by themselves,
  //  - it moves one line at a time and skips lines with no words (LRC breaks, "[Chorus]"); singing
  //    while one of those is showing (after a manual move) moves to the next line with words.
  // push() returns {onset, phrase, line}: onset when a syllable was counted, phrase when that
  // syllable came after a pause (or was the first one), line when the follower moved to a new line.
  class SingFollower {
    constructor(lines, opts = {}) {
      this.need = lines.map(l => lineSyllables(l.text));
      this.auto = opts.auto !== false;
      this.donePause = opts.donePause != null ? opts.donePause : 260;
      this.partPause = opts.partPause != null ? opts.partPause : 600;
      this.phraseMs = opts.phraseMs != null ? opts.phraseMs : 350;
      this.tracker = new NucleusTracker(3, 120, opts.tracker || {});
      this.quietMs = 0; this.gapMs = 0; this.first = true; this.f0s = []; this.note = null; this.stepT = null; this.lastOnset = -1e9;
      this.cur = -1; this.n = 0;
      this.setLine(this.nextLine(-1));
    }
    nextLine(i) { for (let k = i + 1; k < this.need.length; k++) if (this.need[k] > 0) return k; return -1; }
    prevLine(i) { for (let k = i - 1; k >= 0; k--) if (this.need[k] > 0) return k; return -1; }
    // where the singer is now; `carry` syllables already belong to it (manual moves start from 0)
    setLine(i, carry = 0) { this.cur = i; this.n = carry; }
    get ready() { const need = this.need[this.cur] || 0; return need > 0 && this.n >= Math.max(1, Math.ceil(0.7 * need)); }
    advance(carry) {
      const nx = this.nextLine(this.cur); if (nx < 0) return null;
      this.setLine(nx, carry); return nx;
    }
    push(fr, tMs) {
      const out = { onset: false, phrase: false, line: null }, tr = this.tracker;
      let hit = tr.push(fr, tMs);
      const e = 20 * Math.log10(fr.rms + 1e-9);
      const sung = tr.armed && fr.kind === 'voiced' && fr.f0 > 0 && e > tr.floor + tr.floorDb;
      // a new note inside a sung stretch counts as a syllable too
      if (sung && !hit) {
        this.f0s.push(fr.f0); if (this.f0s.length > 7) this.f0s.shift();
        const m = median(this.f0s);
        if (this.note == null) this.note = m;
        const d = Math.abs(12 * Math.log2(m / this.note));
        if (this.f0s.length >= 4 && d >= 1 && Math.abs(d - 12) > 0.7 && tMs - this.lastOnset > 150) {
          if (this.stepT == null) this.stepT = tMs;
          else if (tMs - this.stepT >= 80) { hit = true; this.note = m; this.stepT = null; }
        } else this.stepT = null;
      }
      if (hit) {
        this.f0s = fr.f0 > 0 ? [fr.f0] : []; this.note = fr.f0 > 0 ? fr.f0 : null;
        this.stepT = null; this.lastOnset = tMs;
        out.onset = true; out.phrase = this.first || this.gapMs >= this.phraseMs; this.first = false; this.gapMs = 0;
        this.n++;
        const need = this.need[this.cur] || 0;
        if (this.auto && !need) { const l = this.advance(1); if (l != null) out.line = l; } // singing on a break or label line: it's the next one
        else if (this.auto && need && this.n >= need + Math.max(2, Math.ceil(0.35 * need))) {
          const l = this.advance(Math.min(this.n - need, 2)); if (l != null) out.line = l;
        }
      }
      if (sung) { if (this.quietMs > 0) this.gapMs = Math.max(this.gapMs, this.quietMs); this.quietMs = 0; }
      else {
        const dt = this.lastT == null ? 16 : Math.min(100, Math.max(0, tMs - this.lastT));
        this.quietMs += dt;
        if (!tr.armed || fr.kind !== 'voiced') { this.f0s = []; this.note = null; this.stepT = null; }
        const need = this.need[this.cur] || 0;
        if (this.auto && need && this.ready && this.quietMs >= (this.n >= need ? this.donePause : this.partPause)) {
          const l = this.advance(0); if (l != null) out.line = l;
        }
      }
      this.lastT = tMs;
      return out;
    }
  }
  // Timed (LRC) lyrics with no song file run on a clock, and the singer's phrases correct its drift.
  // Called when a phrase begins at clock time t (s) while line `cur` is showing and `heard` syllables
  // had been counted on it before this one. Returns the clock time to jump to, or null to leave it:
  //  - before the first line: the first phrase starts the song at the first line,
  //  - the next line starts within `win` s and most of this line was sung: the singer is early, jump
  //    to the next line,
  //  - this line started up to `win` s ago and hardly any of it was sung: the singer is late, hold
  //    the clock back to the start of this line.
  // A phrase in the middle of a line (a breath) moves nothing, since neither case fits.
  function lrcSync(lines, need, t, cur, heard, win = 2.5) {
    const next = (i) => { for (let k = i + 1; k < lines.length; k++) if (need[k] > 0) return k; return -1; };
    if (cur < 0 || t == null) { const k = next(-1); return k >= 0 && (t == null || lines[k].t - t <= 30) ? lines[k].t : null; }
    const nx = next(cur), nc = need[cur] || 0;
    if (nx >= 0 && lines[nx].t - t > 0.3 && lines[nx].t - t <= win && (nc === 0 || heard >= Math.ceil(0.6 * nc))) return lines[nx].t;
    if (nc > 0 && t - lines[cur].t > 0.5 && t - lines[cur].t <= win && heard <= Math.floor(0.25 * nc)) return lines[cur].t;
    return null;
  }

  // Lyrics search (LRCLIB, lrclib.net: free, open, no key, CORS enabled; lyrics.ovh below is the backup). Only the typed query is sent.
  // lyricsSearchUrl builds the request; lyricsResults turns its JSON into a short list for the Sing tab:
  // one row per title and artist in the service's order, using a timed (LRC) version when any copy has one,
  // and dropping instrumentals and records without lyrics.
  const LYRICS_API = 'https://lrclib.net/api/search';
  function lyricsSearchUrl(query, base = LYRICS_API) {
    const q = String(query || '').replace(/\s+/g, ' ').trim();
    return q ? `${base}?q=${encodeURIComponent(q)}` : null;
  }
  function lyricsResults(json, max = 8) {
    if (!Array.isArray(json)) return [];
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const out = [], byKey = new Map();
    for (const r of json) {
      if (!r || typeof r !== 'object' || r.instrumental) continue;
      const synced = str(r.syncedLyrics), plain = str(r.plainLyrics);
      if (!synced && !plain) continue;
      const title = str(r.trackName || r.name), artist = str(r.artistName);
      const duration = Number.isFinite(+r.duration) && +r.duration > 0 ? Math.round(+r.duration) : null;
      const timed = !!synced && parseLyrics(synced).timed;
      const row = { id: r.id, title: title || 'Untitled', artist, album: str(r.albumName), duration, timed, text: timed ? synced : (plain || synced) };
      const key = `${title.toLowerCase()}|${artist.toLowerCase()}`, have = byKey.get(key);
      if (!have) { byKey.set(key, row); out.push(row); }
      else if (timed && !have.timed) Object.assign(have, row); // same song, but this copy has timings
    }
    return out.slice(0, max);
  }

  // Backup source: lyrics.ovh (api.lyrics.ovh: free, no key, plain lyrics only). Its /suggest search looks
  // titles up on Deezer; the lyrics themselves come from /v1/<artist>/<title> when a result is picked.
  const LYRICS_OVH = 'https://api.lyrics.ovh';
  const ovhPart = (s) => encodeURIComponent(String(s || '').replace(/[\/\\?#%]+/g, ' ').replace(/\s+/g, ' ').trim());
  function ovhSearchUrl(query, base = LYRICS_OVH) {
    const q = ovhPart(query);
    return q ? `${base}/suggest/${q}` : null;
  }
  function ovhLyricsUrl(artist, title, base = LYRICS_OVH) {
    const a = ovhPart(artist), t = ovhPart(title);
    return a && t ? `${base}/v1/${a}/${t}` : null;
  }
  function ovhResults(json, max = 8) {
    const data = json && Array.isArray(json.data) ? json.data : [];
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const out = [], seen = new Set();
    for (const r of data) {
      if (!r || typeof r !== 'object') continue;
      const title = str(r.title_short) || str(r.title), artist = str(r.artist && r.artist.name);
      if (!title || !artist) continue;
      const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const duration = Number.isFinite(+r.duration) && +r.duration > 0 ? Math.round(+r.duration) : null;
      out.push({ id: r.id, src: 'ovh', title, artist, album: str(r.album && r.album.title), duration, timed: false, text: null });
      if (out.length >= max) break;
    }
    return out;
  }
  // lyrics.ovh text: CRLF line ends, often a French "Paroles de la chanson … par …" heading, and runs of blank lines.
  function ovhLyrics(json) {
    let t = json && typeof json.lyrics === 'string' ? json.lyrics : '';
    t = t.replace(/\r\n?/g, '\n').replace(/^\s*Paroles de la chanson[^\n]*\n/i, '');
    return t.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Opens a normal web search for the lyrics, so they can be copied and pasted when both services fail.
  function lyricsWebUrl(query) {
    const q = String(query || '').replace(/\s+/g, ' ').trim();
    return q ? `https://duckduckgo.com/?q=${encodeURIComponent(q + ' lyrics')}` : null;
  }

  // Backing tracks. Karaoke and instrumental versions of songs are licensed, so the app never includes or
  // downloads one: it links to a YouTube search, plays a YouTube video the user picks in YouTube's own embedded
  // player, or plays a file from the user's device.
  function karaokeSearchUrl(title, artist) {
    const q = [artist, title].map(v => String(v || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    return q ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' karaoke')}` : null;
  }
  // The 11-character video id from a YouTube link (watch, youtu.be, shorts, embed, live, music) or a bare id.
  function youtubeId(text) {
    const s = String(text || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    let u;
    try { u = new URL(/^[a-z][\w+.-]*:/i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    const ok = (id) => (id && /^[\w-]{11}$/.test(id) ? id : null);
    if (host === 'youtu.be') return ok(u.pathname.split('/')[1]);
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
    if (u.pathname === '/watch') return ok(u.searchParams.get('v'));
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})(?:[/?#]|$)/);
    return m ? m[1] : null;
  }
  // Start time from a YouTube link (t=90, t=1m30s, start=90), in seconds; 0 when there is none.
  function youtubeStart(text) {
    let u; try { u = new URL(/^[a-z][\w+.-]*:/i.test(String(text).trim()) ? String(text).trim() : 'https://' + String(text).trim()); } catch (e) { return 0; }
    const t = u.searchParams.get('t') || u.searchParams.get('start') || (u.hash.match(/t=([\dhms]+)/) || [])[1] || '';
    if (/^\d+s?$/.test(t)) return parseInt(t, 10);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m && t ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
  }

  // A link to an attached video ({id, start}), the short form YouTube's Share gives; youtubeId/youtubeStart read it back.
  function youtubeUrl(v) {
    const id = v && youtubeId(v.id); if (!id) return '';
    const t = Math.max(0, Math.floor(+v.start || 0));
    return `https://youtu.be/${id}` + (t ? `?t=${t}` : '');
  }

  // Fetch one JSON document with a timeout. Never throws: the outcome says what happened.
  // 'busy' = the service is overloaded or briefly down (429, 5xx), worth one retry; 'timeout', 'offline'/'network'
  // when no answer came; 'notfound' for 404; 'error' for other answers; 'aborted' when the caller cancelled.
  async function getJson(url, io, ms, headers) {
    const ctl = new AbortController(), outer = io.signal;
    const stop = () => ctl.abort();
    if (outer) { if (outer.aborted) return { outcome: 'aborted' }; outer.addEventListener('abort', stop); }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
    try {
      const opts = { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' };
      if (headers) opts.headers = headers;
      const r = await io.fetch(url, opts);
      const ra = r.headers && r.headers.get ? parseFloat(r.headers.get('Retry-After')) : NaN;
      if (r.status === 429 || r.status >= 500) return { outcome: 'busy', status: r.status, retryAfter: Number.isFinite(ra) ? ra : null };
      if (r.status === 404) return { outcome: 'notfound', status: 404 };
      if (!r.ok) return { outcome: 'error', status: r.status };
      try { return { outcome: 'ok', status: r.status, json: await r.json() }; }
      catch (e) { return timedOut ? { outcome: 'timeout' } : outer && outer.aborted ? { outcome: 'aborted' } : { outcome: 'error', status: r.status }; }
    } catch (e) {
      if (outer && outer.aborted) return { outcome: 'aborted' };
      if (timedOut) return { outcome: 'timeout' };
      return { outcome: io.online === false ? 'offline' : 'network' };
    } finally {
      clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', stop);
    }
  }
  const RETRYABLE = new Set(['busy', 'timeout', 'network']);
  // One request with a single retry when the failure looks temporary (LRCLIB answers 503 with Retry-After: 1 when loaded).
  // A request with custom headers needs a CORS preflight; if it fails without any answer, the retry goes without them,
  // so a blocked preflight can never cost the search.
  async function getJsonRetry(url, io, ms, headers) {
    let res = await getJson(url, io, ms, headers);
    if (!RETRYABLE.has(res.outcome)) return res;
    const wait = res.retryAfter != null ? Math.min(3000, Math.max(500, res.retryAfter * 1000)) : 1200;
    await (io.sleep || ((t) => new Promise(r => setTimeout(r, t))))(wait);
    if (io.signal && io.signal.aborted) return { outcome: 'aborted' };
    const again = await getJson(url, io, ms, res.outcome === 'network' ? undefined : headers);
    return again.outcome === 'ok' || again.outcome === 'aborted' ? again : { ...again, retried: true };
  }

  // LRCLIB asks apps to identify themselves. Browsers won't let a page set User-Agent, so this goes in the
  // Lrclib-Client header, which LRCLIB's CORS setup allows (Access-Control-Allow-Headers). build.js stamps the version.
  const APP_BUILD = /*BUILD*/'dev';
  const APP_BUILT = /*BUILT*/'';
  // Footer line for the build: 'Build 3f2a9c1 · 4 Nov 2026 10:52 UTC', or 'dev' for an unbuilt page.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The build time is stamped in UTC; show it in the viewer's own time zone (PST/PDT handled by the browser)
  // with UTC alongside, e.g. 'Build 3f2a9c1 · 15 Nov 2026 17:42 PST (01:42 UTC)'. timeZone is for tests.
  function buildLabel(build, built, timeZone) {
    if (!build || build === 'dev') return 'dev build';
    const sha = build.split('+')[1] || build;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(built || '');
    if (!m) return 'Build ' + sha;
    const utc = `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]} ${m[4]}:${m[5]} UTC`;
    let p = null;
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
      p = {};
      for (const x of f.formatToParts(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))) p[x.type] = x.value;
    } catch (e) { p = null; }
    const zone = p && p.timeZoneName;
    if (!zone || /^(UTC|GMT)$/.test(zone) || !p.day) return 'Build ' + sha + ' · ' + utc;
    const sameDay = +p.day === +m[3];
    const local = `${+p.day} ${MONTHS[+p.month - 1]} ${p.year} ${p.hour}:${p.minute} ${zone}`;
    return 'Build ' + sha + ` · ${local} (${sameDay ? '' : `${+m[3]} ${MONTHS[+m[2] - 1]} `}${m[4]}:${m[5]} UTC)`;
  }
  // version.json from the server names a different build than the running page: a newer deploy is out.
  function newerBuild(current, remote) {
    return !!(current && current !== 'dev' && remote && typeof remote.build === 'string' && remote.build && remote.build !== current);
  }
  const LRCLIB_CLIENT = `VoiceTrainer ${APP_BUILD} (https://github.com/petravanta/voicetrainer)`;
  const LYRICS_SOURCES = {
    lrclib: { name: 'LRCLIB', site: 'https://lrclib.net', timed: true },
    ovh: { name: 'lyrics.ovh', site: 'https://lyrics.ovh', timed: false },
  };
  // Search LRCLIB first (it has timed lyrics); when it is busy, unreachable or finds nothing, ask lyrics.ovh.
  // io: { fetch, sleep?, signal?, online?, onStep?(sourceKey, attempt) , timeoutMs? }.
  // Returns { rows, source, tried: [{ src, outcome, status?, count? }] } or { aborted: true }.
  async function findLyrics(query, io) {
    const ms = io.timeoutMs || 7000, tried = [];
    const lrcUrl = lyricsSearchUrl(query);
    if (!lrcUrl) return { rows: [], source: null, tried };
    if (io.onStep) io.onStep('lrclib');
    const a = await getJsonRetry(lrcUrl, io, ms, { 'Lrclib-Client': LRCLIB_CLIENT });
    if (a.outcome === 'aborted') return { aborted: true };
    const lrcRows = a.outcome === 'ok' ? lyricsResults(a.json).map(r => ({ ...r, src: 'lrclib' })) : [];
    tried.push({ src: 'lrclib', outcome: a.outcome === 'ok' && !lrcRows.length ? 'empty' : a.outcome, status: a.status, count: lrcRows.length });
    if (lrcRows.length) return { rows: lrcRows, source: 'lrclib', tried };
    if (io.onStep) io.onStep('ovh');
    const b = await getJsonRetry(ovhSearchUrl(query), io, ms + 1000);
    if (b.outcome === 'aborted') return { aborted: true };
    const ovhRows = b.outcome === 'ok' ? ovhResults(b.json) : [];
    tried.push({ src: 'ovh', outcome: b.outcome === 'ok' && !ovhRows.length ? 'empty' : b.outcome, status: b.status, count: ovhRows.length });
    return { rows: ovhRows, source: ovhRows.length ? 'ovh' : null, tried };
  }
  // Fetch the text for a picked row that came without it (lyrics.ovh results). Returns { text } or { outcome }.
  async function loadLyricsText(row, io) {
    if (row.text) return { text: row.text };
    const url = ovhLyricsUrl(row.artist, row.title);
    if (!url) return { outcome: 'notfound' };
    const res = await getJsonRetry(url, io, (io.timeoutMs || 7000) + 1000);
    if (res.outcome !== 'ok') return { outcome: res.outcome, status: res.status };
    const text = ovhLyrics(res.json);
    return text ? { text } : { outcome: 'notfound' };
  }

  // Saved lyrics (Sing tab): lyrics loaded from a search are kept on this device, most recently used first,
  // so a song can be sung again without searching (or while offline). The list is plain data; app.js stores it.
  // Entry: { key, src, id, title, artist, album, duration, timed, text, at, video }. Capped by count and by total text size.
  // video: the YouTube video attached to the song, { id, start, offset } (offset = lyric timing set against it), or null.
  const LYRICS_CACHE_MAX = 40, LYRICS_CACHE_CHARS = 600000;
  const lyricsKey = (r) => [r.src || '', String(r.artist || '').trim().toLowerCase(), String(r.title || '').trim().toLowerCase()].join('|');
  function videoClean(v) {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !/^[\w-]{11}$/.test(v.id)) return null;
    const num = (x, lo, hi) => (Number.isFinite(+x) ? Math.max(lo, Math.min(hi, +x)) : 0);
    return { id: v.id, start: Math.round(num(v.start, 0, 86400)), offset: Math.round(num(v.offset, -3600, 3600) * 100) / 100 };
  }
  function lyricsCacheClean(list) {
    if (!Array.isArray(list)) return [];
    const str = (v) => (typeof v === 'string' ? v : ''), seen = new Set(), out = [];
    for (const e of list) {
      if (!e || typeof e !== 'object' || !str(e.text).trim() || !str(e.title).trim()) continue;
      const row = { key: '', src: str(e.src), id: e.id == null ? null : e.id, title: str(e.title), artist: str(e.artist), album: str(e.album),
        duration: Number.isFinite(+e.duration) && +e.duration > 0 ? Math.round(+e.duration) : null, timed: !!e.timed, text: str(e.text), at: +e.at || 0, video: videoClean(e.video) };
      if (+e.upd > 0) row.upd = +e.upd;
      row.key = lyricsKey(row);
      if (seen.has(row.key)) continue;
      seen.add(row.key); out.push(row);
    }
    return out.sort((a, b) => b.at - a.at);
  }
  // Keep the newest songs (by last use) within the count and text-size caps; one song larger than the cap is still kept.
  function lyricsCacheCap(list, max = LYRICS_CACHE_MAX, chars = LYRICS_CACHE_CHARS) {
    const out = lyricsCacheClean(list);
    let total = 0, n = 0;
    for (; n < out.length && n < max; n++) { total += out[n].text.length; if (n > 0 && total > chars) break; }
    return out.slice(0, Math.max(out.length ? 1 : 0, n));
  }
  // Add (or refresh) a row; it moves to the front. Oldest entries go when the list is over either cap.
  // A row without a video property keeps the video already attached to that song; video: null removes it.
  function lyricsCachePut(list, row, now = Date.now(), max = LYRICS_CACHE_MAX, chars = LYRICS_CACHE_CHARS) {
    const [e] = lyricsCacheClean([{ ...row, at: now }]);
    const rest = lyricsCacheClean(list);
    if (!e) return rest;
    if (row.video === undefined) { const had = rest.find(r => r.key === e.key); if (had) e.video = had.video; }
    return lyricsCacheCap([e, ...rest.filter(r => r.key !== e.key)], max, chars);
  }
  // Attach a video to a saved song (null removes it), leaving the list's order alone. Unknown keys change nothing.
  const lyricsCacheVideo = (list, key, video) => lyricsCacheClean(list).map(r => (r.key === key ? { ...r, video: videoClean(video) } : r));
  const lyricsCacheDrop = (list, key) => lyricsCacheClean(list).filter(r => r.key !== key);
  const lyricsCacheGet = (list, row) => lyricsCacheClean(list).find(r => r.key === lyricsKey(row)) || null;
  // Mark a saved song as used now (opened, or sung), leaving everything else alone. Unknown keys change nothing.
  const lyricsCacheTouch = (list, key, now = Date.now()) => lyricsCacheClean(lyricsCacheClean(list).map(r => (r.key === key ? { ...r, at: now } : r)));
  // Your songs on more than one device (they travel in the app's Google Drive file as songs + songsGone).
  // Each song carries upd, when it last changed on any device (saved, edited, video attached, used); removing one
  // leaves songsGone[key] = when. songsStamp records a change made here; songsMerge combines two copies: per song
  // the newer change wins, and a removal wins over changes made before it (so Undo, or saving it again, brings it back).
  const SONGS_GONE_MAX = 400;
  const songBody = (r) => { const { upd, ...rest } = r; return JSON.stringify(rest); };
  function songsGoneClean(g) {
    const out = {};
    if (!g || typeof g !== 'object' || Array.isArray(g)) return out;
    const keep = Object.entries(g).filter(([k, t]) => typeof k === 'string' && +t > 0).sort((a, b) => b[1] - a[1]).slice(0, SONGS_GONE_MAX);
    for (const [k, t] of keep) out[k] = +t;
    return out;
  }
  function songsStamp(prev, next, gone, now = Date.now()) {
    const was = new Map(lyricsCacheClean(prev).map(r => [r.key, r]));
    const g = songsGoneClean(gone);
    const songs = lyricsCacheClean(next).map(r => {
      const old = was.get(r.key);
      delete g[r.key];
      return { ...r, upd: old && songBody(old) === songBody(r) && old.upd ? old.upd : now };
    });
    const keys = new Set(songs.map(r => r.key));
    for (const k of was.keys()) if (!keys.has(k)) g[k] = now;
    return { songs, songsGone: songsGoneClean(g) };
  }
  function songsMerge(a, b, max = LYRICS_CACHE_MAX, chars = LYRICS_CACHE_CHARS) {
    a = a || {}; b = b || {};
    const ga = songsGoneClean(a.songsGone), gb = songsGoneClean(b.songsGone), gone = { ...gb };
    for (const k in ga) if (!(gone[k] >= ga[k])) gone[k] = ga[k];
    const by = new Map();
    for (const r of [...lyricsCacheClean(b.songs), ...lyricsCacheClean(a.songs)]) {
      const old = by.get(r.key);
      if (!old || (r.upd || 0) >= (old.upd || 0)) by.set(r.key, r);
    }
    const songs = lyricsCacheCap([...by.values()].filter(r => !(gone[r.key] >= (r.upd || 0))), max, chars);
    for (const r of songs) delete gone[r.key];
    return { songs, songsGone: songsGoneClean(gone) };
  }
  // When a saved song was last used, in words: 'today', 'yesterday', '3 days ago', '2 weeks ago', or a date; '' when unknown.
  function usedAgo(at, now = Date.now()) {
    if (!(at > 0)) return '';
    const day = (t) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5; };
    const n = Math.max(0, Math.round(day(now) - day(at)));
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 14) return `${n} days ago`;
    if (n < 56) return `${Math.floor(n / 7)} weeks ago`;
    const d = new Date(at);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
  }
  // Your songs in display order: 'used' = last used first (the stored order), 'name' = by song name, 'artist' = by artist,
  // then song name. Names compare without case or accents, numbers by value, and ignoring a leading "The " or "A ".
  // Songs saved before last-used times were kept (at 0) count as the oldest, in their saved order.
  const LYRICS_SORTS = ['used', 'name', 'artist'];
  function lyricsCacheSort(list, by) {
    const all = lyricsCacheClean(list);
    if (by !== 'name' && by !== 'artist') return all;
    const strip = (s) => String(s || '').trim().replace(/^(the|a|an)\s+(?=\S)/i, '');
    const cmp = (a, b) => strip(a).localeCompare(strip(b), undefined, { sensitivity: 'base', numeric: true });
    return all.map((r, i) => ({ r, i })).sort((x, y) => {
      const a = x.r, b = y.r;
      const c = by === 'artist' ? (cmp(a.artist, b.artist) || cmp(a.title, b.title)) : (cmp(a.title, b.title) || cmp(a.artist, b.artist));
      return c || x.i - y.i;
    }).map(o => o.r);
  }
  // Entries whose title, artist or album hold every word typed (accents and case ignored); all of them for an empty query.
  function lyricsCacheFind(list, query) {
    const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const words = fold(query).split(/[^\p{L}\p{N}']+/u).filter(Boolean);
    const all = lyricsCacheClean(list);
    if (!words.length) return all;
    return all.filter(r => { const hay = fold(`${r.title} ${r.artist} ${r.album}`); return words.every(w => hay.includes(w)); });
  }

  // Lyrics the user types or pastes ("New song") need a song name and an artist before they are used or saved.
  // Returns the missing fields, in form order: [] when the song is ready.
  const ownSongMissing = (s) => ['title', 'artist'].filter(k => !String((s && s[k]) || '').trim());


  // ---- your own take as a reference: the last few seconds of the microphone, kept in a ring, cut out by sample count ----
  // SampleRing holds the newest `cap` samples; `total` counts every sample ever pushed, so a span is asked for in those
  // absolute numbers (what was already dropped is left out).
  class SampleRing {
    constructor(cap) { this.buf = new Float32Array(cap); this.total = 0; }
    push(x) {
      const b = this.buf, n = b.length;
      if (x.length > n) { this.total += x.length - n; x = x.subarray(x.length - n); }
      const at = this.total % n, k = Math.min(x.length, n - at);
      b.set(x.subarray(0, k), at); if (k < x.length) b.set(x.subarray(k), 0);
      this.total += x.length;
    }
    slice(a, z) {
      const b = this.buf, n = b.length;
      a = Math.max(Math.round(a), this.total - n, 0); z = Math.min(Math.round(z), this.total);
      const out = new Float32Array(Math.max(0, z - a));
      for (let i = 0; i < out.length; i++) out[i] = b[(a + i) % n];
      return out;
    }
  }
  // 16-bit samples for storing a take (half the size of floats, plenty for a voice), and back
  function toPcm16(x) { const o = new Int16Array(x.length); for (let i = 0; i < x.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))); return o; }
  function fromPcm16(p) { const o = new Float32Array(p.length); for (let i = 0; i < p.length; i++) o[i] = p[i] / 32767; return o; }
  // linear resampling, for a take kept at one sample rate and played or read at another (44.1 vs 48 kHz)
  function resample(x, from, to) {
    if (from === to || !x.length) return x;
    const n = Math.max(1, Math.round(x.length * to / from)), o = new Float32Array(n), r = from / to;
    for (let i = 0; i < n; i++) { const t = i * r, j = Math.floor(t), f = t - j; o[i] = (x[j] || 0) * (1 - f) + (x[Math.min(j + 1, x.length - 1)] || 0) * f; }
    return o;
  }
  // The stretch of microphone audio behind a run of analysed frames: each frame read the `win` samples before the
  // ring's count `n` at that moment; a little padding either side is trimmed off again when the take is read back.
  const MINE_PAD_S = 0.12, MINE_MAX_S = 6;
  function takeSpan(ns, win, fs) {
    const v = ns.filter(Number.isFinite); if (!v.length) return null;
    let a = Math.min(...v) - win - MINE_PAD_S * fs, z = Math.max(...v) + MINE_PAD_S * fs;
    if (z - a > MINE_MAX_S * fs) a = z - MINE_MAX_S * fs;
    return { a: Math.max(0, Math.round(a)), z: Math.round(z) };
  }

  const api = {
    VOWELS, VOWEL_BY_KEY, SIBILANTS, PITCH_BANDS,
    median, quantile, hzToNote, fft, powerSpectrum, lowpassFIR, decimate,
    voiceDims, DIMS_NOT_MEASURED, textHash, soundOnset, yin, lpc, polyRoots, formants, fitVowel, scoreVowel, pitchLimited, pitchLimitHz, scoreSpread, plausible, F1_PITCH_RATIO, SCORE_RANGE, RES_SCALE, RES_PER_ALPHA, resScore, resAlpha, RES_AVG, RES_BANDS, fromScale1, migrateRecord, classifyVowel, heldVowelFit, HOLD_RMS, pronIndex, wordVowels, wordVowelSeq, matchWordVowel, lineVowels, FUNCTION_WORDS, sibilantAlpha, coachVowel, formantOffsets, formantSummary, coachSibilant, COACH_BAND, F1_SLACK, tractShape, isolation, ISO_RULES, voiceQuality, breathiness, BREATH_BAND, BREATH_SCALE, breathFromScale1, breathWindowUneven, BREATH_EVEN, countSyllables, speechStretches, edgeCues, alignWords, soundClasses, alignByClass, retagFrames, readingVowels, READ_VMAP_MIN, placeWords, wordReport, missedWords, MISS_VOICED, MISS_MAX_SHARE, matchScript, normWord, MATCH_MIN, readingTimeline, wordSpans, heardWords, HEARD_SURE, spectrogram, warpSpectrogram, specStrip, stripReads, compareStrips, wideColumn, WIDE_HZ, analyzeReading, analyzeReadingSteps, warpTimeline, timelineAt, spanFormants, REF_LAG, readingPhrases, focusSpots, spotStats, compareTries, wordShortfall, clipStats, mergeWordReports, vowelMap, prosodyStats, micVoiceCheck, readingsCheck, RC_STEPS, pooledResonance, LOOSE_WORD_MIN, READ_RES_SOLID, VOICED_MAX_BW, SPEECH_SPREAD, WIDE_F1_BW, F1_OFF_RMS, pickFormants, f1OnPitch, F1_ON_PITCH, tameH1, H1_KEEP, NucleusTracker, Analyzer, PITCH_MIN, PITCH_MAX, SING_PITCH_MAX,
    whisperFormants, whisperFit, whisperBrightness, sirenLegs, SIREN_STEP, WHISPER_SHIFT, SIB_SPLIT, sibBursts, glideTurns, GLIDE_STEP, sibScore, glideCheck, ladderCheck, pairsCheck, RUNG_MIN, resoFrame, dogHolds, dogCheck, DOG, chainCheck, CHAIN_MIN,
    dealFeeling, voicedTakes,
    parseLyrics, parseNotes, melodyMatch, nearestNote, lyricLineAt, singSummary, SING_WHY, instrumentalLine, SING_RES_SOLID, SING_RES_MIN, heldNotes, midiName, lineSyllables, SingFollower, lrcSync, lyricsSearchUrl, lyricsResults, LYRICS_API,
    LYRICS_OVH, LYRICS_SOURCES, LRCLIB_CLIENT, APP_BUILD, APP_BUILT, buildLabel, newerBuild, ovhSearchUrl, ovhLyricsUrl, ovhResults, ovhLyrics, lyricsWebUrl, getJson, getJsonRetry, findLyrics, loadLyricsText,
    LYRICS_CACHE_MAX, LYRICS_CACHE_CHARS, lyricsKey, lyricsCacheClean, lyricsCacheCap, lyricsCachePut, songsStamp, songsMerge, songsGoneClean, lyricsCacheDrop, lyricsCacheGet, lyricsCacheFind, lyricsCacheVideo, lyricsCacheTouch, lyricsCacheSort, LYRICS_SORTS, usedAgo, videoClean, ownSongMissing,
    karaokeSearchUrl, youtubeId, youtubeStart, youtubeUrl,
    SampleRing, toPcm16, fromPcm16, resample, takeSpan, MINE_PAD_S, MINE_MAX_S,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VTDSP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
