// Known weak spots of the resonance score, each checked on synthetic voices with a known answer:
// pitch must not earn resonance points, readings far off any voice are refused, and the ± grows with pitch.
// node test/rigor.test.js
const D = require('../src/dsp.js');
const S = require('../src/synth.js');

let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;

function run(x) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), frames = [];
  for (let end = an.needed; end <= x.length; end += hop) frames.push(an.analyze(x.subarray(0, end)));
  return frames.filter(f => f.kind === 'voiced' && f.formants && f.stable);
}
// formants a fraction t of the way from the male (0) to the female (1) average, on a log scale
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
// median score of the frames the app would accept, or null when it accepts none
function score(x, v) {
  const sc = run(x).map(f => D.scoreVowel(f.formants, v, f.f0)).filter(s => s.ok);
  return sc.length ? { s: 100 * D.median(sc.map(q => q.alpha)), n: sc.length, lim: sc.some(q => q.pitchLimited), spread: D.median(sc.map(q => q.spread)) } : null;
}

// A small cascade synthesizer with knobs synth.js lacks: glottal pulse shape and a nasal pole-zero pair.
function reson(x, f, bw, anti) {
  const r = Math.exp(-Math.PI * bw / fs), c = 2 * r * Math.cos(2 * Math.PI * f / fs), r2 = r * r, g = 1 - c + r2;
  let a1 = 0, a2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n];
    if (anti) { x[n] = (xn - c * a1 + r2 * a2) / g; a2 = a1; a1 = xn; } else { const y = g * xn + c * a1 - r2 * a2; a2 = a1; a1 = y; x[n] = y; }
  }
}
function voice(f0, F, o = {}) {
  const n = fs, x = new Float32Array(n), op = o.open || 0.4, cl = o.close || 0.16;
  let ph = 0, seed = 3;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    ph += f0 * (1 + 0.012 * Math.sin(2 * Math.PI * 5 * i / fs)) / fs; if (ph >= 1) ph -= 1;
    x[i] = (ph < op ? 0.5 * (1 - Math.cos(Math.PI * ph / op)) : ph < op + cl ? Math.cos(0.5 * Math.PI * (ph - op) / cl) : 0) + 0.01 * (rand() - 0.5);
  }
  for (let i = n - 1; i > 0; i--) x[i] -= x[i - 1];
  [F[0], F[1], F[2], F[2] * 1.22 + 250, F[2] * 1.38 + 500].forEach((f, k) => reson(x, f, (o.bw || [70, 100, 140, 200, 250])[k]));
  if (o.nasal) { reson(x, o.nasal[0], 80); reson(x, o.nasal[1], 100, true); }
  let e = 0; for (const v of x) e += v * v;
  const g = 0.3 / Math.sqrt(e / n); for (let i = 0; i < n; i++) x[i] *= g;
  return x;
}

