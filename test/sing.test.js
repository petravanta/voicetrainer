// Sing along: lyrics parsing (plain and LRC), finding the current line, and the per-line summary
// from a synthetic singer whose first line is bright and second line dark: node test/sing.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

// plain text: one entry per non-blank line, untimed
const plain = D.parseLyrics('First line\n\n  Second   line \r\nThird line\n');
check(!plain.timed && plain.lines.length === 3 && plain.lines[1].text === 'Second line' && plain.lines[0].t === null, 'plain lyrics: three untimed lines, spaces tidied');

// LRC: metadata dropped, several stamps per line, offset, enhanced word stamps, an instrumental gap
const lrc = D.parseLyrics([
  '[ti:Test song]', '[ar:Nobody]', '[length: 03:10]', '[offset:+500]',
  '[00:12.40]Hello <00:12.40>there <00:13.00>friend',
  '[00:20.00][01:05.5]Chorus line',
  '[00:30.00]',
  '[00:34:20]Last line',
].join('\n'));
check(lrc.timed, 'LRC lyrics are timed');
check(lrc.lines.length === 5, `LRC: 5 lines including the repeated chorus and the break (got ${lrc.lines.length})`);
check(lrc.lines[0].text === 'Hello there friend' && Math.abs(lrc.lines[0].t - 11.9) < 1e-6, 'LRC: word stamps dropped, offset of +500 ms shows lines sooner');
check(lrc.lines.map(l => l.text).join('|') === 'Hello there friend|Chorus line||Last line|Chorus line', 'LRC: lines sorted by time, chorus appears twice');
check(Math.abs(lrc.lines[3].t - 33.7) < 1e-6, 'LRC: mm:ss:xx stamps read too');
check(D.parseLyrics('[00:01.00]\n[00:02.00]Words').lines[0].text === 'Words', 'LRC: a leading instrumental stamp is skipped');
check(D.parseLyrics('').lines.length === 0, 'empty lyrics: no lines');

// the line at a time
const L = lrc.lines;
check(D.lyricLineAt(L, 5) === -1 && D.lyricLineAt(L, 11.9) === 0 && D.lyricLineAt(L, 25) === 1 && D.lyricLineAt(L, 31) === 2 && D.lyricLineAt(L, 999) === 4, 'line lookup by time');

// A synthetic singer: line 0 sung on G3 and C4 with feminine formants, line 1 on C3 and E3 with masculine
// ones, a breath between. Frames are analysed the same way as the app does and filed by line.
const fs = 48000, keys = ['a', 'i', 'ae'];
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
const plan = [[0, 196, 1], [0, 261.6, 1], [-1, 0, 0], [1, 130.8, 0], [1, 164.8, 0]];
const parts = [], spans = [];
let pos = 0;
for (const [n, [line, f0, a]] of plan.entries()) {
  for (const [k, key] of keys.entries()) {
    const x = line < 0 ? S.silence(fs, 0.3) : S.vowel(fs, 0.5, f0, at(D.VOWEL_BY_KEY[key], a), { seed: 10 * n + k + 1 });
    spans.push([pos, pos + x.length, line]); pos += x.length; parts.push(x);
    if (line < 0) break;
  }
}
const x = S.concat(parts), an = new D.Analyzer(fs), hop = Math.round(fs / 60), frames = [];
for (let end = an.needed; end <= x.length; end += hop) {
  const fr = an.analyze(x.subarray(0, end)), mid = end - an.needed / 2;
  const sp = spans.find(s => mid >= s[0] && mid < s[1]); if (!sp || sp[2] < 0) continue;
  let res = NaN;
  if (fr.kind === 'voiced' && fr.formants && fr.stable) {
    const cls = D.classifyVowel(fr.formants);
    if (cls.cost < 0.07) res = Math.max(0, Math.min(100, cls.alpha * 100));
  }
  frames.push({ line: sp[2], f0: fr.kind === 'voiced' ? fr.f0 : 0, res });
}
const sum = D.singSummary(frames, 3);
for (const s of sum) console.log(`  line ${s.line}: res ${s.res == null ? '--' : Math.round(s.res)} (${s.vowelFrames} vowel frames), ${s.f0 ? `${D.hzToNote(s.lo)}-${D.hzToNote(s.hi)}, ${s.span.toFixed(1)} st` : 'no pitch'}`);
check(sum[0].res != null && sum[0].res >= 75, 'bright line scores in the feminine band');
check(sum[1].res != null && sum[1].res <= 25, 'dark line scores in the masculine band');
check(D.hzToNote(sum[0].lo) === 'G3' && D.hzToNote(sum[0].hi) === 'C4', 'bright line range G3 to C4');
check(D.hzToNote(sum[1].lo) === 'C3' && D.hzToNote(sum[1].hi) === 'E3', 'dark line range C3 to E3');
check(sum[2].f0 === null && sum[2].res === null, 'a line with no frames has no summary');

console.log(fails ? `${fails} check(s) failed` : 'all sing-along checks passed');
process.exit(fails ? 1 : 0);
