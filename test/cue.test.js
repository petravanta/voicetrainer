// Timeline cue readout: what the timeline read at one moment (D.timelineAt): node test/cue.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

const tl = { bin: 50, dur: 500, f0: [0, 200, 210, 0, 0, 0, 0, 0, 0, 220], rs: [null, 60, 62, null, null, null, null, null, null, 70],
  fm: [null, [500, 2000, 2900], [520, 2050, 2950], null, null, null, null, null, null, [400, 2200, 3000]] };
let a = D.timelineAt(tl, 75);
check(a.f0 === 200 && a.res === 60 && a.F[1] === 2000, 'reads the bin under the cue');
a = D.timelineAt(tl, 160);
check(a.f0 === 210 && a.res === 62 && a.F[0] === 520, 'a cue just past the voice reads the nearest bin within 100 ms');
a = D.timelineAt(tl, 300);
check(!a.f0 && a.res == null && a.F == null, 'nothing read more than 100 ms from any voice');
a = D.timelineAt(tl, 9999);
check(a.i === 9 && a.f0 === 220, 'a cue past the end reads the last bin');
check(a.ref === null, 'no reference, no reference numbers');
const ref = { f0: [[60, 230], [400, 250]], rs: [[60, 71], [110, null], [400, 75]] };
a = D.timelineAt(tl, 90, ref);
check(a.ref.f0 === 230 && a.ref.res === 71, 'the reference value nearest the cue');
a = D.timelineAt(tl, 250, ref);
check(a.ref.f0 == null && a.ref.res == null, 'no reference value more than 100 ms away');

check(JSON.stringify(D.spanFormants(tl, 50, 150)) === '[510,2025,2925]', 'a word\'s formants: the median over its bins');
check(D.spanFormants(tl, 150, 450) === null, 'no formants read in a stretch, none given');
check(D.spanFormants({ bin: 50, f0: [1] }, 0, 50) === null, 'a timeline without formants gives none');

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all passed');
