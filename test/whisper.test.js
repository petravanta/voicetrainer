// Whisper analysis and the whisper exercise demos: node test/whisper.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
function run(x, fs) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), fr = [];
  for (let end = an.needed; end <= x.length; end += hop) fr.push(an.analyze(x.subarray(0, end)));
  return fr;
}
const pct = (x) => Math.round(x * 100);

for (const fs of [44100, 48000]) {
  // whispered vowels: formants read without a tone, F2 and F3 within ~8%
  for (const key of ['i', 'E', 'a', 'u']) for (const g of ['M', 'W']) {
    const F = D.VOWEL_BY_KEY[key][g];
    const fr = run(S.whispered(fs, 1.2, () => F), fs).filter(f => f.whisperF);
    const m = [0, 1, 2].map(i => D.median(fr.map(f => f.whisperF[i])));
    const err = [1, 2].map(i => Math.abs(Math.log(m[i] / F[i])));
    check(fr.length > 40 && Math.max(...err) < 0.08, `${fs} whispered ${key} ${g}: F ${m.map(Math.round).join('/')} vs ${F.join('/')} (${fr.length} fr)`);
  }
  // no whisper reading on a voiced vowel or a sibilant
  const v = run(S.voiced(fs, 1, 200, 190, D.VOWEL_BY_KEY.a.W), fs).filter(f => f.whisperF).length;
  check(v === 0, `${fs} voiced vowel gives no whisper frames (${v})`);
  for (const sib of ['s', 'sh']) {
    const n = run(S.sibilant(fs, 1, D.SIBILANTS[sib].W), fs).filter(f => f.whisperF).length;
    check(n === 0, `${fs} /${sib}/ gives no whisper frames (${n})`);
  }
}

// siren legs counter
check(D.sirenLegs([0, 0.05, 0.2, 0.1, -0.05, 0.1, 0.2]).legs === 3, 'sirenLegs counts up, down, up');
check(D.sirenLegs([0, 0.05, -0.03, 0.06, 0.02]).legs === 0, 'sirenLegs ignores small wobbles');

// demos: the siren passes only when it moves and is whispered; "kee" scores per goal
const fs = 48000;
for (const goal of ['fem', 'masc']) {
  const siren = { kind: 'siren', vowel: 'u' }, kee = { kind: 'hold', vowel: 'i' };
  const legs = (o) => {
    const b = run(S.whisperExample(fs, siren, goal, D.VOWELS, D.WHISPER_SHIFT, o), fs).filter(f => f.whisperF).map(f => D.whisperBrightness(f.whisperF));
    return D.sirenLegs(b);
  };
  const ok = legs({}), flat = legs({ wrong: 'flat' }), vo = legs({ wrong: 'voiced' });
  check(ok.legs >= 4, `${goal} siren demo: ${ok.legs} legs, span ${pct(ok.span)}%`);
  check(flat.legs === 0, `${goal} flat whisper: ${flat.legs} legs, span ${pct(flat.span)}%`);
  check(vo.legs === 0, `${goal} voiced siren is not counted: ${vo.legs} legs`);
  for (const g2 of ['fem', 'masc']) {
    const fr = run(S.whisperExample(fs, kee, g2, D.VOWELS, D.WHISPER_SHIFT), fs).filter(f => f.whisperF);
    const sc = D.median(fr.map(f => D.whisperFit(f.whisperF, D.VOWEL_BY_KEY.i).alpha * 100));
    const want = g2 === 'fem' ? 100 : 0;
    if (goal === 'fem') check(fr.length > 40 && Math.abs(sc - want) < 25, `whispered kee at ${g2} values scores ${Math.round(sc)} (${fr.length} fr)`);
  }
  const voicedKee = run(S.whisperExample(fs, kee, goal, D.VOWELS, D.WHISPER_SHIFT, { wrong: 'voiced' }), fs).filter(f => f.whisperF).length;
  check(voicedKee < 5, `${goal} voiced kee gives no whisper reading (${voicedKee} fr)`);
}

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all whisper checks passed');
