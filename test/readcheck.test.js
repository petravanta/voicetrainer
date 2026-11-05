// "Check my readings": the self-test passes a voice that does what it's asked, and names what didn't happen.
// Also the two live-reading fixes it came with: a held vowel keeps its name through a resonance slide, and
// breathiness isn't read from a window that is only partly voice. node test/readcheck.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const sr = 48000;
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));

function steps(key, o = {}) {
  const v = D.VOWEL_BY_KEY[key], f0 = o.f0 || 190;
  const vo = (t, p, extra = {}) => S.voiced(sr, 3, p, p * 0.99, tract(v, t), Object.assign({ seed: 5, level: 0.3 }, extra));
  const r = o.res || [-0.3, 0.5, 1.2];
  return {
    dark: vo(r[0], f0), mid: vo(r[1], f0), bright: vo(r[2], f0),
    low: vo(o.lowRes != null ? o.lowRes : r[1], f0 / 1.33), high: vo(o.highRes != null ? o.highRes : r[1], f0 * 1.33),
    again: vo(r[1], f0, { seed: 9 }),
    airy: vo(r[1], f0, { breath: o.airy != null ? o.airy : 0.8 }),
    whisper: o.noWhisper ? new Float32Array(sr * 3) : S.whispered(sr, 3, () => tract(v, r[1]).map((f, i) => f * [1.25, 1.05, 1.03][i]), { level: 0.15 }),
  };
}
const lv = (res, id) => (res.checks.find(c => c.id === id) || {}).level;
const show = (res) => res.checks.map(c => `${c.id}:${c.level}`).join(' ');

for (const k of ['a', 'i', 'u']) {
  const res = D.readingsCheck(steps(k), sr, k);
  check(res.checks.every(c => c.level === 'good'), `"${D.VOWEL_BY_KEY[k].cue}", a voice that does each step: all pass (${show(res)})`);
  if (k !== 'u') console.log('      ' + res.checks.map(c => c.say).join('\n      '));
}
{
  const res = D.readingsCheck(steps('a', { res: [0.5, 0.5, 0.5] }), sr, 'a');
  check(lv(res, 'follow') === 'warn' && /Hardly any change/.test(res.checks[0].title), `no resonance change made: "hardly any change", not a pass (${res.checks[0].title})`);
}
{
  const res = D.readingsCheck(steps('a', { res: [1.2, 0.5, -0.3] }), sr, 'a');
  check(lv(res, 'follow') === 'bad' && /wrong way/.test(res.checks[0].title) && /went down too/.test(res.checks[0].say), 'bright and dark swapped: wrong way, and the formants say it was the sound');
}
{
  const res = D.readingsCheck(steps('a', { lowRes: 0.1, highRes: 1.0 }), sr, 'a');
  check(lv(res, 'pitch') !== 'good' && /really changed with pitch/.test(res.checks.find(c => c.id === 'pitch').say), `resonance that really rises with pitch: flagged, and put down to the voice (${lv(res, 'pitch')})`);
}
{
  const res = D.readingsCheck(steps('a', { airy: 0 }), sr, 'a');
  check(lv(res, 'breath') === 'bad', `"airy" step as clear as everyday: breathiness didn't follow (${lv(res, 'breath')})`);
}
{
  const s = steps('a'); s.bright = new Float32Array(sr * 3);
  const res = D.readingsCheck(s, sr, 'a');
  check(lv(res, 'follow') === 'bad' && /bright/.test(res.checks[0].say), 'a silent step: named as unreadable, no verdict on it');
}

