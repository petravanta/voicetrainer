# VoiceTrainer

A browser-based voice training app for tracking **resonance** and **pitch**, aimed at people working toward a more feminine (or masculine) voice. In the vein of voiceduck.cc.

## Features

- **Resonance scoring** per vowel (0–100), comparing measured formants F1–F3 against Hillenbrand et al. (1995) male/female averages for the same vowel.
- **Consonant feedback**: sibilant (s/sh) spectral centre of gravity.
- **Pitch tracking** (YIN).
- **Guided exercises** built from your weakest vowels and sibilants, with synthesized reference examples and before/after scores.
- **Live spectrogram** with goal markers for the current vowel.
- **Live drill coach**: one concrete adjustment at a time (jaw, tongue, lips/larynx) with per-formant gauges.
- **Reading practice**: large-text reading view with karaoke-style highlighting that follows your syllables (or a steady pace, or tap to advance). Built-in texts include the Rainbow Passage (Fairbanks, 1960) and the Grandfather Passage (Van Riper, 1963), plus your own. "Hear it read" has the browser's speech voice read the passage aloud with the highlight following it.
- **Demo voice settings**: voice type, pitch, resonance and brightness for the synthetic demo voice; type, pitch and speed for the reading voice.
- **Progress history** stored locally.

Everything runs in the browser; no audio leaves your machine.

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

## Layout

- `src/dsp.js` – pitch (YIN), LPC formants, sibilant analysis, vowel/resonance scoring
- `src/synth.js` – synthetic voice for demos, reference examples and tests
- `src/app.js`, `src/index.html`, `src/style.css` – UI
- `build.js` – inlines everything into a single HTML file

## Notes

Formant accuracy drops for voices above roughly 280 Hz fundamental. Not a substitute for a voice coach or speech-language pathologist.

## License

MIT. Shared as-is with no support; fork it, change it, use it however you like.
