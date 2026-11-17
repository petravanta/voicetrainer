// Voice dimensions panel model (D.voiceDims): node test/dims.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
const g = (m, k) => m.groups.find(x => x.key === k);
const row = (m, gk, rk) => (g(m, gk) || { rows: [] }).rows.find(r => r.key === rk);

// nothing measured: nothing shown, and the unmeasured knobs are still named
const none = D.voiceDims({ goal: 'fem' });
check(none.groups.length === 0, 'nothing measured -> no groups (nothing faked)');
check(['vocal weight', 'twang', 'loudness', 'rhythm'].every(k => none.notMeasured.includes(k)), '... the knobs the app cannot read are named as not measured');

// a full reading, feminine goal
const ee = D.VOWEL_BY_KEY.i, ah = D.VOWEL_BY_KEY.A || D.VOWELS[4];
const fo = D.formantSummary([{ k: ee.key, F: at(ee, 1), n: 20 }, { k: ah.key, F: at(ah, 1), n: 20 }], 'fem', 190);
const m = D.voiceDims({ goal: 'fem', pitchBand: [165, 255], pitch: { median: 150, p10: 120, p90: 240, share: 0.3 }, res: { score: 48, pm: 3 }, fo, breath: 70, sib: { s: 60 } });
check(m.groups.map(x => x.key).join() === 'pitch,res,quality,melody,artic', 'groups in knob order: pitch, resonance, voice quality, melody, articulation');
const p = row(m, 'pitch', 'pitch');
check(p.status === 'off' && p.dir === 1 && p.verdict === '↑ 15 Hz to goal', '150 Hz vs 165-255 (fem) -> off, 15 Hz up');
check(p.zone[0] < p.zone[1] && p.pos < p.zone[0], '... marker sits left of the pitch zone on the bar');
check(row(m, 'pitch', 'share').value === '30%', 'time in target shown when given');
check(row(m, 'pitch', 'pitch').more === '120-240 Hz', 'pitch range under the median');
const r = row(m, 'res', 'res');
check(r.status === 'off' && r.verdict === `↑ ${D.RES_BANDS.fem[0] - 48} to goal`, 'resonance 48 below the feminine band -> off, points to the band');
check(g(m, 'res').fo === fo, 'formants carried in the resonance group');
const b = row(m, 'quality', 'breath');
check(b.status === 'off' && b.dir === -1 && /firmer/.test(b.verdict), 'breathiness 70 over the feminine zone -> off, firmer');
const sp = row(m, 'melody', 'spread');
check(Math.abs(parseFloat(sp.value) - 12) < 0.05 && sp.status === 'info', '120-240 Hz -> 12 semitones of movement, no goal');
check(row(m, 'artic', 's').status === 'ok', '/s/ 60 for a feminine goal -> on goal');
check(!row(m, 'artic', 'sh'), '/ʃ/ not heard -> not listed');

// past the far end still on goal (one-sided, as everywhere else in the app)
const hi = D.voiceDims({ goal: 'fem', pitchBand: [165, 255], pitch: { median: 300 }, res: { score: 90 } });
check(row(hi, 'pitch', 'pitch').status === 'ok' && row(hi, 'res', 'res').status === 'ok', 'feminine goal: above the bands still counts');
check(!g(hi, 'melody'), 'no pitch range -> no melody row');
const ma = D.voiceDims({ goal: 'masc', pitchBand: [85, 155], pitch: { median: 180 }, res: { score: 60 } });
check(row(ma, 'pitch', 'pitch').verdict === '↓ 25 Hz to goal' && row(ma, 'res', 'res').dir === -1, 'masculine goal: too high -> down');

// no resonance reading: shown as no reading, never as a low one
const nr = D.voiceDims({ goal: 'fem', res: { score: null, why: 'high' } });
check(row(nr, 'res', 'res').status === 'na' && row(nr, 'res', 'res').pos === null, 'no resonance -> "no reading", no marker');

// larynx hint: F2 and F3 low together
const low = D.VOWELS.map(v => { const F = at(v, 1); F[1] = v.M[1] * 0.98; F[2] = v.M[2] * 0.98; return { k: v.key, F, n: 20 }; });
const fs = D.formantSummary(low, 'fem', 180);
const lm = D.voiceDims({ goal: 'fem', res: { score: 40 }, fo: fs });
check(!!fs.together === !!g(lm, 'res').note && (!fs.together || /larynx/.test(g(lm, 'res').note)), 'F2+F3 together -> larynx hint in the resonance group');
// one take (formantOffsets) works the same
const one = D.formantOffsets(at(ee, 0.2), ee, 'fem', { f0: 170 });
check(g(D.voiceDims({ goal: 'fem', res: { score: 40 }, fo: one }), 'res').fo === one, 'a single take\'s formant offsets are carried too');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');
