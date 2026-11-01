// Reading vowels are checked against the text: each word's expected vowels come from data/pron.json, and a
// vowel heard on a word only counts when it fits one of them. node test/wordvowels.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const idx = D.pronIndex(require('../data/pron.json'));
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// the words Petra spotted under the wrong vowel (2026-11-01), and what they should give
const want = {
  raindrops: ['e', 'a'], long: ['c'], two: ['u'], foretell: ['E'], many: ['E'], centuries: ['E'], man: ['ae'],
  take: ['e'], something: ['V'], floods: ['V'], phenomenon: ['a'], rainbow: ['e', 'o'], 'ninety-three': ['i'],
  "sun's": ['V'], 'Beautiful,': ['u'], 'gold.': ['o'],
};
for (const [w, keys] of Object.entries(want)) { const r = D.wordVowels(w, idx); check(r.why === 'ok' && same(r.keys, keys), `"${w}" has ${keys.join('+')} (got ${r.why} ${r.keys.join('+')})`); }
for (const w of ['the', 'of', 'with', 'was', 'be', 'at', 'as', 'they', 'into', 'There']) check(D.wordVowels(w, idx).why === 'function', `"${w}" is a function word, not scored`);
for (const w of ['sign', 'round', 'light', 'boiling', 'arch', 'form']) check(D.wordVowels(w, idx).why === 'glide', `"${w}" is a glide or r-coloured vowel, not scored per vowel`);
check(D.wordVowels('zxqv', idx).why === 'unknown', 'an unknown word is marked unknown');

// formants of vowel k at resonance t (0 masculine average, 1 feminine average), and from a synthetic voice
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
const fs = 48000;
function heard(k, t, f0) {
  const x = S.vowel(fs, 0.5, f0, at(D.VOWEL_BY_KEY[k], t), { seed: 7 });
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
  for (let end = an.needed; end <= x.length; end += hop) { const fr = an.analyze(x.subarray(0, end)); if (fr.kind === 'voiced' && fr.formants && fr.stable) out.push(fr.formants); }
  return out;
}
const med = (a) => D.median(a);
// a word's own vowel is found and scored near the resonance it was said at
for (const [k, t, f0] of [['E', 0.8, 200], ['e', 0.3, 130], ['c', 0.5, 160], ['u', 0.9, 210], ['V', 0.2, 120], ['ae', 0.6, 180]]) {
  const fr = heard(k, t, f0), m = fr.map(F => D.matchWordVowel(F, [k])).filter(Boolean);
  check(m.length >= fr.length * 0.7 && m.every(x => x.vowel.key === k), `"${D.VOWEL_BY_KEY[k].cue}" on its own word: ${m.length}/${fr.length} frames kept`);
  if (m.length) { const s = med(m.map(x => x.alpha * 100)); check(Math.abs(s - t * 100) < 25, `  scored ${Math.round(s)} (said at ${t * 100})`); }
}
// a vowel the word doesn't have is dropped, not scored as the word's vowel
for (const [k, keys] of [['i', ['u']], ['a', ['i']], ['u', ['ae']], ['i', ['a']]]) {
  const fr = heard(k, 0.5, 160), m = fr.map(F => D.matchWordVowel(F, keys)).filter(Boolean);
  check(m.length <= fr.length * 0.1, `"${D.VOWEL_BY_KEY[k].cue}" on a word with ${keys.map(x => D.VOWEL_BY_KEY[x].cue).join('+')}: ${m.length}/${fr.length} frames kept`);
}
// the cot/caught pair is accepted either way
const ah = heard('a', 0.5, 150).map(F => D.matchWordVowel(F, ['c'])).filter(Boolean);
check(ah.length > 0, `"ah" said on an "aw" word (long) still counts (${ah.length} frames)`);

console.log(fails ? `\n${fails} check(s) failed` : '\nall word vowel checks passed');
process.exit(fails ? 1 : 0);
