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
// Intonation: a synthesized question rises at the end, a statement falls, through the real analyser.
{
  const contour = (x) => run(x, fs).map((f, i) => ({ t: i * 1000 / 60, f0: f.kind === 'voiced' ? f.f0 : 0 }));
  const o = { pitch: 200, res: 100, bright: 60, rate: 0.95 };
  const q = D.prosodyStats(contour(S.readText(fs, ["You're", 'coming', 'tonight?'], D.VOWELS, { ...o, f0At: (wi, u) => (wi < 2 ? 1 : 0.99 + 0.46 * u * u) }).x));
  check(q && q.end >= 3, `prosody: question rises (${q && q.end.toFixed(1)} st)`);
  const st = D.prosodyStats(contour(S.readText(fs, ["I'm", 'going', 'home', 'now.'], D.VOWELS, { ...o, f0At: (wi, u) => 1.12 - 0.08 * wi - (wi === 3 ? 0.14 * u : 0) }).x));
  check(st && st.end <= -1.5, `prosody: statement falls (${st && st.end.toFixed(1)} st)`);
  const flat = D.prosodyStats(contour(S.readText(fs, ['Hi', 'there', 'how', 'are', 'you'], D.VOWELS, { ...o, f0At: () => 1 }).x));
  check(flat && flat.sd < 1 && flat.span < 2, `prosody: monotone reads as flat (sd ${flat && flat.sd.toFixed(2)})`);
}
// An octave slip in the pitch tracker must not read as a big pitch movement.
{
  const pts = []; for (let i = 0; i < 120; i++) pts.push({ t: i * 16, f0: i % 30 === 10 || i % 30 === 11 ? 410 : 205 });
  const s = D.prosodyStats(pts);
  check(s && s.span < 1 && s.sd < 1, `prosody: octave slips are folded back (span ${s && s.span.toFixed(2)})`);
}
// Resonance slide: a dark-to-bright "ee" on one note passes; the same slide with the pitch climbing fails.
// Mirrors isoExample and gradeIso in app.js (starting point = first 40 voiced frames, end = last 30).
for (const f0 of [115, 200]) {
  const v = D.VOWEL_BY_KEY.i;
  for (const [semis, want] of [[0, true], [4, false]]) {
    const x = S.concat([S.silence(fs, 0.1), S.voiced(fs, 1.0, f0, f0, v.M, { ramp: 0.05, seed: 3 }),
      S.voiced(fs, 1.8, f0, f0 * Math.pow(2, semis / 12), v.W, { from: v.M, trans: 0.6, ramp: 0.05, seed: 5 }), S.silence(fs, 0.1)]);
    const vf = run(x, fs).filter(f => f.kind === 'voiced' && f.formants);
    const med = (fr) => ({ F: [0, 1, 2].map(i => D.median(fr.map(f => f.formants[i]))), f0: D.median(fr.map(f => f.f0)) });
    const a = med(vf.slice(0, 40)), b = med(vf.slice(-30)), r = D.isolation('slide', a.F, b.F, a.f0, b.f0);
    check(vf.length > 70 && r.ok === want, `slide at ${f0} Hz, pitch ${semis ? '+' + semis + ' st' : 'held'}: ${r.ok ? 'passes' : 'fails'} (${r.dev.map(d => Math.round(d * 100) + '%').join(' ')}, ${r.semis.toFixed(1)} st)`);
  }
}
console.log(fails ? `\n${fails} failed` : '\nall examples on target');
process.exit(fails ? 1 : 0);
