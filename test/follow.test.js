// "Follow my voice" must not move before you speak: node test/follow.test.js
// Room sound, a mic click, mains hum and a stray voiced blip come first; only the real vowels count.
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000, V = D.VOWELS, hop = Math.round(fs / 60);
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 - 0.5; };
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

const lead = 1.5, n = 4;
const parts = [S.silence(fs, lead)];
for (let i = 0; i < n; i++) parts.push(S.vowel(fs, 0.18, 190, V[i].W, { seed: i + 1 }), S.silence(fs, 0.12));
parts.push(S.silence(fs, 0.6));
const x = S.concat(parts);
const speech = rms(x.subarray(Math.round(fs * lead), Math.round(fs * (lead + 0.18))));
// room: hiss plus a humming fridge / mains buzz that reads as voiced, and loud enough to pass the analyser's gate
for (let k = 0; k < x.length; k++) {
  const t = k / fs;
  x[k] += 0.004 * rnd() * 3.4 + 0.012 * Math.SQRT2 * (Math.sin(2 * Math.PI * 100 * t) + 0.5 * Math.sin(2 * Math.PI * 200 * t)) / 1.12;
}
// the mic switching on: a click at the start
for (let k = 0; k < Math.round(fs * 0.004); k++) x[k] += 0.6 * (1 - k / (fs * 0.004));
// a stray 25 ms voiced blip (a breath catch, a chair) just before you start
const blip = S.vowel(fs, 0.025, 160, V[5].W, { seed: 99 }), b0 = Math.round(fs * 1.0);
for (let k = 0; k < blip.length; k++) x[b0 + k] += blip[k];

function run(tr) {
  const an = new D.Analyzer(fs), hits = [];
  let resyncBefore = 0, wasPause = false;
  for (let end = an.needed; end <= x.length; end += hop) {
    const t = end / fs * 1000;
    if (tr.push(an.analyze(x.subarray(0, end)), t)) hits.push(t);
    const pause = tr.silentMs > 450;
    if (pause && !wasPause && tr.heard > 0 && t < lead * 1000) resyncBefore++;
    wasPause = pause;
  }
  return { hits, resyncBefore };
}
console.log(`speech level ${(20 * Math.log10(speech)).toFixed(1)} dBFS`);
const old = run(new D.NucleusTracker(3, 110, { armMs: 0, holdMs: 0, floorDb: -999 }));
check(old.hits.some(t => t < lead * 1000), `without the guards the room counts as a syllable (${old.hits.filter(t => t < lead * 1000).length} before speech)`);
const r = run(new D.NucleusTracker());
const early = r.hits.filter(t => t < lead * 1000);
check(early.length === 0, `nothing counts before you speak (got ${early.length}${early.length ? ' at ' + early.map(Math.round).join(', ') + ' ms' : ''})`);
check(r.hits.length === n, `each of the ${n} vowels counts once (got ${r.hits.length})`);
check(r.hits.length && r.hits[0] - lead * 1000 < 150, `the first vowel counts promptly (${r.hits.length ? Math.round(r.hits[0] - lead * 1000) : '-'} ms after it starts)`);
check(r.resyncBefore === 0, 'no pause snap before any speech');

// frames stopping (mic off and on again) re-arms, so the restart click does not count either
{
  const tr = new D.NucleusTracker(), q = { kind: 'silence', rms: 0.001 }, v = { kind: 'voiced', rms: 0.2 };
  let t = 0, c = 0;
  for (; t < 600; t += 16) tr.push(q, t);
  for (let i = 0; i < 6; i++, t += 16) c += tr.push(v, t);
  check(c === 1 && tr.count === 1, 'a held voiced sound after the room is learned counts once');
  t += 2000; // mic was off
  for (let i = 0; i < 6; i++, t += 16) c += tr.push(v, t);
  check(tr.count === 1, 'a loud burst right after the mic restarts does not count');
}
console.log(fails ? `\n${fails} follow check(s) FAILED` : '\nall follow checks passed');
process.exit(fails ? 1 : 0);
