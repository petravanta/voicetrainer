// Your own take as a reference: the microphone ring it is cut from, how it is stored (16-bit) and read back at
// another sample rate, and that a kept take reads the same formants as the sound it came from. node test/mine.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
// ---- the ring: newest samples kept, spans asked for by absolute count ----
const r = new D.SampleRing(10), seq = (a, n) => Float32Array.from({ length: n }, (_, i) => a + i);
r.push(seq(0, 4)); r.push(seq(4, 4)); r.push(seq(8, 5)); // 13 pushed, 3..12 kept
check(r.total === 13, `ring counts every sample (${r.total})`);
check(Array.from(r.slice(5, 9)).join() === '5,6,7,8', 'a span across the wrap comes out in order');
check(Array.from(r.slice(0, 5)).join() === '3,4', 'what was already dropped is left out');
check(r.slice(11, 20).length === 2, 'a span past the newest sample stops there');
r.push(seq(100, 25));
check(Array.from(r.slice(r.total - 3, r.total)).join() === '122,123,124', 'a block longer than the ring keeps its end');
// ---- storage ----
const x = Float32Array.from({ length: 1000 }, (_, i) => 0.8 * Math.sin(i / 7));
const back = D.fromPcm16(D.toPcm16(x));
check(Math.max(...x.map((v, i) => Math.abs(v - back[i]))) < 1 / 32000, '16-bit round trip is within one step');
check(D.toPcm16(Float32Array.of(2, -2)).join() === '32767,-32768', 'loud samples clip instead of wrapping');
// ---- the span behind a run of frames ----
const sp = D.takeSpan([48000, 60000, NaN, 72000], 4096, 48000);
check(sp.a === Math.round(48000 - 4096 - D.MINE_PAD_S * 48000) && sp.z === Math.round(72000 + D.MINE_PAD_S * 48000), `span covers the first frame's window to the last frame, padded (${sp.a}-${sp.z})`);
check(D.takeSpan([NaN, NaN], 4096, 48000) === null, 'no span without counts (not the microphone)');
const long = D.takeSpan([0, 48000 * 20], 4096, 48000);
check((long.z - long.a) / 48000 <= D.MINE_MAX_S + 1e-9, `a long run keeps its last ${D.MINE_MAX_S} s`);
// ---- a kept take, stored and read back at 44.1 kHz, reads like the original ----
function frames(y, fs) { const a = new D.Analyzer(fs), hop = Math.round(fs / 60), out = []; for (let end = a.needed; end <= y.length; end += hop) out.push(a.analyze(y.subarray(0, end))); return out; }
S.setStyle('classic');
const ee = S.example(48000, { type: 'vowel', vowel: 'i' }, 'fem', D.VOWELS, D.SIBILANTS);
const kept = D.resample(D.fromPcm16(D.toPcm16(ee)), 48000, 44100);
check(Math.abs(kept.length - ee.length * 44100 / 48000) <= 1, 'resampled to the new rate');
const a0 = D.stripReads(D.specStrip(frames(ee, 48000), { trim: true })), a1 = D.stripReads(D.specStrip(frames(kept, 44100), { trim: true }));
check(a0.F.every((f, i) => Math.abs(a1.F[i] / f - 1) < 0.03), `kept "ee" reads F1-F3 ${a1.F.map(Math.round).join('/')} vs ${a0.F.map(Math.round).join('/')}`);
check(D.resample(x, 48000, 48000) === x, 'same rate leaves it alone');
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
