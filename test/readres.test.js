// A reading's resonance: running speech gets enough vowel readings, the pooled score keeps its accuracy,
// and a reading with too few says why instead of a bare "--". node test/readres.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const PRON = D.pronIndex(require('../data/pron.json'));
const texts = require('../data/texts.json');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;

// ---- pooling ----
{
  const fr = (res, o = {}) => Object.assign({ f0: 200, res, u: 6 }, o);
  const solid = D.pooledResonance(Array.from({ length: 30 }, (_, i) => fr(60 + (i % 5))).concat(Array(40).fill(fr(NaN))));
  check(solid.res === 62 && !solid.shaky && solid.n === 30 && solid.pm >= 2 && solid.pm <= 3, `30 readings: solid score 62 ± ${solid.pm}`);
  const few = D.pooledResonance(Array.from({ length: 8 }, () => fr(55)).concat(Array(60).fill(fr(NaN))));
  check(few.res === 55 && few.shaky && few.pm > solid.pm, `8 readings: score kept, marked rough, wider ± (${few.pm})`);
  const why = (frames) => D.pooledResonance(frames).why;
  check(why(Array(10).fill(fr(NaN))) === 'quiet', 'no score, little voice: "quiet"');
  check(why(Array(80).fill(fr(NaN, { f0: 320 }))) === 'high', 'no score, voice above 280 Hz: "high"');
  check(why(Array(80).fill(fr(NaN, { miss: true }))) === 'unclear', 'no score, vowels refused: "unclear"');
  check(why(Array(80).fill(fr(NaN)).concat([fr(50), fr(51)])) === 'unsteady', 'no score, nothing held: "unsteady"');
  check(Object.keys(D.SING_WHY).every(k => typeof D.SING_WHY[k] === 'string'), 'every reason has words to show');
}

// ---- words: steady frames first, else a few short-vowel (loose) frames, marked rough ----
{
  const f = (i, res, loose) => ({ i, f0: 200, res, loose });
  const w = D.wordReport([f(0, 60), f(0, 62), f(0, 20, true), f(1, 50, true), f(1, 52, true), f(1, 54, true), f(2, 40, true), f(2, 41, true)], 3);
  check(w[0].r === 61 && !w[0].rough, 'word: two steady frames win, loose ones ignored');
  check(w[1].r === 52 && w[1].rough, 'word: three short-vowel frames give a rough score');
  check(w[2].r === null && !w[2].rough, 'word: two short-vowel frames give none');
  const steady = Array.from({ length: 25 }, () => f(0, 60)), loose = Array.from({ length: 25 }, () => f(0, 30, true));
  check(D.pooledResonance(steady.concat(loose)).res === 60, 'reading: enough steady frames, short-vowel ones left out');
  check(D.pooledResonance(steady.slice(0, 4).concat(loose.slice(0, 10))).n === 14, 'reading: too few steady frames, short-vowel ones fill in');
}

