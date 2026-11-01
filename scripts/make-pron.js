// Builds data/pron.json: the stressed vowels of common English words, so a reading can check each vowel it
// hears against the vowel the word should have. Source: the CMU Pronouncing Dictionary (BSD licence,
// https://github.com/cmusphinx/cmudict). Words kept: the most frequent N of a frequency list (one word per
// line, most frequent first; we used wordfreq's top_n_list('en', 30000)) plus every word of data/texts.json
// and data/words.json.
// Run: node scripts/make-pron.js <cmudict.dict> <frequency-list.txt> [N]
//
// Each word gets a code: one character per stressed syllable (primary or secondary stress), in order.
// A letter is the app's vowel key (see VOWELS in src/dsp.js; a two-letter key "ae" is written "A"):
//   IY i, IH I, EY e, EH E, AE A, AA a, AO c, AH V, OW o, UH U, UW u, ER r
// "x" marks a stressed vowel the app can't score: a glide (AY as in "sign", AW "round", OY "boil") or a vowel
// coloured by a following r ("arch", "form", "there"). Unstressed vowels (mostly schwa) are left out.
const fs = require('fs'), path = require('path');
const [dictFile, freqFile, nArg] = process.argv.slice(2);
if (!dictFile || !freqFile) { console.error('usage: node scripts/make-pron.js <cmudict.dict> <frequency-list.txt> [N]'); process.exit(1); }
const N = +nArg || 12000;
const KEY = { IY: 'i', IH: 'I', EY: 'e', EH: 'E', AE: 'A', AA: 'a', AO: 'c', AH: 'V', OW: 'o', UH: 'U', UW: 'u', ER: 'r' };
const GLIDE = new Set(['AY', 'AW', 'OY']);
const dict = new Map(), known = new Set();
for (const line of fs.readFileSync(dictFile, 'utf8').split('\n')) {
  const m = /^([a-z']+) ([A-Z0-9 ]+?)(?: #.*)?$/.exec(line.trim()); // first pronunciation only: "word(2)" variants are skipped
  if (!m || known.has(m[1])) continue;
  known.add(m[1]);
  const ph = m[2].split(' ');
  let code = '';
  ph.forEach((p, i) => {
    const s = /^([A-Z]+)([12])$/.exec(p); // stressed vowels only
    if (!s) return;
    code += GLIDE.has(s[1]) || (s[1] !== 'ER' && ph[i + 1] === 'R') ? 'x' : KEY[s[1]];
  });
  if (code) dict.set(m[1], code);
}
// words of the bundled texts that the dictionary lacks, coded by hand
for (const [w, c] of Object.entries({ refraction: 'A', quivers: 'I' })) { dict.set(w, c); known.add(w); }
const want = new Set(fs.readFileSync(freqFile, 'utf8').split('\n').map(w => w.trim().toLowerCase()).filter(w => dict.has(w)).slice(0, N));
const data = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', n + '.json'), 'utf8'));
const missing = new Set();
for (const t of data('texts')) for (const w of t.body.toLowerCase().match(/[a-z']+/g) || []) {
  const k = w.replace(/^'+|'+$/g, '').replace(/'s$/, '');
  if (dict.has(k)) want.add(k); else if (!known.has(k)) missing.add(k);
}
for (const w of data('words')) if (dict.has(w.word)) want.add(w.word);
// grouped by code so the file stays small: { code: "word word ..." }
const by = {};
for (const w of [...want].sort()) (by[dict.get(w)] = by[dict.get(w)] || []).push(w);
const out = { source: 'CMU Pronouncing Dictionary (BSD licence); built by scripts/make-pron.js', words: Object.fromEntries(Object.entries(by).sort().map(([c, ws]) => [c, ws.join(' ')])) };
fs.writeFileSync(path.join(__dirname, '..', 'data', 'pron.json'), JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + '\n');
console.log(`${want.size} words, ${Object.keys(by).length} codes${missing.size ? '; not in the dictionary: ' + [...missing].join(' ') : ''}`);
