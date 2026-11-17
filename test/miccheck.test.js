// Microphone and voice check: each common problem is named, and a clean setup isn't blamed. node test/miccheck.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const sr = 48000;
const tract = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const noise = (n, a) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = a * (rnd() - 0.5) * 2; return x; };
function lowpass(x, fc) { // windowed sinc, like a phone line or an 8 kHz Bluetooth call
  const taps = 301, m = 150, h = new Float32Array(taps); let s = 0;
  for (let i = 0; i < taps; i++) { const t = i - m; h[i] = (t === 0 ? 2 * fc / sr : Math.sin(2 * Math.PI * fc / sr * t) / (Math.PI * t)) * (0.42 - 0.5 * Math.cos(2 * Math.PI * i / (taps - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (taps - 1))); s += h[i]; }
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { let a = 0; for (let k = 0; k < taps && k <= i; k++) a += h[k] * x[i - k]; y[i] = a / s; }
  return y;
}
const speech = S.readText(sr, 'She sells sea shells by the seashore and the shells she sells'.split(' '), D.VOWELS, { pitch: 210, res: 100 }).x;
function seg(o = {}) {
  const p = o.f0 || 210, vo = (k) => S.voiced(sr, 2.5, p, p * 0.976, tract(D.VOWEL_BY_KEY[k], 1), { seed: 3, level: 0.3, breath: o.breath || 0 });
  return { quiet: noise(sr * 2, 0.0005), ah: vo('a'), ee: vo('i'), speech };
}
const map = (s, fn) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, fn(v, k)]));
const run = (s, info) => D.micVoiceCheck(s, sr, info);

const clean = run(seg());
check(clean.main === null && clean.checks.every(c => c.level === 'good'), `clean voice and microphone: nothing blamed (${clean.checks.filter(c => c.level !== 'good').map(c => c.id).join(', ') || 'all good'})`);
check(clean.data.topHz > 8000, `clean: sound range reaches ${clean.data.topHz} Hz`);
{ // the first-harmonic line: a firm "ah" is balanced, a breathy one has a strong fundamental (and is told it's handled)
  const h = (r) => r.checks.find(c => c.id === 'h1');
  S.setStyle('natural'); const f = run(seg()), b = run(seg({ breath: 1, f0: 180 })); S.setStyle('classic');
  check(h(f) && h(f).title === 'Balanced fundamental' && h(b) && h(b).title === 'Strong fundamental',
    `H1-H2 on "ah": firm ${f.data.h1h2} dB "${h(f) && h(f).title}", breathy ${b.data.h1h2} dB "${h(b) && h(b).title}"`);
}
const phone = run(map(seg(), (x) => lowpass(x, 3400)), { label: 'Headset (Hands-Free AG Audio)' });
check(phone.main === 'band' && phone.data.topHz < 4600 && /Bluetooth/.test(phone.checks.find(c => c.id === 'band').say), `phone-band microphone: named first (${phone.data.topHz} Hz), Bluetooth headset mentioned`);
const clip = run(map(seg(), (x, k) => (k === 'quiet' ? x : x.map(v => Math.max(-1, Math.min(1, v * 8))))));
check(clip.main === 'clip', 'clipping: named first');
const gated = run(Object.assign(seg(), { quiet: new Float32Array(sr * 2) }));
check(gated.main === 'gate', 'room cut to digital silence: processing named');
const noisy = run(map(seg(), (x) => { const y = Float32Array.from(x); for (let i = 0; i < y.length; i++) y[i] += 0.08 * (rnd() - 0.5) * 2; return y; }));
check(noisy.main === 'noise', `noisy room: named first (${noisy.data.snr} dB, main ${noisy.main})`);
const airy = run(map(seg({ breath: 0.85 }), (x, k) => (k === 'ah' || k === 'ee' ? x.map(v => v * 0.3) : x)));
check(airy.main === 'breath', `very breathy held vowels: named (main ${airy.main}, ${airy.checks.filter(c => c.level !== 'good').map(c => c.id).join(' ')})`);
console.log(fails ? `\n${fails} failed` : '\nall mic check checks passed');
process.exit(fails ? 1 : 0);
