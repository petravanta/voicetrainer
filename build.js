// Inlines src/ into two pages: dist/artifact.html (body content for the claude.ai Artifact)
// and dist/VoiceTrainer.html (standalone file that can be opened directly in a browser).
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let page = src('index.html');
// Catalog content from data/*.json (see CONTRIBUTING.md), inlined so the page works as one file
const data = {};
for (const n of ['texts', 'words', 'breath', 'control']) data[n] = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', n + '.json'), 'utf8'));
page = page.split('/*DATA*/').join(JSON.stringify(data).replace(/<\/script/gi, '<\\/script'));
for (const [mark, file] of [['/*STYLE*/', 'style.css'], ['/*DSP*/', 'dsp.js'], ['/*SYNTH*/', 'synth.js'], ['/*APP*/', 'app.js']]) {
  page = page.split(mark).join(src(file).replace(/<\/script/gi, '<\\/script'));
}
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), page);
const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
fs.writeFileSync(path.join(__dirname, 'dist', 'VoiceTrainer.html'), head + page + '\n</body>\n</html>\n');
console.log('built', page.length, 'bytes');
