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

  // backing tracks: YouTube links and the karaoke search
  const ids = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'];
  check(ids.every(u => D.youtubeId(u) === 'dQw4w9WgXcQ'), 'YouTube video id read from watch, youtu.be, shorts, embed and music links');
  check(['', 'https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@channel', 'not a link at all'].every(u => D.youtubeId(u) === null), 'other links and text are not taken for videos');
  check(D.youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=90') === 90 && D.youtubeStart('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s') === 90 && D.youtubeStart('https://youtube.com/embed/dQw4w9WgXcQ?start=7') === 7 && D.youtubeStart('dQw4w9WgXcQ') === 0, 'start time read from t= and start=');
  check(D.karaokeSearchUrl('Dancing Queen', 'ABBA') === 'https://www.youtube.com/results?search_query=ABBA%20Dancing%20Queen%20karaoke' && D.karaokeSearchUrl('  ', '') === null, 'karaoke search names the artist and song');

  console.log(fails ? `${fails} check(s) failed` : 'all sing-along checks passed');
  process.exit(fails ? 1 : 0);
})();
