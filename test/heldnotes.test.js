// Held-note histogram for the Sing review: binning by semitone, steadiness, gaps and pauses
// node test/heldnotes.test.js
const D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const near = (a, b, e = 0.03) => Math.abs(a - b) <= e;

// build 60 fps frames from segments [seconds, midi or 0 (unvoiced) or fn(t), res]
function song(segs, t0 = 0) {
  const out = []; let t = t0;
  for (const [secs, note, res] of segs) {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      const m = typeof note === 'function' ? note(i / 60) : note;
      out.push({ t, f0: m ? hz(m) : 0, res: res == null ? NaN : res }); t += 1000 / 60;
    }
  }
  return out;
}
const bin = (h, name) => h.bins.find(b => b.note === name);

// three held notes: 2 s on G3, 1 s on A3, 0.5 s on D4, with breaths between
let h = D.heldNotes(song([[2, 55, 60], [0.3, 0], [1, 57, 70], [0.3, 0], [0.5, 62]]));
check(h.bins.map(b => b.note).join(',') === 'G3,A3,D4', `semitone bins G3, A3, D4 (got ${h.bins.map(b => b.note)})`);
check(near(bin(h, 'G3').secs, 2) && near(bin(h, 'A3').secs, 1) && near(bin(h, 'D4').secs, 0.5), 'seconds per note match the holds');
check(h.peak.note === 'G3' && h.lo === 55 && h.hi === 62 && near(h.total, 3.5), 'peak, range and total');
check(bin(h, 'G3').res === 60 && bin(h, 'D4').res === null, 'median resonance per note, none when no vowels were scored');

// off-centre singing and vibrato stay in one bin: 40 cents sharp of G3 with a ±40 cent wobble at 5.5 Hz
h = D.heldNotes(song([[2, (t) => 55.4 + 0.4 * Math.sin(2 * Math.PI * 5.5 * t)]]));
check(h.bins.length === 1 && near(h.bins[0].secs, 2), `vibrato across a bin edge counts as one held note (got ${h.bins.map(b => b.note + ' ' + b.secs.toFixed(2))})`);

// a slow glide never settles, so it isn't a held note
h = D.heldNotes(song([[2, (t) => 50 + 6 * t]]));
check(h.total < 0.6, `a slide over an octave isn't counted as holding notes (got ${h.total.toFixed(2)} s)`);

// short notes (under 0.25 s) don't count; a 50 ms dropout inside a hold doesn't split it
h = D.heldNotes(song([[0.15, 60], [0.3, 0], [0.8, 64], [0.05, 0], [0.8, 64]]));
check(h.bins.length === 1 && h.bins[0].note === 'E4' && near(h.bins[0].secs, 1.6), `a quick note is skipped, a tiny gap is bridged (got ${h.bins.map(b => b.note + ' ' + b.secs.toFixed(2))})`);

// a single octave blip in the middle of a hold doesn't break it
const blip = song([[1, 57]]); blip[30].f0 = hz(69);
h = D.heldNotes(blip);
check(h.bins.length === 1 && h.bins[0].note === 'A3', 'one octave-error frame inside a hold is ignored');

// a pause (no frames for 20 s) adds no time
h = D.heldNotes(song([[1, 55]]).concat(song([[1, 55]], 30000)));
check(h.bins.length === 1 && near(h.bins[0].secs, 2, 0.12), `paused time between frames isn't counted (got ${h.bins[0] && h.bins[0].secs.toFixed(2)} s)`);

// nothing voiced: empty
h = D.heldNotes(song([[2, 0]]));
check(h.bins.length === 0 && h.peak === null && h.lo === null && h.total === 0, 'silence gives an empty histogram');
check(D.midiName(61) === 'C#4' && D.midiName(47) === 'B2', 'note names');

if (fails) { console.error(fails + ' failing'); process.exit(1); }
