// Word edges placed again after a reading. D.alignByClass (what the app uses): each word's spelling as a chain of
// sound classes matched against the frames' kinds, with pauses and noise kept apart. D.alignWords (the fallback): from
// pauses, loudness dips and voicing breaks, with the passage's expected word lengths and the neural voice's timing.
// node test/align.test.js
const fsys = require('fs'), path = require('path'), cp = require('child_process');
const D = require('../src/dsp.js'), S = require('../src/synth.js');
const PRON = D.pronIndex(require('../data/pron.json'));
const texts = require('../data/texts.json');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const fs = 48000;

// analyzer frames the way a live reading stores them (t in ms, f0, e vowel-band loudness, a overall loudness, kd kind);
// i is the live highlight's word, given here by tag(t)
function frames(x, tag, lagMs = 40) {
  const an = new D.Analyzer(fs), hop = Math.round(fs / 60), out = [];
  for (let end = an.needed; end <= x.length; end += hop) {
    const fr = an.analyze(x.subarray(0, end)), t = end / fs * 1000 - lagMs;
    out.push({ i: tag(t), t, f0: fr.kind === 'voiced' ? fr.f0 : 0, e: fr.ve, a: 20 * Math.log10(fr.rms + 1e-9),
      kd: fr.kind === 'voiced' ? 'v' : fr.kind === 'fricative' ? 's' : fr.kind === 'silence' ? '.' : 'o' });
  }
  return out;
}
const errs = (ws, truth) => ws.map((s, i) => Math.abs(s - truth[i])).sort((a, b) => a - b);
const med = (a) => a[a.length >> 1];

// ---- the case from a real reading: "beautiful" took "colors." too, "colors." got a sliver ----
{
  S.setStyle('natural');
  const words = 'The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch,'.split(' ');
  const r = S.readText(fs, words, D.VOWELS, { pitch: 205, res: 100, bright: 50, rate: 1, vowelsOf: (w) => D.wordVowelSeq(w, PRON) });
  const st = r.starts.map(s => s * 1000), en = r.ends.map(s => s * 1000), bi = words.indexOf('beautiful'), ci = bi + 1;
  // the live highlight: on time until "beautiful", which it held through "colors." and the pause after it, then two
  // words at once just before "These"
  const fr = frames(r.x, (t) => { let k = 0; while (k + 1 < words.length && st[k + 1] <= t) k++; return k === ci && t < st[ci + 1] - 30 ? bi : k; });
  const live = D.readingTimeline(fr, 0, words.length), lsp = D.wordSpans(live.ws, live.dur);
  check(lsp[ci][1] - lsp[ci][0] < 0.25 * (en[ci] - st[ci]), `the live highlight gives "colors." a sliver (${Math.round(lsp[ci][1] - lsp[ci][0])} ms of ${Math.round(en[ci] - st[ci])})`);
  const al = D.alignWords(fr, words);
  check(!!al, 'the words fit the sound');
  const sp = D.wordSpans(al.ws, live.dur, al.we);
  check(Math.abs(al.ws[ci] - st[ci]) <= 100, `"colors." starts ${Math.round(al.ws[ci])} ms, said at ${Math.round(st[ci])}`);
  check(Math.abs(al.ws[bi] - st[bi]) <= 250, `"beautiful" starts ${Math.round(al.ws[bi])} ms, said at ${Math.round(st[bi])}`);
  check(sp[ci][1] - sp[ci][0] >= 0.7 * (en[ci] - st[ci]), `"colors." now spans ${Math.round(sp[ci][1] - sp[ci][0])} ms (said for ${Math.round(en[ci] - st[ci])})`);
  check(sp[bi][1] <= st[ci] + 100, `"beautiful" ends by ${Math.round(sp[bi][1])} ms, before "colors."`);
  // the word by word report follows the new edges: "colors." gets its own voice
  const re = D.retagFrames(fr, al.ws), voiced = (fs_, k) => fs_.filter(f => f.i === k && f.f0 > 0).length;
  check(voiced(fr, ci) <= 2 && voiced(re, ci) >= 10, `voiced moments on "colors.": ${voiced(fr, ci)} live, ${voiced(re, ci)} after`);
  check(al.we[ci] != null && Math.abs(al.we[ci] - en[ci]) <= 120, `"colors." ends at the pause (${Math.round(al.we[ci])} ms, said until ${Math.round(en[ci])})`);
  const ac = D.alignByClass(fr, words), sc = D.wordSpans(ac.ws, live.dur, ac.we);
  check(Math.abs(ac.ws[ci] - st[ci]) <= 100 && Math.abs(ac.ws[bi] - st[bi]) <= 100, `by sound class: "beautiful" ${Math.round(ac.ws[bi] - st[bi])} ms, "colors." ${Math.round(ac.ws[ci] - st[ci])} ms off`);
  check(sc[ci][1] - sc[ci][0] >= 0.8 * (en[ci] - st[ci]) && sc[bi][1] <= st[ci] + 60, `by sound class: "colors." spans ${Math.round(sc[ci][1] - sc[ci][0])} ms, "beautiful" ends at ${Math.round(sc[bi][1])}`);
}

