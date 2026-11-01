// "Follow my singing" in the Sing tab: node test/singfollow.test.js
// A synthetic singer sings three lines (detached notes, then legato notes with no dip between
// syllables, then a line run on without a breath), with room hum, a held note, a mid-line breath
// and an instrumental break. The highlight must move once per line, at the right moments, and
// never on room sound alone. Also checks the LRC drift correction (lrcSync).
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000, hop = Math.round(fs / 60), V = D.VOWEL_BY_KEY;
let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 - 0.5; };
const st = (n) => 220 * Math.pow(2, n / 12); // semitones from A3
const vk = ['a', 'i', 'ae', 'u', 'o'];

check(D.lineSyllables('Twinkle twinkle little star') === 7, 'syllables: "Twinkle twinkle little star" is 7');
check(D.lineSyllables('[Chorus]') === 0 && D.lineSyllables('') === 0, 'section labels and breaks ask for no syllables');

// Builds a song: segments of {notes: [[semitone, dur]], legato, gap} and silences.
function song(plan) {
  const parts = [], marks = [];
  let pos = 0, k = 0;
  const push = (x) => { parts.push(x); pos += x.length; };
  for (const p of plan) {
    if (p.rest) { push(S.silence(fs, p.rest)); continue; }
    if (p.mark != null) { marks.push([p.mark, pos / fs]); continue; }
    for (const [i, [n, dur]] of p.notes.entries()) {
      const F = V[vk[k++ % vk.length]].W;
      if (p.legato) push(S.voiced(fs, dur, st(n), st(n), F, { seed: k, ramp: i === 0 ? 0.02 : 0.003, level: 0.3 }));
      else { push(S.vowel(fs, dur, st(n), F, { seed: k })); push(S.silence(fs, 0.07)); }
    }
  }
  const x = S.concat(parts);
  for (let i = 0; i < x.length; i++) { // room hiss and mains hum loud enough to pass the analyser's gate
    const t = i / fs;
    x[i] += 0.012 * rnd() + 0.01 * (Math.sin(2 * Math.PI * 100 * t) + 0.5 * Math.sin(2 * Math.PI * 200 * t));
  }
  return { x, marks };
}
function run(x, fol, tickHook) {
  const an = new D.Analyzer(fs), moves = [], onsets = [];
  for (let end = an.needed; end <= x.length; end += hop) {
    const t = end / fs * 1000, r = fol.push(an.analyze(x.subarray(0, end)), t);
    if (r.onset) onsets.push({ t, phrase: r.phrase });
    if (r.line != null) moves.push({ t: t / 1000, line: r.line });
    if (tickHook) tickHook(t, r);
  }
  return { moves, onsets };
}

const lines = [
  { t: null, text: 'Twinkle twinkle little star' },
  { t: null, text: 'How I wonder what you are' },
  { t: null, text: '[Chorus]' },
  { t: null, text: 'Up above the world so high' },
  { t: null, text: 'Like a diamond in the sky' },
];
// line 0: detached notes, last one held 1.6 s, then a 3.5 s instrumental break
// line 1: legato (no dip between notes, only pitch steps), a breath in the middle, then a pause
// line 3: detached, run straight into line 4 with no breath
const plan = [
  { rest: 2.0 },
  { mark: 0 }, { notes: [[0, 0.32], [0, 0.32], [7, 0.32], [7, 0.32], [9, 0.32], [9, 0.32], [7, 1.6]] },
  { rest: 3.5 },
  { mark: 1 }, { legato: true, notes: [[5, 0.34], [5, 0.34], [4, 0.34]] }, { rest: 0.25 }, { legato: true, notes: [[4, 0.34], [2, 0.34], [2, 0.34], [0, 1.0]] },
  { rest: 1.2 },
  { mark: 3 }, { notes: [[7, 0.3], [7, 0.3], [5, 0.3], [5, 0.3], [4, 0.3], [4, 0.3], [2, 0.6]] },
  { mark: 4 }, { notes: [[7, 0.3], [7, 0.3], [5, 0.3], [5, 0.3], [4, 0.3], [4, 0.3], [2, 0.9]] },
  { rest: 2.0 },
];
const { x, marks } = song(plan);
const at = Object.fromEntries(marks);
const fol = new D.SingFollower(lines);
check(fol.cur === 0, 'starts on the first line');
const { moves, onsets } = run(x, fol);
console.log(`  line starts ${marks.map(([l, t]) => `${l}@${t.toFixed(2)}s`).join(', ')}`);
console.log(`  moves ${moves.map(m => `${m.line}@${m.t.toFixed(2)}s`).join(', ')}; ${onsets.length} syllables counted for ${lines.reduce((s, l) => s + D.lineSyllables(l.text), 0)}`);
check(onsets.every(o => o.t / 1000 >= at[0] - 0.05), 'nothing counts in the room sound before singing');
check(moves.map(m => m.line).join() === '1,3,4', `moves 0 -> 1 -> 3 -> 4, skipping the "[Chorus]" label (got ${moves.map(m => m.line).join() || 'none'})`);
const mv = (l) => (moves.find(m => m.line === l) || { t: NaN }).t;
const end0 = at[0] + 6 * 0.39 + 1.6;
check(mv(1) > end0 && mv(1) < at[1], `line 1 shows after the held note ends, during the break (${mv(1).toFixed(2)} s; held note ends ${end0.toFixed(2)} s)`);
check(mv(3) > at[1] + 3 * 0.34 + 0.25 && mv(3) < at[3] + 0.6, `line 1's mid-line breath doesn't move on; the pause after it does (${mv(3).toFixed(2)} s)`);
check(mv(4) > at[3] && mv(4) < at[4] + 1.0, `running into the last line without a breath still moves on (${mv(4).toFixed(2)} s, line starts ${at[4].toFixed(2)} s)`);
check(fol.cur === 4, 'ends on the last line and stays there');

