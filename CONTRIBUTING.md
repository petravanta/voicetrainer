# Contributing

The easiest way to help is to add practice content: reading texts, practice words, breath exercises, control exercises or whisper exercises. They're plain JSON files in [`data/`](data/), and you don't need to know any JavaScript.

## Add an entry

1. Open the file on GitHub and click the pencil icon to edit it. GitHub makes a copy for you if needed.
2. Copy a similar `{ … }` entry and paste it where it should appear, with a comma between entries. The app shows entries in file order.
3. Change the fields. Every field is explained in the matching schema in [`data/schema/`](data/schema/). Ids must be new and never change once shipped, because practice history refers to them.
4. Click **Propose changes**, then **Create pull request**. A check runs automatically and points out anything that needs fixing.

### A reading text

Only add texts that are free to share, and credit the source in the title. A blank line (`\n\n` inside the string) starts a new paragraph.

```json
{
  "id": "b-lighthouse",
  "title": "The lighthouse keeper",
  "body": "Every evening the keeper climbed the narrow stairs to light the lamp.\n\nShips far out at sea saw the beam sweep across the water and knew the rocks were near."
}
```

### A practice word

A short word that starts with *s* or *sh*, plus the vowel it carries. The vowel keys are listed in [`words.schema.json`](data/schema/words.schema.json).

```json
{"word": "sock", "sibilant": "s", "vowel": "a"}
```

### A breath exercise

`aim` is `band` if the exercise is done once the gauge has stayed in the goal zone for a few seconds, or `explore` for free practice. A step that differs by goal can be `{"feminine": "…", "masculine": "…"}`.

```json
{
  "id": "b-straw",
  "title": "Straw phonation",
  "cue": "Straw phonation",
  "sub": "easy closure",
  "aim": "band",
  "why": "Voicing through a straw helps the vocal folds close efficiently without pushing.",
  "steps": [
    "Hum through a drinking straw at a comfortable pitch for about 20 seconds.",
    "Take the straw away and say \"ah\" with the same easy feeling.",
    "Hold the \"ah\" with the gauge in the zone."
  ]
}
```

## Data or code?

Anything you can describe with the existing fields is data. A new vowel or sibilant target needs measured formant data in `src/dsp.js`, a new kind of control exercise needs a scoring rule there, a new kind of whisper exercise needs its own check in `src/app.js`, and prosody exercises each have their own pitch check in `src/app.js`, so those are code changes. Open an issue or a pull request for that.

## Checking locally

```sh
node scripts/check-data.js     # unique ids and words
npx ajv-cli@5 validate --spec=draft2020 -s data/schema/texts.schema.json -d data/texts.json
node build.js                  # then open dist/VoiceTrainer.html
for t in test/*.js; do node "$t"; done
```
