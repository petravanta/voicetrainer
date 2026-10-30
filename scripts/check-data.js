// Checks what the JSON Schemas can't: ids and words are unique, and ids use the prefix the app expects.
// Run: node scripts/check-data.js
const fs = require('fs'), path = require('path');
const load = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', n + '.json'), 'utf8'));
const errors = [];
const unique = (file, list, key) => {
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x[key])) errors.push(`${file}.json: ${key} "${x[key]}" is used more than once`);
    seen.add(x[key]);
  }
};
const prefix = (file, list, p) => list.forEach((x) => { if (!x.id.startsWith(p)) errors.push(`${file}.json: id "${x.id}" should start with "${p}"`); });

const texts = load('texts'), words = load('words'), breath = load('breath'), control = load('control'), whisper = load('whisper');
unique('texts', texts, 'id'); prefix('texts', texts, 'b-');
unique('words', words, 'word');
unique('breath', breath, 'id'); prefix('breath', breath, 'b-');
unique('control', control, 'id'); prefix('control', control, 'c-');
unique('whisper', whisper, 'id'); prefix('whisper', whisper, 'wh-');
// Breath and text ids share the b- prefix but live in different lists; keep them distinct anyway
const textIds = new Set(texts.map((t) => t.id));
breath.forEach((b) => { if (textIds.has(b.id)) errors.push(`breath.json: id "${b.id}" is also a text id`); });

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`data ok: ${texts.length} texts, ${words.length} words, ${breath.length} breath, ${control.length} control, ${whisper.length} whisper`);