// ---- a whole passage in the demo voice: edges near where the words were said ----
for (const [style, pitch, res] of [['natural', 205, 100], ['classic', 115, 0]]) {
  S.setStyle(style);
  const words = texts.find(t => t.id === 'b-northwind').body.split(/\s+/).filter(Boolean);
  const r = S.readText(fs, words, D.VOWELS, { pitch, res, bright: 50, rate: 1, vowelsOf: (w) => D.wordVowelSeq(w, PRON) });
  const st = r.starts.map(s => s * 1000);
  const al = D.alignWords(frames(r.x, () => 0), words), e = errs(al.ws, st);
  check(med(e) <= 70 && e.filter(v => v <= 150).length >= 0.75 * e.length, `${style} demo voice, North Wind: median ${Math.round(med(e))} ms off, ${Math.round(100 * e.filter(v => v <= 150).length / e.length)}% within 150 ms`);
  const ac = D.alignByClass(frames(r.x, () => 0), words), ec = errs(ac.ws, st);
  check(med(ec) <= 40 && ec.filter(v => v <= 150).length >= 0.95 * ec.length && ac.last === words.length - 1, `${style} demo voice, North Wind, by sound class: median ${Math.round(med(ec))} ms off, ${Math.round(100 * ec.filter(v => v <= 150).length / ec.length)}% within 150 ms`);
}

// ---- where the reading stopped isn't known: the live highlight fell far behind (as on a real reading of the
// Rainbow passage, where it was on word 80 of about 140 read), so the alignment finds the end and the pace itself ----
{
  S.setStyle('natural');
  const all = texts.find(t => t.id === 'b-rainbow').body.split(/\s+/).filter(Boolean), said = all.slice(0, all.indexOf('end.') + 1); // to "...at one end."
  const r = S.readText(fs, said, D.VOWELS, { pitch: 205, res: 100, bright: 50, rate: 0.85, vowelsOf: (w) => D.wordVowelSeq(w, PRON) });
  const st = r.starts.map(s => s * 1000), fr = frames(r.x, () => 0);
  const fixed = D.alignWords(fr, all.slice(0, 30)), al = D.alignWords(fr, all, { free: true, guess: 30 });
  const ef = errs(fixed.ws, st), e = errs(al.ws.slice(0, said.length), st);
  check(med(ef) > 500, `taking the highlight's 30 words as all that was read puts them ${Math.round(med(ef))} ms off`);
  check(Math.abs(al.last - (said.length - 1)) <= 1, `free: stops at "${all[al.last]}" (word ${al.last + 1}; read to word ${said.length})`);
  check(med(e) <= 70, `free: median ${Math.round(med(e))} ms off`);
}

