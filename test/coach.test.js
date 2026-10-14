// Live coaching cues point the right way: node test/coach.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
for (const v of D.VOWELS) {
  // whole tract dark -> 'all' up; on target -> nothing; only F2 low -> F2 up
  const dark = D.coachVowel(at(v, 0), v, 'fem');
  check(dark.focus && dark.focus.formant === 'all' && dark.focus.dir === 1, `${v.cue} masculine values, feminine goal -> raise everything`);
  check(D.coachVowel(at(v, 1), v, 'fem').onTarget, `${v.cue} feminine values -> on target`);
  const f2 = at(v, 1); f2[1] = v.M[1] * 0.97;
  const c = D.coachVowel(f2, v, 'fem');
  check(c.focus && c.focus.formant === 1 && c.focus.dir === 1, `${v.cue} only F2 low -> raise F2`);
  const m = D.coachVowel(at(v, 1), v, 'masc');
  check(m.focus && m.focus.dir === -1, `${v.cue} feminine values, masculine goal -> lower`);
  check(D.coachVowel(at(v, 0.4), v, 'fem').distance < dark.distance, `${v.cue} closer values -> smaller distance`);
}
check(D.coachSibilant(6000, D.SIBILANTS.s, 'fem').dir === 1, 's at 6 kHz, feminine goal -> brighten');
check(D.coachSibilant(7900, D.SIBILANTS.s, 'fem').onTarget, 's at 7.9 kHz, feminine goal -> on target');
console.log(fails ? `\n${fails} failed` : '\nall coaching checks passed');
process.exit(fails ? 1 : 0);
