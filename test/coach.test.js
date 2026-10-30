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
// Vocal tract sketch: a whole-tract shift moves the larynx; one formant moves its own articulator.
{
  const v = D.VOWEL_BY_KEY.i;
  const m = D.tractShape(v.M, v, 'fem'), w = D.tractShape(v.W, v, 'fem');
  const ok1 = Math.abs(m.larynx) < 0.05 && Math.abs(w.larynx - 1) < 0.05 && Math.abs(m.back - w.back) < 0.02 && Math.abs(m.height - w.height) < 0.02;
  if (!ok1) fails++; console.log((ok1 ? 'ok   ' : 'FAIL ') + 'tract: masculine "ee" reads as a lower larynx, same tongue and jaw');
  const fwd = D.tractShape([v.W[0], v.W[1] * 1.12, v.W[2]], v, 'fem');
  const ok2 = fwd.back < w.back - 0.05 && Math.abs(fwd.height - w.height) < 0.1;
  if (!ok2) fails++; console.log((ok2 ? 'ok   ' : 'FAIL ') + 'tract: higher F2 alone reads as the tongue further forward');
  const a = D.VOWEL_BY_KEY.a, open = D.tractShape([a.M[0] * 1.15, a.M[1], a.M[2]], a, 'masc');
  const ok3 = open.height < D.tractShape(a.M, a, 'masc').height;
  if (!ok3) fails++; console.log((ok3 ? 'ok   ' : 'FAIL ') + 'tract: higher F1 reads as a more open jaw');
}
// Control exercises: the check accepts the asked-for movement and rejects the wrong one.
{
  const b = D.VOWEL_BY_KEY.i.M, sc = (m) => b.map((x, i) => x * m[i]);
  const cases = [
    ['tongue', sc([1.04, 0.7, 0.97]), 120, true], ['tongue', sc([1.25, 1, 1]), 120, false],
    ['jaw', sc([1.3, 1.03, 1]), 120, true], ['jaw', sc([1, 0.7, 1]), 120, false],
    ['lips', sc([1, 0.92, 0.87]), 120, true], ['lips', sc([1.2, 1, 0.95]), 120, false],
    ['larynx', sc([1.08, 1.08, 1.08]), 120, true], ['larynx', sc([1, 0.7, 1]), 120, false],
    ['pitch', b, 160, true], ['pitch', sc([1, 0.8, 1]), 160, false],
    ['slide', sc([1.2, 1.15, 1.1]), 125, true], ['slide', sc([0.85, 0.88, 0.9]), 115, true],
    ['slide', sc([1.2, 1.15, 1.1]), 152, false], ['slide', sc([1, 1.2, 1]), 120, false], ['slide', sc([1.03, 1.03, 1.03]), 120, false], ['slide', sc([0.85, 1.15, 1.1]), 120, false],
  ];
  for (const [kind, F, f0, want] of cases) {
    const got = D.isolation(kind, b, F, 120, f0).ok;
    if (got !== want) fails++;
    console.log((got === want ? 'ok   ' : 'FAIL ') + `control ${kind}: ${want ? 'accepts the right movement' : 'rejects a different movement'}`);
  }
}
// The jaw (F1) zone is wide enough to hold: +-25% F1 alone stays on target, +50% does not.
for (const k of ['i', 'a', 'u']) {
  const v = D.VOWEL_BY_KEY[k];
  const okIn = [0.78, 1.25].every(m => D.coachVowel([v.W[0] * m, v.W[1], v.W[2]], v, 'fem').onTarget);
  const out = !D.coachVowel([v.W[0] * 1.5, v.W[1], v.W[2]], v, 'fem').onTarget;
  if (!(okIn && out)) fails++;
  console.log((okIn && out ? 'ok   ' : 'FAIL ') + `jaw zone on "${k}": +-25% F1 on target, +50% flagged`);
}
console.log(fails ? `\n${fails} failed` : '\nall coaching checks passed');
process.exit(fails ? 1 : 0);
