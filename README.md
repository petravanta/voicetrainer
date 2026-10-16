# VoiceTrainer

A browser-based voice training app for tracking **resonance** and **pitch**, aimed at people working toward a more feminine (or masculine) voice. In the vein of voiceduck.cc.

## Features

- **Resonance scoring** per vowel (0–100, clamped at both ends), comparing measured formants F1–F3 against Hillenbrand et al. (1995) male/female averages for the same vowel.
- **Consonant feedback**: sibilant (s/sh) spectral centre of gravity.
- **Pitch tracking** (YIN), with optional recognised words over the pitch track ("Show words", using the browser's speech recognition; in Chrome and Edge that audio is sent to Google or Microsoft).
- **Control exercises**: move only the jaw, tongue, lips or larynx (or only the pitch) and see that just the matching formant moves, to build trust in the feedback.
- **Breathiness** estimate (0–100) from cepstral peak prominence (CPP), with breath exercises (Big dog / little dog, sigh to clear tone, whisper to voice, clean onset, hum into a vowel, breathy-clear-pressed) and a live gauge.
- **Guided exercises** built from your weakest vowels and sibilants, with synthesized reference examples and before/after scores.
- **Live spectrogram** with goal markers for the current vowel.
- **Live drill coach**: one concrete adjustment at a time (jaw, tongue, lips/larynx) with per-formant gauges.
- **Vocal tract sketch**: a side view of one plausible tract shape for your formants (jaw from F1, tongue from F2, lips from F3, larynx height from the shared shift), with the goal shape and the recommended change drawn on top.
- **Reading practice**: a collapsible side pane (bottom sheet on phones, or full screen) so the rest of the app stays usable, with a large-text reading view with karaoke-style highlighting that follows your syllables (or a steady pace, or tap to advance), plus an optional large single-line focus track that keeps the current word centred. Built-in texts include the Rainbow Passage (Fairbanks, 1960) and the Grandfather Passage (Van Riper, 1963), plus your own. "Hear it read" reads the passage aloud, either with the browser's speech voice (real words; the meters follow it through the microphone) or with the synthetic demo voice, which goes straight into the analyser so every meter tracks it live.
- **Demo voice settings**: voice type, pitch, resonance and brightness for the synthetic demo voice; type, pitch and speed for the reading voice.
- **Phone mode**: a streamlined layout (meter, pitch, drills) for practising on the go; keeps the screen awake while the microphone runs. Add `?phone=1` to the URL to open in it.
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
