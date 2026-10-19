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
// Installable on phones (see general/STANDARDS.md): the files in pwa/ sit next to the page on Pages.
const register = "<script>if('serviceWorker' in navigator&&/^(petravanta\\.github\\.io|localhost|127\\.0\\.0\\.1)$/.test(location.hostname))navigator.serviceWorker.register('sw.js').catch(function(){})</script>\n";
const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#172129" media="(prefers-color-scheme: dark)">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
fs.writeFileSync(path.join(__dirname, 'dist', 'VoiceTrainer.html'), head + page + '\n' + register + '</body>\n</html>\n');
console.log('built', page.length, 'bytes');