// ---- by sound class: noise before the reading, and the end found inside the room the live highlight leaves ----
{
  S.setStyle('natural');
  const all = texts.find(t => t.id === 'b-rainbow').body.split(/\s+/).filter(Boolean), said = all.slice(0, all.indexOf('end.') + 1);
  const r = S.readText(fs, said, D.VOWELS, { pitch: 205, res: 100, bright: 50, rate: 1, vowelsOf: (w) => D.wordVowelSeq(w, PRON) });
  const pre = 2 * fs, x = new Float32Array(pre + r.x.length); let q = 1;
  for (let i = 0; i < pre; i++) { q = (q * 16807) % 2147483647; x[i] = 0.02 * (q / 2147483647 - 0.5); } // 2 s of hiss first
  x.set(r.x, pre);
  const st = r.starts.map(v => v * 1000 + 2000), fr = frames(x, () => 0);
  for (const reach of [said.length - 1, said.length - 8]) { // the highlight on the last word, or a few behind
    const al = D.alignByClass(fr, all, { maxWords: Math.round((reach + 1) * 1.15) + 3 }), e = errs(al.ws.slice(0, said.length), st);
    check(Math.abs(al.ws[0] - st[0]) <= 100, `the hiss before the reading takes no words ("${all[0]}" at ${al.ws[0]} ms, said at ${Math.round(st[0])})`);
    check(med(e) <= 40 && al.last >= said.length - 1 && al.last <= said.length + 2, `highlight on word ${reach + 1}: median ${Math.round(med(e))} ms off, stops at word ${al.last + 1} (read to ${said.length})`);
  }
}

// ---- the neural voice (where ffmpeg can decode it), with and without its own timing as the template ----
let ff = true; try { cp.execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (e) { ff = false; }
if (!ff) console.log('skip the neural voice: no ffmpeg here to decode the clips');
else {
  const dir = path.join(__dirname, '..', 'refclips'), ix = require(path.join(dir, 'clips.json'));
  const t = texts.find(x => x.id === 'b-rainbow'), words = t.body.split(/\s+/).filter(Boolean), c = ix.clips['b-rainbow.fem'];
  if (c && c.hash === D.textHash(t.body) && fsys.existsSync(path.join(dir, c.file))) {
    const buf = cp.execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, c.file), '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    const shift = D.soundOnset(x, fs) - c.onset, st = c.words.map(w => (w[0] + shift) * 1000);
    const fr = frames(x, () => 0);
    // the model's own word times run up to ~80 ms late, so this is looser than the demo voice
    for (const [name, opt] of [['alone', {}], ['with its timing', { ref: c.words }]]) {
      const al = D.alignWords(fr, words, opt), e = errs(al.ws, st), ci = words.indexOf('colors.');
      check(med(e) <= 120 && Math.abs(al.ws[ci] - st[ci]) <= 150, `neural voice, Rainbow, ${name}: median ${Math.round(med(e))} ms off, "colors." ${Math.round(al.ws[ci] - st[ci])} ms`);
    }
    const ac = D.alignByClass(fr, words), ec = errs(ac.ws, st), ci = words.indexOf('colors.');
    check(med(ec) <= 120 && Math.abs(ac.ws[ci] - st[ci]) <= 150, `neural voice, Rainbow, by sound class: median ${Math.round(med(ec))} ms off, "colors." ${Math.round(ac.ws[ci] - st[ci])} ms`);
  }
}

// ---- odds and ends ----
check(D.alignByClass([{ t: 0, f0: 0, i: 0 }], ['a']) === null, 'frames without a kind (an older reading): no class alignment');
check(D.soundClasses('colors.').map(g => g.c).join('') === 'KVS' && D.soundClasses('shape').map(g => g.c).join('') === 'SVK', 'spelling turns into sound classes (colors. KVS, shape SVK)');
check(D.alignWords([{ t: 0, f0: 0, i: 0 }], ['a']) === null, 'frames without loudness (an older reading): keeps the live edges');
check(JSON.stringify(D.retagFrames([{ t: 0, i: 0 }, { t: 50, i: 0 }, { t: 120, i: 0 }, { t: 300, i: 2 }], [0, 100, 250]).map(f => f.i)) === '[0,0,1,2]', 'frames are tagged with the word whose stretch they fall in');

console.log(fails ? `\n${fails} failed` : '\nall alignment checks passed');
process.exit(fails ? 1 : 0);
