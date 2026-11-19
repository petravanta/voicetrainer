// Inlines src/ into two pages: dist/artifact.html (body content for the claude.ai Artifact)
// and dist/VoiceTrainer.html (standalone file that can be opened directly in a browser).
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let page = src('index.html');
// Catalog content from data/*.json (see CONTRIBUTING.md), inlined so the page works as one file
const data = {};
for (const n of ['texts', 'words', 'breath', 'control', 'whisper', 'sibex', 'embody', 'emotions', 'pron']) data[n] = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', n + '.json'), 'utf8'));
page = page.split('/*DATA*/').join(JSON.stringify(data).replace(/<\/script/gi, '<\\/script'));
// Version stamp: build = date of the build and the commit (sent to LRCLIB in the Lrclib-Client header),
// built = UTC time of the build (the footer shows it in the viewer's time zone, UTC alongside). Both show in the footer; a page that wasn't built (src/ as is) says 'dev'.
function stamp(sha, now) {
  const iso = now.toISOString();
  return { build: iso.slice(0, 10).replace(/-/g, '.') + (sha ? '+' + sha : ''), sha: sha || '', built: iso.slice(0, 16) + 'Z' };
}
function gitSha() {
  try { return require('child_process').execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; /* not a git checkout */ }
}
const quote = (v) => JSON.stringify(v).replace(/"/g, "'");
function stampSource(text, st) {
  return text.split("/*BUILD*/'dev'").join(quote(st.build)).split("/*BUILT*/''").join(quote(st.built));
}
if (require.main !== module) { module.exports = { stamp, stampSource }; return; }
const st = stamp(gitSha(), new Date());
for (const [mark, file] of [['/*STYLE*/', 'style.css'], ['/*DSP*/', 'dsp.js'], ['/*SYNTH*/', 'synth.js'], ['/*APP*/', 'app.js']]) {
  page = page.split(mark).join(stampSource(src(file), st).replace(/<\/script/gi, '<\\/script'));
}
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), page);
// Installable on phones (see general/STANDARDS.md): the files in pwa/ sit next to the page on Pages.
const register = "<script>if('serviceWorker' in navigator&&/^(petravanta\\.github\\.io|localhost|127\\.0\\.0\\.1)$/.test(location.hostname))navigator.serviceWorker.register('sw.js').catch(function(){})</script>\n";
const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#172129" media="(prefers-color-scheme: dark)">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
fs.writeFileSync(path.join(__dirname, 'dist', 'VoiceTrainer.html'), head + page + '\n' + register + '</body>\n</html>\n');
// The live page fetches this (uncached) to tell when a newer deploy is out
fs.writeFileSync(path.join(__dirname, 'dist', 'version.json'), JSON.stringify(st) + '\n');
console.log('built', st.build, page.length, 'bytes');
