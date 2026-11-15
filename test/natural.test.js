// The natural practice voice (LF glottal source, jitter, shimmer, breath, joined runs) must read
// the same as the classic one: rerun the analyzer tests that use the synth with it switched on.
// node test/natural.test.js
const { spawnSync } = require('child_process'), path = require('path');
const S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
// the LF pulse is a flow derivative: each cycle must sum to zero (the folds end where they began)
for (const rd of [0.3, 0.95, 1.6, 2.7]) {
  const { tab } = S.lfTable(rd); let s = 0, mn = 0;
  for (let i = 0; i < tab.length - 1; i++) { s += tab[i]; mn = Math.min(mn, tab[i]); }
  check(Math.abs(s / (tab.length - 1)) < 1e-3 && Math.abs(mn + 1) < 0.02, `LF pulse Rd ${rd}: zero net flow, peak closing -1`);
}
// a natural voiced sound has the requested length and is voiced
{
  S.setStyle('natural');
  const x = S.voiced(48000, 0.5, 200, 200, [850, 1500, 2800], { seed: 3 });
  const zc = []; for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) zc.push(i);
  check(x.length === 24000 && zc.length > 100, 'natural voiced: right length, voiced');
  S.setStyle('classic');
}
const dir = __dirname, pre = path.join(dir, 'natural-preload.js');
for (const t of ['examples', 'dsp', 'reading', 'readres', 'embody', 'wordvowels', 'vowelmap', 'coach', 'readcheck', 'sing', 'singread', 'focus', 'follow', 'rigor', 'whisper']) {
  const r = spawnSync(process.execPath, ['-r', pre, path.join(dir, t + '.test.js')], { encoding: 'utf8' });
  const bad = (r.stdout || '').split('\n').filter(l => l.startsWith('FAIL'));
  check(r.status === 0, `${t} with the natural voice${bad.length ? ': ' + bad.join('; ') : ''}`);
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall natural voice checks passed');
process.exit(fails ? 1 : 0);
