// Build stamp: the commit and build time reach the page, the footer reads them, and an unbuilt page says dev. node test/build.test.js
const fs = require('fs'), path = require('path');
const B = require('../build.js'), D = require('../src/dsp.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

const st = B.stamp('3f2a9c1', new Date('2026-11-04T10:52:31Z'));
check(st.build === '2026.11.04+3f2a9c1' && st.sha === '3f2a9c1' && st.built === '2026-11-04T10:52Z', 'stamp names date, commit and minute: ' + JSON.stringify(st));
check(B.stamp('', new Date('2026-11-04T10:52:31Z')).build === '2026.11.04', 'no git checkout: date only');

const dsp = fs.readFileSync(path.join(__dirname, '..', 'src', 'dsp.js'), 'utf8');
const out = B.stampSource(dsp, st);
check(out.includes("const APP_BUILD = '2026.11.04+3f2a9c1';") && out.includes("const APP_BUILT = '2026-11-04T10:52Z';"), 'dsp.js marks are replaced');
check(!out.includes('/*BUILD*/') && !out.includes('/*BUILT*/'), 'no marks left after stamping');

check(D.APP_BUILD === 'dev' && D.APP_BUILT === '', 'unbuilt source says dev');
check(D.buildLabel('dev', '') === 'dev build', 'footer label for dev: ' + D.buildLabel('dev', ''));
check(D.buildLabel(st.build, st.built, 'UTC') === 'Build 3f2a9c1 · 4 Nov 2026 10:52 UTC', 'footer label: ' + D.buildLabel(st.build, st.built, 'UTC'));
check(D.buildLabel('2026.11.04', '2026-11-04T10:52Z', 'UTC') === 'Build 2026.11.04 · 4 Nov 2026 10:52 UTC', 'label without a commit falls back to the date');

const LA = 'America/Los_Angeles';
check(D.buildLabel(st.build, st.built, LA) === 'Build 3f2a9c1 · 4 Nov 2026 02:52 PST (10:52 UTC)', 'Pacific label with UTC alongside: ' + D.buildLabel(st.build, st.built, LA));
check(D.buildLabel(st.build, '2026-11-16T01:42Z', LA) === 'Build 3f2a9c1 · 15 Nov 2026 17:42 PST (16 Nov 01:42 UTC)', 'UTC on another day names its date: ' + D.buildLabel(st.build, '2026-11-16T01:42Z', LA));
check(D.buildLabel(st.build, '2026-07-01T20:05Z', LA) === 'Build 3f2a9c1 · 1 Jul 2026 13:05 PDT (20:05 UTC)', 'summer time: ' + D.buildLabel(st.build, '2026-07-01T20:05Z', LA));
check(D.buildLabel(st.build, '2026-07-01T00:30Z', 'Europe/Budapest').startsWith('Build 3f2a9c1 · 1 Jul 2026 02:30 '), 'other zones too: ' + D.buildLabel(st.build, '2026-07-01T00:30Z', 'Europe/Budapest'));
check(D.buildLabel(st.build, st.built, 'Not/AZone') === 'Build 3f2a9c1 · 4 Nov 2026 10:52 UTC', 'unknown zone falls back to UTC');
check(D.newerBuild(st.build, { build: '2026.11.05+9b1c0de' }), 'a different deployed build is newer');
check(!D.newerBuild(st.build, { build: st.build }), 'same build: no update');
check(!D.newerBuild('dev', { build: st.build }), 'dev never offers an update');
check(!D.newerBuild(st.build, null) && !D.newerBuild(st.build, {}) && !D.newerBuild(st.build, { build: 5 }), 'missing or odd version.json: no update');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('all passed');
