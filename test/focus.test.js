// Focus spots: the stretches of a reading worth practising, biggest payoff first: node test/focus.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

const fem = { goal: 'fem', res: [75, 100], pitch: [165, 255] }, masc = { goal: 'masc', res: [0, 25], pitch: [85, 145] };
const texts = 'The sun was low, and the long road home was quiet. A small bird sang on the wire. We walked on slowly.'.split(' ');
const on = { p: 200, r: 85 };
const words = texts.map(() => Object.assign({}, on));
// phrase 2 ("and the long road home was quiet.", words 4-10): four words a little dark
for (const i of [6, 7, 8, 9]) words[i] = { p: 200, r: 62 };
// phrase 3 ("A small bird sang on the wire.", 11-17): one word far off
words[13] = { p: 200, r: 40 };
// phrase 4 ("We walked on slowly.", 18-21): pitch low on two words, no resonance problem
words[19] = { p: 140, r: 80 }; words[20] = { p: 145, r: 80 };

let s = D.focusSpots(texts, words, fem);
check(s.length === 3, `three spots found (got ${s.length})`);
check(s[0].a === 6 && s[0].b === 9, `first spot is the run of slightly dark words, trimmed to them (got ${s[0].a}-${s[0].b})`);
check(s[0].why === 'resonance' && Math.round(s[0].r) === 62, `first spot is about resonance, median 62 (got ${s[0].why}, ${s[0].r})`);
check(s[1].b - s[1].a + 1 === 3 && s[1].a <= 13 && s[1].b >= 13, `a single off word is widened to three words around it (got ${s[1].a}-${s[1].b})`);
check(s.some(x => x.why === 'pitch' && x.a <= 19 && x.b >= 20), 'the low-pitch stretch is found and marked as pitch');
check(s[0].gain >= s[1].gain && s[1].gain >= s[2].gain, 'spots are in order of gain');
check(!s.some(x => x.a <= 3), 'the phrase on target is never a spot');
check(D.focusSpots(texts, texts.map(() => on), fem).length === 0, 'no spots when every word is on the goal');
check(D.focusSpots(texts, words, Object.assign({ n: 1 }, fem)).length === 1, 'n limits the list');
// missing values never count against you
check(D.focusSpots(texts, texts.map(() => ({ p: null, r: null })), fem).length === 0, 'words with no numbers are not spots');
// a masculine goal: too bright and too high are the problems
const mw = texts.map(() => ({ p: 110, r: 15 }));
mw[2] = { p: 110, r: 60 }; mw[3] = { p: 180, r: 20 };
s = D.focusSpots(texts, mw, masc);
check(s.length === 1 && s[0].a === 1 && s[0].b === 3 && s[0].why === 'both', `masculine goal: bright + high words found, widened back inside the phrase (got ${JSON.stringify(s.map(x => [x.a, x.b, x.why]))})`);
// a high pitch is fine for a feminine goal, a low one is fine for a masculine goal
check(D.wordShortfall({ p: 320, r: 90 }, fem).p === 0 && D.wordShortfall({ p: 70, r: 10 }, masc).p === 0, 'only the far side of the pitch band counts');
check(Math.abs(D.wordShortfall({ p: 165 / Math.pow(2, 2 / 12), r: 75 }, fem).p - 10) < 1e-6, 'two semitones low counts as 10 points');

// merging readings of one passage: the median per word, readings of another length left out
const rep = (r) => texts.map((t, i) => [t, 200, i === 6 ? r : 85]);
const m = D.mergeWordReports([rep(50), texts.slice(1).map(t => [t, 100, 0]), rep(60), rep(80)]);
check(m.length === texts.length && m[6].r === 60 && m[6].p === 200 && m[0].text === 'The', `merged report takes each word's median (got ${m[6].r})`);
check(D.clipStats([{ p: 150, r: 40 }, { p: null, r: 60 }, { p: 170, r: null }]).r === 50, 'clip stats: median resonance of the words that have one');

// a spot's numbers come from its off words, so a try is compared on the same words
const one = D.focusSpots(texts, words, fem).find(x => x.a <= 13 && x.b >= 13);
check(one.r === 40 && one.ri.length === 1, `a spot with one off word reports that word (got ${one.r})`);
check(D.spotStats(one, [{ r: 90 }, { r: 70 }, { r: 90 }]).r === 70 && D.spotStats(one, [{ r: 90 }, { r: null }, { r: 80 }]).r === 85, 'a try is scored on the same word, or the whole spot if that word had no score');

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all focus checks passed');
