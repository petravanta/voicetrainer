// Sing along: lyrics parsing (plain and LRC), finding the current line, and the per-line summary
// from a synthetic singer whose first line is bright and second line dark: node test/sing.test.js
const D = require('../src/dsp.js'), S = require('../src/synth.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

// plain text: one entry per non-blank line, untimed
const plain = D.parseLyrics('First line\n\n  Second   line \r\nThird line\n');
check(!plain.timed && plain.lines.length === 3 && plain.lines[1].text === 'Second line' && plain.lines[0].t === null, 'plain lyrics: three untimed lines, spaces tidied');

// LRC: metadata dropped, several stamps per line, offset, enhanced word stamps, an instrumental gap
const lrc = D.parseLyrics([
  '[ti:Test song]', '[ar:Nobody]', '[length: 03:10]', '[offset:+500]',
  '[00:12.40]Hello <00:12.40>there <00:13.00>friend',
  '[00:20.00][01:05.5]Chorus line',
  '[00:30.00]',
  '[00:34:20]Last line',
].join('\n'));
check(lrc.timed, 'LRC lyrics are timed');
check(lrc.lines.length === 5, `LRC: 5 lines including the repeated chorus and the break (got ${lrc.lines.length})`);
check(lrc.lines[0].text === 'Hello there friend' && Math.abs(lrc.lines[0].t - 11.9) < 1e-6, 'LRC: word stamps dropped, offset of +500 ms shows lines sooner');
check(lrc.lines.map(l => l.text).join('|') === 'Hello there friend|Chorus line||Last line|Chorus line', 'LRC: lines sorted by time, chorus appears twice');
check(Math.abs(lrc.lines[3].t - 33.7) < 1e-6, 'LRC: mm:ss:xx stamps read too');
check(D.parseLyrics('[00:01.00]\n[00:02.00]Words').lines[0].text === 'Words', 'LRC: a leading instrumental stamp is skipped');
check(D.parseLyrics('').lines.length === 0, 'empty lyrics: no lines');

// the line at a time
const L = lrc.lines;
check(D.lyricLineAt(L, 5) === -1 && D.lyricLineAt(L, 11.9) === 0 && D.lyricLineAt(L, 25) === 1 && D.lyricLineAt(L, 31) === 2 && D.lyricLineAt(L, 999) === 4, 'line lookup by time');

// A synthetic singer: line 0 sung on G3 and C4 with feminine formants, line 1 on C3 and E3 with masculine
// ones, a breath between. Frames are analysed the same way as the app does and filed by line.
const fs = 48000, keys = ['a', 'i', 'ae'];
const at = (v, t) => v.M.map((m, i) => Math.exp(Math.log(m) + t * Math.log(v.W[i] / m)));
const plan = [[0, 196, 1], [0, 261.6, 1], [-1, 0, 0], [1, 130.8, 0], [1, 164.8, 0]];
const parts = [], spans = [];
let pos = 0;
for (const [n, [line, f0, a]] of plan.entries()) {
  for (const [k, key] of keys.entries()) {
    const x = line < 0 ? S.silence(fs, 0.3) : S.vowel(fs, 0.5, f0, at(D.VOWEL_BY_KEY[key], a), { seed: 10 * n + k + 1 });
    spans.push([pos, pos + x.length, line]); pos += x.length; parts.push(x);
    if (line < 0) break;
  }
}
const x = S.concat(parts), an = new D.Analyzer(fs), hop = Math.round(fs / 60), frames = [];
for (let end = an.needed; end <= x.length; end += hop) {
  const fr = an.analyze(x.subarray(0, end)), mid = end - an.needed / 2;
  const sp = spans.find(s => mid >= s[0] && mid < s[1]); if (!sp || sp[2] < 0) continue;
  let res = NaN;
  if (fr.kind === 'voiced' && fr.formants && fr.stable) {
    const cls = D.classifyVowel(fr.formants);
    if (cls.cost < 0.07) res = Math.max(0, Math.min(100, cls.alpha * 100));
  }
  frames.push({ line: sp[2], f0: fr.kind === 'voiced' ? fr.f0 : 0, res });
}
const sum = D.singSummary(frames, 3);
for (const s of sum) console.log(`  line ${s.line}: res ${s.res == null ? '--' : Math.round(s.res)} (${s.vowelFrames} vowel frames), ${s.f0 ? `${D.hzToNote(s.lo)}-${D.hzToNote(s.hi)}, ${s.span.toFixed(1)} st` : 'no pitch'}`);
check(sum[0].res != null && sum[0].res >= 75, 'bright line scores in the feminine band');
check(sum[1].res != null && sum[1].res <= 25, 'dark line scores in the masculine band');
check(D.hzToNote(sum[0].lo) === 'G3' && D.hzToNote(sum[0].hi) === 'C4', 'bright line range G3 to C4');
check(D.hzToNote(sum[1].lo) === 'C3' && D.hzToNote(sum[1].hi) === 'E3', 'dark line range C3 to E3');
check(sum[2].f0 === null && sum[2].res === null, 'a line with no frames has no summary');
check(sum[2].why === 'quiet', 'a line with no frames says too little voice');
check(!sum[0].shaky && sum[0].pm >= 2, 'a well-sung line is a solid reading with a ± band');

// every sung line gets an explicit state: a score (solid or shaky) or a reason
{
  const fr = [];
  const add = (line, n, f) => { for (let k = 0; k < n; k++) fr.push(Object.assign({ line, f0: 0, res: NaN }, f(k))); };
  add(0, 30, k => ({ f0: 220, res: k < 5 ? 40 + k : NaN, u: 6 }));       // 5 vowel readings: shaky score
  add(1, 30, () => ({ f0: 330 }));                                       // high, nothing scored
  add(2, 30, k => ({ f0: 200, miss: k % 3 === 0 }));                     // vowels heard, none measurable
  add(3, 30, () => ({ f0: 200 }));                                       // voiced but never steady
  add(4, 2, () => ({ f0: 200 }));                                        // a breath of voice
  add(5, 30, k => ({ f0: 200, res: 20 + k, u: 4 }));                     // 30 readings, far off target: still shown
  add(6, 30, k => ({ f0: 200, res: k < 2 ? 50 : NaN }));                 // 2 readings: not enough
  const ss = D.singSummary(fr, 7);
  check(ss[0].res === 42 && ss[0].shaky && ss[0].pm > 0, `5 readings give a shaky score (got ${ss[0].res}, ±${ss[0].pm})`);
  check(ss[1].res === null && ss[1].why === 'high', 'a high line with no reading says it was too high');
  check(ss[2].why === 'unclear', 'unmeasurable vowels say so');
  check(ss[3].why === 'unsteady', 'voice with no held vowel says so');
  check(ss[4].why === 'quiet', 'barely any voice says so');
  check(ss[5].res != null && !ss[5].shaky && ss[5].res < 40, 'a low, off-target line still gets its score');
  check(ss[5].pm < ss[0].pm, 'more readings give a tighter ± band');
  check(ss[6].res === null && ss[6].why === 'unsteady', 'under 3 readings is no score, with a reason');
  check(ss.every(x => x.res != null || D.SING_WHY[x.why]), 'every line has a score or a reason to show');
  check(D.instrumentalLine('♪ ♪') && D.instrumentalLine('(Instrumental)') && D.instrumentalLine('[Guitar solo]') && !D.instrumentalLine('Solo in the night'), 'instrumental lines are spotted');
}

// lyrics search (LRCLIB): request URL and turning a made-up response into the result list (no network here)
check(D.lyricsSearchUrl('  Some  Artist & Song ') === 'https://lrclib.net/api/search?q=Some%20Artist%20%26%20Song', 'search URL sends only the tidied, encoded query');
check(D.lyricsSearchUrl('   ') === null, 'an empty query sends nothing');
const found = D.lyricsResults([
  { id: 1, trackName: 'Made Up Song', artistName: 'Nobody', albumName: 'Single', duration: 201.7, instrumental: false, plainLyrics: 'One\nTwo', syncedLyrics: null },
  { id: 2, trackName: 'Other Tune', artistName: 'Somebody', duration: 180, plainLyrics: 'La la', syncedLyrics: null },
  { id: 3, trackName: 'made up song', artistName: 'nobody', albumName: 'Album', duration: 203, plainLyrics: 'One\nTwo', syncedLyrics: '[00:05.00]One\n[00:09.50]Two' },
  { id: 4, trackName: 'Quiet Bit', artistName: 'Nobody', duration: 60, instrumental: true, plainLyrics: null, syncedLyrics: null },
  { id: 5, trackName: 'Empty', artistName: 'Nobody', duration: 60, plainLyrics: '  ', syncedLyrics: null },
  null, 'junk',
]);
check(found.length === 2, `two songs listed: duplicates merged, instrumental and empty dropped (got ${found.length})`);
check(found[0].timed && found[0].id === 3 && D.parseLyrics(found[0].text).lines.length === 2, 'a song with a timed copy loads the timed lyrics, in the first row');
check(found[0].duration === 203 && found[0].album === 'Album', 'the row shows the timed copy\'s album and length');
check(!found[1].timed && found[1].text === 'La la', 'a song with plain lyrics only loads them');
check(D.lyricsResults({ message: 'error' }).length === 0 && D.lyricsResults(null).length === 0, 'an error body gives no results');
check(D.lyricsResults(Array.from({ length: 20 }, (_, i) => ({ trackName: 'S' + i, artistName: 'A', plainLyrics: 'x' }))).length === 8, 'at most 8 results');


// Backup source (lyrics.ovh) and the fallback chain, with a scripted fake fetch (no network here)
check(D.ovhSearchUrl(' AC/DC  Back in Black ') === 'https://api.lyrics.ovh/suggest/AC%20DC%20Back%20in%20Black', 'lyrics.ovh search URL is tidied and has no slashes in the path');
check(D.ovhLyricsUrl('Sigur Rós', 'Hoppípolla') === 'https://api.lyrics.ovh/v1/Sigur%20R%C3%B3s/Hopp%C3%ADpolla', 'lyrics.ovh lyrics URL encodes artist and title');
check(D.ovhLyricsUrl('', 'x') === null && D.ovhSearchUrl(' ') === null, 'nothing is sent without artist and title');
const ovh = D.ovhResults({ data: [
  { id: 7, title: 'Made Up Song (Remastered)', title_short: 'Made Up Song', artist: { name: 'Nobody' }, album: { title: 'Single' }, duration: 202 },
  { id: 8, title: 'Made Up Song', title_short: 'Made Up Song', artist: { name: 'nobody' }, album: { title: 'Live' }, duration: 240 },
  { id: 9, title: 'No Artist' }, null,
] });
check(ovh.length === 1 && ovh[0].title === 'Made Up Song' && ovh[0].src === 'ovh' && !ovh[0].timed && ovh[0].text === null, 'lyrics.ovh results: short title, deduplicated, plain, text fetched on pick');
check(D.ovhResults({ error: 'x' }).length === 0 && D.ovhResults(null).length === 0, 'a lyrics.ovh error body gives no results');
check(D.ovhLyrics({ lyrics: 'Paroles de la chanson Made Up Song par Nobody\r\nOne\r\n\r\n\r\n\r\nTwo  \r\n' }) === 'One\n\nTwo', 'lyrics.ovh text loses its heading, CR and extra blank lines');
check(D.lyricsWebUrl('Nobody  Made Up') === 'https://duckduckgo.com/?q=Nobody%20Made%20Up%20lyrics', 'web search link');

const reply = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k] ?? null }, json: async () => body });
function fakeFetch(script) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push(url);
    const host = url.includes('lrclib') ? 'lrclib' : url.includes('/suggest/') ? 'suggest' : 'ovh';
    const step = script[host].shift();
    if (!step) throw new Error('unexpected call ' + url);
    if (step === 'hang') return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (step === 'neterr') throw new TypeError('Failed to fetch');
    return step;
  };
  f.calls = calls; return f;
}
const sleeps = [], sleep = async (ms) => { sleeps.push(ms); };
const lrcOk = [{ id: 3, trackName: 'Made Up Song', artistName: 'Nobody', plainLyrics: 'One', syncedLyrics: '[00:05.00]One' }];
const ovhOk = { data: [{ id: 7, title_short: 'Made Up Song', artist: { name: 'Nobody' }, duration: 202 }] };

