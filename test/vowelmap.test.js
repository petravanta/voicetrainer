// Vowel map: a passage of vowels mixed with hisses and silences comes back as one entry per vowel,
// each with its own score, and nothing for the consonants: node test/vowelmap.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

const fs = 48000, keys = ['i', 'a', 'u', 'ae', 'o'];
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
// each vowel at its own resonance, so the map must keep them apart: ee feminine, ah masculine, the rest between
const want = { i: 1, a: 0, u: 0.5, ae: 0.5, o: 0.5 };
const parts = [];
for (let rep = 0; rep < 3; rep++) for (const [n, k] of keys.entries()) {
  const v = D.VOWEL_BY_KEY[k];
  parts.push(S.vowel(fs, 0.45, 150 + 15 * n, at(v, want[k]), { seed: rep * 10 + n + 1 }));
  parts.push(n % 2 ? S.sibilant(fs, 0.12, 6500, { seed: n + 30 }) : S.silence(fs, 0.08));
}
const x = S.concat(parts);

// the same path as the app: steady voiced frames whose formants fit a vowel well
const an = new D.Analyzer(fs), hop = Math.round(fs / 60), byKey = {};
for (let end = an.needed; end <= x.length; end += hop) {
  const fr = an.analyze(x.subarray(0, end));
  if (fr.kind !== 'voiced' || !fr.formants || !fr.stable) continue;
  const cls = D.classifyVowel(fr.formants);
  if (cls.cost >= 0.07) continue;
  const F = fr.formants;
  (byKey[cls.vowel.key] = byKey[cls.vowel.key] || []).push([F[0], F[1], F[2], Math.max(0, Math.min(100, cls.alpha * 100))]);
}
const map = D.vowelMap(byKey);
for (const m of map) console.log(`  ${m.k.padEnd(3)} n=${String(m.n).padStart(3)} score ${Math.round(m.s)}  F ${m.F.map(Math.round).join('/')}`);
const got = new Map(map.map(m => [m.k, m]));
for (const k of keys) {
  const m = got.get(k);
  check(!!m, `"${D.VOWEL_BY_KEY[k].cue}" is on the map`);
  if (m) check(Math.abs(m.s - want[k] * 100) < 25, `"${D.VOWEL_BY_KEY[k].cue}" scored ${Math.round(m.s)} (spoken at ${want[k] * 100})`);
}
check(map.every(m => keys.includes(m.k) || m.n < 20), 'no large entry for a vowel that was not spoken');
check(map.every(m => m.F.every(Number.isFinite)), 'every entry has median formants');
check(D.vowelMap({ i: [[300, 2300, 3000, 50]] }).length === 0, 'a vowel heard in only one frame is left out');

console.log(fails ? `\n${fails} check(s) failed` : '\nall vowel map checks passed');
process.exit(fails ? 1 : 0);
