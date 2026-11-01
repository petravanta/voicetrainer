# VoiceTrainer

A browser-based voice training app for tracking **resonance** and **pitch**, aimed at people working toward a more feminine (or masculine) voice. In the vein of voiceduck.cc.

## Modes

- **Readings**: read a prepared passage aloud; press Finish for a result card (resonance, /s/ brightness, pitch, breathiness, change since last time) and the weakest vowels to practise. **Your vowels** maps every vowel you held steadily on the F1/F2 vowel chart against the typical masculine and feminine values, with its own score and the words it was heard in (consonants are left out). **Focus spots** pick the few short bits of the passage where getting to your goal gains the most (how far each word was from the goal, added up over the phrase); **Practise** opens just that bit in the reader, scores every try against the reading (a bar per try for how far it is from the goal, each word's number in the reading next to the latest try, and a plain-words verdict on which words reached the goal and which are still off), and saves the tries in Practice progress. The History panel lists the spots that keep coming up over your last five readings. Each reading is saved with one trend per passage; readings under 70% of the text are kept as partial and left out of the trend.
- **Freestyle**: every live dial (resonance meter, vowel space, spectrogram, vocal tract, pitch), and a vowel map of the session that fills in as you talk. Nothing is saved. On a phone the dials sit side by side and you swipe between them.
- **Sing along**: play a song anywhere (Spotify, YouTube, a CD) with headphones on, or load a song file from your device, and sing. Search for the lyrics by artist and title (from [LRCLIB](https://lrclib.net), a free third-party lyrics library that has timed versions; when it's busy, unreachable or finds nothing, the app retries once and then asks [lyrics.ovh](https://lyrics.ovh), which has plain lyrics only and looks titles up on Deezer; each result says where it came from and whether it's timed, and a link opens a web search for the lyrics when both fail. Only what you type is sent; lyrics you load are saved in this browser under Saved lyrics, newest first and filtered by what you type, so you can sing them again without searching or offline, with × to remove one and Clear all, each undoable; the list keeps up to 40 songs), or paste them as plain text (press Next line or the space bar as you go) or as timed LRC lyrics (they scroll by themselves: with a song file they follow it exactly, otherwise press Next line as the first line begins, then nudge by half a second if they drift). You see the note you're singing, your resonance and a pitch trace coloured by resonance; each line gets its resonance and range as you finish it, and Finish shows a summary per line. Your singing isn't saved. Music from speakers mixes into the microphone, so use headphones; with a song file there's an echo cancellation option for speakers. Pitch is read up to about 500 Hz (B4). The app can't hook into Spotify itself: browsers can't capture Spotify's audio, and its API has no lyrics.
- **Practice**: one exercise at a time with the live coach. Every finished exercise is saved, with last, best and a trend line per exercise.

Phones get a tab bar along the bottom; the screen stays awake while the microphone runs.

## Saved data and themes

Readings, practice history, settings and your own texts live in one file (`VoiceTrainer data.json`) in your own Google Drive, using the shared sign-in of [petravanta's apps](https://github.com/petravanta/general/blob/main/STANDARDS.md) (drive.file scope: the app only sees the file it creates). Until Drive is connected, or when the app runs from a file or a claude.ai Artifact, the browser keeps them. The Settings tab holds the goal (feminine or masculine; every target follows it), your own target pitch range per goal (or the typical band, with a reset), and the theme (system, light or dark). The theme is shared with the switch in the header and with petravanta's other apps on this device.

## Features

- **Resonance scoring** per vowel (0–100, clamped at both ends), comparing measured formants F1–F3 against Hillenbrand et al. (1995) male/female averages for the same vowel.
- **Consonant feedback**: sibilant (s/sh) spectral centre of gravity.
- **Pitch tracking** (YIN), with optional words over the pitch track ("Show words"): words appear faded as they are recognised and firm up when final (browser speech recognition; in Chrome and Edge that audio is sent to Google or Microsoft, so it is off until you agree to that in a consent prompt, and you can withdraw consent at any time). In reading practice the words come from the passage as the highlight moves, without recognition.
- **Control exercises**: move only the jaw, tongue, lips or larynx (or only the pitch) and see that just the matching formant moves, to build trust in the feedback. The resonance slide goes from dark to bright on one note and checks that the pitch holds while the resonance moves.
- **Whisper exercises**: a whisper siren (slide the whisper's brightness up and down twice) and a whispered "kee" held in the goal zone. With no voice, pitch is out of the way; the formants are read from the whisper's airflow noise (LPC, F2 and F3 only, after allowing for the usual upward shift of whispered formants), so the score is a trend within one setup rather than an exact match to voiced vowels.
- **Embody** ("Uwu with feeling"): an unscored thought exercise in embodied voice. Say "uwu" ("eww-woo") in your goal voice while conveying a feeling dealt at random from 75 (smug, sleepy, bashful, indignant, wistful...), each with a one-line scene; "Another feeling" deals a new one from a different family and never one of your last 20. A gentle live view shows pitch across and resonance up with a shaded home zone, each take leaves a mark named after its feeling, and after each take a question asks what your jaw, lips, breath, face or throat did. Nothing is scored or saved to history.
- **Breathiness** estimate (0–100) from cepstral peak prominence (CPP), with breath exercises (Big dog / little dog, sigh to clear tone, whisper to voice, clean onset, hum into a vowel, breathy-clear-pressed, straw or lip-trill siren warm-up) and a live gauge.
- **Prosody exercises**: question rise, settled statement, statement-then-question, expressive range, stressing one word and melody vs monotone. Each spoken phrase is checked from its pitch contour in semitones around your own middle pitch, with a synthesized example for each.
- **Check the checker**: every exercise shows demo sounds that should pass and should not (typical feminine vs masculine, right vs wrong movement, whispered vs flat or voiced, clear vs breathy vs pressed, intended vs flat intonation), each graded by exactly the same scoring as your voice. While a demo plays, the live coach, gauges and vocal tract sketch show where the demo voice's jaw, tongue, lips and larynx likely sit (and the breath, control and prosody panels show its reading), without scoring it as you. Every other piece of feedback (the resonance meter text, the main vocal tract sketch, the exercise message) says when it is showing a demo or reading voice, and earlier tips such as "that sounds closer to..." are cleared when a demo starts.
- **Guided exercises** built from your weakest vowels and sibilants, with synthesized reference examples and before/after scores.
- **Live spectrogram** with goal markers for the current vowel.
- **Live drill coach**: one concrete adjustment at a time (jaw, tongue, lips/larynx) with per-formant gauges.
- **Vocal tract sketch**: a side view of one plausible tract shape for your formants (jaw from F1, tongue from F2, lips from F3, larynx height from the shared shift), with the goal shape and the recommended change drawn on top.
- **Reading practice**: the reader behind Readings, with the highlight following your voice, a single-line focus track, steady-pace and tap modes, and your own texts.
- **Demo voice settings**: voice type, pitch, resonance and brightness for the synthetic demo voice; type, pitch and speed for the reading voice.

Everything runs in the browser; no audio leaves your machine (except the optional Show words recognition noted above). The Sing along lyrics search sends only the typed artist and title to LRCLIB and, as a backup, lyrics.ovh (and to DuckDuckGo if you use the web search link); lyrics you load stay in your browser's local storage and are never uploaded; no lyrics are bundled with the app.

**Try it: https://petravanta.github.io/voicetrainer/** (allow microphone access when asked)

## Usage

```sh
node build.js            # writes dist/VoiceTrainer.html (standalone) and dist/artifact.html
```

Open `dist/VoiceTrainer.html` in a browser and allow microphone access, or use the hosted version above. Every push to `main` rebuilds and redeploys the hosted version via GitHub Actions.

## Tests

```sh
node test/dsp.test.js       # pitch/formant/scoring checks on synthetic voices
node test/examples.test.js  # every reference example scores on target
node test/coach.test.js     # live coaching cues point the right way
node test/reading.test.js   # syllable counting and tracking for reading along
node test/sing.test.js      # lyrics parsing (plain and LRC), lyrics search results, the LRCLIB to lyrics.ovh fallback (with a fake network), the saved-lyrics list and the per-line sing-along summary
```

## Extending the app

Practice content lives in plain JSON files under [`data/`](data/), separate from the code, so you can read it, review it and add to it in a pull request without touching JavaScript. `build.js` inlines them into the page. Each file has a schema that explains every field, and a check runs on every pull request.

| Dataset | File | Schema | What it controls |
| --- | --- | --- | --- |
| Reading texts | [`data/texts.json`](data/texts.json) | [`texts.schema.json`](data/schema/texts.schema.json) | Built-in passages for reading practice |
| Practice words | [`data/words.json`](data/words.json) | [`words.schema.json`](data/schema/words.schema.json) | Words pairing *s* or *sh* with a vowel, for the word drills |
| Breath exercises | [`data/breath.json`](data/breath.json) | [`breath.schema.json`](data/schema/breath.schema.json) | Guided breath exercises: steps, why, and whether they finish in the goal zone |
| Control exercises | [`data/control.json`](data/control.json) | [`control.schema.json`](data/schema/control.schema.json) | Move-one-part exercises (jaw, tongue, lips, larynx, pitch) and the resonance slide |
| Whisper exercises | [`data/whisper.json`](data/whisper.json) | [`whisper.schema.json`](data/schema/whisper.schema.json) | Resonance exercises done in a whisper (siren or hold a vowel) |
| Embody exercises | [`data/embody.json`](data/embody.json) | [`embody.schema.json`](data/schema/embody.schema.json) | Unscored "say this sound with a feeling" exercises: steps and reflection questions |
| Feelings | [`data/emotions.json`](data/emotions.json) | [`emotions.schema.json`](data/schema/emotions.schema.json) | Feelings dealt in the Embody exercises, each with a family and a short scene |
| Word vowels | [`data/pron.json`](data/pron.json) | [`pron.schema.json`](data/schema/pron.schema.json) | Stressed vowels of about 12,000 common words, so a reading checks each vowel it hears against the word being read. Generated by [`scripts/make-pron.js`](scripts/make-pron.js) from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD licence); don't edit by hand |

Vowels and sibilant targets (measured formant data in `src/dsp.js`) and prosody exercises (each has its own pitch check) stay in code. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add an entry.

## Layout

- `src/dsp.js` – pitch (YIN), LPC formants, sibilant analysis, vowel/resonance scoring
- `src/synth.js` – synthetic voice for demos, reference examples and tests
- `src/app.js`, `src/index.html`, `src/style.css` – UI
- `data/` – practice content (see *Extending the app*)
- `build.js` – inlines everything into a single HTML file

## Notes

Formant accuracy drops for voices above roughly 280 Hz fundamental. Not a substitute for a voice coach or speech-language pathologist.

## License

MIT. Shared as-is with no support; fork it, change it, use it however you like.
