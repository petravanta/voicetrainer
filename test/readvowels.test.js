// A reading's vowel map comes from the words as re-placed after Finish, and counts short vowels too, so a
// short reading shows its vowels instead of one or two (Petra's 14 s Rainbow reading showed only "ee").
// node test/readvowels.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const PRON = D.pronIndex(require('../data/pron.json'));
const texts = require('../data/texts.json');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;

// about 14 s of the Rainbow passage at speech pace: short vowels gliding in from and out to their consonants
const words = texts.find(t => t.id === 'b-rainbow').body.split(/\s+/).slice(0, 36);
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
function read(pitch, t) {
  const mix = {}; for (const v of D.VOWELS) mix[v.key] = tract(v, t);
  const LOC = [450, 1500, 2600], parts = [S.silence(fs, 0.3)], at = [];
  let time = 0.3, seed = 5;
  const push = (x) => { parts.push(x); time += x.length / fs; };
  words.forEach((w, wi) => {
    const t0 = time, fw = D.FUNCTION_WORDS.has(w.toLowerCase().replace(/[^a-z']/g, ''));
    let vi = 0;
    for (const q of S.wordUnits(w)) {
      seed += 7;
      if (q.v) {
        const F = mix[q.v] || mix.V, dur = fw ? 0.06 : vi === 0 ? 0.1 : 0.07, f0 = pitch * (1 + 0.12 * Math.sin(wi * 0.7 + vi));
        const edge = LOC.map((l, i) => (l + F[i]) / 2);
        push(S.voiced(fs, dur, f0, f0 * 0.95, F, { from: edge, to: edge, trans: Math.min(0.04, dur / 3), seed, ramp: 0.008, level: 0.3 })); vi++;
      } else if (q.sib) push(S.sibilant(fs, 0.09, 6500, { level: 0.1, seed }));
      else if (q.nasal || q.glide) push(S.voiced(fs, 0.05, pitch, pitch, [300, 1350, 2500], { level: 0.12, bws: [90, 200, 250, 300, 350], ramp: 0.01, seed }));
      else if (q.fric) push(S.sibilant(fs, 0.05, 2000, { level: 0.04, seed }));
      else push(S.silence(fs, 0.04));
    }
    at.push([t0, time + 0.03]);
    push(S.silence(fs, /[.,]$/.test(w) ? 0.25 : 0.03));
  });
  return { x: S.concat(parts), at };
}
// frames in Run.frames form, tagged with the word really being said (as the aligner places it) or, like the
// live highlight, one word behind
function frames(sim, lag = 0) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
  for (let end = an.needed; end <= sim.x.length; end += hop) {
    const fr = an.analyze(sim.x.subarray(0, end)), t = end / fs - D.REF_LAG;
    let wi = sim.at.findIndex(([a, b]) => t >= a && t <= b); if (wi < 0) continue;
    wi = Math.max(0, wi - lag);
    out.push({ i: wi, t: Math.round(t * 1000), f0: fr.kind === 'voiced' ? fr.f0 : 0, st: !!fr.steady, F: fr.kind === 'voiced' ? fr.formants : null, rawF: fr.kind === 'voiced' ? fr.rawF : null, k: 'i' });
  }
  return out;
}
const ALT = { a: ['c'], c: ['a'] }; // matchWordVowel lets "ah" and "aw" stand in for each other
const steadyOnly = (fl) => fl.map(f => (f.st ? f : Object.assign({}, f, { rawF: null })));

for (const [pitch, t] of [[120, 0], [200, 1]]) {
  const sim = read(pitch, t), want = D.resScore(t), fl = frames(sim);
  const before = D.vowelMap(D.readingVowels(steadyOnly(frames(sim, 1)), words, PRON).vf);
  const rv = D.readingVowels(fl, words, PRON), map = D.vowelMap(rv.vf, D.READ_VMAP_MIN);
  const err = D.median(map.map(m => Math.abs(m.s - want)));
  console.log(`  ${pitch} Hz: ${map.map(m => `${m.k} ${Math.round(m.s)} (${m.n})`).join(', ')}; before ${before.length}`);
  check(map.length >= 5 && map.length > before.length + 2, `${pitch} Hz: ${map.length} vowels on the map (steady frames on the lagging highlight: ${before.length})`);
  check(err <= 10, `${pitch} Hz: vowel scores stay near ${Math.round(want)} (median off ${err.toFixed(1)})`);
  // each vowel is credited only to words that have it
  const wrong = rv.frames.filter(f => f.k && !D.wordVowels(words[f.i], PRON).keys.some(k => k === f.k || (ALT[k] || []).includes(f.k)));
  check(wrong.length === 0, `${pitch} Hz: no vowel credited to a word without it (${wrong.length})`);
  check(rv.frames.every(f => f.k == null || D.wordVowels(words[f.i], PRON).why === 'ok'), `${pitch} Hz: linking words and glides keep no vowel (the stale live tag is cleared)`);
}
process.exit(fails ? 1 : 0);