(async () => {
  let f = fakeFetch({ lrclib: [reply(200, lrcOk)], suggest: [], ovh: [] });
  let r = await D.findLyrics('Nobody Made Up Song', { fetch: f, sleep });
  check(r.source === 'lrclib' && r.rows[0].timed && r.rows[0].src === 'lrclib' && f.calls.length === 1, 'LRCLIB working: one request, timed result, no fallback');

  f = fakeFetch({ lrclib: [reply(503, null, { 'Retry-After': '1' }), reply(200, lrcOk)], suggest: [], ovh: [] });
  sleeps.length = 0;
  r = await D.findLyrics('Nobody Made Up Song', { fetch: f, sleep });
  check(r.source === 'lrclib' && f.calls.length === 2 && sleeps[0] === 1000, 'LRCLIB 503 then OK: retried once after its Retry-After');

  f = fakeFetch({ lrclib: [reply(503, null), reply(503, null)], suggest: [reply(200, ovhOk)], ovh: [] });
  r = await D.findLyrics('Nobody Made Up Song', { fetch: f, sleep });
  check(r.source === 'ovh' && r.rows.length === 1 && r.tried[0].outcome === 'busy' && r.tried[0].status === 503 && f.calls.length === 3, 'LRCLIB 503 twice: falls back to lyrics.ovh and says LRCLIB was busy');

  f = fakeFetch({ lrclib: ['hang', 'hang'], suggest: [reply(200, ovhOk)], ovh: [] });
  r = await D.findLyrics('Nobody Made Up Song', { fetch: f, sleep, timeoutMs: 30 });
  check(r.source === 'ovh' && r.tried[0].outcome === 'timeout', 'LRCLIB hanging: times out, retries once, then lyrics.ovh');

  f = fakeFetch({ lrclib: [reply(200, [])], suggest: [reply(200, ovhOk)], ovh: [] });
  r = await D.findLyrics('Nobody Made Up Song', { fetch: f, sleep });
  check(r.source === 'ovh' && r.tried[0].outcome === 'empty' && f.calls.length === 2, 'LRCLIB finds nothing: asks lyrics.ovh without retrying LRCLIB');

  f = fakeFetch({ lrclib: ['neterr', 'neterr'], suggest: [reply(502, null), reply(200, { data: [] })], ovh: [] });
  r = await D.findLyrics('Nobody Made Up Song', { fetch: f, sleep });
  check(r.source === null && !r.rows.length && r.tried.map(t => t.outcome).join() === 'network,empty', 'both failing: no rows, and each source says what went wrong');

  f = fakeFetch({ lrclib: [reply(400, null)], suggest: [reply(200, ovhOk)], ovh: [] });
  r = await D.findLyrics('x', { fetch: f, sleep });
  check(r.tried[0].outcome === 'error' && f.calls.length === 2, 'a 400 from LRCLIB is not retried');

  const ctl = new AbortController();
  f = fakeFetch({ lrclib: ['hang'], suggest: [], ovh: [] });
  const p = D.findLyrics('x', { fetch: f, sleep, signal: ctl.signal, timeoutMs: 5000 });
  setTimeout(() => ctl.abort(), 10);
  r = await p;
  check(r.aborted && f.calls.length === 1, 'a newer search cancels the old one without falling back');

  // Lrclib-Client identifies the app to LRCLIB only; a request that gets no answer at all is retried without it
  const seen = [];
  const hdrFetch = async (url, opts) => { seen.push([url.includes('lrclib') ? 'lrclib' : 'ovh', opts.headers ? opts.headers['Lrclib-Client'] : null]); if (seen.length === 1) throw new TypeError('Failed to fetch'); return url.includes('lrclib') ? reply(200, []) : reply(200, ovhOk); };
  r = await D.findLyrics('Nobody Made Up Song', { fetch: hdrFetch, sleep });
  check(/^VoiceTrainer \S+ \(https:\/\/github\.com\/petravanta\/voicetrainer\)$/.test(D.LRCLIB_CLIENT) && seen[0][1] === D.LRCLIB_CLIENT, `LRCLIB gets the Lrclib-Client header (${D.LRCLIB_CLIENT})`);
  check(seen[1][0] === 'lrclib' && seen[1][1] === null, 'after a no-answer failure (maybe a blocked preflight) the retry drops the header');
  check(seen[2][0] === 'ovh' && seen[2][1] === null, 'lyrics.ovh gets no custom header');

  const row = { src: 'ovh', title: 'Made Up Song', artist: 'Nobody', timed: false, text: null };
  f = fakeFetch({ lrclib: [], suggest: [], ovh: [reply(503, null), reply(200, { lyrics: 'One\r\nTwo' })] });
  let got = await D.loadLyricsText(row, { fetch: f, sleep });
  check(got.text === 'One\nTwo' && f.calls[0].endsWith('/v1/Nobody/Made%20Up%20Song'), 'picking a lyrics.ovh result fetches its text (with one retry)');
  f = fakeFetch({ lrclib: [], suggest: [], ovh: [reply(404, { error: 'No lyrics found' })] });
  got = await D.loadLyricsText(row, { fetch: f, sleep });
  check(got.outcome === 'notfound' && f.calls.length === 1, 'lyrics.ovh without lyrics for a title: not found, no retry');
  got = await D.loadLyricsText({ ...row, text: 'Have it' }, { fetch: () => { throw new Error('no'); }, sleep });
  check(got.text === 'Have it', 'rows that already have text need no request');

  // saved lyrics: most recent first, one entry per song and source, capped, removable, searchable
  const song = (i, extra) => ({ src: 'lrclib', id: i, title: `Song ${i}`, artist: 'Band', timed: true, text: `[00:01.00]Line ${i}`, ...extra });
  let saved = [];
  for (let i = 0; i < 5; i++) saved = D.lyricsCachePut(saved, song(i), 1000 + i);
  check(saved.length === 5 && saved[0].title === 'Song 4' && saved[4].title === 'Song 0', 'saved lyrics: newest first');
  saved = D.lyricsCachePut(saved, song(1), 2000);
  check(saved.length === 5 && saved[0].title === 'Song 1', 'saving a song again moves it to the front, no duplicate');
  saved = D.lyricsCachePut(saved, song(1, { src: 'ovh', timed: false, text: 'Line 1' }), 2001);
  check(saved.length === 6, 'the same song from another source is a separate entry');
  check(D.lyricsCacheGet(saved, { src: 'ovh', artist: ' band', title: 'SONG 1 ' }).text === 'Line 1', 'lookup ignores case and spaces');
  saved = D.lyricsCacheDrop(saved, saved[0].key);
  check(saved.length === 5 && !D.lyricsCacheGet(saved, { src: 'ovh', artist: 'Band', title: 'Song 1' }), 'removing one entry');
  let capped = [];
  for (let i = 0; i < 50; i++) capped = D.lyricsCachePut(capped, song(i), i, 10);
  check(capped.length === 10 && capped[0].title === 'Song 49' && capped[9].title === 'Song 40', 'count cap drops the oldest');
  capped = [];
  for (let i = 0; i < 5; i++) capped = D.lyricsCachePut(capped, song(i, { text: 'x'.repeat(400) }), i, 40, 1000);
  check(capped.length === 2 && capped[0].title === 'Song 4', 'size cap drops the oldest');
  check(D.lyricsCachePut([], song(0, { text: 'x'.repeat(5000) }), 0, 40, 1000).length === 1, 'one song larger than the size cap is still kept');
  check(D.lyricsCachePut([], song(0, { text: '  ' }), 0).length === 0, 'empty lyrics are not saved');
  const mixed = D.lyricsCacheClean([song(1, { title: 'Café del Mar', artist: 'Energy 52' }), song(2, { title: 'Other', artist: 'Someone' }), null, { title: 'no text' }, 'junk']);
  check(mixed.length === 2, 'damaged entries are dropped when loading');
  check(D.lyricsCacheFind(mixed, 'cafe energy').length === 1 && D.lyricsCacheFind(mixed, '').length === 2 && D.lyricsCacheFind(mixed, 'nope').length === 0, 'search saved lyrics by words, accents ignored');
  check(D.lyricsCacheClean('not a list').length === 0, 'a broken store reads as empty');
  check(D.ownSongMissing({ title: ' ', artist: '' }).join() === 'title,artist' && D.ownSongMissing({ title: 'Mine', artist: '' }).join() === 'artist'
    && D.ownSongMissing({ title: 'Mine', artist: 'Me' }).length === 0 && D.ownSongMissing(null).length === 2, 'own lyrics need a song name and an artist');
  const own = D.lyricsCachePut(saved, { src: 'mine', title: 'Mine', artist: 'Me', text: 'La la' }, 3000);
  check(own[0].src === 'mine' && own[0].title === 'Mine' && own[0].artist === 'Me' && D.lyricsCacheFind(own, 'me mine').length === 1, 'own songs keep their name and artist in Your songs');

  // sorting Your songs, and last-used times
  const lib = [
    { src: 'mine', title: 'zebra Song', artist: 'The Beatles', text: 'a', at: 300 },
    { src: 'lrclib', title: 'Song 10', artist: 'ABBA', text: 'b', at: 100 },
    { src: 'lrclib', title: 'Song 9', artist: 'abba', text: 'c', at: 200 },
    { src: 'lrclib', title: 'Ánimo', artist: 'Café Tacvba', text: 'd' },
    { src: 'lrclib', title: 'Old', artist: 'Zed', text: 'e' },
  ];
  check(D.lyricsCacheSort(lib, 'used').map(r => r.text).join('') === 'acbde', 'sort by last use: newest first, songs without a time last in saved order');
  check(D.lyricsCacheSort(lib, 'name').map(r => r.title).join('|') === 'Ánimo|Old|Song 9|Song 10|zebra Song', 'sort by name: case and accents ignored, numbers by value');
  check(D.lyricsCacheSort(lib, 'artist').map(r => r.text).join('') === 'cbade', 'sort by artist (ignoring a leading The), then by name');
  check(D.lyricsCacheSort(lib, 'bogus').map(r => r.text).join('') === 'acbde', 'an unknown sort falls back to last use');
  const touched = D.lyricsCacheTouch(lib, D.lyricsKey(lib[4]), 999);
  check(touched[0].title === 'Old' && touched[0].at === 999 && touched.length === 5 && D.lyricsCacheTouch(lib, 'nope', 999)[0].text === 'a', 'using a song marks it used now; unknown keys change nothing');
  const noon = new Date(2026, 10, 1, 12).getTime(), dayMs = 864e5;
  check(D.usedAgo(noon - 3600e3, noon) === 'today' && D.usedAgo(noon - dayMs, noon) === 'yesterday' && D.usedAgo(noon - 3 * dayMs, noon) === '3 days ago'
    && D.usedAgo(noon - 20 * dayMs, noon) === '2 weeks ago' && D.usedAgo(0, noon) === '' && /Aug|8/.test(D.usedAgo(noon - 80 * dayMs, noon)), 'last used, in words');

  // attached videos live in the song's entry in Your songs
  const vid = { id: 'dQw4w9WgXcQ', start: 42, offset: 1.234 };
  let withVid = D.lyricsCacheVideo(own, own[0].key, vid);
  check(withVid[0].video.id === 'dQw4w9WgXcQ' && withVid[0].video.start === 42 && withVid[0].video.offset === 1.23 && withVid.length === own.length, 'a video is attached to a saved song');
  const reloaded = D.lyricsCacheClean(JSON.parse(JSON.stringify(withVid)));
  check(reloaded[0].video && reloaded[0].video.id === 'dQw4w9WgXcQ', 'the attached video survives storing and reading Your songs');
  withVid = D.lyricsCachePut(withVid, { src: 'mine', title: 'Mine', artist: 'Me', text: 'La la la' }, 4000);
  check(withVid[0].text === 'La la la' && withVid[0].video && withVid[0].video.id === 'dQw4w9WgXcQ', 'saving the song again keeps its video');
  check(D.lyricsCachePut(withVid, { src: 'mine', title: 'Mine', artist: 'Me', text: 'La', video: null }, 5000)[0].video === null, 'video: null removes it');
  check(D.lyricsCacheVideo(withVid, withVid[0].key, null)[0].video === null, 'removing the video leaves the song');
  check(D.lyricsCacheDrop(withVid, withVid[0].key).every(r => !r.video), 'removing the song removes its video');
  check(D.lyricsCacheVideo(withVid, 'no|such|song', vid).every((r, i) => r.key === withVid[i].key && JSON.stringify(r.video) === JSON.stringify(withVid[i].video)), 'unknown songs change nothing');
  check([null, {}, { id: 'short' }, { id: '<script>xx>' }, 'dQw4w9WgXcQ'].every(v => D.videoClean(v) === null), 'broken video entries are dropped');

  // Your songs across devices (merged through the Google Drive file)
  const A0 = [song(1), song(2)].map((r, i) => ({ ...r, at: 10 + i }));
  let here = D.songsStamp([], A0, {}, 100);
  check(here.songs.length === 2 && here.songs.every(r => r.upd === 100), 'new songs are stamped with when they changed');
  check(D.songsStamp(here.songs, here.songs, here.songsGone, 200).songs.every(r => r.upd === 100), 'unchanged songs keep their stamp');
  const k1 = here.songs.find(r => r.title === 'Song 1').key, k2 = here.songs.find(r => r.title === 'Song 2').key;
  const phone = D.songsStamp(here.songs, D.lyricsCacheDrop(here.songs, k1), here.songsGone, 300);
  check(phone.songsGone[k1] === 300 && phone.songs.length === 1, 'removing a song leaves a note of when');
  const laptop = D.songsStamp(here.songs, D.lyricsCacheVideo(here.songs, k2, vid), here.songsGone, 250);
  let m = D.songsMerge(phone, laptop);
  check(m.songs.length === 1 && m.songs[0].key === k2 && m.songs[0].video && m.songs[0].video.id === vid.id, 'merging: a removal on one device and a video on another both survive');
  check(JSON.stringify(D.songsMerge(laptop, phone).songs.map(r => r.key)) === JSON.stringify(m.songs.map(r => r.key)), 'merging gives the same songs either way round');
  const back = D.songsStamp(phone.songs, here.songs, phone.songsGone, 400);
  m = D.songsMerge(back, laptop);
  check(m.songs.length === 2 && !(k1 in m.songsGone) && !(k1 in back.songsGone), 'Undo (or saving it again) after a removal brings the song back everywhere');
  m = D.songsMerge({ songs: D.songsStamp([], [song(9)], {}, 500).songs }, { songsGone: { [D.lyricsKey(song(9))]: 450 } });
  check(m.songs.length === 1, 'a song saved after an older removal is kept');
  check(D.songsMerge({}, {}).songs.length === 0 && D.songsMerge({ songs: 'junk', songsGone: [1] }, null).songs.length === 0, 'old files without songs merge cleanly');
  const many = D.songsMerge({ songs: Array.from({ length: 30 }, (_, i) => ({ ...song(i), at: i, upd: 1 })) }, { songs: Array.from({ length: 30 }, (_, i) => ({ ...song(i + 30), at: i + 30, upd: 1 })) });
  check(many.songs.length === D.LYRICS_CACHE_MAX && many.songs[0].title === 'Song 59', 'merged songs stay within the cap, newest kept');
  check(D.songsStamp([], [{ ...song(1), upd: 77 }], {}, 900).songs[0].upd === 900 && D.lyricsCacheClean([{ ...song(1), upd: 77 }])[0].upd === 77, 'stamps survive storing and reading');

  // backing tracks: YouTube links and the karaoke search
  const ids = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'];
  check(ids.every(u => D.youtubeId(u) === 'dQw4w9WgXcQ'), 'YouTube video id read from watch, youtu.be, shorts, embed and music links');
  check(['', 'https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@channel', 'not a link at all'].every(u => D.youtubeId(u) === null), 'other links and text are not taken for videos');
  check(D.youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=90') === 90 && D.youtubeStart('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s') === 90 && D.youtubeStart('https://youtube.com/embed/dQw4w9WgXcQ?start=7') === 7 && D.youtubeStart('dQw4w9WgXcQ') === 0, 'start time read from t= and start=');
  check(D.youtubeUrl({ id: 'dQw4w9WgXcQ', start: 90 }) === 'https://youtu.be/dQw4w9WgXcQ?t=90' && D.youtubeUrl({ id: 'dQw4w9WgXcQ' }) === 'https://youtu.be/dQw4w9WgXcQ' && D.youtubeUrl(null) === '' && ['https://youtu.be/dQw4w9WgXcQ?t=90'].every(u => D.youtubeId(u) === 'dQw4w9WgXcQ' && D.youtubeStart(u) === 90), 'attached video link shown in the box reads back to the same video and start');
  check(D.karaokeSearchUrl('Dancing Queen', 'ABBA') === 'https://www.youtube.com/results?search_query=ABBA%20Dancing%20Queen%20karaoke' && D.karaokeSearchUrl('  ', '') === null, 'karaoke search names the artist and song');

  // a target tune written in braces after a line, or on the row under it
  check(D.parseNotes('C4 D#4 Eb g3, a - B♭3|c5').join() === '60,63,63,55,57,58,72', 'note names: sharps, flats, octave carried over, rests and separators');
  const tl = D.parseLyrics('Sweet dreams {C4 C4 D#4}\nAre made of this\n{C4 G3}\nNo tune');
  check(tl.lines.length === 3 && tl.lines[0].text === 'Sweet dreams' && tl.lines[0].notes.join() === '60,60,63' && tl.lines[1].notes.join() === '60,55' && !tl.lines[2].notes,
    'lyrics: notes in braces come off the text, a row of notes goes with the line above');
  check(D.parseLyrics('[00:01.00]Hi {A4 G4}').lines[0].notes.join() === '69,67', 'timed lyrics keep their notes');
  const nn = D.nearestNote(131, [60, 64]);
  check(nn.midi === 60 && nn.octaves === -1 && Math.abs(nn.cents) < 10 && D.nearestNote(262, [60, 64]).octaves === 0, 'nearest target note, an octave down named as such');
  { // 1 s on C4, 1 s on C3 (the tune an octave down), 0.5 s on D4 (not in the tune)
    const fr = [], put = (hz, secs) => { for (let k = 0; k < secs * 60; k++) fr.push({ f0: hz, t: fr.length * 1000 / 60 }); };
    put(261.6, 1); put(130.8, 1); put(293.7, 0.5);
    const m = D.melodyMatch(fr, [60, 64]);
    check(Math.abs(m.on - 1) < 0.1 && Math.abs(m.oct - 1) < 0.1 && Math.abs(m.off - 0.5) < 0.1 && m.missed.join() === '64',
      `tune: ${m.on.toFixed(1)} s on, ${m.oct.toFixed(1)} s an octave away, ${m.off.toFixed(1)} s off, E4 not held`);
  }

  console.log(fails ? `${fails} check(s) failed` : 'all sing-along checks passed');
  process.exit(fails ? 1 : 0);
})();
