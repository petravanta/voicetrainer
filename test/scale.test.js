// The 0..100 resonance scale and its target bands: average voices land inside their band, real speakers mostly do
// too, extremes are told apart instead of pinned at an end, and scores saved on the old scale convert.
// node test/scale.test.js
const D = require('../src/dsp.js');
const S = require('../src/synth.js');

let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;
const [mLo, mHi] = D.RES_BANDS.masc, [fLo, fHi] = D.RES_BANDS.fem;
const inBand = (s, b) => s >= b[0] && s <= b[1];
console.log(`bands: masculine ${mLo}-${mHi}, feminine ${fLo}-${fHi}; averages ${D.RES_AVG.masc} / ${D.RES_AVG.fem}`);

// ---- the scale itself ----
check(D.resScore(D.SCORE_RANGE[0]) === 0 && D.resScore(D.SCORE_RANGE[1]) === 100, 'the plausible range is exactly 0..100');
check(Math.abs(D.resAlpha(D.resScore(0.37)) - 0.37) < 1e-12, 'resAlpha undoes resScore');
check(inBand(D.RES_AVG.masc, D.RES_BANDS.masc) && inBand(D.RES_AVG.fem, D.RES_BANDS.fem), 'each average sits inside its own band');
check(D.RES_AVG.masc - mLo > 5 && mHi - D.RES_AVG.masc > 5 && D.RES_AVG.fem - fLo > 5 && fHi - D.RES_AVG.fem > 5, 'with room on both sides');
check(mHi < fLo, 'the bands do not overlap');
check(mLo > 15 && fHi < 85, 'and neither reaches an end of the scale');

// ---- the exact average formants of every vowel, at a low and a high pitch ----
for (const [goal, key, f0s] of [['masc', 'M', [110, 150]], ['fem', 'W', [200, 260]]]) {
  for (const f0 of f0s) {
    const out = D.VOWELS.filter(v => { const s = D.resScore(D.scoreVowel(v[key], v, f0).alpha); return !inBand(s, D.RES_BANDS[goal]); });
    check(!out.length, `average ${goal === 'fem' ? 'woman' : 'man'}'s formants at ${f0} Hz: all 12 vowels in the ${goal} band${out.length ? ' (not: ' + out.map(v => v.cue).join(', ') + ')' : ''}`);
  }
}

// ---- real speakers ----
// Each speaker's median alpha across their vowels in Hillenbrand et al. (1995), the recordings the averages come
// from (phonTools' h95 copy of the data, scored with scoreVowel at each token's own pitch). This is the evidence
// the bands were set from: the 5th-95th percentiles are men -0.31..0.27, women 0.60..1.46.
const H95 = {
  masc: [0.1, -0.27, -0.23, 0.12, 0.01, 0.03, -0.11, -0.06, -0.04, -0.08, -0.01, 0.14, -0.27, -0.32, 0.19, 0.27, 0.07, -0.25, 0.22, 0.08, 0.35, -0.19, -0.2, 0.05, 0.26, 0.07, -0.29, -0.06, -0.02, -0.05, -0.13, -0.07, 0.05, -0.41, -0.09, 0.04, 0.16, -0.14, 0.06, -0.02, 0.41, -0.52, -0.1, 0.18, 0.16],
  fem: [0.99, 1.15, 0.83, 1.22, 0.74, 0.75, 0.98, 1.71, 0.89, 0.78, 0.87, 1.33, 0.75, 0.99, 0.78, 1.31, 0.84, 1.1, 0.62, 0.54, 0.96, 0.79, 1.5, 1.38, 0.64, 1.05, 1.15, 0.93, 1.26, 0.8, 0.62, 1.81, 1.1, 1.14, 1.06, 1.13, 1.23, 0.61, 0.72, 1.21, 0.66, 0.59, 0.8, 1.04, 0.8, 0.58, 1.03, 1.17],
};
for (const goal of ['masc', 'fem']) {
  const sc = H95[goal].map(D.resScore), b = D.RES_BANDS[goal];
  const inside = sc.filter(s => inBand(s, b)).length / sc.length;
  // on target counts past the far end too (brighter than the band for a feminine goal)
  const onT = sc.filter(s => (goal === 'fem' ? s >= b[0] : s <= b[1])).length / sc.length;
  const old = H95[goal].filter(a => (goal === 'fem' ? a >= 0.75 : a <= 0.25)).length / sc.length; // scale 1's 75-100 / 0-25
  check(inside >= 0.88, `real ${goal === 'fem' ? 'women' : 'men'} (${sc.length}): ${Math.round(inside * 100)}% inside the band, ${Math.round(onT * 100)}% on target (old scale: ${Math.round(old * 100)}%)`);
  check(sc.every(s => s > 0 && s < 100), `  none pinned at 0 or 100 (range ${Math.round(Math.min(...sc))}-${Math.round(Math.max(...sc))})`);
}