console.log('\n# a held vowel keeps its name while its resonance slides (live meter in Freestyle)');
function live(x, hold) {
  const an = new D.Analyzer(sr), hop = Math.round(sr / 60), out = []; let held = null, n = 0;
  for (let end = an.needed; end <= x.length; end += hop, n++) {
    const fr = an.analyze(x.subarray(0, end));
    if (!(fr.kind === 'voiced' && fr.formants && (fr.stable || fr.steady))) continue;
    const cls = D.classifyVowel(fr.formants, D.VOWELS, fr.f0); let fit = null;
    if (hold && fr.stable && held && n - held.n <= 10) fit = D.heldVowelFit(fr.formants, held.v, fr.f0);
    if (!fit && cls.cost < 0.07 && cls.ok) fit = Object.assign({}, cls);
    if (!fit) continue;
    if (fr.stable) held = { v: fit.vowel, n };
    out.push({ t: end / sr, s: D.resScore(fit.alpha), key: fit.vowel.key });
  }
  return out;
}
for (const [k, f0] of [['E', 150], ['a', 150], ['a', 210], ['u', 210]]) {
  const v = D.VOWEL_BY_KEY[k], sc = (s) => v.M.map(m => m * s);
  const x = S.voiced(sr, 4, f0, f0, sc(1.09), { from: sc(0.94), to: sc(1.24), trans: 2 });
  const halves = (r) => [0, 1, 2, 3, 4, 5, 6, 7].map(i => r.filter(o => o.t >= i / 2 && o.t < i / 2 + 0.5)).filter(w => w.length >= 5).map(w => D.median(w.map(o => o.s)));
  const mono = (m) => m.every((x, i) => i === 0 || x >= m[i - 1] - 2);
  const was = live(x, false), now = live(x, true);
  const named = now.filter(o => o.key === k).length / now.length;
  check(mono(halves(now)) && named > 0.95 && halves(now).length >= 7, `"${v.cue}" at ${f0} Hz sliding 0.94x -> 1.24x: rises steadily ${halves(now).map(Math.round).join(' ')}, named "${v.cue}" ${Math.round(100 * named)}%`
    + ` (without the hold: ${halves(was).map(Math.round).join(' ')}, named right ${Math.round(100 * was.filter(o => o.key === k).length / Math.max(1, was.length))}%)`);
}

console.log('\n# breathiness skips frames whose window is only partly voice');
{
  const v = D.VOWEL_BY_KEY.a, parts = [];
  for (let i = 0; i < 6; i++) parts.push(S.voiced(sr, 0.18, 190, 185, tract(v, 0.7), { seed: 3 + i, breath: 0.25 }), S.silence(sr, 0.12));
  const x = S.concat(parts), held = S.voiced(sr, 2, 190, 185, tract(v, 0.7), { seed: 3, breath: 0.25 });
  const read = (y) => { const an = new D.Analyzer(sr), hop = Math.round(sr / 60), b = []; for (let end = an.needed; end <= y.length; end += hop) { const fr = an.analyze(y.subarray(0, end)); if (fr.breath != null) b.push(fr.breath); } return b; };
  const bs = read(x), bh = read(held);
  check(bs.length > 0 && D.median(bs) < D.median(bh) + 12, `short syllables read ${Math.round(D.median(bs))} vs the same voice held ${Math.round(D.median(bh))} (within 12)`);
}
console.log('\n# pitch stays on the right octave when the second harmonic sits on F1');
for (const [k, f0] of [['i', 190], ['u', 210]]) {
  const x = S.voiced(sr, 2, f0, f0 * 0.99, tract(D.VOWEL_BY_KEY[k], 0.5), { seed: 5 }), an = new D.Analyzer(sr);
  let n = 0, off = 0;
  for (let end = an.needed; end <= x.length; end += 800) { const fr = an.analyze(x.subarray(0, end)); if (fr.kind === 'voiced') { n++; if (Math.abs(12 * Math.log2(fr.f0 / f0)) > 6) off++; } }
  check(n > 50 && off === 0, `"${D.VOWEL_BY_KEY[k].cue}" at ${f0} Hz: ${off} of ${n} frames an octave off (was most of them)`);
}
console.log(fails ? `\n${fails} failed` : '\nall readings-check checks passed');
process.exit(fails ? 1 : 0);
