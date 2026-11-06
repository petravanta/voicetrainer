// Sing along readings: notes above the speech range, the right octave on "oh"/"oo" near C4, and vowels whose F1
// alone is off read from F2 and F3 when the line's lyrics say which vowels to expect. node test/singread.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
function frames(x, pitchMax) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
  if (pitchMax) an.pitchMax = pitchMax;
  for (let end = an.needed; end <= x.length; end += hop) out.push(an.analyze(x.subarray(0, end)));
  return out;
}
const st = (a, b) => 12 * Math.log2(a / b);

console.log('# singing reads notes up to C6 on the right octave');
for (const k of ['u', 'o', 'i', 'a']) {
  for (const f0 of [523, 659, 784, 988]) {
    const p = frames(S.vowel(fs, 0.6, f0, tract(D.VOWEL_BY_KEY[k], 1), { seed: 3 }), D.SING_PITCH_MAX).filter(f => f.kind === 'voiced').map(f => f.f0);
    const right = p.filter(q => Math.abs(st(q, f0)) < 0.7).length, low = p.filter(q => Math.abs(st(q, f0) + 12) < 1).length;
    check(p.length > 20 && right >= 0.7 * p.length && low <= 0.1 * p.length, `"${D.VOWEL_BY_KEY[k].cue}" at ${D.hzToNote(f0)} (${f0} Hz): ${right}/${p.length} right, ${low} an octave low`);
  }
}
{
  const p = frames(S.vowel(fs, 0.6, 659, tract(D.VOWEL_BY_KEY.o, 1), { seed: 3 })).filter(f => f.kind === 'voiced').map(f => f.f0);
  check(p.every(q => q <= D.PITCH_MAX * 1.02), `outside Sing the ceiling stays at ${D.PITCH_MAX} Hz`);
}

console.log('\n# "oh" and "oo" around C4 are not read an octave high, with the singing ceiling on');
for (const k of ['o', 'u', 'U']) {
  for (const t of [0, 1]) {
    for (const f0 of [233, 262, 294]) {
      const p = frames(S.voiced(fs, 0.8, f0 * 0.97, f0 * 1.03, tract(D.VOWEL_BY_KEY[k], t), { seed: 5 }), D.SING_PITCH_MAX).filter(f => f.kind === 'voiced').map(f => f.f0);
      const high = p.filter(q => st(q, f0) > 6).length;
      check(p.length > 20 && high === 0, `"${D.VOWEL_BY_KEY[k].cue}" (${t ? 'female' : 'male'} tract) at ${D.hzToNote(f0)}: ${high}/${p.length} an octave high`);
    }
  }
}

console.log('\n# lower notes read the same with the singing ceiling on');
for (const [k, f0] of [['a', 110], ['i', 165], ['u', 196], ['E', 247], ['o', 330], ['a', 440]]) {
  const x = S.vowel(fs, 0.6, f0, tract(D.VOWEL_BY_KEY[k], 0.5), { seed: 7 });
  const a = frames(x).map(f => f.kind === 'voiced' ? Math.round(f.f0) : 0), b = frames(x, D.SING_PITCH_MAX).map(f => f.kind === 'voiced' ? Math.round(f.f0) : 0);
  // above 230 Hz the full-rate pass reads the note, a few cents finer; it must name the same note
  const same = a.filter((v, i) => (!v && !b[i]) || (v && b[i] && Math.abs(st(v, b[i])) < 0.25)).length;
  check(same >= 0.97 * a.length, `"${D.VOWEL_BY_KEY[k].cue}" at ${f0} Hz: ${same}/${a.length} frames within a quarter tone`);
}

console.log('\n# a sung line\'s vowels come from its words');
{
  const idx = D.pronIndex(require('../data/pron.json'));
  const v = D.lineVowels('Sweet dreams are made of this', idx);
  check(v.join() === 'i,e', `"Sweet dreams are made of this": ${v.join(' ')} ("are", "of", "this" are linking words)`);
  check(D.lineVowels('', idx).length === 0 && D.lineVowels('of the and', idx).length === 0, 'a blank line or only linking words gives none');
}

console.log('\n# a vowel whose F1 alone is off is read from F2 and F3 against the line\'s vowels');
{
  // a very closed "ee" (F1 240 Hz, below both averages) with a woman's F2 and F3: what Petra's real "ee" does
  const v = D.VOWEL_BY_KEY.i, W = tract(v, 1);
  const fr = frames(S.vowel(fs, 1, 140, [240, W[1], W[2]], { seed: 4 }), D.SING_PITCH_MAX).filter(f => f.kind === 'voiced' && f.formants && f.steady);
  const free = fr.filter(f => { const c = D.classifyVowel(f.formants, D.VOWELS, f.f0); return c.cost < 0.07 && c.ok; }).length;
  const line = fr.map(f => D.matchWordVowel(f.formants, ['i', 'a', 'o'], D.classifyVowel(f.formants, D.VOWELS, f.f0), f.f0)).filter(Boolean);
  const a = line.length ? D.median(line.map(m => m.alpha)) : NaN;
  check(fr.length > 20 && line.length >= 0.8 * fr.length && Math.abs(a - 1) < 0.3 && line.some(m => m.f1Off),
    `"ee" with F1 240 Hz: ${free}/${fr.length} read without lyrics, ${line.length} with the line's vowels, at ${Math.round(D.resScore(a))} (woman's average ${Math.round(D.RES_AVG.fem)}), F1 set aside`);
  // a man's "ee" with the same low F1 must not come out feminine
  const M = tract(v, 0);
  const frm = frames(S.vowel(fs, 1, 130, [240, M[1], M[2]], { seed: 4 }), D.SING_PITCH_MAX).filter(f => f.kind === 'voiced' && f.formants && f.steady);
  const lm = frm.map(f => D.matchWordVowel(f.formants, ['i', 'a', 'o'], D.classifyVowel(f.formants, D.VOWELS, f.f0), f.f0)).filter(Boolean);
  const am = lm.length ? D.median(lm.map(m => m.alpha)) : NaN;
  check(lm.length > 0 && D.resScore(am) <= D.RES_BANDS.masc[1], `the same with a man's F2/F3 reads ${Math.round(D.resScore(am))}, in the masculine band (man's average ${Math.round(D.RES_AVG.masc)})`);
}

console.log(fails ? `\n${fails} failed` : '\nall sing reading checks passed');
process.exit(fails ? 1 : 0);
