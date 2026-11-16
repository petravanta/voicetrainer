// Held references ("Hold" on Hear target): node test/sustain.test.js
// Played on a loop, a held sound must read as the same target as the short example (same goal score,
// F1-F3 within a few %), at one steady pitch, with no jump in loudness where the loop wraps.
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
function run(x, fs) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 30), fr = [];
  for (let end = an.needed; end <= x.length; end += hop) fr.push(an.analyze(x.subarray(Math.max(0, end - 8192), end)));
  return fr;
}
// what the browser plays: the start once, then the loop over and over
function unroll(h, times) {
  const a = Math.round(h.loopStart * h.fs), b = Math.round(h.loopEnd * h.fs), L = b - a, out = new Float32Array(a + L * times);
  out.set(h.x.subarray(0, a));
  for (let k = 0; k < times; k++) out.set(h.x.subarray(a, b), a + k * L);
  return { y: out, a, L };
}
const rms = (x, i, n) => { let e = 0; for (let k = i; k < i + n; k++) e += x[k] * x[k]; return Math.sqrt(e / n); };
const fs = 48000;
const defs = [
  ...['i', 'a', 'u', 'E', 'r'].map(v => ({ type: 'vowel', vowel: v, cue: v })),
  { type: 'sib', sib: 's', cue: 'sss' }, { type: 'sib', sib: 'sh', cue: 'shh' },
  { type: 'word', cue: 'see', sib: 's', vowel: 'i' }, { type: 'word', cue: 'shop', sib: 'sh', vowel: 'a' },
  { type: 'whisper', kind: 'hold', vowel: 'i', cue: 'kee' },
];
check(!S.canSustain({ type: 'whisper', kind: 'siren' }) && !S.canSustain({ type: 'iso' }) && !S.canSustain({ type: 'prosody' }), 'sounds that move have no held version');
for (const style of ['classic', 'natural']) {
  S.setStyle(style);
  for (const goal of ['fem', 'masc']) {
    const want = goal === 'fem' ? 100 : 0;
    for (const def of defs) {
      const h = S.sustain(fs, def, goal, D.VOWELS, D.SIBILANTS, { shift: D.WHISPER_SHIFT });
      const { y, a, L } = unroll(h, 3), fr = run(y, fs), held = fr.slice(Math.ceil((a / fs + 0.2) * 30));
      const out = []; let ok = h.loopEnd - h.loopStart > 3;
      // no seam: the loudness around each wrap matches the loudness inside the loop (50 ms windows)
      const n = Math.round(0.05 * fs), inside = rms(y, a + L / 2, n);
      const worst = Math.max(...[1, 2].map(k => Math.abs(20 * Math.log10(rms(y, a + k * L - n / 2, n) / inside))));
      out.push(`seam ${worst.toFixed(1)} dB`); ok = ok && worst < 3;
      if (def.type === 'vowel' || def.type === 'word') {
        const v = D.VOWEL_BY_KEY[def.vowel], st = held.filter(f => f.formants && f.stable);
        const m = D.median(st.map(f => D.fitVowel(f.formants, v).alpha * 100));
        const F = [0, 1, 2].map(i => D.median(st.map(f => f.formants[i]))), G = goal === 'fem' ? v.W : v.M;
        const f0s = held.filter(f => f.kind === 'voiced').map(f => f.f0), f0 = D.median(f0s);
        const spread = D.median(f0s.map(f => Math.abs(1200 * Math.log2(f / f0))));
        out.push(`vowel ${Math.round(m)} (${st.length}/${held.length} fr), F ${F.map(Math.round).join('/')} vs ${G.join('/')}, ${Math.round(f0)} Hz ±${Math.round(spread)} c`);
        ok = ok && st.length > 0.6 * held.length && Math.abs(m - want) < 25 && Math.abs(f0 / (goal === 'fem' ? 200 : 112) - 1) < 0.04 && spread < 25
          && [1, 2].every(i => Math.abs(F[i] / G[i] - 1) < 0.1);
      }
      if (def.type === 'sib') {
        const sc = held.filter(f => f.kind === 'fricative').map(f => D.sibilantAlpha(f.cog, D.SIBILANTS[def.sib]) * 100);
        out.push(`${def.sib} ${Math.round(D.median(sc))} (${sc.length}/${held.length} fr)`);
        ok = ok && sc.length > 0.8 * held.length && Math.abs(D.median(sc) - want) < 25;
      }
      if (def.type === 'whisper') {
        const w = held.filter(f => f.whisperF), v = D.VOWEL_BY_KEY[def.vowel];
        const m = D.median(w.map(f => D.whisperFit(f.whisperF, v).alpha * 100));
        out.push(`whisper ${Math.round(m)} (${w.length}/${held.length} fr)`);
        ok = ok && w.length > 0.6 * held.length && Math.abs(m - want) < 30;
      }
      check(ok, `${style} ${goal} ${def.type} "${def.cue}": ${out.join(', ')}`);
    }
  }
}
S.setStyle('classic');
console.log(fails ? `\n${fails} check(s) failed` : '\nall held reference checks passed');
process.exit(fails ? 1 : 0);
