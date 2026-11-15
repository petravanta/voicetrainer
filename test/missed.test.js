// Possibly missed script words in a reading: node test/missed.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

// frames for a reading: each entry [word index, voiced frames, silent frames]
const read = (plan) => plan.flatMap(([i, v, s = 2]) => [...Array(v).fill({ i, f0: 180 }), ...Array(s).fill({ i, f0: 0 })]);
const all = (n) => Array.from({ length: n }, (_, i) => [i, 8]);

{ const r = D.missedWords(read(all(10)), 10); check(r.miss.length === 0 && r.reach === 9, 'every word voiced: nothing missed, all reached'); }
{ // the highlight jumped over words 4 and 5 at a pause
  const r = D.missedWords(read(all(10).filter(([i]) => i !== 4 && i !== 5)), 10);
  check(JSON.stringify(r.miss) === '[4,5]', `words jumped over are possibly missed (${r.miss})`);
}
{ // a word that went by in silence (pace mode), and one with a single voiced frame
  const r = D.missedWords(read(all(10).map(([i, v]) => [i, i === 2 ? 0 : i === 7 ? 1 : v, 6])), 10);
  check(JSON.stringify(r.miss) === '[2,7]', `words with no voice on them are possibly missed (${r.miss})`);
}
{ // stopped after word 5: the rest are not reached, not missed
  const r = D.missedWords(read(all(6)), 12);
  check(r.miss.length === 0 && r.reach === 5, `words after the stop are not reached (reach ${r.reach})`);
}
{ // the highlight lost the voice: most words look missed, so none are flagged
  const r = D.missedWords(read(all(10).map(([i, v]) => [i, i % 3 ? 0 : v])), 10);
  check(r.miss.length === 0 && r.lost, 'when most words look missed, nothing is flagged');
}
{ const r = D.missedWords([], 5); check(r.miss.length === 0 && r.reach === -1, 'no frames: nothing'); }

// Check words: the recogniser's words lined up with the passage
const sc = 'For although the ancient Chinese people took 2 colour light-hearted impressions from every one of the wood blocks.'.split(' ');
{ const r = D.matchScript(sc, 'for although the ancient chinese people took two color light hearted impressions from everyone of the wood blocks'.split(' '));
  check(r.miss.length === 0 && r.last === sc.length - 1, `every word heard (digits, colour/color, split and joined words): none missed (${r.miss})`); }
{ const r = D.matchScript(sc, 'for although the Chinese took two colour light-hearted impressions from every one of the wood blocks'.split(' '));
  check(JSON.stringify(r.miss.map(i => sc[i])) === '["ancient","people"]', `skipped words are missed (${r.miss.map(i => sc[i])})`); }
{ const r = D.matchScript(sc, 'for although the ancient Chinese steeple took two colour light-hearted impressions from every one of the wood blocks'.split(' '));
  check(r.miss.length === 0, 'a misheard word is not counted as missed'); }
{ const r = D.matchScript(sc, 'for although the ancient Chinese people'.split(' '));
  check(r.miss.length === 0 && r.last === 5, `stopping early: the rest is not reached, not missed (last ${r.last})`); }
{ const r = D.matchScript(sc, 'banana window cat dog fish'.split(' '));
  check(r.miss.length === 0 && r.lost, 'recogniser heard something else entirely: nothing flagged'); }

console.log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