// ---- synthetic voices through the whole pipeline ----
function run(x) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), frames = [];
  for (let end = an.needed; end <= x.length; end += hop) frames.push(an.analyze(x.subarray(0, end)));
  return frames.filter(f => f.kind === 'voiced' && f.formants && f.stable);
}
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
// per vowel: the median score of the frames the app accepts; pooled: the median over every accepted frame
function voice(t, f0) {
  const per = [], all = [];
  for (const v of D.VOWELS) {
    const sc = run(S.vowel(fs, 0.8, f0, tract(v, t))).map(f => D.scoreVowel(f.formants, v, f.f0)).filter(s => s.ok).map(s => D.resScore(s.alpha));
    if (sc.length) { per.push({ v, s: D.median(sc) }); all.push(...sc); }
  }
  return { per, pooled: D.median(all) };
}
for (const [label, goal, t, f0] of [['average man', 'masc', 0, 110], ['average woman', 'fem', 1, 210]]) {
  const r = voice(t, f0), b = D.RES_BANDS[goal], n = r.per.filter(p => inBand(p.s, b)).length;
  check(inBand(r.pooled, b), `${label} at ${f0} Hz: pooled score ${r.pooled.toFixed(1)} in the ${goal} band`);
  check(n >= 11, `  ${n}/12 vowels in the band (${r.per.map(p => p.v.cue.split(' ')[0] + ' ' + Math.round(p.s)).join(', ')})`);
}
// Extremes: a very dark and a very bright tract get their own numbers, past the bands, and are not pinned to the ends
// (scale 1 showed both as 0 and 100, the same as an average voice's ends).
const dark = voice(-0.9, 90), bright = voice(1.9, 250), brightish = voice(1.5, 250);
check(dark.pooled > 2 && dark.pooled < mLo, `very dark tract (alpha -0.9) at 90 Hz: ${dark.pooled.toFixed(1)}, below the masculine band and above 0`);
check(bright.pooled > fHi && bright.pooled < 98, `very bright tract (alpha 1.9) at 250 Hz: ${bright.pooled.toFixed(1)}, above the feminine band and below 100`);
check(bright.pooled - brightish.pooled > 4, `  and told apart from a merely bright one (alpha 1.5: ${brightish.pooled.toFixed(1)})`);

// ---- history saved on the old scale ----
check(D.fromScale1(0) === 37.5 && D.fromScale1(100) === 62.5 && D.fromScale1(50) === 50, 'old 0 / 50 / 100 become 37.5 / 50 / 62.5');
check(D.fromScale1(null) === null && D.fromScale1(undefined) === undefined, 'missing scores stay missing');
const oldReading = { id: 'r1', at: '2026-10-20T10:00:00Z', resonance: 80, sibS: 100, sibSh: null, vowels: { i: 90, a: 70 },
  vmap: { i: [400, 2600, 3200, 90, 40, ['see']] }, byWord: [['see', 200, 90, null], ['the', 190, null, null]], pitchMedian: 200, breath: 30 };
const m = D.migrateRecord(oldReading, 'readings');
check(m.rs === D.RES_SCALE && m.rsFrom === 1 && m.resonance === 57.5 && m.sibS === 62.5 && m.sibSh === null, 'a reading: overall and sibilant scores converted');
check(m.vowels.i === 60 && m.vmap.i[3] === 60 && m.vmap.i[0] === 400 && m.byWord[0][2] === 60 && m.byWord[0][1] === 200 && m.byWord[1][2] === null, '  per-vowel, vowel-map and per-word scores converted, formants and pitch untouched');
check(m.pitchMedian === 200 && m.breath === 30 && oldReading.resonance === 80, '  pitch and breath untouched, the original not modified');
check(D.migrateRecord(m, 'readings') === m, '  converting twice changes nothing');
const p = (kind, score) => D.migrateRecord({ id: 'p', kind, score }, 'practice').score;
check(p('sound', 75) === 56.3 && p(undefined, 0) === 37.5 && p('spot', 100) === 62.5, 'practice: vowel/word drills and focus spots converted');
check(p('breath', 40) === 40 && p('prosody', 3.5) === 3.5 && p('control', 12) === 12 && p('whisper', 30) === 30 && p('spotpitch', 190) === 190, '  breath, semitones, percentages and Hz untouched');
const fresh = { id: 'r2', rs: D.RES_SCALE, resonance: 70 };
check(D.migrateRecord(fresh, 'readings') === fresh, 'a record saved on the current scale is left alone');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
