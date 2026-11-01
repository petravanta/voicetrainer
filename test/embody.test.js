// Embodied voice ("uwu with feeling"): the feelings list, dealing without repeats, and the synthetic
// "uwu" landing in the goal zone and being counted as separate takes. node test/embody.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const feelings = require('../data/emotions.json'), embody = require('../data/embody.json');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

check(feelings.length >= 60, `${feelings.length} feelings`);
check(new Set(feelings.map(f => f.family)).size >= 8, 'feelings span at least 8 families');
check(embody.every(e => e.reflect.length >= 3), 'every embody exercise has reflection questions');

// dealing: no repeats within the recent window, and a new family each time while possible
let seed = 7; const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const recent = [], RECENT = 20;
let repeats = 0, sameFamily = 0;
for (let i = 0; i < 500; i++) {
  const f = D.dealFeeling(feelings, recent, rand), prev = feelings.find(e => e.id === recent[recent.length - 1]);
  if (recent.includes(f.id)) repeats++;
  if (prev && prev.family === f.family) sameFamily++;
  recent.push(f.id); if (recent.length > RECENT) recent.shift();
}
check(repeats === 0, `no feeling repeats within ${RECENT} deals (${repeats})`);
check(sameFamily === 0, `no two feelings in a row from one family (${sameFamily})`);
check(D.dealFeeling(feelings.slice(0, 1), [feelings[0].id]) === feelings[0], 'a one-feeling list still deals');
const two = feelings.slice(0, 2);
check(D.dealFeeling(two, [two[0].id, two[1].id], () => 0) === two[0], 'when everything is recent, it avoids only the last one');

// takes: short dips stay in one take, a pause ends it, short blips are ignored
const on = (n) => Array(n).fill(true), off = (n) => Array(n).fill(false);
check(D.voicedTakes([...on(20), ...off(5), ...on(30), ...off(30)]).length === 1, 'a dip for the "w" stays in one take');
check(D.voicedTakes([...on(30), ...off(30), ...on(30), ...off(30)]).length === 2, 'a pause splits two takes');
check(D.voicedTakes([...on(5), ...off(30)]).length === 0, 'a short blip is not a take');
check(D.voicedTakes([...on(40)]).length === 0, 'a take still going is not counted yet');

// the synthetic uwu, analysed like the microphone: two takes, pitch and resonance in the goal zone
function run(x, fs) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), fr = [];
  for (let end = an.needed; end <= x.length; end += hop) fr.push(an.analyze(x.subarray(0, end)));
  return fr;
}
for (const fs of [44100, 48000]) for (const goal of ['fem', 'masc']) {
  const fr = run(S.uwu(fs, goal, D.VOWELS), fs);
  const takes = D.voicedTakes(fr.map(f => f.kind === 'voiced'));
  const f0 = D.median(fr.filter(f => f.kind === 'voiced').map(f => f.f0)), band = D.PITCH_BANDS[goal];
  const res = [];
  for (const f of fr) if (f.kind === 'voiced' && f.formants && f.stable) { const c = D.classifyVowel(f.formants); if (c.cost < 0.07) res.push(Math.max(0, Math.min(100, c.alpha * 100))); }
  const r = D.median(res), zone = goal === 'fem' ? r >= 75 : r <= 25;
  check(takes.length === 2, `${fs} ${goal} uwu said twice: ${takes.length} takes`);
  check(f0 >= band[0] && f0 <= band[1], `${fs} ${goal} uwu pitch ${Math.round(f0)} Hz in ${band.join('-')}`);
  check(res.length >= 20 && zone, `${fs} ${goal} uwu resonance ${Math.round(r)} (${res.length} frames)`);
}

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all embody checks passed');
