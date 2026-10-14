// Reference examples should score on target in the analyzer: node test/examples.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
function run(x, fs) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), fr = [];
  for (let end = an.needed; end <= x.length; end += hop) fr.push(an.analyze(x.subarray(0, end)));
  return fr;
}
const fs = 48000;
const defs = [
  ...D.VOWELS.map(v => ({ type: 'vowel', vowel: v.key, cue: v.cue })),
  { type: 'sib', sib: 's', cue: 'sss' }, { type: 'sib', sib: 'sh', cue: 'shh' },
  ...[['see', 's', 'i'], ['sit', 's', 'I'], ['say', 's', 'e'], ['sat', 's', 'ae'], ['saw', 's', 'c'], ['sue', 's', 'u'],
    ['she', 'sh', 'i'], ['shed', 'sh', 'E'], ['shop', 'sh', 'a'], ['shoe', 'sh', 'u'], ['shirt', 'sh', 'r'], ['sun', 's', 'V']]
    .map(([cue, sib, vowel]) => ({ type: 'word', cue, sib, vowel })),
];
for (const goal of ['fem', 'masc']) {
  const want = goal === 'fem' ? 100 : 0;
  for (const def of defs) {
    const x = S.example(fs, def, goal, D.VOWELS, D.SIBILANTS);
    const fr = run(x, fs);
    const out = [];
    let ok = true;
    if (def.vowel) {
      const v = D.VOWEL_BY_KEY[def.vowel];
      const sc = fr.filter(f => f.formants && f.stable).map(f => D.fitVowel(f.formants, v).alpha * 100);
      const m = D.median(sc);
      out.push(`vowel ${Math.round(m)} (${sc.length} fr)`);
      ok = ok && sc.length > 5 && Math.abs(m - want) < 25;
    }
    if (def.sib) {
      const sc = fr.filter(f => f.kind === 'fricative').map(f => D.sibilantAlpha(f.cog, D.SIBILANTS[def.sib]) * 100);
      const m = D.median(sc);
      out.push(`${def.sib} ${Math.round(m)} (${sc.length} fr)`);
      ok = ok && sc.length > 5 && Math.abs(m - want) < 25;
    }
    check(ok, `${goal} ${def.type} "${def.cue}": ${out.join(', ')}  ${(x.length / fs).toFixed(2)} s`);
  }
}
// The configurable demo voice should land near the resonance it was set to, at any pitch or brightness.
const four = D.VOWELS.filter(v => ['i', 'a', 'u', 'E'].includes(v.key));
for (const [pitch, res, bright] of [[115, 0, 40], [205, 100, 65], [160, 50, 50], [120, 100, 20], [210, 0, 90], [180, 60, 100]]) {
  const fr = run(S.demoVoice(fs, D.VOWELS, { pitch, res, bright }), fs);
  const sc = fr.filter(f => f.formants && f.stable).map(f => D.classifyVowel(f.formants, four).alpha * 100);
  const m = D.median(sc);
  check(sc.length > 20 && Math.abs(m - res) < 25, `demo voice pitch ${pitch} res ${res} bright ${bright}: measured ${Math.round(m)} (${sc.length} fr)`);
}
console.log(fails ? `\n${fails} failed` : '\nall examples on target');
process.exit(fails ? 1 : 0);
