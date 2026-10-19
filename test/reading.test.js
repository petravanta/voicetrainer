// Reading-along: syllable counting and syllable-nucleus tracking: node test/reading.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

const words = { cat: 1, rainbow: 2, beautiful: 3, sunlight: 2, made: 1, people: 2, strikes: 1, a: 1, the: 1, raindrops: 2 };
for (const [w, n] of Object.entries(words)) check(D.countSyllables(w) === n, `"${w}" has ${n} syllable(s) (got ${D.countSyllables(w)})`);

const fs = 48000, V = D.VOWELS;
// 24 syllables: joined by silence (stops), by fricatives, and by voiced dips (two vowels in one breath)
const parts = [];
let n = 0;
for (let i = 0; i < 8; i++) {
  const v = V[i % V.length];
  parts.push(S.vowel(fs, 0.16, 140 + 10 * (i % 3), v.M, { seed: i + 1 }), S.silence(fs, 0.06)); n++;
  parts.push(S.sibilant(fs, 0.09, 6500, { seed: i + 3 }));
  parts.push(S.vowel(fs, 0.14, 150, V[(i + 3) % V.length].M, { seed: i + 7 })); n++;
  const dip = S.vowel(fs, 0.34, 145, V[(i + 5) % V.length].M, { seed: i + 9 }); // two syllables in one voiced stretch
  for (let k = 0; k < dip.length; k++) { const t = k / dip.length; dip[k] *= t > 0.42 && t < 0.58 ? 0.25 : 1; }
  parts.push(dip, S.silence(fs, i % 3 === 2 ? 0.6 : 0.08)); n += 2;
}
const x = S.concat(parts);
const an = new D.Analyzer(fs), tr = new D.NucleusTracker(), hop = Math.round(fs / 60);
let pauses = 0, wasLong = false;
for (let end = an.needed; end <= x.length; end += hop) {
  tr.push(an.analyze(x.subarray(0, end)), end / fs * 1000);
  const long = tr.silentMs > 450; if (long && !wasLong) pauses++; wasLong = long;
}
check(Math.abs(tr.count - n) <= Math.ceil(n * 0.15), `counted ${tr.count} syllable nuclei of ${n}`);
check(pauses >= 2, `noticed ${pauses} long pauses (sentence breaks)`);
// Recognised words land on the voiced stretches of the pitch track.
{
  const D2 = require('../src/dsp.js');
  const frames = (a, b) => { const r = []; for (let t = a; t <= b; t += 15) r.push(t); return r; };
  const t = [...frames(0, 300), ...frames(600, 900)];
  const p = D2.placeWords(['hello', 'there'], t);
  const ok1 = p.length === 2 && p[0].t0 === 0 && p[1].t0 === 600;
  if (!ok1) fails++; console.log((ok1 ? 'ok   ' : 'FAIL ') + 'words: one word per voiced stretch');
  const q = D2.placeWords(['a', 'wonderful', 'day'], frames(0, 1000));
  const ok2 = q.length === 3 && q[0].t1 <= q[1].t0 + 1 && q[1].t1 - q[1].t0 > q[0].t1 - q[0].t0 && q[2].t1 <= 1016;
  if (!ok2) fails++; console.log((ok2 ? 'ok   ' : 'FAIL ') + 'words: spread by syllables inside one stretch');
}
// Reading report: frames tagged with the highlighted word become per-word pitch and resonance.
{
  const fr = [];
  for (let k = 0; k < 10; k++) fr.push({ i: 0, f0: 200, res: 80, sib: NaN });
  for (let k = 0; k < 10; k++) fr.push({ i: 1, f0: k < 5 ? 150 : 0, res: k === 0 ? 40 : NaN, sib: 70 });
  fr.push({ i: 9, f0: 300, res: 90, sib: NaN }); // past the end of the passage: ignored
  const w = D.wordReport(fr, 3);
  check(w.length === 3 && w[0].p === 200 && w[0].r === 80 && w[0].s === null, 'report: pitch and resonance per word');
  check(w[1].p === 150 && w[1].r === null && w[1].s === 70, 'report: one stray vowel frame is not a score');
  check(w[2].p === null && w[2].r === null, 'report: a word with no voice has no numbers');
  const texts = ['The', 'rainbow,', 'a', 'division', 'of', 'white', 'light.', 'It', 'is'];
  const vals = texts.map((_, i) => ({ p: 180 + i, r: i < 2 ? 50 : 90 }));
  const ph = D.readingPhrases(texts, vals);
  check(ph.length === 3 && ph[0].a === 0 && ph[0].b === 1 && ph[1].a === 2 && ph[1].b === 6 && ph[2].b === 8, 'report: phrases split at punctuation');
  check(ph[0].r === 50 && ph[1].r === 90 && ph[0].nr === 2, 'report: phrase resonance is the median of its words');
  check(D.readingPhrases(Array(25).fill('la'), Array(25).fill({ p: null, r: null }), 10).length === 3, 'report: long unpunctuated text is cut into short phrases');
}
console.log(fails ? `\n${fails} failed` : '\nall reading checks passed');
process.exit(fails ? 1 : 0);

