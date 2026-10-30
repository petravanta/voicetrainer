# VoiceTrainer

A browser-based voice training app for tracking **resonance** and **pitch**, aimed at people working toward a more feminine (or masculine) voice. In the vein of voiceduck.cc.

## Modes

- **Readings**: read a prepared passage aloud; press Finish for a result card (resonance, /s/ brightness, pitch, breathiness, change since last time) and the weakest vowels to practise. Each reading is saved with one trend per passage; readings under 70% of the text are kept as partial and left out of the trend.
- **Freestyle**: every live dial (resonance meter, vowel space, spectrogram, vocal tract, pitch). Nothing is saved. On a phone the dials sit side by side and you swipe between them.
- **Practice**: one exercise at a time with the live coach. Every finished exercise is saved, with last, best and a trend line per exercise.

Phones get a tab bar along the bottom; the screen stays awake while the microphone runs.

## Saved data and themes

Readings, practice history, settings and your own texts live in one file (`VoiceTrainer data.json`) in your own Google Drive, using the shared sign-in of [petravanta's apps](https://github.com/petravanta/general/blob/main/STANDARDS.md) (drive.file scope: the app only sees the file it creates). Until Drive is connected, or when the app runs from a file or a claude.ai Artifact, the browser keeps them. The Settings tab holds the goal (feminine or masculine; every target follows it), your own target pitch range per goal (or the typical band, with a reset), and the theme (system, light or dark). The theme is shared with the switch in the header and with petravanta's other apps on this device.

## Features

- **Resonance scoring** per vowel (0–100, clamped at both ends), comparing measured formants F1–F3 against Hillenbrand et al. (1995) male/female averages for the same vowel.
- **Consonant feedback**: sibilant (s/sh) spectral centre of gravity.
- **Pitch tracking** (YIN), with optional words over the pitch track ("Show words"): words appear faded as they are recognised and firm up when final (browser speech recognition; in Chrome and Edge that audio is sent to Google or Microsoft, so it is off until you agree to that in a consent prompt, and you can withdraw consent at any time). In reading practice the words come from the passage as the highlight moves, without recognition.
- **Control exercises**: move only the jaw, tongue, lips or larynx (or only the pitch) and see that just the matching formant moves, to build trust in the feedback.
- **Breathiness** estimate (0–100) from cepstral peak prominence (CPP), with breath exercises (Big dog / little dog, sigh to clear tone, whisper to voice, clean onset, hum into a vowel, breathy-clear-pressed, straw or lip-trill siren warm-up) and a live gauge.
- **Prosody exercises**: question rise, settled statement, statement-then-question, expressive range, stressing one word and melody vs monotone. Each spoken phrase is checked from its pitch contour in semitones around your own middle pitch, with a synthesized example for each.
- **Check the checker**: every exercise shows demo sounds that should pass and should not (typical feminine vs masculine, right vs wrong movement, clear vs breathy vs pressed, intended vs flat intonation), each graded by exactly the same scoring as your voice. While a demo plays, the live coach, gauges and vocal tract sketch show where the demo voice's jaw, tongue, lips and larynx likely sit (and the breath, control and prosody panels show its reading), without scoring it as you. Every other piece of feedback (the resonance meter text, the main vocal tract sketch, the exercise message) says when it is showing a demo or reading voice, and earlier tips such as "that sounds closer to..." are cleared when a demo starts.
- **Guided exercises** built from your weakest vowels and sibilants, with synthesized reference examples and before/after scores.
- **Live spectrogram** with goal markers for the current vowel.
- **Live drill coach**: one concrete adjustment at a time (jaw, tongue, lips/larynx) with per-formant gauges.
- **Vocal tract sketch**: a side view of one plausible tract shape for your formants (jaw from F1, tongue from F2, lips from F3, larynx height from the shared shift), with the goal shape and the recommended change drawn on top.
- **Reading practice**: the reader behind Readings, with the highlight following your voice, a single-line focus track, steady-pace and tap modes, and your own texts.
- **Demo voice settings**: voice type, pitch, resonance and brightness for the synthetic demo voice; type, pitch and speed for the reading voice.

Everything runs in the browser; no audio leaves your machine (except the optional Show words recognition noted above).

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
```

## Extending the app

Practice content lives in plain JSON files under [`data/`](data/), separate from the code, so you can read it, review it and add to it in a pull request without touching JavaScript. `build.js` inlines them into the page. Each file has a schema that explains every field, and a check runs on every pull request.

| Dataset | File | Schema | What it controls |
| --- | --- | --- | --- |
| Reading texts | [`data/texts.json`](data/texts.json) | [`texts.schema.json`](data/schema/texts.schema.json) | Built-in passages for reading practice |
| Practice words | [`data/words.json`](data/words.json) | [`words.schema.json`](data/schema/words.schema.json) | Words pairing *s* or *sh* with a vowel, for the word drills |
| Breath exercises | [`data/breath.json`](data/breath.json) | [`breath.schema.json`](data/schema/breath.schema.json) | Guided breath exercises: steps, why, and whether they finish in the goal zone |
| Control exercises | [`data/control.json`](data/control.json) | [`control.schema.json`](data/schema/control.schema.json) | Move-one-part exercises (jaw, tongue, lips, larynx, pitch) |

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
