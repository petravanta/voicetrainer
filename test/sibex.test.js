// Sibilant brightness exercises (Practice > Sibilants): the checks and their demos. node test/sibex.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const data = require('../data/sibex.json');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
function run(x, fs) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), fr = [];
  for (let end = an.needed; end <= x.length; end += hop) fr.push(an.analyze(x.subarray(0, end)));
  return fr.map(f => ({ cog: f.kind === 'fricative' ? f.cog : null }));
}
const R = Math.round;

// bursts: gaps join, short ones drop, /s/ or /ʃ/ by the centre
{
  const f = (c, n) => Array(n).fill({ cog: c }), q = (n) => Array(n).fill({ cog: null });
  const b = D.sibBursts([...f(7000, 10), ...q(2), ...f(7000, 5), ...q(10), ...f(4000, 8), ...q(10), ...f(4000, 3)]);
  check(b.length === 2 && b[0].n === 15 && b[0].sib === 's' && b[1].sib === 'sh', `bursts: a 2-frame gap joins, a 3-frame hiss drops (${b.map(x => x.n + x.sib).join(' ')})`);
}
// glide turns: lows are the /ʃ/ ends, the one in progress included
{
  const L = (hz) => Math.log(hz), seq = [];
  const ramp = (a, b, n) => { for (let i = 0; i < n; i++) seq.push(L(a * Math.pow(b / a, i / (n - 1)))); };
  ramp(7800, 7800, 10); ramp(7800, 4300, 20); ramp(4300, 7800, 20); ramp(7800, 4600, 20);
  const t = D.glideTurns(seq);
  check(t.legs === 3 && t.lows.length === 2 && t.dir === -1, `glide: 3 slides, 2 /ʃ/ ends (${t.legs}, ${t.lows.map(v => R(Math.exp(v))).join('/')})`);
  check(Math.abs(Math.exp(t.lows[0]) - 4300) < 200 && Math.abs(Math.exp(t.lows[1]) - 4600) < 200, 'glide: the ends sit where the slides turned');
  check(D.glideTurns(seq.map((v, i) => L(7000) + 0.05 * Math.sin(i))).legs === 0, 'glide: a wobbly /s/ is no slide');
}

const fs = 48000;
const byKind = (k) => data.find(x => x.kind === k);
for (const goal of ['fem', 'masc']) {
  const fem = goal === 'fem', [lo, hi] = D.RES_BANDS[fem ? 'fem' : 'masc'], on = (v) => (fem ? v >= lo : v <= hi);
  const other = { s: D.SIBILANTS.s[fem ? 'M' : 'W'], sh: D.SIBILANTS.sh[fem ? 'M' : 'W'] * (fem ? 0.92 : 1.05) };
  // glide
  const glide = byKind('glide');
  const g1 = D.glideCheck(run(S.sibExercise(fs, glide, goal, D.VOWELS, D.SIBILANTS), fs));
  check(g1.legs >= 4 && g1.ends.length >= 2 && g1.ends.every(e => e.sh) && on(g1.score), `${goal} glide demo: ${g1.legs} slides, "shh" ends ${g1.ends.map(e => R(e.score)).join('/')} on target`);
  const g2 = D.glideCheck(run(S.sibExercise(fs, glide, goal, D.VOWELS, D.SIBILANTS, { sh: other.sh }), fs));
  check(g2.legs >= 4 && !on(g2.score), `${goal} glide with the other goal's "shh": ${R(g2.score)} off target`);
  const g3 = D.glideCheck(run(S.sibExercise(fs, glide, goal, D.VOWELS, D.SIBILANTS, { s: 8200, sh: 5700 }), fs));
  check(g3.missed > 0 && !Number.isFinite(g3.score), `${goal} glide that never reaches "shh": no score, ${g3.missed} ends stayed /s/`);
  // ladders: three rungs, moving the goal's way; a flat one doesn't
  for (const lad of data.filter(x => x.kind === 'ladder')) {
    const v = D.ladderCheck(run(S.sibExercise(fs, lad, goal, D.VOWELS, D.SIBILANTS), fs), lad.sib).map(b => b.score);
    const moved = (v[v.length - 1] - v[0]) * (fem ? 1 : -1);
    check(v.length === lad.rungs.length && moved > 20 && on(v[v.length - 1]), `${goal} ${lad.id}: ${v.map(R).join(' → ')}`);
    const f = D.ladderCheck(run(S.sibExercise(fs, lad, goal, D.VOWELS, D.SIBILANTS, { flat: true }), fs), lad.sib).map(b => b.score);
    check(f.length === lad.rungs.length && Math.abs(f[f.length - 1] - f[0]) < 4, `${goal} ${lad.id} flat: ${f.map(R).join(' → ')}`);
  }
  // pairs: every hiss found and sorted
  const pairs = byKind('pairs');
  const p1 = D.pairsCheck(run(S.sibExercise(fs, pairs, goal, D.VOWELS, D.SIBILANTS), fs));
  const med = (a) => D.median(a.map(b => b.score));
  check(p1.s.length === 6 && p1.sh.length === 6 && on(med(p1.s)) && on(med(p1.sh)), `${goal} pairs demo: ${p1.s.length} /s/ (${R(med(p1.s))}), ${p1.sh.length} /ʃ/ (${R(med(p1.sh))})`);
  const p2 = D.pairsCheck(run(S.sibExercise(fs, pairs, goal, D.VOWELS, D.SIBILANTS, { sh: other.sh }), fs));
  check(p2.sh.length === 6 && !on(med(p2.sh)) && on(med(p2.s)), `${goal} pairs with the other goal's "sh": /ʃ/ ${R(med(p2.sh))} off, /s/ ${R(med(p2.s))} on`);
}
if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');
