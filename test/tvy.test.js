// Target vs you: the short spectrograms the exercises draw side by side, made from analyzer frames, and the
// numbers under them. node test/tvy.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;
function frames(x) {
  const a = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
  for (let end = a.needed; end <= x.length; end += hop) out.push(a.analyze(x.subarray(0, end)));
  return out;
}
const ex = (def, goal) => frames(S.example(fs, def, goal, D.VOWELS, D.SIBILANTS));
const rowOf = (st, f) => Math.floor(f / st.fmax * st.rows);
// the loudest rows of a strip's middle column
function bright(st, c) { const col = Array.from(st.v.slice(c * st.rows, (c + 1) * st.rows)); return col.map((v, r) => [v, r]).sort((a, b) => b[0] - a[0]); }

for (const style of ['natural', 'classic']) {
  S.setStyle(style);
  // ---- a held vowel: formants marked where they are, bright cells near them, silence trimmed and blank ----
  const ee = { type: 'vowel', vowel: 'i' }, v = D.VOWEL_BY_KEY.i;
  const fem = D.specStrip(ex(ee, 'fem'), { trim: true }), masc = D.specStrip(ex(ee, 'masc'), { trim: true });
  const raw = D.specStrip(ex(ee, 'fem'));
  check(fem.cols < raw.cols && fem.cols > 60 && Math.abs(fem.dur - 1200) < 250, `${style}: "ee" strip trimmed to the sound (${raw.cols} -> ${fem.cols} columns, ${Math.round(fem.dur)} ms)`);
  check(raw.v.slice(0, raw.rows).every(x => x === 0), `${style}: silence before the sound is blank`);
  const rf = D.stripReads(fem);
  check(rf.F.every((f, i) => Math.abs(f / v.W[i] - 1) < 0.08), `${style}: "ee" strip reads F1-F3 ${rf.F.map(Math.round).join('/')} vs set ${v.W.join('/')}`);
  const mid = Math.floor(fem.cols / 2), cell = (f) => Math.max(...[-1, 0, 1].map(d => fem.v[mid * fem.rows + rowOf(fem, f) + d]));
  check(v.W.every(f => cell(f) > 110), `${style}: F1-F3 rows are lit mid-vowel (${v.W.map(cell).join('/')} of 255)`);
  // ---- compared: a masculine "ee" against the feminine target says F2/F3 low ----
  const c = D.compareStrips(fem, masc);
  check(c.big && c.big.r < 1 && (c.big.k === 'F2' || c.big.k === 'F3' || c.big.k === 'F1'), `${style}: masculine vs feminine "ee": biggest gap ${c.big && c.big.k} at ${c.big && c.big.r.toFixed(2)}x`);
  check(c.rows.filter(r => r.k !== 'F1').every(r => r.r < 0.97), `${style}: F2 and F3 both read lower (${c.rows.map(r => r.k + ' ' + r.r.toFixed(2)).join(', ')})`);
  const same = D.compareStrips(fem, D.specStrip(ex(ee, 'fem'), { trim: true }));
  check(!same.big, `${style}: the target against itself has no gap`);
}
S.setStyle('natural');
// ---- hiss: the wide column reaches the /s/ and the strip's centre follows the goal ----
for (const sib of ['s', 'sh']) {
  const def = { type: 'sib', sib }, P = D.SIBILANTS[sib];
  const f = D.specStrip(ex(def, 'fem'), { wide: true, fmax: 11000, trim: true }), m = D.specStrip(ex(def, 'masc'), { wide: true, fmax: 11000, trim: true });
  const rf = D.stripReads(f), rm = D.stripReads(m);
  check(f.cols > 40 && rf.cog && rm.cog && rf.cog > rm.cog, `/${sib}/: feminine hiss centre ${Math.round(rf.cog)} Hz above masculine ${Math.round(rm.cog)} Hz`);
  const mid = Math.floor(f.cols / 2), loud = bright(f, mid).slice(0, 10).map(x => x[1] * f.fmax / f.rows);
  check(D.median(loud) > P.M * 0.6, `/${sib}/: the loud rows sit up in the hiss (median ${Math.round(D.median(loud))} Hz)`);
  const c = D.compareStrips(f, m);
  check(c.big && c.big.k === 'cog' && c.big.r < 1, `/${sib}/: masculine vs feminine: the gap is the hiss centre (${c.big && c.big.r.toFixed(2)}x)`);
}
// ---- a word: hiss and vowel in one strip ----
{
  const def = { type: 'word', sib: 's', vowel: 'i', cue: 'see' };
  const st = D.specStrip(ex(def, 'fem'), { wide: true, fmax: 9000, trim: true }), r = D.stripReads(st);
  check(r.cog && r.F[1] && Math.abs(r.F[1] / D.VOWEL_BY_KEY.i.W[1] - 1) < 0.1, `word "see": reads both the hiss (${Math.round(r.cog)} Hz) and the vowel (F2 ${Math.round(r.F[1])})`);
}
// ---- a whisper: F2/F3 marked, F1 left out ----
{
  const def = { type: 'whisper', kind: 'hold', vowel: 'i' };
  const st = D.specStrip(frames(S.whisperExample(fs, def, 'fem', D.VOWELS, D.WHISPER_SHIFT)), { trim: true });
  const marked = st.fm.filter(Boolean);
  check(marked.length > 20 && marked.every(f => f[0] == null && f[1] > 0), `whisper: ${marked.length} columns marked with F2/F3 only`);
}
// ---- empty input ----
check(D.specStrip([], { trim: true }).cols === 0 && D.compareStrips(D.specStrip([]), D.specStrip([])).big === null, 'no frames: an empty strip and no gap');
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
