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
console.log(fails ? `\n${fails} failed` : '\nall reading checks passed');
process.exit(fails ? 1 : 0);
