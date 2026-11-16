// The neural voice's readings of the built-in passages (refclips/, made by scripts/make-refclips.py): each matches
// its passage, its word times are in order, and (where ffmpeg can decode the clips) the app measures the feminine
// voice in the feminine band and the masculine voice in the masculine one. node test/refclips.test.js
const fsys = require('fs'), path = require('path'), cp = require('child_process');
const D = require('../src/dsp.js');
const PRON = D.pronIndex(require('../data/pron.json'));
const texts = require('../data/texts.json');
const dir = path.join(__dirname, '..', 'refclips'), ix = require(path.join(dir, 'clips.json'));
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

check(D.textHash('') === '811c9dc5' && D.textHash('a') === 'e40c292c' && D.textHash('é') !== D.textHash('e'), 'text hash: FNV-1a of the UTF-8 bytes');
for (const t of texts) {
  const words = t.body.split(/\s+/).filter(Boolean);
  for (const kind of ['fem', 'masc']) {
    const c = ix.clips[t.id + '.' + kind];
    if (!c) { console.log(`warn ${t.id}.${kind}: no neural clip, the demo voice reads it (run scripts/make-refclips.py --only ${t.id})`); continue; }
    if (c.hash !== D.textHash(t.body)) { console.log(`warn ${t.id}.${kind}: the passage changed since its clip was made, so the demo voice reads it (run scripts/make-refclips.py --only ${t.id})`); continue; }
    const ok = c.words.length === words.length && c.words.every(([a, b], i) => a >= 0 && b > a && b <= c.seconds && (i === 0 || a >= c.words[i - 1][1] - 1e-6));
    check(ok && fsys.existsSync(path.join(dir, c.file)), `${t.id}.${kind}: ${words.length} words in order within ${c.seconds} s, ${c.file} there`);
  }
}
for (const k of Object.keys(ix.clips)) check(texts.some(t => k.startsWith(t.id + '.')), `${k}: a passage it reads`);

// measured the way a reading is, from the clip as a browser decodes it (at 48 kHz)
let ff = true; try { cp.execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (e) { ff = false; }
if (!ff) console.log('skip measuring: no ffmpeg here to decode the clips');
else for (const id of ['b-rainbow', 'b-northwind', 'b-grandfather']) {
  const t = texts.find(x => x.id === id), words = t.body.split(/\s+/).filter(Boolean);
  for (const kind of ['fem', 'masc']) {
    const c = ix.clips[id + '.' + kind]; if (!c || c.hash !== D.textHash(t.body)) continue;
    const buf = cp.execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, c.file), '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    const shift = D.soundOnset(x, 48000) - c.onset;
    check(Math.abs(shift) < 0.06, `${id}.${kind}: decoded sound starts where the script said (${Math.round(shift * 1000)} ms off)`);
    const out = D.analyzeReading(x, 48000, words, c.words.map(([a, b]) => [a + shift, b + shift]), PRON);
    const pool = D.pooledResonance(out.frames), f0 = D.median(out.pitch);
    const wr = D.wordReport(out.frames, words.length), content = words.filter(w => D.wordVowels(w, PRON).why === 'ok').length;
    const scored = wr.filter((w, i) => w.r != null && D.wordVowels(words[i], PRON).why === 'ok').length;
    const [lo, hi] = D.RES_BANDS[kind];
    // the masculine voice sits at the top of its band: within 3 of it counts
    check(pool.res != null && pool.res >= lo - 3 && pool.res <= hi + 3, `${id}.${kind} (${c.voice}): resonance ${pool.res != null ? pool.res.toFixed(1) : '--'}, ${kind} band ${lo}-${hi}`);
    check(kind === 'fem' ? f0 > 170 && f0 < 240 : f0 > 90 && f0 < 140, `${id}.${kind}: median pitch ${Math.round(f0)} Hz`);
    check(scored >= 0.6 * content, `${id}.${kind}: ${scored} of ${content} content words have a resonance`);
  }
}
console.log(fails ? `\n${fails} failed` : '\nall neural voice checks passed');
process.exit(fails ? 1 : 0);