console.log('# raising pitch alone must not raise resonance (male-average tract, true score 0)');
for (const k of ['i', 'u', 'U', 'I']) {
  const v = D.VOWEL_BY_KEY[k];
  for (const f0 of [180, 220, 260]) {
    const r = score(S.vowel(fs, 1, f0, tract(v, 0)), v);
    check(r && r.s < 25, `${v.cue} at ${f0} Hz scores ${r ? Math.round(r.s) : '--'} (under 25)${r && r.lim ? ', F2/F3 only' : ''}`);
  }
}
console.log('\n# a female-average tract stays near 100 as pitch rises');
for (const k of ['i', 'u', 'E', 'a']) {
  const v = D.VOWEL_BY_KEY[k];
  for (const f0 of [180, 220, 260]) {
    const r = score(S.vowel(fs, 1, f0, tract(v, 1)), v);
    check(r && r.s > 75 && r.s < 130, `${v.cue} at ${f0} Hz scores ${r ? Math.round(r.s) : '--'} (75 to 130)`);
  }
}
console.log('\n# a pressed voice at a raised pitch (male tract) is not credited');
for (const k of ['i', 'u']) {
  const v = D.VOWEL_BY_KEY[k], r = score(voice(220, tract(v, 0), { open: 0.3, close: 0.08 }), v);
  check(r && r.s < 30, `pressed ${v.cue} at 220 Hz scores ${r ? Math.round(r.s) : '--'} (under 30)`);
}
console.log('\n# a nasal resonance that breaks the formant picking is refused or read from F2/F3, never shown as 0 or 100');
{
  const v = D.VOWEL_BY_KEY.a;
  for (const [f0, t] of [[120, 0], [210, 1]]) {
    const fr = run(voice(f0, tract(v, t), { nasal: [250, 600] }));
    const raw = fr.map(f => D.fitVowel(f.formants, v).alpha);
    const fits = fr.map(f => D.scoreVowel(f.formants, v, f.f0)), kept = fits.filter(s => s.ok);
    const wrong = kept.filter(s => Math.abs(s.alpha - t) > 0.35).length; // kept frames must land near the true tract
    check(fr.length > 0 && wrong <= 0.1 * fr.length, `nasal "ah" (${t ? 'female' : 'male'} tract): raw ${Math.round(100 * D.median(raw))}, ${kept.length}/${fr.length} frames kept`
      + (kept.length ? ` at ${Math.round(100 * D.median(kept.map(s => s.alpha)))} (true ${100 * t})` : '') + `, ${wrong} wrong`);
  }
  check(!D.plausible({ alpha: 4.06, rms: 0.05 }) && !D.plausible({ alpha: -2.3, rms: 0.05 }) && D.plausible({ alpha: 1.3, rms: 0.05 }), 'plausible range is -100 to 200');
}
console.log('\n# a voice whose F1 alone is off still gets read, from F2 and F3');
{
  const v = D.VOWEL_BY_KEY.i, W = tract(v, 1);
  const fr = run(voice(165, [240, W[1], W[2]]));
  const fits = fr.map(f => D.scoreVowel(f.formants, v, f.f0)), kept = fits.filter(s => s.ok);
  const a = kept.length ? D.median(kept.map(s => s.alpha)) : NaN;
  check(kept.length > 0.8 * fr.length && kept.every(s => s.f1Off) && Math.abs(a - 1) < 0.25, `"ee" with F1 240 Hz, woman's F2/F3: ${kept.length}/${fr.length} read, at ${Math.round(100 * a)} (true 100), F1 set aside`);
  const m = D.fitVowel([240, ...tract(v, 0).slice(1)], v);
  check(!D.scoreVowel([240, 1500, 3300], v, 165).ok, 'F2 and F3 that disagree are still refused');
  // a soft, wide F1 (seen on a real woman's held "ah": 630-830 Hz wide in Praat too) is kept rather than F2 taking its place
  const p = D.pickFormants([{ f: 760, bw: 820 }, { f: 1580, bw: 120 }, { f: 3400, bw: 200 }, { f: 3900, bw: 300 }]);
  check(p.wideF1 && p.map(q => q.f).join() === '760,1580,3400,3900', `a wide F1 with no narrow pole below 1100 Hz is kept as F1 (${p.map(q => q.f).join('/')})`);
  const p2 = D.pickFormants([{ f: 600, bw: 900 }, { f: 780, bw: 150 }, { f: 1580, bw: 120 }, { f: 3400, bw: 200 }]);
  check(!p2.wideF1 && p2[0].f === 780, 'a narrow F1 wins over a wide pole');
}
console.log('\n# the ± widens with pitch');
{
  const v = D.VOWEL_BY_KEY.E, F = tract(v, 0.5);
  const a = D.scoreSpread(F, v, 110, [0.6, 1, 0.8]), b = D.scoreSpread(F, v, 250, [0.6, 1, 0.8]);
  check(a > 3 && b > 1.8 * a, `±${a.toFixed(0)} at 110 Hz, ±${b.toFixed(0)} at 250 Hz`);
  check(!D.pitchLimited(D.VOWEL_BY_KEY.i, 160) && D.pitchLimited(D.VOWEL_BY_KEY.i, 190) && !D.pitchLimited(D.VOWEL_BY_KEY.a, 300), 'F1 is set aside for "ee" above ~175 Hz, not for "ah" at 300 Hz');
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
