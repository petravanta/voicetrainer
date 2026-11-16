// The demo voice reading a passage as a reference: said with the dictionary's vowels, measured offline the way a
// live reading is, and laid over another reading's clock word by word. node test/refread.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const PRON = D.pronIndex(require('../data/pron.json'));
const texts = require('../data/texts.json');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;

// ---- the dictionary's vowels, in order ----
check(JSON.stringify(D.wordVowelSeq('people', PRON)) === '["i"]' && D.wordVowelSeq('the', PRON) === null && D.wordVowelSeq('zzxq', PRON) === null,
  'word vowels: "people" is "ee"; linking and unknown words have none');
{
  // without the dictionary the spelling rules say "people" with "eh"; with it, "ee" (then a schwa)
  const plain = S.wordUnits('people').filter(u => u.v).map(u => u.v).join(' ');
  check(plain !== 'i', `spelling alone says "people" as ${plain}`);
}

// ---- the demo voice measured, both styles, both goals ----
const words = texts.find(t => t.id === 'b-northwind').body.split(/\s+/).filter(Boolean);
const content = words.filter(w => D.wordVowels(w, PRON).why === 'ok').length;
for (const style of ['natural', 'classic']) {
  S.setStyle(style);
  for (const [name, pitch, res] of [['feminine', 205, 100], ['masculine', 115, 0]]) {
    const r = S.readText(fs, words, D.VOWELS, { pitch, res, bright: 50, rate: 1, vowelsOf: (w) => D.wordVowelSeq(w, PRON) });
    let shares = 0;
    const it = D.analyzeReadingSteps(r.x, fs, words, r.starts.map((a, i) => [a, r.ends[i]]), PRON, 300);
    let out; for (;;) { const n = it.next(); if (n.done) { out = n.value; break; } shares++; }
    const truth = D.resScore(res / 100), pool = D.pooledResonance(out.frames), wr = D.wordReport(out.frames, words.length);
    const scored = wr.filter((w, i) => w.r != null && D.wordVowels(words[i], PRON).why === 'ok').length;
    // "ah" is left out: "aw" words ("called", "along") may be heard as "ah" (accents merge them), and an "aw" scored
    // on the "ah" scale reads about 20 points darker, so the "ah" dot of the map carries them (a known limit)
    const vm = D.vowelMap(out.vf), worst = vm.filter(v => v.k !== 'a').reduce((m, v) => Math.max(m, Math.abs(v.s - truth)), 0);
    const f0 = D.median(out.pitch);
    const tag = `${style} ${name}`;
    check(shares > 3, `${tag}: analysed in slices (${shares})`);
    check(pool.res != null && Math.abs(pool.res - truth) <= 3, `${tag}: reading resonance ${pool.res != null ? pool.res.toFixed(1) : '--'}, set to ${truth}`);
    check(Math.abs(f0 / pitch - 1) < 0.05, `${tag}: median pitch ${Math.round(f0)} Hz, set to ${pitch}`);
    check(scored >= 0.5 * content, `${tag}: ${scored} of ${content} content words have a resonance`);
    check(vm.length >= 6 && worst <= 10, `${tag}: ${vm.length} vowels on the map, all but "ah" within ${Math.round(worst)} of the set resonance`);
    check(out.frames.every(f => f.i >= 0 && f.i < words.length) && out.frames.some(f => f.i === words.length - 1), `${tag}: every frame has a word, up to the last`);
  }
}
S.setStyle('classic');

// ---- the reference on another reading's clock ----
{
  // reference: two words, 0-1000 and 1000-2000 ms, pitch 200 then 220, resonance 60 throughout
  const ref = { bin: 50, dur: 2000, ws: [0, 1000], f0: [], rs: [] };
  for (let i = 0; i < 40; i++) { ref.f0.push(i < 20 ? 200 : 220); ref.rs.push(60); }
  // you: the first word at 500 ms and twice as slow (2000 ms), the second at 2500 for 2000 ms
  const w = D.warpTimeline(ref, [500, 2500], 4500);
  const at = (ms) => w.f0.find(p => Math.abs(p[0] - ms) <= 50);
  check(w.f0.length === 40 && w.f0[0][0] === 550 && at(2400)[1] === 200 && at(2600)[1] === 220, `word by word: the first word stretched to 500-2500 ms, the second from 2500 (${w.f0[0][0]}, ${w.f0[19][0]}, ${w.f0[20][0]})`);
  const skip = D.warpTimeline(ref, [500, null], 4500);
  check(skip.f0.length === 20, 'a word you never reached has no reference');
  const long = D.warpTimeline(ref, [0, 9000], 10000);
  check(Math.max(...long.f0.filter(p => p[1] === 200).map(p => p[0])) <= 2500, 'a word stretched at most 2.5 times');
}
console.log(fails ? `\n${fails} failed` : '\nall reference reading checks passed');
process.exit(fails ? 1 : 0);
