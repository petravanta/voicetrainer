// Synthetic-voice checks for the analysis pipeline: node test/dsp.test.js
const D = require('../src/dsp.js');
const S = require('../src/synth.js');

let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

// Stream a signal through the Analyzer in ~60 fps hops, like the browser loop.
function run(x, fs) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), frames = [];
  for (let end = an.needed; end <= x.length; end += hop) frames.push(an.analyze(x.subarray(0, end)));
  return frames;
}

for (const fs of [48000, 44100]) {
  console.log(`\n# sample rate ${fs}`);
  for (const [label, t, f0] of [['male', 0, 110], ['female', 1, 210], ['between', 0.5, 160]]) {
    const errs = [], alphas = [], ids = [], pitch = [];
    for (const v of D.VOWELS) {
      const F = v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
      const fr = run(S.vowel(fs, 0.8, f0, F), fs).filter(f => f.kind === 'voiced' && f.formants && f.stable);
      if (!fr.length) { ids.push(false); continue; }
      const est = [0, 1, 2].map(i => D.median(fr.map(f => f.formants[i])));
      errs.push(...est.map((e, i) => Math.abs(e / F[i] - 1)));
      alphas.push(D.fitVowel(est, v).alpha);
      const cls = fr.map(f => D.classifyVowel(f.formants).vowel.key);
      const top = D.median(fr.map(f => f.f0));
      pitch.push(Math.abs(top / f0 - 1));
      const hits = cls.filter(k => k === v.key).length / cls.length;
      ids.push(hits > 0.5);
      console.log(`  ${label.padEnd(7)} ${v.cue.padEnd(9)} true ${F.map(Math.round).join('/')}  est ${est.map(Math.round).join('/')}  alpha(known) ${D.fitVowel(est, v).alpha.toFixed(2)}  id ${(hits * 100).toFixed(0)}%`);
    }
    const mErr = D.median(errs), mA = D.median(alphas);
    check(mErr < 0.06, `${label}: median formant error ${(mErr * 100).toFixed(1)}%`);
    check(Math.abs(mA - t) < 0.3, `${label}: median resonance ${(mA * 100).toFixed(0)} (expected ${t * 100})`);
    check(ids.filter(Boolean).length >= 8, `${label}: vowel identified for ${ids.filter(Boolean).length}/12`);
    check(D.median(pitch) < 0.03, `${label}: pitch error ${(D.median(pitch) * 100).toFixed(1)}%`);
  }

  for (const [lab, peak] of [['sh masc', 3500], ['sh fem', 4300], ['s masc', 6200], ['s fem', 7800]]) {
    const fr = run(S.sibilant(fs, 0.6, peak), fs);
    const fric = fr.filter(f => f.kind === 'fricative');
    const cog = D.median(fric.map(f => f.cog));
    const sib = D.median(fric.map(f => (f.sib === 's' ? 1 : 0)));
    console.log(`  ${lab}: fricative frames ${fric.length}/${fr.length}, CoG ${Math.round(cog)} Hz, class ${sib ? 's' : 'sh'}`);
    check(fric.length / fr.length > 0.7, `${lab}: detected as fricative`);
    check((sib === 1) === lab.startsWith('s '), `${lab}: classified as ${lab.split(' ')[0]}`);
  }
}

// silence stays silent
const quiet = run(new Float32Array(48000).map(() => (Math.random() - 0.5) * 0.002), 48000);
check(quiet.every(f => f.kind === 'silence'), 'low noise reads as silence');

// Breathiness: rises steadily with airflow noise, and does not depend much on pitch or vowel.
for (const fs of [44100, 48000]) for (const [f0, vk] of [[110, 'u'], [210, 'i'], [180, 'a']]) {
  const v = D.VOWEL_BY_KEY[vk], F = f0 > 150 ? v.W : v.M, got = [];
  for (const br of [0, 0.25, 0.5]) {
    const x = S.voiced(fs, 1.0, f0, f0 * 0.95, F, { breath: br });
    const an = new D.Analyzer(fs), hop = Math.round(fs / 60), b = [];
    for (let end = an.needed; end <= x.length; end += hop) { const fr = an.analyze(x.subarray(0, end)); if (fr.breath != null) b.push(fr.breath); }
    got.push(b.length > 30 ? D.median(b) : NaN);
  }
  const ok = got[0] < 12 && got[1] > 20 && got[1] < 50 && got[2] > got[1] + 10;
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + `breathiness ${fs} Hz, ${f0} Hz "${vk}": clear ${Math.round(got[0])}, light air ${Math.round(got[1])}, breathy ${Math.round(got[2])}`);
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