// room sound alone (hum, hiss, a chair creak) for 8 s: no movement, no syllables
{
  const y = song([{ rest: 8 }]).x;
  const blip = S.vowel(fs, 0.03, 160, V.i.W, { seed: 3 }), b0 = Math.round(fs * 4);
  for (let i = 0; i < blip.length; i++) y[b0 + i] += blip[i];
  const f = new D.SingFollower(lines), r = run(y, f);
  check(r.moves.length === 0 && f.cur === 0, `8 s of room sound and a creak never move the lyrics (${r.onsets.length} syllables counted)`);
}
// a manual move resets the count: Back a line and Next line still work with following on
{
  const f = new D.SingFollower(lines);
  f.setLine(f.nextLine(f.cur)); check(f.cur === 1 && f.n === 0, 'Next line moves one line and starts its count afresh');
  f.setLine(f.nextLine(f.cur)); check(f.cur === 3, 'Next line skips a line with no words');
  f.setLine(f.prevLine(f.cur)); check(f.cur === 1, 'Back a line skips it too');
}
// with auto off (timed lyrics), the follower only counts and reports phrases
{
  const f = new D.SingFollower(lines, { auto: false }), r = run(x, f);
  check(r.moves.length === 0, 'with timed lyrics the follower never moves lines itself');
  const ph = r.onsets.filter(o => o.phrase).map(o => o.t / 1000);
  console.log(`  phrases begin at ${ph.map(t => t.toFixed(2)).join(', ')} s`);
  check(ph.length >= 3 && Math.abs(ph[0] - at[0]) < 0.25 && ph.some(t => Math.abs(t - at[1]) < 0.25) && ph.some(t => Math.abs(t - at[3]) < 0.25), 'phrases are found where the lines begin');
}

// LRC drift correction
{
  const L = [{ t: 10, text: 'Twinkle twinkle little star' }, { t: 15, text: 'How I wonder what you are' }, { t: 20, text: '' }, { t: 24, text: 'Up above the world so high' }];
  const need = L.map(l => D.lineSyllables(l.text));
  check(D.lrcSync(L, need, null, -1, 0) === 10, 'LRC: the first phrase starts the clock at the first line');
  check(D.lrcSync(L, need, 13.8, 0, 6) === 15, 'LRC: singer early on the next line (most of this one sung) jumps ahead');
  check(D.lrcSync(L, need, 13.8, 0, 2) === null, 'LRC: a breath partway through a line moves nothing');
  check(D.lrcSync(L, need, 16.4, 1, 0) === 15, 'LRC: singer late (line barely begun) holds the clock back');
  check(D.lrcSync(L, need, 16.4, 1, 4) === null, 'LRC: a breath after most of a line is not mistaken for lateness');
  check(D.lrcSync(L, need, 22.6, 2, 0) === 24, 'LRC: an early start after a break jumps to the next sung line');
  check(D.lrcSync(L, need, 18.0, 1, 7) === null, 'LRC: nothing within 2.5 s, no change');
}
console.log(fails ? `\n${fails} sing-follow check(s) FAILED` : '\nall sing-follow checks passed');
process.exit(fails ? 1 : 0);
