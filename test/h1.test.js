// A dominant first harmonic (a light or breathy voice) must not be read as F1, and a firm voice must read as before.
// node test/h1.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
S.setStyle('natural');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const sr = 48000, med = (a) => { a = a.slice().sort((p, q) => p - q); return a[a.length >> 1]; };
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
function read(F, f0, breath) {
  const x = S.voiced(sr, 1.2, f0, f0 * 0.99, F, { seed: 3, level: 0.3, breath }), an = new D.Analyzer(sr), fr = [];
  for (let e = an.needed; e <= x.length; e += 1024) { const r = an.analyze(x.subarray(0, e)); if (r.formants && e > sr * 0.3) fr.push(r); }
  return { F1: med(fr.map(r => r.formants[0])), h12: med(fr.map(r => r.h1h2).filter(Number.isFinite)), cut: fr.filter(r => r.h1Cut).length / fr.length };
}
const err = (a, b) => Math.abs(Math.log(a / b));
let worst = 0, all = [];
for (const k of ['i', 'e', 'E', 'a', 'o', 'u', 'V']) for (const f0 of [110, 166, 200]) for (const t of [0, 1]) {
  const F = tract(D.VOWEL_BY_KEY[k], t), r = read(F, f0, 1);
  all.push(err(r.F1, F[0])); worst = Math.max(worst, err(r.F1, F[0]));
}
check(med(all) < 0.1, `breathy voice (H1 well above H2): F1 read within 10% (median ${(100 * med(all)).toFixed(1)}%; was ~27% before the first harmonic was turned down)`);
{
  const F = tract(D.VOWEL_BY_KEY.a, 1), r = read(F, 180, 1);
  check(r.F1 > 1.35 * 180 && err(r.F1, F[0]) < 0.15, `breathy "ah" at 180 Hz: F1 ${Math.round(r.F1)} Hz (true ${Math.round(F[0])}), not the pitch`);
}
for (const [k, f0] of [['i', 166], ['a', 200], ['u', 110]]) {
  const F = tract(D.VOWEL_BY_KEY[k], 1), r = read(F, f0, 0);
  check(r.cut < 0.2 && err(r.F1, F[0]) < 0.08, `firm voice "${k}" at ${f0} Hz: left as it is (cut on ${Math.round(100 * r.cut)}% of frames), F1 ${Math.round(r.F1)} vs ${Math.round(F[0])}`);
}
{ // the filter itself: a pure first harmonic 20 dB over the second comes out H1_KEEP over it
  const fs = 11025, f0 = 180, n = 4096, y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = Math.sin(2 * Math.PI * f0 * i / fs) + 0.1 * Math.sin(2 * Math.PI * 2 * f0 * i / fs);
  const z = D.tameH1(y, fs, f0, 20), amp = (x, f) => { let re = 0, im = 0; for (let i = n - 2048; i < n; i++) { re += x[i] * Math.cos(2 * Math.PI * f * i / fs); im += x[i] * Math.sin(2 * Math.PI * f * i / fs); } return Math.hypot(re, im); };
  const d = 20 * Math.log10(amp(z, f0) / amp(z, 2 * f0));
  check(Math.abs(d - D.H1_KEEP) < 2.5, `H1 20 dB over H2 is cut to ${d.toFixed(1)} dB over it (aim ${D.H1_KEEP})`);
  check(D.tameH1(y, fs, f0, 3) === y, 'H1-H2 under the limit: signal untouched');
}
// above 200 Hz a closed vowel's F1 can sit on the first harmonic: the cut must not take it and read the next pole up
for (const f0 of [250, 320]) for (const br of [0, 1]) {
  const r = read([300, 2830, 3400], f0, br);
  check(err(r.F1, 300) < 0.15, `closed "ee" (F1 300 Hz) at ${f0} Hz${br ? ', breathy' : ''}: F1 read ${Math.round(r.F1)}, not pushed up to a harmonic`);
}
{ // a set-aside F1 says why and at what pitch, and is never the biggest difference in Target vs you
  const v = D.VOWEL_BY_KEY.i, o = D.formantOffsets([644, 2936, 3431], v, 'fem', { f0: 215 });
  check(o.rows[0].skip === 'pitch' && o.rows[0].pitchWhy === 'high' && o.rows[0].f0 === 215 && o.rows[0].limitHz === D.pitchLimitHz(v) && D.pitchLimitHz(v) === 193,
    `"ee" at 215 Hz: F1 set aside as pitch ${o.rows[0].f0} Hz over ${o.rows[0].limitHz} Hz`);
  const strip = (F, f0) => ({ fm: Array(10).fill(F), cog: [], f0: Array(10).fill(f0) });
  const c = D.compareStrips(strip([411, 2749, 3362], 210), strip([644, 2936, 3431], 215), { vowel: v });
  check(c.rows[0].aside && c.big && c.big.k !== 'F1', `Target vs you at 215 Hz: F1 marked aside, biggest difference ${c.big && c.big.k}`);
  const low = D.compareStrips(strip([411, 2749, 3362], 180), strip([300, 2936, 3431], 180), { vowel: v });
  check(!low.rows[0].aside && low.big.k === 'F1', 'at 180 Hz F1 counts and can be the biggest difference');
}
if (fails) { console.log(`${fails} failed`); process.exit(1); }
