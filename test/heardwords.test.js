// Freestyle "Show words": recognised words put on the take's timeline: node test/heardwords.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

// a take starting at page time 1000 ms; frames every 16 ms, voice in two stretches; frame clock 20 ms behind
const t0 = 1000, lag = 20, frames = [];
for (let ms = 0; ms < 2000; ms += 16) {
  const voiced = (ms >= 200 && ms < 700) || (ms >= 1100 && ms < 1600);
  frames.push({ t: t0 + ms, f0: voiced ? (ms < 1000 ? 180 : 220) : 0, res: voiced ? (ms < 1000 ? 55 : 70) : null });
}
// the recogniser's words, placed on the page clock (voice at page time t0 + ms + lag)
const heard = [
  { w: 'hello', t0: t0 + 200 + lag, t1: t0 + 700 + lag, conf: 0.92 },
  { w: 'there', t0: t0 + 1100 + lag, t1: t0 + 1600 + lag, conf: 0.4 },
  { w: 'friend', t0: t0 + 1700 + lag, t1: t0 + 1900 + lag, tent: 1 },
  { w: 'late', t0: t0 + 5000, t1: t0 + 5200 }, // after the take ended: dropped
];
const h = D.heardWords(frames, t0, 2000, heard, lag);
check(h.words.length === 3, `words inside the take kept (got ${h.words.length})`);
check(h.ws[0] === 200 && h.we[0] === 700, `first word spans its voice (${h.ws[0]}-${h.we[0]})`);
check(h.words[0][1] === 180 && h.words[1][1] === 220, `each word's pitch from its own stretch (${h.words[0][1]}, ${h.words[1][1]})`);
check(h.words[0][2] === 55 && h.words[1][2] === 70, `each word's resonance from its own stretch (${h.words[0][2]}, ${h.words[1][2]})`);
check(h.words[2][1] == null, 'a word over silence has no pitch');
check(!h.unsure[0] && h.unsure[1] && h.unsure[2], 'low-confidence and never-final words are unsure');
check(!D.heardWords(frames, t0, 2000, [{ w: 'x', t0: 1500, t1: 1600, conf: 0 }], lag).unsure[0], 'no confidence given is not unsure');
const sp = D.wordSpans(h.ws, 2000, h.we);
check(sp[0][1] === 700 && sp[1][0] === 1100, 'spans end where the word ends, not at the next word');
check(D.wordSpans([0, 400], 1000)[0][1] === 400, 'without ends, a word still runs to the next');
check(D.heardWords(frames, t0, 2000, [], lag).words.length === 0, 'nothing heard, no words');

if (fails) { console.log(`\n${fails} failed`); process.exit(1); } else console.log('\nall passed');