// ---- running speech: coarticulated vowels of speech length, each word's timing known ----
const words = texts.find(t => t.id === 'b-rainbow').body.split(/\s+/).slice(0, 45);
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
function read(pitch, t) {
  const mix = {}; for (const v of D.VOWELS) mix[v.key] = tract(v, t);
  const LOC = [450, 1500, 2600], parts = [S.silence(fs, 0.3)], at = [];
  let time = 0.3, seed = 5;
  const push = (x) => { parts.push(x); time += x.length / fs; };
  words.forEach((w, wi) => {
    const t0 = time, fw = D.FUNCTION_WORDS.has(w.toLowerCase().replace(/[^a-z']/g, ''));
    let vi = 0;
    for (const q of S.wordUnits(w)) {
      seed += 7;
      if (q.v) {
        const F = mix[q.v] || mix.V, dur = fw ? 0.06 : vi === 0 ? 0.12 : 0.08, f0 = pitch * (1 + 0.12 * Math.sin(wi * 0.7 + vi));
        const edge = LOC.map((l, i) => (l + F[i]) / 2); // glides in from and out to its consonants
        push(S.voiced(fs, dur, f0, f0 * 0.95, F, { from: edge, to: edge, trans: Math.min(0.04, dur / 3), seed, ramp: 0.008, level: 0.3 })); vi++;
      } else if (q.sib) push(S.sibilant(fs, 0.09, 6500, { level: 0.1, seed }));
      else if (q.nasal || q.glide) push(S.voiced(fs, 0.05, pitch, pitch, [300, 1350, 2500], { level: 0.12, bws: [90, 200, 250, 300, 350], ramp: 0.01, seed }));
      else if (q.fric) push(S.sibilant(fs, 0.05, 2000, { level: 0.04, seed }));
      else push(S.silence(fs, 0.04));
    }
    at.push([t0, time + 0.03]);
    push(S.silence(fs, /[.,]$/.test(w) ? 0.25 : 0.03));
  });
  return { x: S.concat(parts), at };
}
// the reading path of app.js onFrame: the word's own vowels first, then any clear vowel (overall only)
function score(sim, gate) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
  for (let end = an.needed; end <= sim.x.length; end += hop) {
    const fr = an.analyze(sim.x.subarray(0, end)), t = end / fs, rec = { f0: fr.kind === 'voiced' ? fr.f0 : 0, res: NaN };
    out.push(rec);
    if (fr.kind !== 'voiced' || !fr.formants || !gate(fr)) continue;
    const wi = sim.at.findIndex(([a, b]) => t >= a && t <= b); if (wi < 0) continue;
    const wv = D.wordVowels(words[wi], PRON), cls = D.classifyVowel(fr.formants, D.VOWELS, fr.f0);
    if (wv.why === 'function') continue;
    const m = wv.why === 'ok' ? D.matchWordVowel(fr.formants, wv.keys, cls, fr.f0) : null;
    if (m) rec.res = D.resScore(m.alpha);
    else if (cls.cost < 0.07 && cls.ok) rec.res = D.resScore(cls.alpha);
  }
  return out;
}
for (const [pitch, t] of [[120, 0], [200, 1]]) {
  const sim = read(pitch, t), truth = D.resScore(t);
  const held = score(sim, fr => fr.stable).filter(r => Number.isFinite(r.res)).length;
  const frames = score(sim, fr => fr.steady), p = D.pooledResonance(frames);
  const n = frames.filter(r => Number.isFinite(r.res)).length;
  check(n >= 1.1 * held, `${pitch} Hz speech: ${n} vowel readings with the speech gate, ${held} with the held-vowel gate`);
  check(p.res != null && !p.shaky && Math.abs(p.res - truth) <= 4, `${pitch} Hz speech: pooled ${p.res != null ? Math.round(p.res) : '--'} ± ${p.pm}, true ${truth}`);
}
// ---- timeline for replay: bins from the recording's start, word starts, smoothed resonance ----
{
  const fr = [];
  // 2 s at 100 frames/s from t=1000: word 0 for the first second, word 2 after (word 1 skipped by the highlight);
  // voiced throughout, resonance 40 for 0.5 s, nothing for 0.5 s, then 70 (loose only from 1.5 s)
  for (let k = 0; k < 200; k++) {
    const ms = k * 10;
    fr.push({ t: 1000 + ms, i: ms < 1000 ? 0 : 2, f0: 200, res: ms < 500 ? 40 : ms < 1000 ? NaN : 70, loose: ms >= 1500 });
  }
  fr.push({ t: 900, i: 0, f0: 999, res: 99 }); // before the recording started: left out
  const tl = D.readingTimeline(fr, 1000, 4, 50);
  check(tl.f0.length === 40 && tl.f0.every(v => v === 200), `40 bins of 50 ms, pitch 200 in each (${tl.f0.length})`);
  check(tl.ws[0] === 0 && tl.ws[1] === 1000 && tl.ws[2] === 1000 && tl.ws[3] == null, `word starts ${JSON.stringify(tl.ws)}: a skipped word starts with the next, an unreached one has none`);
  check(tl.res[0] === 40 && tl.res[15] == null && tl.res[25] === 70 && !tl.rough[25] && tl.rough[35] === 1, 'bin resonance: steady frames, gap, short-vowel bins marked rough');
  check(tl.rs[13] == null && tl.rs[9] != null && tl.rs[9] > 40 === false, 'smoothed line keeps a long gap open and does not bleed across it');
  check(Math.abs(tl.dur - 1990) <= 1, `duration ${tl.dur} ms`);
}
console.log(fails ? `\n${fails} failed` : '\nall reading resonance checks passed');
process.exit(fails ? 1 : 0);
