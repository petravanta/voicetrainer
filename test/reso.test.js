// Resonance exercises (Practice > Resonance): big dog / little dog and resonance chains, their checks and demos.
// node test/reso.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const data = require('../data/reso.json'), idx = D.pronIndex(require('../data/pron.json'));
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const R = Math.round, fs = 48000;
const vowelsOf = (w) => D.wordVowelSeq(w, idx);
function run(def, x) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), fr = [];
  for (let end = an.needed; end <= x.length; end += hop) fr.push(D.resoFrame(def, an.analyze(x.subarray(0, end))));
  return fr;
}
const byId = (id) => data.find(x => x.id === id);

// holds: short gaps join, short holds drop, pairs read darker = big whichever came first
{
  const h = (res, f0, n) => Array(n).fill({ res, f0 }), q = (n) => Array(n).fill(null);
  const fr = [...h(30, 200, 40), ...q(5), ...h(30, 200, 10), ...q(20), ...h(70, 202, 45), ...q(20), ...h(50, 200, 12), ...q(20), ...h(72, 200, 40), ...q(20), ...h(35, 240, 40)];
  const r = D.dogCheck(fr, 'fem');
  check(r.holds.length === 4 && r.holds[0].n === 50, `holds: a 5-frame gap joins, a 12-frame hold drops (${r.holds.map(x => x.n).join(' ')})`);
  check(r.pairs.length === 2 && r.pairs[0].ok && r.pairs[1].big.res === 35 && !r.pairs[1].ok && r.pairs[1].drift > 3, 'pairs: little then big still pairs up; a pitch jump of 3 semitones fails the pair');
  check(r.score === 71 && D.dogCheck(fr, 'masc').score === 32.5, `score: the goal's side (fem little ${r.score}, masc big ${D.dogCheck(fr, 'masc').score})`);
}
// chains: each vowel on its own, CHAIN_MIN frames before it counts
{
  const f = (key, res, n) => Array(n).fill({ key, res });
  const r = D.chainCheck([...f('i', 70, 10), null, ...f('u', 40, 5), ...f('x', 99, 20), ...f('u', 44, 5)], ['i', 'u', 'a']);
  check(r.done === 2 && !r.all && !Number.isFinite(r.score) && r.per[1].n === 10 && r.lo === 42 && r.hi === 70, `chain: vowels pooled over rounds, unknown keys ignored (${r.per.map(p => p.key + ':' + p.res).join(' ')})`);
}

for (const goal of ['fem', 'masc']) {
  const fem = goal === 'fem', [lo, hi] = D.RES_BANDS[goal], on = (v) => (fem ? v >= lo : v <= hi);
  const dog = byId('rs-dog');
  const a = D.dogCheck(run(dog, S.resoExample(fs, dog, goal, D.VOWELS)), goal);
  check(a.pairs.length === 2 && a.good === 2 && on(a.score), `${goal} dog demo: ${a.pairs.map(p => `${R(p.big.res)}/${R(p.little.res)} (${p.drift.toFixed(1)} st)`).join(', ')}, kept ${R(a.score)} on target`);
  const b = D.dogCheck(run(dog, S.resoExample(fs, dog, goal, D.VOWELS, { big: 0.45, little: 0.6 })), goal);
  check(b.pairs.length === 2 && b.good === 0, `${goal} dog with hardly any change fails: contrast ${b.pairs.map(p => R(p.contrast)).join(', ')}`);
  const c = D.dogCheck(run(dog, S.resoExample(fs, dog, goal, D.VOWELS, { jump: 5 })), goal);
  check(c.pairs.length === 2 && c.good === 0 && c.pairs.every(p => p.drift > D.DOG.drift), `${goal} dog that drags the pitch up fails: ${c.pairs.map(p => p.drift.toFixed(1)).join(', ')} st`);
  for (const id of ['rs-chain-vowels', 'rs-chain-words', 'rs-chain-phrases']) {
    const def = byId(id);
    const x = id === 'rs-chain-vowels' ? S.resoExample(fs, def, goal, D.VOWELS) : S.resoExample(fs, def, goal, D.VOWELS, { vowelsOf });
    // the words and phrases are said twice, as you would
    const r = D.chainCheck(run(def, id === 'rs-chain-vowels' ? x : S.concat([x, x])), def.vowels);
    check(r.all && on(r.score), `${goal} ${id} demo: ${r.per.map(p => `${p.key} ${R(p.res)} (${p.n})`).join(', ')}, score ${R(r.score)} on target`);
    const y = S.resoExample(fs, def, goal, D.VOWELS, { vowelsOf, res: fem ? 0 : 1 });
    const o = D.chainCheck(run(def, S.concat([y, y])), def.vowels);
    check(!on(o.score) || !o.all, `${goal} ${id} in the other goal's voice: score ${R(o.score)} off target`);
  }
  const vc = byId('rs-chain-vowels');
  const back = D.chainCheck(run(vc, S.resoExample(fs, vc, goal, D.VOWELS, { resOf: (k) => (['o', 'u'].includes(k) ? (fem ? 0 : 1) : (fem ? 1 : 0)) })), vc.vowels);
  const off = back.per.filter(p => !on(p.res)).map(p => p.key);
  check(off.includes('o') && off.includes('u') && !off.includes('i'), `${goal} vowel chain with oh/oo slipping: off target ${off.join(' ')}`);
}
console.log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
