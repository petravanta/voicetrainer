// One formant at a time: per-formant offsets, live and in summaries: node test/formants.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
for (const v of D.VOWELS) {
  // only F2 low, feminine goal: F2 is the worst, it must go up, and moving it by the Hz given lands on the zone edge
  const F = at(v, 1); F[1] = v.M[1] * 0.97;
  const o = D.formantOffsets(F, v, 'fem');
  check(o.worst === 1 && o.rows[1].need === 1 && o.rows[1].dHz > 0, `${v.cue} only F2 low -> F2 worst, up`);
  const G = F.slice(); G[1] = o.rows[1].toHz * 1.001;
  check(D.formantOffsets(G, v, 'fem').rows[1].need === 0, `${v.cue} F2 moved by the given ${Math.round(o.rows[1].dHz)} Hz -> in its zone`);
  check(Math.abs(o.rows[1].pct - o.rows[1].dHz / F[1]) < 1e-9, `${v.cue} percent and Hz agree`);
  // the same picks as the live coach, so the gauges and the tips never disagree
  for (const t of [0, 0.4, 1, 1.3]) {
    const c = D.coachVowel(at(v, t), v, 'fem'), f = D.formantOffsets(at(v, t), v, 'fem');
    check(JSON.stringify(c.focus) === JSON.stringify(f.focus), `${v.cue} at ${t}: same focus as the coach`);
  }
  // positions are on the scale people see: the average woman's formants read 62.5, the average man's 37.5
  check(D.formantOffsets(at(v, 1), v, 'fem').rows.every(r => Math.abs(r.score - 62.5) < 1e-6), `${v.cue} feminine averages read 62.5 per formant`);
  check(D.formantOffsets(at(v, 0), v, 'masc').rows.every(r => Math.abs(r.score - 37.5) < 1e-6 && r.need === 0), `${v.cue} masculine averages, masculine goal -> all in zone`);
}
// F1 set aside at high pitch: not judged, never the worst
const ee = D.VOWEL_BY_KEY.i, dk = at(ee, 1); dk[0] = ee.M[0] * 0.6;
const lo = D.formantOffsets(dk, ee, 'fem');
check(lo.rows[0].need === 1 && lo.rows[0].unsure && lo.worst === null, 'ee with only F1 very low at speaking pitch -> F1 shown as up but unsure, not picked as worst');
const all = at(ee, 0.2); all[0] = ee.M[0] * 0.75;
check(D.formantOffsets(all, ee, 'fem').rows[0].need === 1, 'F1 low along with the others -> judged');
const hi = D.formantOffsets(dk, ee, 'fem', { f0: 260 });
check(hi.rows[0].skip === 'pitch' && hi.rows[0].score === null && hi.worst !== 0, 'same at 260 Hz -> F1 set aside (high pitch), not the worst');
// a formant far outside anything a voice does reads "couldn't measure", not a clamped 0 or 100
const wild = at(ee, 1); wild[2] = ee.W[2] * 2;
const ow = D.formantOffsets(wild, ee, 'fem');
check(ow.rows[2].skip === 'range' && ow.rows[2].score === null, "F3 twice the feminine average -> couldn't measure");
// summary: pooled over vowels, worst formant called out
const sum = D.formantSummary(D.VOWELS.map(v => { const F = at(v, 1); F[2] = v.M[2]; return { k: v.key, F, n: 20 }; }), 'fem', 180);
check(sum.worst === 2 && sum.rows[2].need === 1 && sum.rows[2].nOff === D.VOWELS.length, 'every vowel with a masculine F3 -> F3 the worst, up, off on all');
check(!sum.together, '... not a whole-tract change');
check(sum.rows[1].need === 0 && sum.rows[1].nOff === 0, '... and F2 in its zone');
check(Object.keys(sum.byVowel).length === D.VOWELS.length, '... with a breakdown for each vowel');
const dark = D.formantSummary(D.VOWELS.map(v => ({ k: v.key, F: at(v, 0), n: 20 })), 'fem', 120);
check(dark.together === 1, 'masculine averages on every vowel, feminine goal -> F2 and F3 low together (larynx)');
const none = D.formantSummary([], 'fem');
check(none.worst === null && none.rows.every(r => r.score === null), 'no vowels -> nothing to say, nothing clamped');
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
